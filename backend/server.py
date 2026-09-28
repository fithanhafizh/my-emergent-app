from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Header, Query
from fastapi.responses import StreamingResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import os, uuid, logging, requests, json, io
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="Dental Coass Master Dashboard")
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
storage_key = None
APP_NAME = "dental-coass-tracker"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
DRIVE_REDIRECT_URI = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI")

# ---------------- Models ----------------
class SessionPayload(BaseModel):
    session_id: str

class AiRequest(BaseModel):
    mode: str = "chat"
    prompt: str
    patient_context: Optional[dict] = None

class PatientUpsert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    rm: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    department: Optional[str] = None
    diagnosis: Optional[str] = None
    tag: Optional[str] = None
    reliability: Optional[str] = "green"
    medical_history: Optional[List[str]] = []
    allergies: Optional[List[str]] = []
    notes: Optional[str] = ""
    tooth_map: Optional[Dict[str, List[str]]] = {}

class PatientUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tooth_map: Optional[Dict[str, List[str]]] = None
    medical_history: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    notes: Optional[str] = None
    diagnosis: Optional[str] = None
    tag: Optional[str] = None
    reliability: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: str  # YYYY-MM-DD
    time: Optional[str] = ""
    title: str
    kind: str = "Pasien"  # Pasien / Bimbingan / Deadline / Reminder
    patient_id: Optional[str] = None
    supervisor_id: Optional[str] = None
    notes: Optional[str] = ""
    done: Optional[bool] = False

class Supervisor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    department: Optional[str] = ""
    piket_day: Optional[str] = ""  # Senin, Selasa, ...
    phone: Optional[str] = ""
    notes: Optional[str] = ""

class SOP(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    category: str
    steps: Optional[str] = ""
    read_time: Optional[str] = "5 min"
    tags: Optional[List[str]] = []

class Journal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    source: Optional[str] = ""
    url: Optional[str] = ""
    department: Optional[str] = ""
    highlights: Optional[str] = ""

class SafetyCheck(BaseModel):
    history: List[str] = []
    allergies: List[str] = []

# ---------------- Auth ----------------
async def current_user(request: Request, authorization: Optional[str] = None):
    token = request.cookies.get("session_token")
    if not token and authorization and isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Session not found")
    expires = session.get("expires_at")
    if isinstance(expires, str): expires = datetime.fromisoformat(expires)
    if expires and expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user: raise HTTPException(401, "User not found")
    return user

@api_router.get("/")
async def root(): return {"message": "Dental Coass API ready"}

@api_router.post("/auth/session")
async def exchange_session(payload: SessionPayload, response: Response):
    try:
        r = requests.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": payload.session_id}, timeout=20)
        r.raise_for_status(); data = r.json()
    except Exception as exc:
        logger.warning("OAuth exchange failed: %s", exc)
        raise HTTPException(401, "Google session could not be verified")
    user_id = "user_" + uuid.uuid4().hex[:12]
    existing = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if existing: user_id = existing["user_id"]
    user = {"user_id": user_id, "email": data["email"], "name": data.get("name", "Dental Coass"),
            "picture": data.get("picture", ""), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"email": data["email"]}, {"$set": user}, upsert=True)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": data["session_token"],
                                       "expires_at": expires.isoformat(),
                                       "created_at": datetime.now(timezone.utc).isoformat()})
    response.set_cookie("session_token", data["session_token"], max_age=604800, httponly=True,
                        secure=True, samesite="none", path="/")
    return user

@api_router.get("/auth/me")
async def me(request: Request, authorization: Optional[str] = Header(None)):
    return await current_user(request, authorization)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token: await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------------- Dashboard & Requirements ----------------
DEPARTMENTS = [("Bedah Mulut", 20), ("Konservasi Gigi", 25), ("Periodonsia", 18),
               ("Prostodonsia", 15), ("Ortodonsia", 12), ("Pedodonsia", 20),
               ("Oral Medicine", 18), ("Radiologi", 20)]

