"""Tests for editable hero caption (hero_label, hero_tagline) settings."""
import os
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
OWNER_EMAIL = os.environ["SUPER_ADMIN_EMAIL"]
OWNER_PASSWORD = os.environ["SUPER_ADMIN_PASSWORD"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

DEFAULT_LABEL = "Now serving"
DEFAULT_TAGLINE = "Afternoon light & golden evenings"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_EMAIL, OWNER_PASSWORD)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module", autouse=True)
def reset_after(owner_token):
    yield
    requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_label": DEFAULT_LABEL, "hero_tagline": DEFAULT_TAGLINE},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )


def test_public_settings_has_hero_fields():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "hero_label" in data
    assert "hero_tagline" in data


def test_admin_non_owner_forbidden(admin_token):
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_label": "Hack"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_owner_can_update_hero_fields_and_persist(owner_token):
    new_label = "QA Label X"
    new_tagline = "QA Test Tagline 123"
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_label": new_label, "hero_tagline": new_tagline},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    # public reflects
    pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=15).json()
    assert pub["hero_label"] == new_label
    assert pub["hero_tagline"] == new_tagline

    # admin reflects
    adm = requests.get(
        f"{BASE_URL}/api/admin/settings",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert adm.status_code == 200
    a = adm.json()
    assert a.get("hero_label") == new_label
    assert a.get("hero_tagline") == new_tagline


def test_regression_other_settings_preserved(owner_token):
    headers = {"Authorization": f"Bearer {owner_token}"}
    before = requests.get(f"{BASE_URL}/api/admin/settings", headers=headers, timeout=15).json()
    keys = ["fee_per_person", "refund_percent", "group_threshold", "hold_minutes",
            "special_needs_approval", "menu_enabled"]
    snapshot = {k: before.get(k) for k in keys}

    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_label": "RegTest", "hero_tagline": "RegTag"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200

    after = requests.get(f"{BASE_URL}/api/admin/settings", headers=headers, timeout=15).json()
    for k in keys:
        assert after.get(k) == snapshot[k], f"{k} changed from {snapshot[k]} to {after.get(k)}"


def test_reset_to_defaults(owner_token):
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_label": DEFAULT_LABEL, "hero_tagline": DEFAULT_TAGLINE},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=15).json()
    assert pub["hero_label"] == DEFAULT_LABEL
    assert pub["hero_tagline"] == DEFAULT_TAGLINE
