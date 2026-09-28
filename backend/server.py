from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Header, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional
import os, uuid, logging, requests, json

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

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class SessionPayload(BaseModel):
    session_id: str

class AiRequest(BaseModel):
    mode: str = "chat"
    prompt: str
    patient_context: Optional[dict] = None

class PatientUpdate(BaseModel):
    tooth_map: dict

async def current_user(request: Request, authorization: Optional[str] = Header(None)):
    token = request.cookies.get("session_token")
    if not token and authorization and authorization.lower().startswith("bearer "):
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
        r = requests.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": payload.session_id}, timeout=20)
        r.raise_for_status(); data = r.json()
    except Exception as exc:
        logger.warning("OAuth exchange failed: %s", exc)
        raise HTTPException(401, "Google session could not be verified")
    user_id = "user_" + uuid.uuid4().hex[:12]
    existing = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if existing: user_id = existing["user_id"]
    user = {"user_id": user_id, "email": data["email"], "name": data.get("name", "Dental Coass"), "picture": data.get("picture", ""), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.users.update_one({"email": data["email"]}, {"$set": user}, upsert=True)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": data["session_token"], "expires_at": expires.isoformat(), "created_at": datetime.now(timezone.utc).isoformat()})
    response.set_cookie("session_token", data["session_token"], max_age=604800, httponly=True, secure=True, samesite="none", path="/")
    return user

@api_router.get("/auth/me")
async def me(request: Request, authorization: Optional[str] = Header(None)): return await current_user(request, authorization)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token: await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.get("/dashboard")
async def dashboard(request: Request):
    await current_user(request)
    return {"departments": [{"name": n, "done": d, "target": 20, "status": "Lulus" if d >= 18 else "On Progress"} for n, d in [("Bedah Mulut",18),("Konservasi Gigi",14),("Periodonsia",11),("Prostodonsia",9),("Ortodonsia",8),("Pedodonsia",13),("Oral Medicine",16),("Radiologi",17)]], "countdown": 126, "today": [{"time":"08:00","title":"Kontrol pasien #RM-2418","type":"Klinik"},{"time":"13:30","title":"Bimbingan Endodontik","type":"Supervisor"}], "stats": {"patients": 24, "visits": 68, "acc": 72}}

@api_router.get("/patients")
async def patients(request: Request):
    await current_user(request)
    docs = await db.patients.find({}, {"_id": 0}).to_list(100)
    if docs: return docs
    return [{"id":"p1","name":"Ayu Pratama","rm":"RM-2418","age":22,"department":"Konservasi Gigi","tag":"#PasienKooperatif","reliability":"green","diagnosis":"Karies profunda 36","last_visit":"12 Jun 2026","tooth_map":{"36":"Caries","11":"Restored"}}, {"id":"p2","name":"Bagas Wijaya","rm":"RM-2391","age":29,"department":"Endodontik","tag":"#KasusSulit","reliability":"yellow","diagnosis":"Nekrosis pulpa 21","last_visit":"10 Jun 2026","tooth_map":{"21":"RCT","22":"Missing"}}, {"id":"p3","name":"Citra Lestari","rm":"RM-2450","age":8,"department":"Pedodonsia","tag":"#Ujian","reliability":"red","diagnosis":"Early childhood caries","last_visit":"08 Jun 2026","tooth_map":{"51":"Caries","61":"Caries"}}]

@api_router.patch("/patients/{patient_id}")
async def update_patient(patient_id: str, payload: PatientUpdate, request: Request):
    await current_user(request); await db.patients.update_one({"id": patient_id}, {"$set": {"tooth_map": payload.tooth_map}}); return {"ok": True}

@api_router.get("/calendar")
async def calendar(request: Request):
    await current_user(request); return [{"date":"2026-06-16","time":"08:00","title":"Kontrol Ayu Pratama","kind":"Pasien"},{"date":"2026-06-17","time":"13:30","title":"Bimbingan Drg. Nadia","kind":"Bimbingan"},{"date":"2026-06-20","time":"23:59","title":"Deadline ACC Notula","kind":"Deadline"}]

@api_router.get("/library")
async def library(request: Request):
    await current_user(request); return [{"title":"Preparasi kavitas Klas II","category":"Konservasi","read":"6 min"},{"title":"Protokol irigasi saluran akar","category":"Endodontik","read":"9 min"},{"title":"SRP: prinsip dan urutan kerja","category":"Periodonsia","read":"7 min"}]

def init_storage(force=False):
    global storage_key
    if storage_key and not force: return storage_key
    if not EMERGENT_KEY: raise RuntimeError("Storage requires EMERGENT_LLM_KEY")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30); r.raise_for_status(); storage_key = r.json()["storage_key"]; return storage_key

