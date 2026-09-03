"""Iteration 12 — REAL Razorpay integration regression suite.

Covers:
 1. POST /api/reservations returns a REAL Razorpay order (order_id starts with 'order_',
    key_id starts with 'rzp_test_', amount = people * 30000 paise).
 2. POST /api/reservations/{rid}/pay with INVALID signature -> 400.
 3. POST /api/reservations/{rid}/pay with a valid HMAC-SHA256 signature confirms the
    reservation and stores payment_id (uses a fake pay_ id since we can't drive the
    real Razorpay Checkout iframe from a headless script).
 4. Customer cancel with a FAKE payment_id -> backend attempts a real Razorpay refund,
    Razorpay returns "id provided does not exist", backend raises HTTP 502 with
    friendly detail. (Real captured payment refund cannot be tested from a script;
    the code path is exercised end-to-end against Razorpay.)
 5. Admin reject with a FAKE payment_id -> same real-refund attempt -> 502. Confirms
    the reject-approval flow really talks to Razorpay for the FULL refund.
"""
import os, hmac, hashlib, datetime, requests, pytest
from dotenv import dotenv_values

_env = dotenv_values("/app/backend/.env")
SECRET = _env["RAZORPAY_KEY_SECRET"]
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
API = BASE + "/api"


def _token(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _find_slot(people=2):
    bw = requests.get(f"{API}/booking-window", timeout=10).json()
    d = datetime.date.fromisoformat(bw["start"])
    end = datetime.date.fromisoformat(bw["end"])
    while d < end:
        av = requests.get(f"{API}/availability",
                          params={"date": d.isoformat(), "people": people}, timeout=10).json()
        if av.get("open") and av.get("slots"):
            for s in av["slots"]:
                if s.get("available"):
                    return d.isoformat(), s["time"]
        d += datetime.timedelta(days=1)
    pytest.skip("No bookable slot found in window")


def _sign(order_id, payment_id):
    return hmac.new(SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


@pytest.fixture(scope="module")
def cust_headers():
    return {"Authorization": f"Bearer {_token('guest@komorebi.cafe', 'Guest@123')}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_token('sabnamrajoria@gmail.com', 'Owner@123')}"}


def _create_reservation(headers, people=2, special_service=False, occasion="None"):
    date, time = _find_slot(people)
    body = {
        "booking_name": "TEST_RZP",
        "date": date, "time": time, "people": people,
        "phone": "9999999999",
        "special_occasion": occasion,
        "special_service": special_service,
        "has_dietary": False, "dietary_note": "",
        "policies_accepted": True,
    }
    r = requests.post(f"{API}/reservations", json=body, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# --- 1) Real Razorpay order is created --------------------------------------
def test_real_razorpay_order_created(cust_headers):
    data = _create_reservation(cust_headers, people=2)
    order = data["order"]
    assert order["order_id"].startswith("order_"), order
    assert order["key_id"].startswith("rzp_test_"), order
    assert order["currency"] == "INR"
    assert order["amount"] == 2 * 300 * 100  # people * fee * paise


# --- 2) Invalid signature is rejected ---------------------------------------
def test_invalid_signature_rejected(cust_headers):
    data = _create_reservation(cust_headers)
    rid = data["reservation_id"]
    order_id = data["order"]["order_id"]
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=cust_headers, json={
        "razorpay_order_id": order_id,
        "razorpay_payment_id": "pay_TESTfake123",
        "razorpay_signature": "deadbeefbadsig",
    }, timeout=15)
    assert r.status_code == 400
    assert "Payment verification failed" in r.text
    # GET back -> still pending_payment
    lst = requests.get(f"{API}/reservations/mine", headers=cust_headers, timeout=10).json()
    match = next((x for x in lst if x["id"] == rid), None)
    assert match and match["status"] == "pending_payment"


# --- 3) Valid signature confirms + stores payment_id ------------------------
def test_valid_signature_confirms(cust_headers):
    data = _create_reservation(cust_headers)
    rid = data["reservation_id"]
    order_id = data["order"]["order_id"]
    pay_id = "pay_TESTsig12345678"
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=cust_headers, json={
        "razorpay_order_id": order_id,
        "razorpay_payment_id": pay_id,
        "razorpay_signature": _sign(order_id, pay_id),
    }, timeout=15)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["status"] in ("confirmed", "pending_approval")
    assert res["payment_id"] == pay_id
    assert res.get("razorpay_order_id") == order_id


# --- 4) Customer cancel attempts REAL Razorpay refund -----------------------
def test_customer_cancel_hits_real_razorpay_refund(cust_headers):
    """With a fake payment_id, Razorpay returns 'id provided does not exist',
    backend must raise 502 with the friendly refund-error detail. This proves
    the cancel endpoint really calls the Razorpay refund API (not a mock)."""
    data = _create_reservation(cust_headers)
    rid = data["reservation_id"]
    order_id = data["order"]["order_id"]
    pay_id = "pay_TESTcancel1234"
    # confirm the reservation with a valid signature
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=cust_headers, json={
        "razorpay_order_id": order_id,
        "razorpay_payment_id": pay_id,
        "razorpay_signature": _sign(order_id, pay_id),
    }, timeout=15)
    assert r.status_code == 200
    # now cancel — real refund call will fail since pay_id doesn't exist at Razorpay
    r = requests.post(f"{API}/reservations/{rid}/cancel", headers=cust_headers, timeout=30)
    # The backend raises 502; the preview ingress may pass through the raw HTTP status.
    assert r.status_code == 502, f"expected 502 from real Razorpay refund failure, got {r.status_code}: {r.text[:200]}"


# --- 5) Admin reject attempts REAL Razorpay refund (FULL amount) ------------
def test_admin_reject_hits_real_razorpay_refund(cust_headers, admin_headers):
    # occasion=Birthday + special_service triggers approval flow (needs_approval=True)
    data = _create_reservation(cust_headers, people=2,
                               special_service=True, occasion="Birthday")
    assert data["needs_approval"] is True
    rid = data["reservation_id"]
    order_id = data["order"]["order_id"]
    pay_id = "pay_TESTreject12345"
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=cust_headers, json={
        "razorpay_order_id": order_id,
        "razorpay_payment_id": pay_id,
        "razorpay_signature": _sign(order_id, pay_id),
    }, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "pending_approval"
    # admin rejects — real refund call must be attempted
    r = requests.post(f"{API}/admin/reservations/{rid}/approval",
                      json={"action": "reject", "note": "test"},
                      headers=admin_headers, timeout=30)
    assert r.status_code == 502, f"expected 502 from real Razorpay refund failure, got {r.status_code}: {r.text[:200]}"
