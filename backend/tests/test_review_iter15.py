"""Backend checks: Razorpay keys, unpaid cancel refund=0, featured menu round-trip."""
import os, requests, datetime, uuid, pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
OWNER = ("sabnamrajoria@gmail.com", "Owner@123")
CUST = ("guest@komorebi.cafe", "Guest@123")


def _login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_h():
    return {"Authorization": f"Bearer {_login(*OWNER)}"}


@pytest.fixture(scope="module")
def cust_h():
    return {"Authorization": f"Bearer {_login(*CUST)}"}


def _next_tuesday():
    d = datetime.date.today()
    while d.weekday() != 1:  # Tue
        d += datetime.timedelta(days=1)
    return d.isoformat()


def test_razorpay_key_and_unpaid_cancel(cust_h):
    # Find an open slot
    date = _next_tuesday()
    win = requests.get(f"{BASE}/booking-window").json()
    # Try dates within window
    for i in range(0, 14):
        d = (datetime.date.today() + datetime.timedelta(days=i)).isoformat()
        av = requests.get(f"{BASE}/availability", params={"date": d}).json()
        slots = av.get("slots") or []
        open_slot = next((s for s in slots if s.get("available")), None)
        if open_slot:
            date = d
            slot = open_slot["time"]
            break
    else:
        pytest.skip("No open slot found in window")

    payload = {
        "date": date,
        "time": slot,
        "people": 2,
        "booking_name": "TEST Guest",
        "phone": "9000012345",
        "email": "guest@komorebi.cafe",
        "notes": "iter15 test",
        "accept_policies": True,
        "policies_accepted": True
    }
    r = requests.post(f"{BASE}/reservations", json=payload, headers=cust_h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["order"]["key_id"].startswith("rzp_test_")
    assert data["order"]["key_id"] == "rzp_test_TcC8ye2twizUpg"
    rid = data["reservation_id"]

    # Do NOT pay. Cancel unpaid.
    c = requests.post(f"{BASE}/reservations/{rid}/cancel", headers=cust_h)
    assert c.status_code == 200, c.text
    cd = c.json()
    assert cd["status"] == "cancelled"
    assert cd.get("refund_amount", 0) == 0
    assert cd.get("payment_id") in (None, "", 0)


def test_menu_featured_roundtrip(owner_h):
    # Create featured menu item
    item = {
        "name": f"TEST_Featured_{uuid.uuid4().hex[:6]}",
        "description": "test",
        "price": 250,
        "category": "Mains",
        "image_url": "",
        "featured": True,
        "active": True,
    }
    r = requests.post(f"{BASE}/admin/menu", json=item, headers=owner_h)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]

    # GET /api/menu should include it with featured=true
    resp = requests.get(f"{BASE}/menu").json()
    lst = resp.get("items", [])
    found = next((m for m in lst if m["id"] == mid), None)
    assert found is not None
    assert found.get("featured") is True

    # Cleanup
    d = requests.delete(f"{BASE}/admin/menu/{mid}", headers=owner_h)
    assert d.status_code in (200, 204)
