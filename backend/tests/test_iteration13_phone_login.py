"""Iteration 13: phone-or-email login + public settings/tables/events shape."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

GUEST_EMAIL = "guest@komorebi.cafe"
GUEST_PASS = "Guest@123"
GUEST_PHONE = "9000012345"


def _login(identifier, password):
    return requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=30)


class TestPhoneOrEmailLogin:
    def test_login_with_email(self):
        r = _login(GUEST_EMAIL, GUEST_PASS)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str)

    def test_login_with_phone_last10(self):
        r = _login(GUEST_PHONE, GUEST_PASS)
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_login_with_phone_country_code_and_spaces(self):
        r = _login("+91 90000 12345", GUEST_PASS)
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_login_wrong_password(self):
        r = _login(GUEST_EMAIL, "WrongPass!")
        assert r.status_code == 401

    def test_register_then_phone_login_then_cleanup(self):
        suffix = str(int(time.time()))
        email = f"TEST_it13_{suffix}@example.com"
        phone = f"98{suffix[-8:]}"  # 10 digits
        payload = {"name": "TEST it13", "email": email, "password": "TestPass@123", "phone": phone}
        r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        # Login by phone
        r2 = _login(phone, "TestPass@123")
        assert r2.status_code == 200, r2.text
        assert "access_token" in r2.json()
        # Cleanup: best-effort via owner admin API if a delete-user endpoint exists
        try:
            owner = requests.post(f"{API}/auth/login", json={"identifier": "sabnamrajoria@gmail.com", "password": "Owner@123"}, timeout=30)
            if owner.status_code == 200:
                tok = owner.json().get("access_token")
                h = {"Authorization": f"Bearer {tok}"}
                # Try common cleanup endpoint variants
                for path in [f"/admin/users/by-email/{email}", f"/admin/users?email={email}"]:
                    try:
                        requests.delete(f"{API}{path}", headers=h, timeout=15)
                    except Exception:
                        pass
        except Exception:
            pass


class TestPublicEndpoints:
    def test_public_settings_shape(self):
        r = requests.get(f"{API}/settings/public", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "fee_per_person" in d
        assert "refund_percent" in d
        assert isinstance(d["fee_per_person"], (int, float))
        assert isinstance(d["refund_percent"], (int, float))

    def test_public_tables_shape(self):
        r = requests.get(f"{API}/tables/public", timeout=30)
        assert r.status_code == 200, r.text
        tables = r.json()
        assert isinstance(tables, list) and len(tables) >= 1
        sample = tables[0]
        for k in ("id", "name", "zone", "capacity"):
            assert k in sample, f"missing {k} in {sample}"
        zones = {t["zone"] for t in tables}
        assert "indoor" in zones or "outdoor" in zones

    def test_events_list(self):
        r = requests.get(f"{API}/events", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestPastEventFlow:
    """Create a past-dated event as owner, verify it exists, then delete it."""

    def test_past_event_create_and_delete(self):
        owner = requests.post(f"{API}/auth/login", json={"identifier": "sabnamrajoria@gmail.com", "password": "Owner@123"}, timeout=30)
        if owner.status_code != 200:
            pytest.skip("Owner login failed")
        tok = owner.json().get("access_token")
        h = {"Authorization": f"Bearer {tok}"}
        payload = {
            "title": "TEST_PAST_EVENT_it13",
            "date": "2020-01-15",
            "time": "18:00",
            "description": "Auto test past event",
            "image_url": "https://example.com/x.jpg",
        }
        r = requests.post(f"{API}/admin/events", json=payload, headers=h, timeout=30)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        eid = created.get("id") or created.get("_id")
        assert eid, f"no id in {created}"
        # Ensure present in /events
        listing = requests.get(f"{API}/events", timeout=30).json()
        assert any((e.get("id") == eid) for e in listing), "created past event not in /api/events"
        # Cleanup
        d = requests.delete(f"{API}/admin/events/{eid}", headers=h, timeout=30)
        assert d.status_code in (200, 204), d.text
