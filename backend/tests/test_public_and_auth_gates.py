"""Regression coverage for public API availability and unauthenticated auth gates."""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api_client():
    return requests.Session()


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL is not configured")
def test_api_root_is_available(api_client):
    response = api_client.get(f"{BASE_URL}/api/", timeout=20)
    assert response.status_code == 200
    assert response.json()["message"] == "Dental Coass API ready"


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL is not configured")
def test_auth_me_rejects_unauthenticated_request(api_client):
    response = api_client.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


@pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL is not configured")
@pytest.mark.parametrize("endpoint", ["dashboard", "patients", "calendar", "library", "inventory"])
def test_protected_endpoints_reject_unauthenticated_request(api_client, endpoint):
    response = api_client.get(f"{BASE_URL}/api/{endpoint}", timeout=20)
    assert response.status_code == 401