DEFAULT_REQUIREMENTS = {
    "Bedah Mulut": [("Ekstraksi Gigi Anterior", 5), ("Ekstraksi Gigi Posterior", 5),
                    ("Odontektomi M3", 2), ("Alveolektomi", 1)],
    "Konservasi Gigi": [("Tumpatan Kelas I", 5), ("Tumpatan Kelas II", 5),
                        ("Tumpatan Kelas III", 3), ("Tumpatan Kelas V", 2),
                        ("Perawatan Saluran Akar", 2)],
    "Periodonsia": [("Scaling & Root Planing", 5), ("Kuretase", 2), ("Splinting", 1)],
    "Prostodonsia": [("Gigi Tiruan Lepasan Sebagian", 2), ("Gigi Tiruan Cekat / Crown", 2),
                     ("Denture Reline / Rebase", 1)],
    "Ortodonsia": [("Analisis Model & Diagnosis", 3), ("Removable Appliance", 2)],
    "Pedodonsia": [("Pulpotomi", 2), ("Tumpatan Gigi Sulung", 3),
                   ("Fissure Sealant", 2), ("Space Maintainer", 1)],
    "Oral Medicine": [("Anamnesis Lesi Mukosa", 5), ("Terapi Ulkus Aftosa", 2)],
    "Radiologi": [("Interpretasi Periapikal", 5), ("Interpretasi Panoramik", 3)],
}

class RequirementCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    department: str
    name: str
    target: int = 1
    notes: Optional[str] = ""

class RequirementUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    target: Optional[int] = None
    done: Optional[int] = None
    delta: Optional[int] = None
    notes: Optional[str] = None


