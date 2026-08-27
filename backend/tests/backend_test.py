"""Backend API tests for Café Komorebi Reservation System."""
import os
import pytest
import requests
from datetime import datetime, date, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://komorebi-reserve.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Load frontend .env if REACT_APP_BACKEND_URL is not set
if not os.environ.get('REACT_APP_BACKEND_URL'):
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                    API = f"{BASE_URL}/api"
    except Exception:
        pass


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def owner_token():
    return _login("sabnamrajoria@gmail.com", "Owner@123")


# --- Google auth ---
class TestGoogleAuth:
    def test_google_session_invalid(self):
        r = requests.post(f"{API}/auth/google/session", json={"session_id": "garbage-invalid-xyz-123"}, timeout=30)
        assert r.status_code == 401
        assert "invalid" in r.text.lower() or "expired" in r.text.lower()

    def test_google_session_empty_body(self):
        r = requests.post(f"{API}/auth/google/session", json={}, timeout=15)
        assert r.status_code in (400, 422)

    def test_google_session_empty_string(self):
        # empty session_id should still fail 401 or 400
        r = requests.post(f"{API}/auth/google/session", json={"session_id": ""}, timeout=30)
        assert r.status_code in (400, 401, 422)

@pytest.fixture(scope="session")
def admin_token():
    return _login("admin@komorebi.cafe", "Admin@123")

@pytest.fixture(scope="session")
def guest_token():
    return _login("guest@komorebi.cafe", "Guest@123")

def H(token):
    return {"Authorization": f"Bearer {token}"}


# --- Auth ---
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "guest@komorebi.cafe", "password": "wrong"})
        assert r.status_code == 401

    def test_login_owner(self, owner_token):
        r = requests.get(f"{API}/auth/me", headers=H(owner_token))
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"

    def test_login_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=H(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_login_guest(self, guest_token):
        r = requests.get(f"{API}/auth/me", headers=H(guest_token))
        assert r.status_code == 200
        assert r.json()["role"] == "customer"

    def test_register_and_login(self):
        email = f"TEST_user_{int(datetime.utcnow().timestamp())}@example.com".lower()
        r = requests.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email, "password": "TestPass@123", "phone": "1234567890"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert "access_token" in data
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email, "password": "TestPass@123"
        })
        assert r2.status_code == 400


# --- Public endpoints ---
class TestPublic:
    def test_public_settings(self):
        r = requests.get(f"{API}/settings/public")
        assert r.status_code == 200
        d = r.json()
        assert "fee_per_person" in d and "refund_percent" in d and "group_threshold" in d

    def test_booking_window(self):
        r = requests.get(f"{API}/booking-window")
        assert r.status_code == 200
        d = r.json()
        assert "start" in d and "end" in d
        start = date.fromisoformat(d["start"])
        end = date.fromisoformat(d["end"])
        assert end > start

    def test_availability_monday_closed(self):
        # find upcoming Monday
        today = date.today()
        days = (0 - today.weekday()) % 7 or 7
        monday = today + timedelta(days=days)
        r = requests.get(f"{API}/availability", params={"date": monday.isoformat(), "people": 2})
        assert r.status_code == 200
        d = r.json()
        assert d["open"] is False

    def test_availability_open_day(self):
        # find upcoming Wednesday within booking window
        r = requests.get(f"{API}/booking-window").json()
        start = date.fromisoformat(r["start"])
        end = date.fromisoformat(r["end"])
        target = None
        cur = start
        while cur < end:
            if cur.weekday() != 0:
                target = cur
                break
            cur += timedelta(days=1)
        assert target is not None
        r = requests.get(f"{API}/availability", params={"date": target.isoformat(), "people": 2})
        assert r.status_code == 200
        d = r.json()
        assert d["open"] is True
        assert len(d["slots"]) > 0
        assert d.get("bookable") is True


def _pick_bookable_date_and_slot(people=2):
    r = requests.get(f"{API}/booking-window").json()
    start = date.fromisoformat(r["start"])
    end = date.fromisoformat(r["end"])
    cur = start
    while cur < end:
        if cur.weekday() != 0:
            av = requests.get(f"{API}/availability", params={"date": cur.isoformat(), "people": people}).json()
            if av.get("open") and av.get("bookable"):
                for s in av["slots"]:
                    if s["available"]:
                        return cur.isoformat(), s["time"]
        cur += timedelta(days=1)
    return None, None


