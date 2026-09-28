"""Comprehensive backend tests for the Dental Coass tracker (iteration 3)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
SESSION_TOKEN = "test_session_a007d529bd5c41d5b0b715236d6a9d1e"

pytestmark = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL missing")


@pytest.fixture(scope="session")
def anon():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def auth():
    s = requests.Session()
    s.cookies.set("session_token", SESSION_TOKEN,
                  domain="odonto-coass-hub.preview.emergentagent.com", path="/")
    return s


# ---------------- Auth gates ----------------
@pytest.mark.parametrize("path", [
    "dashboard", "patients", "calendar", "sops", "journals",
    "supervisors", "reminders", "inventory", "expenses",
    "files", "drive/status", "settings/integrations", "safety/rules",
])
def test_unauth_401(anon, path):
    r = anon.get(f"{BASE_URL}/api/{path}", timeout=20)
    assert r.status_code == 401, f"{path} -> {r.status_code}"


def test_root_public(anon):
    r = anon.get(f"{BASE_URL}/api/", timeout=20)
    assert r.status_code == 200
    assert "message" in r.json()


def test_auth_me(auth):
    r = auth.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "test.koas@dental-tracker.dev"
    assert body["user_id"] == "user_test_koas_01"


# ---------------- Dashboard ----------------
def test_dashboard(auth):
    r = auth.get(f"{BASE_URL}/api/dashboard", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert len(body["departments"]) == 8
    assert "countdown" in body and body["countdown"] >= 0
    assert "overall" in body


# ---------------- Patients CRUD + seed ----------------
def test_patients_seed_and_crud(auth):
    r = auth.get(f"{BASE_URL}/api/patients", timeout=20)
    assert r.status_code == 200
    patients = r.json()
    assert len(patients) >= 4
    names = {p["name"] for p in patients}
    assert "Bagas Wijaya" in names

    # Idempotent seeding: second call same count
    r2 = auth.get(f"{BASE_URL}/api/patients", timeout=20)
    assert len(r2.json()) == len(patients)

    # Create
    payload = {"name": f"TEST_{uuid.uuid4().hex[:6]}", "department": "Konservasi Gigi",
               "medical_history": ["Hipertensi"], "allergies": ["Penisilin"]}
    r = auth.post(f"{BASE_URL}/api/patients", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    # Patch tooth_map
    tm = {"46": ["Caries", "RCT"]}
    r = auth.patch(f"{BASE_URL}/api/patients/{pid}",
                   json={"tooth_map": tm, "notes": "updated"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["tooth_map"]["46"] == ["Caries", "RCT"]

    # Verify persist via GET list
    listing = auth.get(f"{BASE_URL}/api/patients", timeout=20).json()
    found = next(p for p in listing if p["id"] == pid)
    assert found["tooth_map"]["46"] == ["Caries", "RCT"]
    assert found["notes"] == "updated"

    # Delete
    r = auth.delete(f"{BASE_URL}/api/patients/{pid}", timeout=20)
    assert r.status_code == 200
    ids_after = {p["id"] for p in auth.get(f"{BASE_URL}/api/patients").json()}
    assert pid not in ids_after


# ---------------- Safety Engine ----------------
def test_safety_check(auth):
    r = auth.post(f"{BASE_URL}/api/safety/check",
                  json={"history": ["Hipertensi", "Kehamilan"], "allergies": ["Penisilin"]},
                  timeout=20)
    assert r.status_code == 200
    alerts = r.json()["alerts"]
    titles = {a["title"] for a in alerts}
    assert "Hipertensi" in titles
    assert "Kehamilan" in titles
    assert "Alergi Penisilin" in titles
    # Kehamilan critical
    keh = next(a for a in alerts if a["title"] == "Kehamilan")
    assert keh["severity"] == "critical"


def test_safety_rules(auth):
    r = auth.get(f"{BASE_URL}/api/safety/rules", timeout=20)
    assert r.status_code == 200
    rules = r.json()
    assert len(rules) >= 10
    assert all("recommendation" in x and "severity" in x for x in rules)


# ---------------- Calendar CRUD ----------------
def test_calendar_crud(auth):
    from datetime import date
    today = date.today().isoformat()
    month = today[:7]
    r = auth.post(f"{BASE_URL}/api/calendar",
                  json={"date": today, "title": "TEST_event", "kind": "Pasien"}, timeout=20)
    assert r.status_code == 200
    eid = r.json()["id"]

    r = auth.get(f"{BASE_URL}/api/calendar?month={month}", timeout=20)
    assert r.status_code == 200
    assert any(e["id"] == eid for e in r.json())

    r = auth.patch(f"{BASE_URL}/api/calendar/{eid}", json={"done": True}, timeout=20)
    assert r.status_code == 200

    r = auth.delete(f"{BASE_URL}/api/calendar/{eid}", timeout=20)
    assert r.status_code == 200


# ---------------- Supervisors ----------------
def test_supervisors(auth):
    r = auth.get(f"{BASE_URL}/api/supervisors", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 3
    r = auth.post(f"{BASE_URL}/api/supervisors",
                  json={"name": "TEST_drg. X", "department": "Konservasi", "piket_day": "Jumat"},
                  timeout=20)
    assert r.status_code == 200
    sid = r.json()["id"]
    r = auth.delete(f"{BASE_URL}/api/supervisors/{sid}", timeout=20)
    assert r.status_code == 200


# ---------------- SOPs ----------------
def test_sops(auth):
    r = auth.get(f"{BASE_URL}/api/sops", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 4
    r = auth.get(f"{BASE_URL}/api/sops?category=Konservasi", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 1
    r = auth.post(f"{BASE_URL}/api/sops",
                  json={"title": "TEST_sop", "category": "Konservasi", "steps": "1. Test"},
                  timeout=20)
    sid = r.json()["id"]
    r = auth.delete(f"{BASE_URL}/api/sops/{sid}", timeout=20)
    assert r.status_code == 200


# ---------------- Journals ----------------
def test_journals(auth):
    r = auth.get(f"{BASE_URL}/api/journals", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) >= 2
    r = auth.post(f"{BASE_URL}/api/journals",
                  json={"title": "TEST_journal", "source": "Test", "url": "https://x.com"},
                  timeout=20)
    jid = r.json()["id"]
    r = auth.delete(f"{BASE_URL}/api/journals/{jid}", timeout=20)
    assert r.status_code == 200


# ---------------- Reminders ----------------
def test_reminders(auth):
    r = auth.post(f"{BASE_URL}/api/reminders",
                  json={"text": "TEST_reminder", "due": "2026-12-01"}, timeout=20)
    assert r.status_code == 200
    rid = r.json()["id"]
    r = auth.get(f"{BASE_URL}/api/reminders", timeout=20)
    assert any(x["id"] == rid for x in r.json())
    r = auth.patch(f"{BASE_URL}/api/reminders/{rid}", json={"done": True}, timeout=20)
    assert r.status_code == 200
    r = auth.delete(f"{BASE_URL}/api/reminders/{rid}", timeout=20)
    assert r.status_code == 200


# ---------------- AI SSE ----------------
def test_ai_stream(auth):
    r = auth.post(f"{BASE_URL}/api/ai/stream",
                  json={"mode": "chat", "prompt": "Sebutkan langkah triase karies"},
                  stream=True, timeout=60)
    assert r.status_code == 200
    saw_data = False
    saw_done = False
    for line in r.iter_lines(decode_unicode=True):
        if not line:
            continue
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload == "[DONE]":
                saw_done = True
                break
            saw_data = True
    assert saw_data, "No data chunk received"
    assert saw_done


# ---------------- Drive ----------------
def test_drive_status(auth):
    r = auth.get(f"{BASE_URL}/api/drive/status", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "connected" in body and "folder_name" in body


def test_drive_connect(auth):
    r = auth.get(f"{BASE_URL}/api/drive/connect", timeout=20)
    # If OAuth not configured, server returns 503; accept either
    if r.status_code == 503:
        pytest.skip("Google Drive OAuth not configured")
    assert r.status_code == 200
    url = r.json().get("authorization_url", "")
    assert "google.com" in url or "googleapis.com" in url
