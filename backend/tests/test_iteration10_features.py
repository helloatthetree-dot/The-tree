"""Tests for iteration 10 features: booking window, party-size duration, named tables,
dietary approval, special-service approval, menu CSV upload, events CRUD."""
import io
import os
import pytest
import requests
from datetime import date, timedelta, datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{email} login failed: {r.text}"
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner():
    return _login("sabnamrajoria@gmail.com", "Owner@123")


@pytest.fixture(scope="module")
def admin():
    return _login("admin@komorebi.cafe", "Admin@123")


@pytest.fixture(scope="module")
def guest():
    return _login("guest@komorebi.cafe", "Guest@123")


def _next_non_monday(from_day: date) -> date:
    d = from_day
    while d.weekday() == 0:
        d += timedelta(days=1)
    return d


def _pick_slot(people=2, offset_days=1):
    d = _next_non_monday(date.today() + timedelta(days=offset_days))
    r = requests.get(f"{API}/availability", params={"date": d.isoformat(), "people": people}).json()
    if not r.get("open") or not r.get("bookable"):
        return None, None
    for s in r["slots"]:
        if s["available"]:
            return d.isoformat(), s["time"]
    return None, None


# -------- 1. Booking window --------
class TestBookingWindow:
    def test_window_today_to_plus_15(self):
        r = requests.get(f"{API}/booking-window")
        assert r.status_code == 200
        d = r.json()
        today = date.today()
        assert d["start"] == today.isoformat()
        assert d["end"] == (today + timedelta(days=15)).isoformat()

    def test_availability_within_window_bookable(self):
        target = _next_non_monday(date.today() + timedelta(days=1))
        r = requests.get(f"{API}/availability", params={"date": target.isoformat(), "people": 2}).json()
        assert r["open"] is True
        assert r["bookable"] is True

    def test_availability_beyond_window_not_bookable(self):
        far = (date.today() + timedelta(days=20))
        far = _next_non_monday(far)
        r = requests.get(f"{API}/availability", params={"date": far.isoformat(), "people": 2}).json()
        # open (café operates that day) but not bookable (outside 2-week window)
        assert r["open"] is True
        assert r["bookable"] is False


# -------- 2. Upcoming-only slots for today --------
class TestUpcomingSlots:
    def test_today_hides_past_slots(self):
        today = date.today()
        # Skip if today is Monday (closed)
        if today.weekday() == 0:
            pytest.skip("Today is Monday (closed)")
        # IST now
        now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
        cur_min = now_ist.hour * 60 + now_ist.minute
        r = requests.get(f"{API}/availability", params={"date": today.isoformat(), "people": 2}).json()
        assert r["open"] is True
        for s in r["slots"]:
            h, m = map(int, s["time"].split(":"))
            assert h * 60 + m > cur_min, f"Past slot {s['time']} exposed (now {now_ist.strftime('%H:%M')} IST)"

    def test_future_day_full_slot_list(self):
        # A future non-Monday should return the whole day's slot list
        d = _next_non_monday(date.today() + timedelta(days=2))
        r = requests.get(f"{API}/availability", params={"date": d.isoformat(), "people": 2}).json()
        assert r["open"] is True
        assert len(r["slots"]) >= 5  # cafe has multiple slots/day

    def test_monday_closed(self):
        today = date.today()
        days = (0 - today.weekday()) % 7 or 7
        monday = today + timedelta(days=days)
        r = requests.get(f"{API}/availability", params={"date": monday.isoformat(), "people": 2}).json()
        assert r["open"] is False
        assert "reason" in r


# -------- 3. Named tables --------
class TestNamedTables:
    def test_public_tables_named_seven(self):
        r = requests.get(f"{API}/tables/public")
        assert r.status_code == 200
        rows = r.json()
        # Filter to just seeded named tables (allow test residue like TEST_)
        expected = {"Spicy": 2, "Umami": 2, "Salty": 4, "Tangy": 4, "Fruity": 6, "Malty": 6, "Smoky": 5}
        named = {t["name"]: t for t in rows if t["name"] in expected}
        for n, cap in expected.items():
            assert n in named, f"Missing seeded table {n}"
            assert named[n]["capacity"] == cap, f"{n}: got capacity {named[n]['capacity']} want {cap}"