# --- Reservation Flow ---
class TestReservations:
    def test_policies_required(self, guest_token):
        d, t = _pick_bookable_date_and_slot()
        assert d and t
        r = requests.post(f"{API}/reservations", headers=H(guest_token), json={
            "booking_name": "TEST Guest", "date": d, "time": t, "people": 2,
            "phone": "9999999999", "special_occasion": "None", "policies_accepted": False
        })
        assert r.status_code == 400
        assert "polic" in r.text.lower()

    def test_normal_booking_confirmed_after_pay(self, guest_token):
        d, t = _pick_bookable_date_and_slot()
        assert d and t
        r = requests.post(f"{API}/reservations", headers=H(guest_token), json={
            "booking_name": "TEST Normal", "date": d, "time": t, "people": 2,
            "phone": "9999999999", "special_occasion": "None", "policies_accepted": True
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["needs_approval"] is False
        assert data["order"]["order_id"].startswith("order_mock_")
        rid = data["reservation_id"]
        # Pay
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest_token))
        assert p.status_code == 200, p.text
        pd = p.json()
        assert pd["status"] == "confirmed"
        assert pd["table_id"] is not None
        assert pd["table_name"]

        # cancel with 50% refund
        c = requests.post(f"{API}/reservations/{rid}/cancel", headers=H(guest_token))
        assert c.status_code == 200
        cd = c.json()
        assert cd["status"] == "cancelled"
        # refund_percent default 50
        assert cd["refund_amount"] > 0

    def test_special_occasion_needs_approval(self, guest_token):
        d, t = _pick_bookable_date_and_slot()
        assert d and t
        r = requests.post(f"{API}/reservations", headers=H(guest_token), json={
            "booking_name": "TEST Bday", "date": d, "time": t, "people": 2,
            "phone": "9999999999", "special_occasion": "Birthday", "policies_accepted": True
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["needs_approval"] is True
        rid = data["reservation_id"]
        p = requests.post(f"{API}/reservations/{rid}/pay", headers=H(guest_token))
        assert p.status_code == 200
        assert p.json()["status"] == "pending_approval"

        # Admin approve
        a = requests.post(f"{API}/admin/reservations/{rid}/approval",
                          headers=H(_login("admin@komorebi.cafe", "Admin@123")),
                          json={"action": "approve"})
        assert a.status_code == 200
        assert a.json()["status"] == "confirmed"
        assert a.json()["table_id"]

    def test_group_over_threshold_needs_approval(self, guest_token):
        d, t = _pick_bookable_date_and_slot(people=8)
        if not d:
            pytest.skip("No 8-seater slot available")
        r = requests.post(f"{API}/reservations", headers=H(guest_token), json={
            "booking_name": "TEST Group", "date": d, "time": t, "people": 8,
            "phone": "9999999999", "special_occasion": "None", "policies_accepted": True
        })
        assert r.status_code == 200
        assert r.json()["needs_approval"] is True

    def test_my_reservations(self, guest_token):
        r = requests.get(f"{API}/reservations/mine", headers=H(guest_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- Waitlist ---
class TestWaitlist:
    def test_join_waitlist(self, guest_token):
        d, t = _pick_bookable_date_and_slot()
        r = requests.post(f"{API}/waitlist", headers=H(guest_token), json={
            "booking_name": "TEST WL", "date": d, "time": t, "people": 2,
            "phone": "999", "special_occasion": "None"
        })
        assert r.status_code == 200
        assert r.json()["status"] == "waiting"


# --- Tables / Admin ---
class TestAdmin:
    def test_admin_today(self, admin_token):
        r = requests.get(f"{API}/admin/today", headers=H(admin_token))
        assert r.status_code == 200

    def test_admin_reservations(self, admin_token):
        r = requests.get(f"{API}/admin/reservations", headers=H(admin_token))
        assert r.status_code == 200

    def test_admin_waitlist(self, admin_token):
        r = requests.get(f"{API}/admin/waitlist", headers=H(admin_token))
        assert r.status_code == 200

    def test_tables_list(self, admin_token):
        r = requests.get(f"{API}/tables", headers=H(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 7  # 7 named tables seeded

    def test_table_status(self, admin_token):
        d, t = _pick_bookable_date_and_slot()
        r = requests.get(f"{API}/tables/status", headers=H(admin_token),
                          params={"date": d, "time": t})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_customer_cannot_access_admin(self, guest_token):
        r = requests.get(f"{API}/admin/reservations", headers=H(guest_token))
        assert r.status_code == 403

    def test_block_flow(self, admin_token):
        # Create a block for a random future date (2 months out, likely outside booking window)
        d = (date.today() + timedelta(days=60)).isoformat()
        r = requests.post(f"{API}/admin/blocks", headers=H(admin_token),
                          json={"type": "date", "date": d, "reason": "TEST_block"})
        assert r.status_code == 200
        bid = r.json()["id"]
        # verify availability is closed
        av = requests.get(f"{API}/availability", params={"date": d, "people": 2}).json()
        assert av["open"] is False
        # cleanup
        r2 = requests.delete(f"{API}/admin/blocks/{bid}", headers=H(admin_token))
        assert r2.status_code == 200


# --- Owner-only ---
class TestOwner:
    def test_admin_cannot_change_settings(self, admin_token):
        r = requests.put(f"{API}/admin/settings", headers=H(admin_token), json={"fee_per_person": 300})
        assert r.status_code == 403

    def test_owner_settings_update(self, owner_token):
        r = requests.put(f"{API}/admin/settings", headers=H(owner_token),
                          json={"fee_per_person": 300, "refund_percent": 50, "group_threshold": 6})
        assert r.status_code == 200
        d = r.json()
        assert d["fee_per_person"] == 300 and d["refund_percent"] == 50

    def test_owner_create_and_delete_table(self, owner_token):
        r = requests.post(f"{API}/tables", headers=H(owner_token),
                          json={"name": "TEST_Table", "capacity": 4, "zone": "indoor", "active": True})
        assert r.status_code == 200
        tid = r.json()["id"]
        r2 = requests.put(f"{API}/tables/{tid}", headers=H(owner_token),
                          json={"name": "TEST_Table_Upd", "capacity": 4, "zone": "indoor", "active": True})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Table_Upd"
        r3 = requests.delete(f"{API}/tables/{tid}", headers=H(owner_token))
        assert r3.status_code == 200

    def test_owner_users(self, owner_token):
        r = requests.get(f"{API}/admin/users", headers=H(owner_token))
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_owner_create_staff_and_change_role(self, owner_token):
        email = f"TEST_staff_{int(datetime.utcnow().timestamp())}@example.com"
        r = requests.post(f"{API}/admin/users", headers=H(owner_token),
                          json={"name": "TEST Staff", "email": email, "password": "Pass@1234", "role": "admin"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        r2 = requests.put(f"{API}/admin/users/{uid}/role", headers=H(owner_token),
                          json={"role": "customer"})
        assert r2.status_code == 200
        r3 = requests.delete(f"{API}/admin/users/{uid}", headers=H(owner_token))
        assert r3.status_code == 200

    def test_analytics(self, owner_token):
        r = requests.get(f"{API}/admin/analytics", headers=H(owner_token))
        assert r.status_code == 200
        d = r.json()
        assert "total_reservations" in d and "revenue" in d


# --- New Features: avatars, menu, table photos, upload ---
import io

def _tiny_png_bytes():
    # 1x1 transparent PNG
    import base64
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )


class TestAvatarInAuth:
    def test_me_has_picture_field(self, guest_token):
        r = requests.get(f"{API}/auth/me", headers=H(guest_token))
        assert r.status_code == 200
        d = r.json()
        assert "picture" in d  # may be None/empty for non-Google users
        assert "name" in d and d["name"]

    def test_login_response_has_picture(self):
        r = requests.post(f"{API}/auth/login", json={"email": "guest@komorebi.cafe", "password": "Guest@123"})
        assert r.status_code == 200
        d = r.json()
        assert "user" in d and "picture" in d["user"]


class TestPublicTables:
    def test_public_tables_no_auth(self):
        r = requests.get(f"{API}/tables/public")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 7
        for t in rows:
            for k in ("id", "name", "zone", "capacity", "image_url"):
                assert k in t


class TestMenu:
    def test_public_menu(self):
        r = requests.get(f"{API}/menu")
        assert r.status_code == 200
        d = r.json()
        assert "enabled" in d and "items" in d
        assert isinstance(d["items"], list)
        assert len(d["items"]) >= 6  # 6 seeded
        item = d["items"][0]
        for k in ("id", "name", "price"):
            assert k in item

    def test_admin_menu_list(self, admin_token):
        r = requests.get(f"{API}/admin/menu", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_customer_forbidden_admin_menu(self, guest_token):
        r = requests.get(f"{API}/admin/menu", headers=H(guest_token))
        assert r.status_code == 403

    def test_admin_cannot_write_menu(self, admin_token):
        # Admin (non-owner) must be 403 on write
        r = requests.post(f"{API}/admin/menu", headers=H(admin_token),
                          json={"name": "TEST_forbidden", "price": 100})
        assert r.status_code == 403

    def test_owner_menu_crud(self, owner_token):
        # CREATE
        create = requests.post(f"{API}/admin/menu", headers=H(owner_token), json={
            "name": "TEST_Latte", "description": "test desc", "price": 250,
            "category": "Drinks", "image_url": "", "active": True
        })
        assert create.status_code == 200, create.text
        item = create.json()
        assert item["name"] == "TEST_Latte" and item["price"] == 250
        assert "id" in item
        mid = item["id"]

        # LIST includes it
        lst = requests.get(f"{API}/admin/menu", headers=H(owner_token)).json()
        assert any(i["id"] == mid for i in lst)

        # UPDATE
        upd = requests.put(f"{API}/admin/menu/{mid}", headers=H(owner_token), json={
            "name": "TEST_Latte_Upd", "description": "x", "price": 300,
            "category": "Drinks", "image_url": "", "active": True
        })
        assert upd.status_code == 200
        assert upd.json()["price"] == 300 and upd.json()["name"] == "TEST_Latte_Upd"

        # Public menu sees it (active=true)
        pub = requests.get(f"{API}/menu").json()
        assert any(i["id"] == mid for i in pub["items"])

        # DELETE
        d = requests.delete(f"{API}/admin/menu/{mid}", headers=H(owner_token))
        assert d.status_code == 200


class TestMenuToggle:
    def test_toggle_menu_enabled(self, owner_token):
        try:
            # disable
            r = requests.put(f"{API}/admin/settings", headers=H(owner_token), json={"menu_enabled": False})
            assert r.status_code == 200
            pub = requests.get(f"{API}/menu").json()
            assert pub["enabled"] is False
            pubs = requests.get(f"{API}/settings/public").json()
            assert pubs["menu_enabled"] is False
        finally:
            # re-enable no matter what
            r2 = requests.put(f"{API}/admin/settings", headers=H(owner_token), json={"menu_enabled": True})
            assert r2.status_code == 200
        pub2 = requests.get(f"{API}/menu").json()
        assert pub2["enabled"] is True


class TestGenericUpload:
    def test_admin_forbidden_on_upload(self, admin_token):
        files = {"file": ("t.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(f"{API}/admin/upload?kind=table", headers=H(admin_token), files=files)
        assert r.status_code == 403

    def test_owner_upload_and_fetch(self, owner_token):
        files = {"file": ("t.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(f"{API}/admin/upload?kind=table", headers=H(owner_token), files=files)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "path" in d
        assert d["url"].startswith("/api/files/")
        # fetch
        f = requests.get(f"{BASE_URL}{d['url']}")
        assert f.status_code == 200
        assert f.headers.get("content-type", "").startswith("image/")

    def test_table_without_image(self, owner_token):
        # ensure optional image_url still permits creation
        r = requests.post(f"{API}/tables", headers=H(owner_token),
                          json={"name": "TEST_no_img", "capacity": 2, "zone": "indoor", "active": True})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert r.json().get("image_url", "") in ("", None)
        # cleanup
        requests.delete(f"{API}/tables/{tid}", headers=H(owner_token))