@api_router.post("/files/upload")
async def upload_file(request: Request, file: UploadFile = File(...), patient_id: str = "general"):
    user = await current_user(request)
    if not file.content_type or not (file.content_type.startswith("image/") or file.content_type == "application/pdf"): raise HTTPException(400, "Only images or PDF files are allowed")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024: raise HTTPException(413, "File too large")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4()}.{ext}"
    result = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage(), "Content-Type": file.content_type}, data=data, timeout=120)
    result.raise_for_status(); stored = result.json()
    doc = {"id": str(uuid.uuid4()), "user_id": user["user_id"], "patient_id": patient_id, "storage_path": stored["path"], "original_filename": file.filename, "content_type": file.content_type, "size": stored["size"], "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.files.insert_one(doc)
    return {k:v for k,v in doc.items() if k != "_id"}

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, request: Request):
    user = await current_user(request); record = await db.files.find_one({"id": file_id, "user_id": user["user_id"], "is_deleted": False}, {"_id": 0})
    if not record: raise HTTPException(404, "File not found")
    r = requests.get(f"{STORAGE_URL}/objects/{record['storage_path']}", headers={"X-Storage-Key": init_storage()}, timeout=60); r.raise_for_status()
    return Response(content=r.content, media_type=record["content_type"], headers={"Content-Disposition": f"inline; filename={record['original_filename']}"})

@api_router.get("/files")
async def list_files(request: Request):
    user = await current_user(request); return await db.files.find({"user_id": user["user_id"], "is_deleted": False}, {"_id": 0}).to_list(1000)

@api_router.post("/ai/stream")
async def ai_stream(payload: AiRequest, request: Request):
    user = await current_user(request)
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta
    model = "gemini-3.1-pro-preview" if payload.mode == "treatment" else "gemini-3-flash-preview"
    system = "You are Dental Coass AI, a careful clinical study assistant. Give educational drafts only, flag emergencies and contraindications, never replace supervisor judgement. Respond in Indonesian."
    if payload.mode == "soap": system += " Format the response as Subjective, Objective, Assessment, Plan with concise bullet points."
    if payload.mode == "treatment": system += " Give a numbered treatment sequence, rationale, required supervisor checks, and safety alerts."
    chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"dental-{user['user_id']}-{uuid.uuid4().hex}", system_message=system).with_model("gemini", model)
    async def stream():
        async for event in chat.stream_message(UserMessage(text=payload.prompt + ("\nPATIENT CONTEXT: " + json.dumps(payload.patient_context or {}, ensure_ascii=False) if payload.patient_context else ""))):
            if isinstance(event, TextDelta): yield f"data: {json.dumps({'text': event.content})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache", "X-Accel-Buffering":"no"})

@api_router.get("/inventory")
async def inventory(request: Request):
    await current_user(request); return [{"name":"Karpul anestesi","stock":12,"unit":"pcs","level":"Cukup"},{"name":"File endo #25","stock":4,"unit":"pcs","level":"Menipis"},{"name":"Bahan cetak alginat","stock":2,"unit":"pack","level":"Menipis"}]

@api_router.get("/settings/integrations")
async def integrations(request: Request):
    await current_user(request); return {"google_drive": False, "storage": bool(EMERGENT_KEY), "ai": bool(EMERGENT_KEY)}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client(): client.close()