# -------- 4. Party-size duration + allocation cascade --------
class TestPartyDurationAndAllocation:
    def _book_and_pay(self, tok, d, t, people, special="None", **extra):
        body = {"booking_name": f"TEST_{people}p", "date": d, "time": t, "people": people,
                "phone": "9999999999", "special_occasion": special, "policies_accepted": True}
        body.update(extra)
        r = requests.post(f"{API}/reservations", headers=H(tok), json=body)
        assert r.status_code == 200, r.text
        rid = r.json()["reservation_id"]
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(tok))
        assert p.status_code == 200, p.text
        return rid, p.json()

    def _cancel(self, tok, rid):
        requests.post(f"{API}/reservations/{rid}/cancel", headers=H(tok))

    def test_2guest_stores_duration_120_and_allocates(self, guest):
        d, t = _pick_slot(people=2, offset_days=3)
        assert d and t
        rid, pd = self._book_and_pay(guest, d, t, 2)
        try:
            assert pd["status"] == "confirmed", pd
            assert pd["table_id"]
            assert pd.get("duration_minutes") == 120
        finally:
            self._cancel(guest, rid)

    def test_5guest_stores_duration_180(self, guest):
        d, t = _pick_slot(people=5, offset_days=4)
        assert d and t
        rid, pd = self._book_and_pay(guest, d, t, 5)
        try:
            assert pd["status"] == "confirmed"
            assert pd.get("duration_minutes") == 180
        finally:
            self._cancel(guest, rid)

    def test_6guest_confirms_and_stores_duration_210(self, guest):
        d, t = _pick_slot(people=6, offset_days=5)
        assert d and t
        rid, pd = self._book_and_pay(guest, d, t, 6)
        try:
            # threshold=6, `>` so 6 does NOT need approval
            assert pd["status"] == "confirmed", pd
            assert pd.get("duration_minutes") == 210
        finally:
            self._cancel(guest, rid)

    def test_7guest_needs_approval(self, guest):
        d, t = _pick_slot(people=7, offset_days=6)
        if not (d and t):
            pytest.skip("no 7+ slot")
        body = {"booking_name": "TEST_7p", "date": d, "time": t, "people": 7,
                "phone": "9999999999", "special_occasion": "None", "policies_accepted": True}
        r = requests.post(f"{API}/reservations", headers=H(guest), json=body)
        assert r.status_code == 200
        assert r.json()["needs_approval"] is True
        rid = r.json()["reservation_id"]
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest))
        assert p.status_code == 200
        assert p.json()["status"] == "pending_approval"
        self._cancel(guest, rid)

    def test_allocation_cascades_to_larger_tables(self, guest):
        """Book 2-guest reservations at same slot repeatedly.
        Should be allowed at least 3 times (2x 2-seaters + 2x 4-seaters as fallback)."""
        d, t = _pick_slot(people=2, offset_days=7)
        assert d and t
        rids = []
        try:
            tables_used = []
            for i in range(3):
                body = {"booking_name": f"TEST_cascade_{i}", "date": d, "time": t, "people": 2,
                        "phone": "9999999999", "special_occasion": "None", "policies_accepted": True}
                r = requests.post(f"{API}/reservations", headers=H(guest), json=body)
                if r.status_code != 200:
                    break
                rid = r.json()["reservation_id"]
                rids.append(rid)
                p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest))
                assert p.status_code == 200
                pd = p.json()
                assert pd["status"] == "confirmed", pd
                tables_used.append(pd["table_name"])
            # At least 3 successful bookings for a 2-person party
            assert len(tables_used) >= 3, f"Only {len(tables_used)} 2-guest bookings could allocate"
            # tables should not be all the same (cascade happened)
            assert len(set(tables_used)) >= 2, f"All routed to same table {tables_used}"
        finally:
            for rid in rids:
                self._cancel(guest, rid)


