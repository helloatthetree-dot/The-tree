import os, requests, datetime

API = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
API = API.rstrip("/") + "/api"


def token(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    r.raise_for_status()
    return r.json()["access_token"]


def find_bookable_slot(cust):
    bw = requests.get(f"{API}/booking-window").json()
    start = datetime.date.fromisoformat(bw["start"])
    end = datetime.date.fromisoformat(bw["end"])
    d = start
    while d < end:
        av = requests.get(f"{API}/availability", params={"date": d.isoformat(), "people": 2}).json()
        if av.get("open") and av.get("slots"):
            for slot in av["slots"]:
                if slot.get("available"):
                    return d.isoformat(), slot["time"]
        d += datetime.timedelta(days=1)
    return None, None


def test_reject_gives_full_refund():
    cust = token("guest@komorebi.cafe", "Guest@123")
    admin = token("sabnamrajoria@gmail.com", "Owner@123")
    ch = {"Authorization": f"Bearer {cust}"}
    ah = {"Authorization": f"Bearer {admin}"}

    date, time = find_bookable_slot(cust)
    assert date, "No bookable slot found in window"

    body = {
        "booking_name": "Refund Test", "date": date, "time": time, "people": 2,
        "phone": "9999999999", "special_occasion": "Birthday", "special_service": True,
        "has_dietary": False, "dietary_note": "", "policies_accepted": True,
    }
    r = requests.post(f"{API}/reservations", json=body, headers=ch)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_approval"] is True, data
    rid, amount = data["reservation_id"], data["amount"]

    # pay (mock)
    r = requests.post(f"{API}/reservations/{rid}/pay", headers=ch)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_approval", r.json()

    # admin rejects
    r = requests.post(f"{API}/admin/reservations/{rid}/approval",
                      json={"action": "reject", "note": "test"}, headers=ah)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["status"] == "rejected", res
    assert res["refund_amount"] == amount, f"expected full {amount}, got {res['refund_amount']}"
    print(f"OK: paid {amount}, full refund {res['refund_amount']} on rejection")


if __name__ == "__main__":
    test_reject_gives_full_refund()
