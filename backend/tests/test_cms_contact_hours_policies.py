"""Tests for CMS-editable settings: contact/WhatsApp, hours, policies."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://komorebi-reserve.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_token():
    return _login("sabnamrajoria@gmail.com", "Owner@123")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@komorebi.cafe", "Admin@123")


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


DEFAULT_HOURS = [
    {"days": "Sat & Sun", "time": "10:00 AM – 10:00 PM", "note": "Weekend hours"},
    {"days": "Tue – Fri", "time": "11:30 AM – 10:00 PM", "note": "Weekday hours"},
    {"days": "Monday", "time": "Closed", "note": "We rest and reset."},
]
DEFAULT_POLICIES = [
    {"title": "Reservation window", "body": "You can book up to 14 days in advance."},
    {"title": "Group threshold", "body": "Parties above 6 need approval."},
    {"title": "Cancellations", "body": "Cancel any time before your slot for a 50% refund."},
    {"title": "Special occasions", "body": "Tell us about birthdays/anniversaries at booking."},
    {"title": "Dietary needs", "body": "Share allergies during booking so we can prepare."},
    {"title": "Arrival window", "body": "Please arrive within 15 minutes of your slot."},
]
DEFAULT_CONTACT = {
    "contact_heading": "Reach us on WhatsApp",
    "contact_whatsapp": "919148271005",
    "contact_phone": "",
    "contact_email": "",
    "contact_address": "",
    "policies_intro": "A few gentle guidelines so every guest enjoys the calm of The Tree.",
}


class TestPublicHasCmsFields:
    def test_public_settings_returns_new_fields(self):
        r = requests.get(f"{API}/settings/public")
        assert r.status_code == 200
        d = r.json()
        for k in ["contact_heading", "contact_whatsapp", "contact_phone", "contact_email",
                  "contact_address", "policies_intro", "hours", "policies"]:
            assert k in d, f"missing field {k}"
        assert isinstance(d["hours"], list) and len(d["hours"]) >= 1
        assert isinstance(d["policies"], list) and len(d["policies"]) >= 1
        # WhatsApp default
        assert d["contact_whatsapp"], "contact_whatsapp should not be empty"


class TestAdminCannotWriteCms:
    def test_admin_forbidden(self, admin_token):
        r = requests.put(f"{API}/admin/settings", headers=H(admin_token),
                         json={"contact_heading": "hack"})
        assert r.status_code == 403


class TestOwnerCmsPersistence:
    def test_owner_updates_contact_and_persists(self, owner_token):
        payload = {
            "contact_heading": "TEST_Ping us on WhatsApp",
            "contact_whatsapp": "919000000000",
            "contact_phone": "+91 90000 11111",
            "contact_email": "test@thetree.cafe",
            "contact_address": "TEST 123, Bengaluru",
        }
        try:
            r = requests.put(f"{API}/admin/settings", headers=H(owner_token), json=payload)
            assert r.status_code == 200, r.text
            body = r.json()
            for k, v in payload.items():
                assert body[k] == v
            # GET public
            pub = requests.get(f"{API}/settings/public").json()
            for k, v in payload.items():
                assert pub[k] == v, f"public did not persist {k}"
        finally:
            requests.put(f"{API}/admin/settings", headers=H(owner_token), json=DEFAULT_CONTACT)

    def test_owner_updates_hours(self, owner_token):
        new_hours = [
            {"days": "TEST Mon-Fri", "time": "9-5", "note": "Test note"},
            {"days": "TEST Sat", "time": "10-6", "note": ""},
        ]
        try:
            r = requests.put(f"{API}/admin/settings", headers=H(owner_token),
                             json={"hours": new_hours})
            assert r.status_code == 200
            assert r.json()["hours"] == new_hours
            pub = requests.get(f"{API}/settings/public").json()
            assert pub["hours"] == new_hours
        finally:
            requests.put(f"{API}/admin/settings", headers=H(owner_token),
                         json={"hours": DEFAULT_HOURS})

    def test_owner_updates_policies(self, owner_token):
        new_policies = [
            {"title": "TEST P1", "body": "TEST body 1"},
            {"title": "TEST P2", "body": "TEST body 2"},
        ]
        try:
            r = requests.put(f"{API}/admin/settings", headers=H(owner_token), json={
                "policies_intro": "TEST intro paragraph",
                "policies": new_policies,
            })
            assert r.status_code == 200
            assert r.json()["policies"] == new_policies
            assert r.json()["policies_intro"] == "TEST intro paragraph"
            pub = requests.get(f"{API}/settings/public").json()
            assert pub["policies"] == new_policies
            assert pub["policies_intro"] == "TEST intro paragraph"
        finally:
            requests.put(f"{API}/admin/settings", headers=H(owner_token), json={
                "policies_intro": DEFAULT_CONTACT["policies_intro"],
                "policies": DEFAULT_POLICIES,
            })

    def test_restore_defaults_sanity(self, owner_token):
        pub = requests.get(f"{API}/settings/public").json()
        assert pub["contact_whatsapp"] == "919148271005"
        assert len(pub["hours"]) >= 3
        assert len(pub["policies"]) >= 6
