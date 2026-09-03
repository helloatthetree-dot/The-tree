import os, requests, datetime, hmac, hashlib
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
API = BASE + "/api"
SECRET = os.environ["RAZORPAY_KEY_SECRET"]


def token(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    r.raise_for_status()
    return r.json()["access_token"]


def find_slot():
    bw = requests.get(f"{API}/booking-window").json()
    start = datetime.date.fromisoformat(bw["start"])
    end = datetime.date.fromisoformat(bw["end"])
    d = start
    while d < end:
        av = requests.get(f"{API}/availability", params={"date": d.isoformat(), "people": 2}).json()
        if av.get("open") and av.get("slots"):
            for s in av["slots"]:
                if s.get("available"):
                    return d.isoformat(), s["time"]
        d += datetime.timedelta(days=1)
    return None, None


def sign(order_id, payment_id):
    return hmac.new(SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def main():
    cust = token("guest@komorebi.cafe", "Guest@123")
    ch = {"Authorization": f"Bearer {cust}"}
    date, time = find_slot()
    assert date, "no bookable slot"

    body = {"booking_name": "Rzp Test", "date": date, "time": time, "people": 2,
            "phone": "9999999999", "special_occasion": "None", "special_service": False,
            "has_dietary": False, "dietary_note": "", "policies_accepted": True}
    r = requests.post(f"{API}/reservations", json=body, headers=ch)
    assert r.status_code == 200, r.text
    d = r.json()
    order = d["order"]
    assert order["order_id"].startswith("order_"), order
    assert order["key_id"].startswith("rzp_test_"), order
    print(f"1) real order created: {order['order_id']} amount={order['amount']} key={order['key_id']}")

    rid = d["reservation_id"]
    pay_id = "pay_TESTfake123456"

    # wrong signature -> 400
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=ch, json={
        "razorpay_order_id": order["order_id"], "razorpay_payment_id": pay_id,
        "razorpay_signature": "deadbeef"})
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    print("2) invalid signature correctly rejected (400)")

    # valid signature -> confirmed
    good = sign(order["order_id"], pay_id)
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=ch, json={
        "razorpay_order_id": order["order_id"], "razorpay_payment_id": pay_id,
        "razorpay_signature": good})
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["status"] in ("confirmed", "pending_approval"), res
    assert res["payment_id"] == pay_id, res
    print(f"3) valid signature accepted -> status={res['status']}, payment_id stored")
    print("ALL PASS")


if __name__ == "__main__":
    main()
