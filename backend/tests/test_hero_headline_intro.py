"""Tests for owner-editable hero_headline & hero_intro settings."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback for backend-only environments; read from frontend/.env
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")

OWNER = {"email": "sabnamrajoria@gmail.com", "password": "Owner@123"}
ADMIN = {"email": "admin@komorebi.cafe", "password": "Admin@123"}

DEFAULT_HEADLINE = "Where sunlight\nfilters through\nthe trees."
DEFAULT_INTRO = "Reserve a table at Café Komorebi — a calm, light-filled retreat for warm afternoons, golden evenings and quiet celebrations."


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module", autouse=True)
def reset_defaults(owner_token):
    """Ensure defaults are set before and reset after the module."""
    yield
    # Teardown: reset
    requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_headline": DEFAULT_HEADLINE, "hero_intro": DEFAULT_INTRO},
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )


def test_public_settings_has_defaults():
    r = requests.get(f"{BASE_URL}/api/settings/public", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "hero_headline" in data
    assert "hero_intro" in data
    # Headline should contain newlines by default
    assert "\n" in data["hero_headline"], f"Expected newlines in headline, got: {data['hero_headline']!r}"


def test_owner_can_put_settings_with_newlines(owner_token):
    payload = {
        "hero_headline": "QA Headline Line1\nQA Line2\nQA Line3",
        "hero_intro": "QA intro paragraph for testing.",
    }
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json=payload,
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"

    # Verify persistence via public endpoint
    pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=15).json()
    assert pub["hero_headline"] == payload["hero_headline"]
    assert "\n" in pub["hero_headline"]
    assert pub["hero_intro"] == payload["hero_intro"]


def test_non_owner_admin_forbidden(admin_token):
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json={"hero_headline": "Hacked"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 403, f"Expected 403 for non-owner, got {r.status_code}: {r.text}"


def test_reset_to_defaults_and_regression_fields(owner_token):
    # Reset both + also send some other editable fields to ensure they don't wipe each other
    payload = {
        "hero_headline": DEFAULT_HEADLINE,
        "hero_intro": DEFAULT_INTRO,
        "hero_label": "Now serving",
        "hero_tagline": "Afternoon light & golden evenings",
    }
    r = requests.put(
        f"{BASE_URL}/api/admin/settings",
        json=payload,
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    pub = requests.get(f"{BASE_URL}/api/settings/public", timeout=15).json()
    assert pub["hero_headline"] == DEFAULT_HEADLINE
    assert pub["hero_intro"] == DEFAULT_INTRO
    assert pub.get("hero_label") == "Now serving"
    assert pub.get("hero_tagline") == "Afternoon light & golden evenings"
