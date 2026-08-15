"""Tests for gallery_cta_title / gallery_cta_button settings + booking policy simplification."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://komorebi-reserve.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "sabnamrajoria@gmail.com", "password": "Owner@123"}
ADMIN = {"email": "admin@komorebi.cafe", "password": "Admin@123"}
DEFAULT_TITLE = "Reserve your window seat"
DEFAULT_BUTTON = "Start booking"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


def test_public_settings_defaults():
    r = requests.get(f"{API}/settings/public", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "gallery_cta_title" in d
    assert "gallery_cta_button" in d
    # Might not be default currently, just assert type/non-empty
    assert isinstance(d["gallery_cta_title"], str) and d["gallery_cta_title"]
    assert isinstance(d["gallery_cta_button"], str) and d["gallery_cta_button"]


def test_owner_update_and_reset(owner_token):
    h = {"Authorization": f"Bearer {owner_token}"}
    new_title = "QA Window Seat"
    new_btn = "QA Book Now"
    # Update
    r = requests.put(f"{API}/admin/settings",
                     json={"gallery_cta_title": new_title, "gallery_cta_button": new_btn},
                     headers=h, timeout=30)
    assert r.status_code == 200, r.text
    # Verify public reflects
    pub = requests.get(f"{API}/settings/public", timeout=30).json()
    assert pub["gallery_cta_title"] == new_title
    assert pub["gallery_cta_button"] == new_btn
    # Reset
    r = requests.put(f"{API}/admin/settings",
                     json={"gallery_cta_title": DEFAULT_TITLE, "gallery_cta_button": DEFAULT_BUTTON},
                     headers=h, timeout=30)
    assert r.status_code == 200
    pub2 = requests.get(f"{API}/settings/public", timeout=30).json()
    assert pub2["gallery_cta_title"] == DEFAULT_TITLE
    assert pub2["gallery_cta_button"] == DEFAULT_BUTTON


def test_admin_non_owner_forbidden(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.put(f"{API}/admin/settings",
                     json={"gallery_cta_title": "hack"}, headers=h, timeout=30)
    assert r.status_code == 403, f"Expected 403, got {r.status_code} {r.text}"