async def seed_requirements_if_empty(uid: str):
    if await db.requirements.count_documents({"owner_id": uid}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for dept, items in DEFAULT_REQUIREMENTS.items():
        for name, target in items:
            docs.append({
                "req_id": "req_" + uuid.uuid4().hex[:12],
                "owner_id": uid, "department": dept, "name": name,
                "target": target, "done": 0, "notes": "",
                "created_at": now
            })
    if docs:
        await db.requirements.insert_many(docs)


@api_router.get("/requirements")
async def list_requirements(request: Request, department: Optional[str] = None):
    user = await current_user(request)
    uid = user["user_id"]
    await seed_requirements_if_empty(uid)
    q = {"owner_id": uid}
    if department:
        q["department"] = department
    items = await db.requirements.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api_router.post("/requirements")
async def create_requirement(payload: RequirementCreate, request: Request):
    user = await current_user(request)
    doc = {
        "req_id": "req_" + uuid.uuid4().hex[:12],
        "owner_id": user["user_id"],
        "department": payload.department,
        "name": payload.name.strip(),
        "target": max(1, int(payload.target or 1)),
        "done": 0, "notes": payload.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.requirements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/requirements/{req_id}")
async def update_requirement(req_id: str, payload: RequirementUpdate, request: Request):
    user = await current_user(request)
    q = {"req_id": req_id, "owner_id": user["user_id"]}
    current = await db.requirements.find_one(q)
    if not current:
        raise HTTPException(404, "Requirement tidak ditemukan")
    updates: Dict[str, Any] = {}
    if payload.name is not None: updates["name"] = payload.name.strip()
    if payload.target is not None: updates["target"] = max(1, int(payload.target))
    if payload.notes is not None: updates["notes"] = payload.notes
    if payload.done is not None:
        updates["done"] = max(0, int(payload.done))
    elif payload.delta is not None:
        updates["done"] = max(0, int(current.get("done", 0)) + int(payload.delta))
    if updates:
        await db.requirements.update_one(q, {"$set": updates})
    doc = await db.requirements.find_one(q, {"_id": 0})
    return doc


@api_router.delete("/requirements/{req_id}")
async def delete_requirement(req_id: str, request: Request):
    user = await current_user(request)
    r = await db.requirements.delete_one({"req_id": req_id, "owner_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Requirement tidak ditemukan")
    return {"ok": True}


@api_router.get("/requirements/{req_id}/patients")
async def requirement_patients(req_id: str, request: Request):
    user = await current_user(request)
    uid = user["user_id"]
    req = await db.requirements.find_one({"req_id": req_id, "owner_id": uid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Requirement tidak ditemukan")
    # Cross-link: patients in same department whose diagnosis matches requirement name (substring)
    kw = (req.get("name") or "").lower().split()
    patients = await db.patients.find(
        {"owner_id": uid, "department": req["department"]}, {"_id": 0}
    ).to_list(500)
    matches = []
    for p in patients:
        hay = (p.get("diagnosis") or "").lower() + " " + (p.get("notes") or "").lower()
        if any(k in hay for k in kw if len(k) > 3):
            matches.append(p)
    return {"requirement": req, "patients": matches}


@api_router.get("/dashboard")
async def dashboard(request: Request):
    user = await current_user(request)
    uid = user["user_id"]
    await seed_requirements_if_empty(uid)
    reqs = await db.requirements.find({"owner_id": uid}, {"_id": 0}).to_list(500)
    patients = await db.patients.find({"owner_id": uid}, {"_id": 0}).to_list(500)
    by_dept: Dict[str, Dict[str, int]] = {}
    for r in reqs:
        dept = r.get("department") or "Lainnya"
        agg = by_dept.setdefault(dept, {"done": 0, "target": 0, "items": 0})
        agg["done"] += int(r.get("done", 0))
        agg["target"] += int(r.get("target", 0))
        agg["items"] += 1
    departments = []
    for name, _ in DEPARTMENTS:
        agg = by_dept.get(name, {"done": 0, "target": 0, "items": 0})
        target = agg["target"] or 0
        done = min(agg["done"], target) if target else agg["done"]
        pct = round((done / target) * 100) if target else 0
        status = "Lulus" if target and done >= target else ("On Progress" if done > 0 else "Belum Dimulai")
        departments.append({"name": name, "done": done, "target": target,
                            "items": agg["items"], "pct": pct, "status": status})
    events = await db.calendar_events.find({"owner_id": uid, "date": datetime.now().strftime("%Y-%m-%d")},
                                           {"_id": 0}).to_list(50)
    events.sort(key=lambda e: e.get("time") or "")
    total_done = sum(d["done"] for d in departments)
    total_target = sum(d["target"] for d in departments)
    overall = round((total_done / total_target) * 100) if total_target else 0
    ukmp_date = datetime(2026, 10, 20, tzinfo=timezone.utc)
    countdown = max((ukmp_date - datetime.now(timezone.utc)).days, 0)
    return {"departments": departments, "countdown": countdown,
            "today": events[:5],
            "stats": {"patients": len(patients),
                      "visits": sum(len(p.get("visits", [])) for p in patients),
                      "acc": overall},
            "overall": overall, "total_done": total_done, "total_target": total_target}

# ---------------- Patients ----------------
async def seed_patients_if_empty(uid: str):
    if await db.patients.count_documents({"owner_id": uid}) > 0: return
    demos = [
        {"name": "Ayu Pratama", "rm": "RM-2418", "age": 22, "phone": "6281234567890",
         "address": "Jl. Melati No. 12, Yogyakarta", "department": "Konservasi Gigi",
         "diagnosis": "Karies profunda 36", "tag": "#PasienKooperatif", "reliability": "green",
         "medical_history": [], "allergies": [],
         "tooth_map": {"36": ["Caries"], "11": ["Restored"]},
         "notes": "Pasien kontrol rutin, kooperatif.", "last_visit": "2026-06-12"},
        {"name": "Bagas Wijaya", "rm": "RM-2391", "age": 29, "phone": "6285712345678",
         "address": "Jl. Kaliurang KM 7, Sleman", "department": "Konservasi Gigi",
         "diagnosis": "Nekrosis pulpa 21", "tag": "#KasusSulit", "reliability": "yellow",
         "medical_history": ["Hipertensi"], "allergies": ["Penisilin"],
         "tooth_map": {"21": ["RCT"], "22": ["Missing"]},
         "notes": "Perlu premedikasi, konfirmasi tensi sebelum tindakan.", "last_visit": "2026-06-10"},
        {"name": "Citra Lestari", "rm": "RM-2450", "age": 8, "phone": "6289876543210",
         "address": "Jl. Kenanga No. 5, Bantul", "department": "Pedodonsia",
         "diagnosis": "Early childhood caries", "tag": "#Ujian", "reliability": "red",
         "medical_history": ["Asma"], "allergies": [],
         "tooth_map": {"51": ["Caries"], "61": ["Caries"], "75": ["Caries"]},
         "notes": "Anak sering absen jadwal kontrol.", "last_visit": "2026-06-08"},
        {"name": "Dewi Anggraini", "rm": "RM-2460", "age": 34, "phone": "6281212345678",
         "address": "Jl. Solo No. 88, Yogyakarta", "department": "Periodonsia",
         "diagnosis": "Periodontitis kronis lokal", "tag": "#PasienKooperatif", "reliability": "green",
         "medical_history": ["Diabetes Melitus Tipe 2"], "allergies": [],
         "tooth_map": {"46": ["Caries"], "36": ["Restored"]},
         "notes": "Kontrol gula darah sebelum SRP.", "last_visit": "2026-06-14"},
    ]
    for d in demos:
        d.update({"id": "p_" + uuid.uuid4().hex[:10], "owner_id": uid,
                  "created_at": datetime.now(timezone.utc).isoformat(),
                  "visits": []})
        await db.patients.insert_one(d.copy())

@api_router.get("/patients")
async def list_patients(request: Request, dept: Optional[str] = None,
                        tooth_status: Optional[str] = None):
    user = await current_user(request); uid = user["user_id"]
    await seed_patients_if_empty(uid)
    q = {"owner_id": uid}
    if dept: q["department"] = dept
    docs = await db.patients.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    if tooth_status:
        docs = [d for d in docs if any(tooth_status in (v or []) for v in (d.get("tooth_map") or {}).values())]
    return docs

@api_router.post("/patients")
async def create_patient(payload: PatientUpsert, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "p_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "visits": [], "last_visit": None})
    await db.patients.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc

@api_router.patch("/patients/{patient_id}")
async def update_patient(patient_id: str, payload: PatientUpdate, request: Request):
    user = await current_user(request)
    changes = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not changes: return {"ok": True}
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.patients.update_one({"id": patient_id, "owner_id": user["user_id"]}, {"$set": changes})
    doc = await db.patients.find_one({"id": patient_id, "owner_id": user["user_id"]}, {"_id": 0})
    return doc or {"ok": True}

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, request: Request):
    user = await current_user(request)
    await db.patients.delete_one({"id": patient_id, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- Calendar Events ----------------
@api_router.get("/calendar")
async def list_events(request: Request, month: Optional[str] = None):
    user = await current_user(request); q = {"owner_id": user["user_id"]}
    if month: q["date"] = {"$regex": f"^{month}"}
    docs = await db.calendar_events.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    return docs

@api_router.post("/calendar")
async def create_event(payload: CalendarEvent, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "ev_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    await db.calendar_events.insert_one(doc.copy())
    doc.pop("_id", None); return doc

@api_router.patch("/calendar/{event_id}")
async def update_event(event_id: str, payload: dict, request: Request):
    user = await current_user(request)
    await db.calendar_events.update_one({"id": event_id, "owner_id": user["user_id"]},
                                        {"$set": payload})
    return {"ok": True}

@api_router.delete("/calendar/{event_id}")
async def delete_event(event_id: str, request: Request):
    user = await current_user(request)
    await db.calendar_events.delete_one({"id": event_id, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- Supervisors ----------------
async def seed_supervisors_if_empty(uid: str):
    if await db.supervisors.count_documents({"owner_id": uid}) > 0: return
    for s in [
        {"name": "drg. Nadia Puspita, Sp.KG", "department": "Konservasi Gigi", "piket_day": "Senin",
         "phone": "628111222333", "notes": "Fokus endo, cek preparasi kavitas terlebih dahulu."},
        {"name": "drg. Rangga Prawira, Sp.BM", "department": "Bedah Mulut", "piket_day": "Rabu",
         "phone": "628112223334", "notes": "Wajib inform consent sebelum ekstraksi."},
        {"name": "drg. Sekar Ayu, Sp.Perio", "department": "Periodonsia", "piket_day": "Kamis",
         "phone": "628113334445", "notes": "Bawa hasil probing dan foto klinis."},
    ]:
        s.update({"id": "sup_" + uuid.uuid4().hex[:10], "owner_id": uid,
                  "created_at": datetime.now(timezone.utc).isoformat()})
        await db.supervisors.insert_one(s.copy())

@api_router.get("/supervisors")
async def list_supervisors(request: Request):
    user = await current_user(request); uid = user["user_id"]
    await seed_supervisors_if_empty(uid)
    return await db.supervisors.find({"owner_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/supervisors")
async def create_supervisor(payload: Supervisor, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "sup_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    await db.supervisors.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.delete("/supervisors/{sid}")
async def delete_supervisor(sid: str, request: Request):
    user = await current_user(request)
    await db.supervisors.delete_one({"id": sid, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- SOP Library ----------------
async def seed_sops_if_empty(uid: str):
    if await db.sops.count_documents({"owner_id": uid}) > 0: return
    for s in [
        {"title": "Preparasi kavitas Klas II", "category": "Konservasi",
         "steps": "1. Isolasi rubber dam\n2. Akses email dengan bur bulat\n3. Ekskavasi karies dari pinggir ke tengah\n4. Bentuk box proksimal, cek titik kontak\n5. Cek pulpa & retensi\n6. Etsa, bonding, restorasi resin komposit",
         "read_time": "6 min", "tags": ["Klas II", "Komposit"]},
        {"title": "Protokol irigasi saluran akar", "category": "Endodontik",
         "steps": "1. NaOCl 2.5% selama preparasi\n2. Aktivasi ultrasonik 3 x 30 detik\n3. Irigasi akhir EDTA 17% 1 menit\n4. Bilas saline\n5. Keringkan dengan paper point",
         "read_time": "9 min", "tags": ["Endo", "Irigasi"]},
        {"title": "SRP prinsip dan urutan kerja", "category": "Periodonsia",
         "steps": "1. Anestesi infiltrasi bila perlu\n2. Kalkulasi supra & sub gingiva\n3. Scaling dengan ultrasonic tip\n4. Root planing dengan kuret gracey\n5. Irigasi klorheksidin 0.2%\n6. Berikan instruksi OH",
         "read_time": "7 min", "tags": ["Perio", "Scaling"]},
        {"title": "Cetak Gigi Tiruan Lengkap", "category": "Prostodonsia",
         "steps": "1. Cetak anatomis dengan alginat\n2. Buat sendok cetak individual\n3. Border molding dengan compound\n4. Cetak fisiologis ZOE / silikon\n5. Kirim ke laboratorium",
         "read_time": "8 min", "tags": ["GTL", "Cetak"]},
    ]:
        s.update({"id": "sop_" + uuid.uuid4().hex[:10], "owner_id": uid,
                  "created_at": datetime.now(timezone.utc).isoformat()})
        await db.sops.insert_one(s.copy())

@api_router.get("/sops")
async def list_sops(request: Request, category: Optional[str] = None, q: Optional[str] = None):
    user = await current_user(request); uid = user["user_id"]
    await seed_sops_if_empty(uid)
    query = {"owner_id": uid}
    if category: query["category"] = category
    if q: query["title"] = {"$regex": q, "$options": "i"}
    return await db.sops.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.post("/sops")
async def create_sop(payload: SOP, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "sop_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    await db.sops.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.delete("/sops/{sid}")
async def delete_sop(sid: str, request: Request):
    user = await current_user(request)
    await db.sops.delete_one({"id": sid, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- Journals ----------------
async def seed_journals_if_empty(uid: str):
    if await db.journals.count_documents({"owner_id": uid}) > 0: return
    for j in [
        {"title": "Efektivitas NaOCl 2.5% vs 5.25% pada irigasi saluran akar",
         "source": "Journal of Endodontics 2024", "url": "https://www.jendodon.com",
         "department": "Endodontik",
         "highlights": "NaOCl 2.5% cukup efektif dan mengurangi iritasi periapikal."},
        {"title": "Bond strength resin komposit setelah selective etching",
         "source": "Operative Dentistry 2023", "url": "https://www.jopdent.org",
         "department": "Konservasi",
         "highlights": "Selective etching pada enamel memberi retensi optimal."},
    ]:
        j.update({"id": "jrn_" + uuid.uuid4().hex[:10], "owner_id": uid,
                  "created_at": datetime.now(timezone.utc).isoformat()})
        await db.journals.insert_one(j.copy())

@api_router.get("/journals")
async def list_journals(request: Request):
    user = await current_user(request); uid = user["user_id"]
    await seed_journals_if_empty(uid)
    return await db.journals.find({"owner_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.post("/journals")
async def create_journal(payload: Journal, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "jrn_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    await db.journals.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.delete("/journals/{jid}")
async def delete_journal(jid: str, request: Request):
    user = await current_user(request)
    await db.journals.delete_one({"id": jid, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- Drug Safety / Contraindication Engine ----------------
SAFETY_RULES = [
    {"keyword": ["hipertensi", "hypertension", "darah tinggi"], "severity": "warning",
     "title": "Hipertensi", "recommendation": "Ukur tekanan darah sebelum tindakan. Batasi epinefrin (maks. 0.04 mg / 2 karpul lidokain 2% 1:100.000). Hindari NSAID jangka panjang."},
    {"keyword": ["kehamilan", "hamil", "pregnancy"], "severity": "critical",
     "title": "Kehamilan", "recommendation": "Tunda radiografi elektif. Hindari NSAID di trimester 3. Prilokain lebih dipilih. Konsultasi obgyn bila tindakan invasif."},
    {"keyword": ["diabetes", "dm"], "severity": "warning",
     "title": "Diabetes Melitus", "recommendation": "Pastikan gula darah puasa <200 mg/dL. Risiko infeksi tinggi, resepkan antibiotik profilaksis bila tindakan invasif."},
    {"keyword": ["alergi penisilin", "penicillin allergy", "amoxicillin"], "severity": "critical",
     "title": "Alergi Penisilin", "recommendation": "Hindari amoxicillin/ampicillin. Alternatif: klindamisin 300 mg atau azitromisin."},
    {"keyword": ["alergi lateks", "latex allergy"], "severity": "critical",
     "title": "Alergi Lateks", "recommendation": "Gunakan sarung tangan nitril dan rubber dam bebas lateks."},
    {"keyword": ["asma"], "severity": "warning",
     "title": "Asma", "recommendation": "Hindari aspirin/NSAID. Siapkan bronkodilator. Kurangi stres di kursi klinik."},
    {"keyword": ["warfarin", "antikoagulan", "gangguan pembekuan"], "severity": "critical",
     "title": "Antikoagulan / Bleeding", "recommendation": "Cek INR (target <3.5) sebelum ekstraksi/bedah. Siapkan lokal hemostat, jahitan, dan penekanan."},
    {"keyword": ["jantung", "endokarditis", "katup"], "severity": "critical",
     "title": "Penyakit Jantung Struktural", "recommendation": "Pertimbangkan profilaksis antibiotik (amoxicillin 2 g PO 30-60 menit sebelum tindakan invasif) sesuai pedoman AHA."},
    {"keyword": ["epilepsi", "kejang"], "severity": "warning",
     "title": "Epilepsi", "recommendation": "Tanyakan obat & frekuensi kejang. Kurangi cahaya berkedip, siapkan protokol kejang."},
    {"keyword": ["gagal ginjal", "renal"], "severity": "warning",
     "title": "Gangguan Ginjal", "recommendation": "Sesuaikan dosis (hindari NSAID, sesuaikan antibiotik). Hindari tetrasiklin."},
    {"keyword": ["bifosfonat", "bisphosphonate"], "severity": "critical",
     "title": "Terapi Bifosfonat", "recommendation": "Risiko MRONJ. Hindari ekstraksi elektif; konsultasi dokter penulis resep."},
]

def evaluate_safety(history: List[str], allergies: List[str]) -> List[dict]:
    combined = " ".join(
        [h.lower() for h in (history or [])] +
        [f"alergi {a.lower()}" for a in (allergies or [])]
    )
    alerts = []
    for rule in SAFETY_RULES:
        if any(k in combined for k in rule["keyword"]):
            alerts.append({"title": rule["title"], "severity": rule["severity"],
                           "recommendation": rule["recommendation"]})
    return alerts

@api_router.post("/safety/check")
async def safety_check(payload: SafetyCheck, request: Request):
    await current_user(request)
    return {"alerts": evaluate_safety(payload.history, payload.allergies)}

@api_router.get("/safety/rules")
async def safety_rules(request: Request):
    await current_user(request)
    return [{"title": r["title"], "severity": r["severity"], "recommendation": r["recommendation"]}
            for r in SAFETY_RULES]

# ---------------- Reminders ----------------
class Reminder(BaseModel):
    text: str
    due: Optional[str] = None
    done: Optional[bool] = False

@api_router.get("/reminders")
async def list_reminders(request: Request):
    user = await current_user(request)
    return await db.reminders.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/reminders")
async def create_reminder(payload: Reminder, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "rem_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat()})
    await db.reminders.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.patch("/reminders/{rid}")
async def toggle_reminder(rid: str, payload: dict, request: Request):
    user = await current_user(request)
    await db.reminders.update_one({"id": rid, "owner_id": user["user_id"]}, {"$set": payload})
    return {"ok": True}

@api_router.delete("/reminders/{rid}")
async def delete_reminder(rid: str, request: Request):
    user = await current_user(request)
    await db.reminders.delete_one({"id": rid, "owner_id": user["user_id"]})
    return {"ok": True}

# ---------------- Storage & Files ----------------
def init_storage(force=False):
    global storage_key
    if storage_key and not force: return storage_key
    if not EMERGENT_KEY: raise RuntimeError("Storage requires EMERGENT_LLM_KEY")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    r.raise_for_status(); storage_key = r.json()["storage_key"]; return storage_key

def drive_flow():
    if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get("GOOGLE_CLIENT_SECRET") or not DRIVE_REDIRECT_URI:
        raise HTTPException(503, "Google Drive OAuth is not configured")
    return Flow.from_client_config({"web": {"client_id": os.environ["GOOGLE_CLIENT_ID"],
                                            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                                            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                                            "token_uri": "https://oauth2.googleapis.com/token",
                                            "redirect_uris": [DRIVE_REDIRECT_URI]}},
                                   scopes=DRIVE_SCOPES, redirect_uri=DRIVE_REDIRECT_URI)

async def drive_service(user_id: str):
    doc = await db.drive_credentials.find_one({"user_id": user_id}, {"_id": 0})
    if not doc: raise HTTPException(400, "Google Drive belum terhubung")
    creds = Credentials(token=doc.get("access_token"), refresh_token=doc.get("refresh_token"),
                        token_uri=doc.get("token_uri"), client_id=os.environ["GOOGLE_CLIENT_ID"],
                        client_secret=os.environ["GOOGLE_CLIENT_SECRET"], scopes=doc.get("scopes"))
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
        await db.drive_credentials.update_one({"user_id": user_id},
                                              {"$set": {"access_token": creds.token,
                                                        "expiry": creds.expiry.isoformat() if creds.expiry else None,
                                                        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return build("drive", "v3", credentials=creds)

async def ensure_drive_folder(service, user_id: str):
    profile = await db.drive_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if profile and profile.get("folder_id"): return profile["folder_id"]
    result = service.files().list(q="name = 'Dental Coass Tracker' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                                  spaces="drive", fields="files(id,name)").execute()
    folder_id = result["files"][0]["id"] if result.get("files") else service.files().create(
        body={"name": "Dental Coass Tracker", "mimeType": "application/vnd.google-apps.folder"},
        fields="id").execute()["id"]
    await db.drive_profiles.update_one({"user_id": user_id},
                                       {"$set": {"user_id": user_id, "folder_id": folder_id,
                                                 "updated_at": datetime.now(timezone.utc).isoformat()}},
                                       upsert=True)
    return folder_id

async def sync_file_to_drive(user_id: str, doc: dict, data: bytes):
    try:
        service = await drive_service(user_id)
        folder_id = await ensure_drive_folder(service, user_id)
        metadata = {"name": doc["original_filename"], "parents": [folder_id],
                    "description": f"Dental Coass Tracker · patient {doc['patient_id']}"}
        media = MediaIoBaseUpload(io.BytesIO(data), mimetype=doc["content_type"], resumable=False)
        result = service.files().create(body=metadata, media_body=media,
                                        fields="id,webViewLink").execute()
        await db.files.update_one({"id": doc["id"]}, {"$set": {"drive_file_id": result.get("id"),
                                                                "drive_synced": True}})
    except Exception as exc:
        logger.warning("Drive sync skipped: %s", exc)

@api_router.get("/drive/connect")
async def connect_drive(request: Request):
    user = await current_user(request)
    flow = drive_flow(); state = uuid.uuid4().hex
    await db.drive_oauth_states.insert_one({"state": state, "user_id": user["user_id"],
                                            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()})
    authorization_url, _ = flow.authorization_url(access_type="offline",
                                                  include_granted_scopes="true",
                                                  prompt="consent", state=state)
    return {"authorization_url": authorization_url}

@api_router.get("/drive/callback")
async def drive_callback(code: str = Query(...), state: str = Query(...)):
    state_doc = await db.drive_oauth_states.find_one({"state": state}, {"_id": 0})
    if not state_doc: raise HTTPException(400, "OAuth state tidak valid")
    expires = datetime.fromisoformat(state_doc["expires_at"])
    if expires.tzinfo is None: expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc): raise HTTPException(400, "OAuth state kedaluwarsa")
    flow = drive_flow(); flow.fetch_token(code=code); creds = flow.credentials
    await db.drive_credentials.update_one({"user_id": state_doc["user_id"]},
                                          {"$set": {"user_id": state_doc["user_id"],
                                                    "access_token": creds.token,
                                                    "refresh_token": creds.refresh_token,
                                                    "token_uri": creds.token_uri,
                                                    "scopes": creds.scopes or DRIVE_SCOPES,
                                                    "expiry": creds.expiry.isoformat() if creds.expiry else None,
                                                    "updated_at": datetime.now(timezone.utc).isoformat()},
                                           "$unset": {"client_secret": "", "client_id": ""}},
                                          upsert=True)
    await db.drive_oauth_states.delete_one({"state": state})
    return RedirectResponse(url=f"{os.environ.get('FRONTEND_URL', '')}/settings?drive_connected=true")

@api_router.get("/drive/status")
async def drive_status(request: Request):
    user = await current_user(request)
    connected = bool(await db.drive_credentials.find_one({"user_id": user["user_id"]}, {"_id": 0, "user_id": 1}))
    return {"connected": connected, "folder_name": "Dental Coass Tracker"}

@api_router.post("/files/upload")
async def upload_file(request: Request, file: UploadFile = File(...),
                     patient_id: str = "general", label: str = "media"):
    user = await current_user(request)
    if not file.content_type or not (file.content_type.startswith("image/") or file.content_type == "application/pdf"):
        raise HTTPException(400, "Only images or PDF files are allowed")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024: raise HTTPException(413, "File too large")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4()}.{ext}"
    result = requests.put(f"{STORAGE_URL}/objects/{path}",
                          headers={"X-Storage-Key": init_storage(),
                                   "Content-Type": file.content_type}, data=data, timeout=120)
    result.raise_for_status(); stored = result.json()
    doc = {"id": str(uuid.uuid4()), "user_id": user["user_id"], "patient_id": patient_id,
           "label": label, "storage_path": stored["path"], "original_filename": file.filename,
           "content_type": file.content_type, "size": stored["size"],
           "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.files.insert_one(doc)
    await sync_file_to_drive(user["user_id"], doc, data)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, request: Request):
    user = await current_user(request)
    record = await db.files.find_one({"id": file_id, "user_id": user["user_id"],
                                      "is_deleted": False}, {"_id": 0})
    if not record: raise HTTPException(404, "File not found")
    r = requests.get(f"{STORAGE_URL}/objects/{record['storage_path']}",
                     headers={"X-Storage-Key": init_storage()}, timeout=60); r.raise_for_status()
    return Response(content=r.content, media_type=record["content_type"],
                    headers={"Content-Disposition": f"inline; filename={record['original_filename']}"})

@api_router.get("/files")
async def list_files(request: Request, patient_id: Optional[str] = None):
    user = await current_user(request)
    q = {"user_id": user["user_id"], "is_deleted": False}
    if patient_id: q["patient_id"] = patient_id
    return await db.files.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.delete("/files/{file_id}")
async def delete_file_soft(file_id: str, request: Request):
    user = await current_user(request)
    await db.files.update_one({"id": file_id, "user_id": user["user_id"]},
                              {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------------- AI ----------------
@api_router.post("/ai/stream")
async def ai_stream(payload: AiRequest, request: Request):
    user = await current_user(request)
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta
    model = "gemini-3.1-pro-preview" if payload.mode == "treatment" else "gemini-3-flash-preview"
    system = "You are Dental Coass AI, a careful clinical study assistant for Indonesian dental students. Provide educational drafts only, flag emergencies and contraindications, and remind users this cannot replace supervisor judgement. Respond in Bahasa Indonesia."
    if payload.mode == "soap":
        system += " Format the response as SUBJECTIVE, OBJECTIVE, ASSESSMENT, PLAN sections with concise bullet points and always end with an alert list of contraindications."
    if payload.mode == "treatment":
        system += " Give a numbered treatment sequence, rationale for each step, required supervisor checks, and safety alerts based on the patient's systemic history."
    chat = LlmChat(api_key=EMERGENT_KEY,
                   session_id=f"dental-{user['user_id']}-{uuid.uuid4().hex}",
                   system_message=system).with_model("gemini", model)

    async def stream():
        try:
            body = payload.prompt
            if payload.patient_context:
                body += "\nPATIENT CONTEXT: " + json.dumps(payload.patient_context, ensure_ascii=False)
            async for event in chat.stream_message(UserMessage(text=body)):
                if isinstance(event, TextDelta):
                    yield f"data: {json.dumps({'text': event.content})}\n\n"
        except Exception as exc:
            logger.warning("AI stream error: %s", exc)
            yield f"data: {json.dumps({'text': '⚠️ AI sedang sibuk. Coba lagi sebentar.'})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ---------------- Inventory & Expenses ----------------
class InventoryItem(BaseModel):
    name: str; stock: int = 0; unit: str = "pcs"; min_stock: int = 0
class ExpenseItem(BaseModel):
    date: str; category: str; description: str = ""; amount: float = 0

@api_router.get("/inventory")
async def list_inventory(request: Request):
    user = await current_user(request)
    return await db.inventory.find({"owner_id": user["user_id"]}, {"_id": 0}).to_list(200)

@api_router.post("/inventory")
async def add_inventory(payload: InventoryItem, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "inv_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"]})
    await db.inventory.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.get("/expenses")
async def list_expenses(request: Request):
    user = await current_user(request)
    return await db.expenses.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(500)

@api_router.post("/expenses")
async def add_expense(payload: ExpenseItem, request: Request):
    user = await current_user(request)
    doc = payload.model_dump()
    doc.update({"id": "exp_" + uuid.uuid4().hex[:10], "owner_id": user["user_id"]})
    await db.expenses.insert_one(doc.copy()); doc.pop("_id", None); return doc

@api_router.get("/settings/integrations")
async def integrations(request: Request):
    user = await current_user(request)
    return {"google_drive": bool(await db.drive_credentials.find_one({"user_id": user["user_id"]}, {"_id": 0, "user_id": 1})),
            "storage": bool(EMERGENT_KEY), "ai": bool(EMERGENT_KEY)}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()