# -------- 5. Dietary + special-service approval flow --------
class TestApprovalToggles:
    def test_dietary_yes_needs_approval(self, guest):
        d, t = _pick_slot(people=2, offset_days=8)
        assert d and t
        body = {"booking_name": "TEST_diet", "date": d, "time": t, "people": 2,
                "phone": "9999999999", "special_occasion": "None", "policies_accepted": True,
                "has_dietary": True, "dietary_note": "nut allergy"}
        r = requests.post(f"{API}/reservations", headers=H(guest), json=body)
        assert r.status_code == 200
        assert r.json()["needs_approval"] is True
        rid = r.json()["reservation_id"]
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest))
        assert p.json()["status"] == "pending_approval"
        requests.post(f"{API}/reservations/{rid}/cancel", headers=H(guest))

    def test_special_occasion_with_service_needs_approval(self, guest):
        d, t = _pick_slot(people=2, offset_days=9)
        assert d and t
        body = {"booking_name": "TEST_svc", "date": d, "time": t, "people": 2,
                "phone": "9999999999", "special_occasion": "Birthday", "policies_accepted": True,
                "special_service": True}
        r = requests.post(f"{API}/reservations", headers=H(guest), json=body)
        assert r.status_code == 200
        assert r.json()["needs_approval"] is True
        rid = r.json()["reservation_id"]
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest))
        assert p.json()["status"] == "pending_approval"
        requests.post(f"{API}/reservations/{rid}/cancel", headers=H(guest))


# -------- 6. Menu CSV upload --------
DEFAULT_MENU_CSV = (
    "name,description,price,category\n"
    "Komorebi Pour-Over,Single-origin beans brewed slow over filtered light.,320,Coffee\n"
    "Matcha Cloud Latte,Ceremonial matcha oat milk a whisper of cane sugar.,340,Coffee\n"
    "Yuzu Cheesecake,Baked cheesecake with bright yuzu and a sesame crust.,380,Dessert\n"
    "Garden Soba Bowl,Chilled soba seasonal greens sesame-ginger dressing.,460,Mains\n"
    "Maple Miso Toast,Sourdough miso butter maple toasted walnuts.,290,Small Plates\n"
    "Hojicha Affogato,Roasted-tea ice cream drowned in warm espresso.,300,Dessert\n"
)


class TestMenuUpload:
    def test_admin_forbidden(self, admin):
        files = {"file": ("m.csv", b"name,price\nTEST_x,100\n", "text/csv")}
        r = requests.post(f"{API}/admin/menu/upload", headers=H(admin), files=files)
        assert r.status_code == 403

    def test_owner_upload_replaces_menu_and_public_reflects(self, owner):
        try:
            csv_bytes = "name,description,price,category\nTEST_A,desc a,111,Coffee\nTEST_B,desc b,222,Dessert\n".encode()
            files = {"file": ("upload.csv", csv_bytes, "text/csv")}
            r = requests.post(f"{API}/admin/menu/upload", headers=H(owner), files=files)
            assert r.status_code == 200, r.text
            assert r.json()["count"] == 2
            pub = requests.get(f"{API}/menu").json()
            names = [i["name"] for i in pub["items"]]
            assert "TEST_A" in names and "TEST_B" in names
            assert len(pub["items"]) == 2
        finally:
            # ALWAYS restore default menu
            files = {"file": ("restore.csv", DEFAULT_MENU_CSV.encode(), "text/csv")}
            r2 = requests.post(f"{API}/admin/menu/upload", headers=H(owner), files=files)
            assert r2.status_code == 200
            assert r2.json()["count"] == 6
            pub2 = requests.get(f"{API}/menu").json()
            assert len(pub2["items"]) == 6


# -------- 7. Events --------
class TestEvents:
    def test_public_events_returns_list(self):
        r = requests.get(f"{API}/events")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_cannot_write_event(self, admin):
        body = {"title": "TEST_admin_evt", "description": "x", "date": (date.today() + timedelta(days=5)).isoformat()}
        r = requests.post(f"{API}/admin/events", headers=H(admin), json=body)
        assert r.status_code == 403

    def test_owner_event_crud(self, owner):
        d = (date.today() + timedelta(days=10)).isoformat()
        body = {"title": "TEST_evt_1", "description": "hello", "date": d, "image_url": "", "active": True}
        r = requests.post(f"{API}/admin/events", headers=H(owner), json=body)
        assert r.status_code == 200, r.text
        ev = r.json()
        eid = ev["id"]
        assert ev["title"] == "TEST_evt_1"

        # Public list should include it
        pub = requests.get(f"{API}/events").json()
        assert any(e["id"] == eid for e in pub)

        # Update
        upd = {"title": "TEST_evt_upd", "description": "y", "date": d, "image_url": "", "active": True}
        r2 = requests.put(f"{API}/admin/events/{eid}", headers=H(owner), json=upd)
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_evt_upd"

        # Delete
        r3 = requests.delete(f"{API}/admin/events/{eid}", headers=H(owner))
        assert r3.status_code == 200
        pub2 = requests.get(f"{API}/events").json()
        assert not any(e["id"] == eid for e in pub2)
