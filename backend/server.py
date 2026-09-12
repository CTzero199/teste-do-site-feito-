from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import uuid
import secrets
import hashlib
import asyncio
import hmac
import re
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import bcrypt
import requests
import stripe
from twilio.rest import Client as TwilioClient
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
SESSION_EXPIRE_DAYS = int(os.environ.get("SESSION_EXPIRE_DAYS", "7"))
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
OWNER_EMAIL = os.environ.get("ADMIN_EMAIL", "").lower()

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")
SP_TZ = ZoneInfo("America/Sao_Paulo")
_twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN) if (TWILIO_SID and TWILIO_TOKEN) else None

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("padrao-rd")

app = FastAPI(title="Padrão RD API")
api = APIRouter(prefix="/api")

WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

# Recurring membership plans (from the "Planos Exclusivos" card).
PLANS = [
    {"id": "manutencao", "name": "Plano Manutenção", "price_cents": 9000, "lookup_key": "plano_manutencao",
     "accent": "orange", "highlight": False,
     "features": ["4 cortes (qualquer tipo normal)", "Sobrancelha grátis"]},
    {"id": "fiel", "name": "Plano Fiel", "price_cents": 13000, "lookup_key": "plano_fiel",
     "accent": "silver", "highlight": False,
     "features": ["4 cortes (1 por semana)", "2 barbas", "Sobrancelha grátis"]},
    {"id": "completo", "name": "Plano Completo", "price_cents": 18000, "lookup_key": "plano_completo",
     "accent": "gold", "highlight": True,
     "features": ["4 cortes (pode incluir navalhado)", "4 barbas", "2 pigmentação", "Sobrancelha grátis", "1 bebida por atendimento"]},
    {"id": "elite", "name": "Plano Elite", "price_cents": 25000, "lookup_key": "plano_elite",
     "accent": "diamond", "highlight": False,
     "features": ["Corte ilimitado (uso consciente)", "4 barbas", "2 pigmentações", "Prioridade no atendimento", "4 limpeza de pele", "5 bebidas"]},
]
PLAN_BY_ID = {p["id"]: p for p in PLANS}

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt) -> Optional[str]:
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt

def normalize_phone_br(raw: str) -> str:
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if raw.strip().startswith("+"):
        return "+" + digits
    if digits.startswith("55"):
        return "+" + digits
    return "+55" + digits

def send_whatsapp(to_phone: str, body: str) -> bool:
    to_phone = normalize_phone_br(to_phone)
    if not _twilio_client or not TWILIO_WHATSAPP_FROM or not to_phone:
        logger.info(f"[whatsapp skipped] to={to_phone or 'n/a'} configured={bool(_twilio_client)}")
        return False
    try:
        _twilio_client.messages.create(
            from_=TWILIO_WHATSAPP_FROM if TWILIO_WHATSAPP_FROM.startswith("whatsapp:") else f"whatsapp:{TWILIO_WHATSAPP_FROM}",
            to=f"whatsapp:{to_phone}", body=body,
        )
        return True
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return False

async def send_whatsapp_async(to_phone: str, body: str):
    await asyncio.to_thread(send_whatsapp, to_phone, body)


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"], "email": u["email"], "name": u.get("name", ""),
        "picture": u.get("picture"), "role": u.get("role", "user"),
        "phone": u.get("phone"), "birthday": u.get("birthday"), "notes": u.get("notes"),
    }

def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=SESSION_EXPIRE_DAYS * 24 * 3600, path="/",
    )

async def create_session(user_id: str) -> str:
    token = "sess_" + secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=SESSION_EXPIRE_DAYS), "created_at": now_utc(),
    })
    return token

async def get_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token

async def get_current_user(request: Request) -> dict:
    token = await get_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    exp = session["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=401, detail="Sessão expirada")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito à administração")
    return user

# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class RegisterBody(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class ForgotBody(BaseModel):
    email: EmailStr

class ResetBody(BaseModel):
    token: str
    password: str = Field(min_length=6)

class ProfileBody(BaseModel):
    phone: Optional[str] = ""
    birthday: Optional[str] = ""
    notes: Optional[str] = ""

class RoleBody(BaseModel):
    role: str

class ServiceBody(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "Cortes"
    duration_minutes: int = 30
    price_cents: int = 0
    active: bool = True

class Availability(BaseModel):
    id: Optional[str] = None
    weekday: int
    start_time: str
    end_time: str

class BarberBody(BaseModel):
    id: Optional[str] = None
    name: str
    bio: Optional[str] = ""
    specialties: List[str] = []
    image_url: Optional[str] = ""
    rating: float = 5.0
    active: bool = True
    service_ids: List[str] = []
    availabilities: List[Availability] = []

class AppointmentBody(BaseModel):
    barber_id: str
    service_ids: List[str] = Field(min_length=1)
    date: str
    time: str
    phone: Optional[str] = ""
    customer_note: Optional[str] = ""
    payment_method: str = "online"  # "online" | "cash"

class ReviewBody(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""

class AppointmentEditBody(BaseModel):
    barber_id: str
    service_id: str
    date: str
    time: str
    status: str
    admin_note: Optional[str] = ""

class StatusBody(BaseModel):
    status: str

class CheckoutBody(BaseModel):
    appointment_id: str
    origin_url: str

class SubscribeBody(BaseModel):
    plan_id: str
    method: str = "online"  # "online" | "cash"
    origin_url: Optional[str] = ""

# ----------------------------------------------------------------------------
# Auth routes
# ----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    role = "admin" if email in ADMIN_EMAILS else "user"
    user = {
        "user_id": new_id("user"), "email": email, "name": body.name,
        "password_hash": hash_password(body.password), "role": role,
        "auth_method": "password", "picture": None,
        "phone": "", "birthday": "", "notes": "", "created_at": now_utc(),
    }
    await db.users.insert_one(user)
    token = await create_session(user["user_id"])
    set_session_cookie(response, token)
    return public_user(user)

@api.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and locked_until.replace(tzinfo=timezone.utc) > now_utc():
            raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente em 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash")):
        updated = await db.login_attempts.find_one_and_update(
            {"identifier": identifier}, {"$inc": {"count": 1}, "$set": {"email": email}},
            upsert=True, return_document=True,
        )
        if updated and updated.get("count", 0) >= 5:
            await db.login_attempts.update_one(
                {"identifier": identifier}, {"$set": {"locked_until": now_utc() + timedelta(minutes=15)}},
            )
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    await db.login_attempts.delete_many({"email": email})
    token = await create_session(user["user_id"])
    set_session_cookie(response, token)
    return public_user(user)

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotBody):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"found": False, "message": "Não encontramos uma conta com esse e-mail."}
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash, "user_id": user["user_id"], "email": email,
        "expires_at": now_utc() + timedelta(hours=1), "used": False, "created_at": now_utc(),
    })
    reset_url = f"{FRONTEND_URL.rstrip('/')}/redefinir-senha?token={raw}"
    return {"found": True, "reset_url": reset_url,
            "message": "Link de redefinição gerado. Use-o em até 1 hora."}

@api.post("/auth/reset-password")
async def reset_password(body: ResetBody):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now_utc()}},
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Link inválido ou expirado. Solicite um novo.")
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.user_sessions.delete_many({"user_id": doc["user_id"]})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"ok": True, "message": "Senha redefinida com sucesso. Faça login."}

@api.post("/auth/google")
async def google_auth(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id ausente")
    try:
        r = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}, timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception:
        raise HTTPException(status_code=401, detail="Falha ao validar login Google")
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        update = {"name": data.get("name", existing.get("name")), "picture": data.get("picture")}
        if email in ADMIN_EMAILS and existing.get("role") != "admin":
            update["role"] = "admin"
        await db.users.update_one({"user_id": user_id}, {"$set": update})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        role = "admin" if email in ADMIN_EMAILS else "user"
        user = {
            "user_id": new_id("user"), "email": email, "name": data.get("name", ""),
            "password_hash": None, "role": role, "auth_method": "google",
            "picture": data.get("picture"), "phone": "", "birthday": "", "notes": "", "created_at": now_utc(),
        }
        await db.users.insert_one(user)
    token = data.get("session_token") or ("sess_" + secrets.token_urlsafe(32))
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user["user_id"],
        "expires_at": now_utc() + timedelta(days=SESSION_EXPIRE_DAYS), "created_at": now_utc(),
    })
    set_session_cookie(response, token)
    return public_user(user)

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = await get_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api.put("/auth/profile")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"phone": body.phone, "birthday": body.birthday, "notes": body.notes}},
    )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return public_user(updated)

# ----------------------------------------------------------------------------
# Public catalog
# ----------------------------------------------------------------------------
async def barber_public(b: dict) -> dict:
    return {
        "id": b["id"], "name": b["name"], "bio": b.get("bio", ""),
        "specialties": b.get("specialties", []), "image_url": b.get("image_url", ""),
        "rating": round(b.get("rating", 5.0), 1), "active": b.get("active", True),
        "review_count": b.get("review_count", 0),
        "service_ids": b.get("service_ids", []), "availabilities": b.get("availabilities", []),
    }

@api.get("/catalog")
async def catalog():
    services = await db.services.find({"active": True}, {"_id": 0}).to_list(200)
    barbers = await db.barbers.find({"active": True}, {"_id": 0}).to_list(200)
    return {"services": services, "barbers": [await barber_public(b) for b in barbers]}

@api.get("/plans")
async def get_plans():
    return {"plans": PLANS}

@api.get("/barbers/for-services")
async def barbers_for_services(service_ids: str):
    ids = [s for s in service_ids.split(",") if s]
    if not ids:
        return []
    barbers = await db.barbers.find({"active": True, "service_ids": {"$all": ids}}, {"_id": 0}).to_list(200)
    return [await barber_public(b) for b in barbers]

@api.get("/availability/slots")
async def available_slots(barber_id: str, service_ids: str, date: str):
    ids = [s for s in service_ids.split(",") if s]
    barber = await db.barbers.find_one({"id": barber_id}, {"_id": 0})
    services = await db.services.find({"id": {"$in": ids}}, {"_id": 0}).to_list(50)
    if not barber or not services:
        return []
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return []
    weekday = (d.weekday() + 1) % 7
    windows = [a for a in barber.get("availabilities", []) if a["weekday"] == weekday]
    if not windows:
        return []
    duration = sum(s.get("duration_minutes", 30) for s in services) or 30
    taken = set()
    booked = await db.appointments.find(
        {"barber_id": barber_id, "date": date, "status": {"$in": ["pending", "confirmed"]}},
        {"_id": 0, "time": 1},
    ).to_list(500)
    for a in booked:
        taken.add(a["time"])
    slots = []
    for w in windows:
        start = datetime.strptime(w["start_time"], "%H:%M")
        end = datetime.strptime(w["end_time"], "%H:%M")
        cur = start
        while cur + timedelta(minutes=duration) <= end:
            t = cur.strftime("%H:%M")
            if t not in taken:
                slots.append(t)
            cur += timedelta(minutes=duration)
    slots = sorted(set(slots))
    return [{"time": t} for t in slots]

# ----------------------------------------------------------------------------
# Appointments (client)
# ----------------------------------------------------------------------------
async def enrich_appointment(a: dict) -> dict:
    ids = a.get("service_ids") or ([a["service_id"]] if a.get("service_id") else [])
    services = await db.services.find({"id": {"$in": ids}}, {"_id": 0}).to_list(50)
    by_id = {s["id"]: s for s in services}
    ordered = [by_id[i] for i in ids if i in by_id]
    barber = await db.barbers.find_one({"id": a["barber_id"]}, {"_id": 0})
    total = a.get("total_cents")
    if total is None:
        total = sum(s.get("price_cents", 0) for s in ordered)
    return {
        "id": a["id"], "barber_id": a["barber_id"], "service_ids": ids,
        "date": a["date"], "time": a["time"], "status": a["status"],
        "customer_note": a.get("customer_note", ""), "admin_note": a.get("admin_note", ""),
        "payment_status": a.get("payment_status", "pending"),
        "payment_method": a.get("payment_method", "online"),
        "reviewed": a.get("reviewed", False),
        "service_name": " + ".join(s["name"] for s in ordered) if ordered else "Serviço",
        "services": [{"id": s["id"], "name": s["name"], "price_cents": s["price_cents"]} for s in ordered],
        "price_cents": total,
        "barber_name": barber["name"] if barber else "Barbeiro",
        "customer_name": a.get("customer_name", ""),
        "customer_email": a.get("customer_email", ""),
    }

@api.post("/appointments")
async def create_appointment(body: AppointmentBody, user: dict = Depends(get_current_user)):
    services = await db.services.find({"id": {"$in": body.service_ids}}, {"_id": 0}).to_list(50)
    barber = await db.barbers.find_one({"id": body.barber_id}, {"_id": 0})
    if not services or not barber:
        raise HTTPException(status_code=400, detail="Serviço ou barbeiro inválido")
    conflict = await db.appointments.find_one({
        "barber_id": body.barber_id, "date": body.date, "time": body.time,
        "status": {"$in": ["pending", "confirmed"]},
    })
    if conflict:
        raise HTTPException(status_code=409, detail="Este horário acabou de ser reservado. Escolha outro.")
    total = sum(s.get("price_cents", 0) for s in services)
    method = "cash" if body.payment_method == "cash" else "online"
    appt = {
        "id": new_id("appt"), "user_id": user["user_id"], "customer_name": user.get("name", ""),
        "customer_email": user.get("email", ""),
        "barber_id": body.barber_id, "service_ids": body.service_ids, "total_cents": total,
        "date": body.date, "time": body.time,
        "status": "pending", "phone": normalize_phone_br(body.phone or user.get("phone", "")),
        "customer_note": body.customer_note or "", "admin_note": "",
        "payment_status": "pending", "payment_method": method,
        "reviewed": False, "created_at": now_utc(),
    }
    await db.appointments.insert_one(appt)
    if body.phone and not user.get("phone"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"phone": body.phone}})
    return await enrich_appointment(appt)

@api.get("/appointments/me")
async def my_appointments(user: dict = Depends(get_current_user)):
    items = await db.appointments.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    items.sort(key=lambda a: (a["date"], a["time"]), reverse=True)
    return [await enrich_appointment(a) for a in items]

@api.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: str, user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one({"id": appointment_id, "user_id": user["user_id"]})
    if not appt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"status": "cancelled"}})
    return {"ok": True}

async def _recompute_barber_rating(barber_id: str):
    reviews = await db.reviews.find({"barber_id": barber_id}, {"_id": 0, "rating": 1}).to_list(2000)
    count = len(reviews)
    avg = round(sum(r["rating"] for r in reviews) / count, 1) if count else 5.0
    await db.barbers.update_one({"id": barber_id}, {"$set": {"rating": avg, "review_count": count}})

@api.post("/appointments/{appointment_id}/review")
async def review_appointment(appointment_id: str, body: ReviewBody, user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one({"id": appointment_id, "user_id": user["user_id"]}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if appt.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Só é possível avaliar agendamentos pagos")
    if appt.get("reviewed"):
        raise HTTPException(status_code=400, detail="Este agendamento já foi avaliado")
    review = {
        "id": new_id("rev"), "appointment_id": appointment_id, "barber_id": appt["barber_id"],
        "user_id": user["user_id"], "customer_name": user.get("name", "Cliente"),
        "rating": body.rating, "comment": (body.comment or "").strip()[:500], "created_at": now_utc(),
    }
    await db.reviews.insert_one(review)
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"reviewed": True}})
    await _recompute_barber_rating(appt["barber_id"])
    return {"ok": True}

@api.get("/barbers/{barber_id}/reviews")
async def barber_reviews(barber_id: str):
    items = await db.reviews.find({"barber_id": barber_id}, {"_id": 0}).to_list(200)
    items.sort(key=lambda r: r.get("created_at", now_utc()), reverse=True)
    return [{"id": r["id"], "rating": r["rating"], "comment": r.get("comment", ""),
             "customer_name": r.get("customer_name", "Cliente"), "created_at": iso(r.get("created_at"))}
            for r in items[:30]]

# ----------------------------------------------------------------------------
# Payments — appointments (Stripe one-time) + cash
# ----------------------------------------------------------------------------
@api.post("/payments/checkout")
async def create_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one({"id": body.appointment_id, "user_id": user["user_id"]}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    info = await enrich_appointment(appt)
    amount = int(info["price_cents"])
    origin = body.origin_url.rstrip("/")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "brl",
                    "product_data": {"name": f"{info['service_name']} — {info['barber_name']}",
                                     "description": f"Agendamento {appt['date']} às {appt['time']}"},
                    "unit_amount": amount,
                },
                "quantity": 1,
            }],
            success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}&kind=appointment",
            cancel_url=f"{origin}/payment/cancel?appointment_id={appt['id']}",
            metadata={"kind": "appointment", "appointment_id": appt["id"], "user_id": user["user_id"]},
        )
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Não foi possível iniciar o pagamento")
    await db.payment_transactions.insert_one({
        "session_id": session.id, "kind": "appointment", "appointment_id": appt["id"], "user_id": user["user_id"],
        "amount": amount, "currency": "brl", "status": "initiated", "payment_status": "pending",
        "created_at": now_utc(), "updated_at": now_utc(),
    })
    await db.appointments.update_one({"id": appt["id"]}, {"$set": {"payment_session_id": session.id}})
    return {"checkout_url": session.url, "session_id": session.id}

async def _mark_appointment_paid(session_id: str, payment_intent=None):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        return
    result = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "stripe_payment_intent_id": payment_intent, "updated_at": now_utc()}},
    )
    await db.appointments.update_one(
        {"id": txn["appointment_id"]}, {"$set": {"payment_status": "paid", "status": "confirmed"}},
    )
    if result.modified_count:
        appt = await db.appointments.find_one({"id": txn["appointment_id"]}, {"_id": 0})
        if appt and appt.get("phone"):
            info = await enrich_appointment(appt)
            body = (f"✅ *Padrão RD* — Agendamento confirmado!\n\n"
                    f"Serviço: {info['service_name']}\nBarbeiro: {info['barber_name']}\n"
                    f"Data: {appt['date']} às {appt['time']}\n\nPagamento aprovado. Te esperamos! 🪒")
            await send_whatsapp_async(appt["phone"], body)

async def _mark_subscription_paid(session_id: str, stripe_subscription_id=None):
    result = await db.subscriptions.update_one(
        {"session_id": session_id, "status": {"$ne": "active"}},
        {"$set": {"status": "active", "payment_status": "paid",
                  "stripe_subscription_id": stripe_subscription_id,
                  "activated_at": now_utc(), "updated_at": now_utc()}},
    )
    await db.payment_transactions.update_one(
        {"session_id": session_id}, {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_utc()}},
    )
    return result.modified_count

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                if record.get("kind") == "subscription":
                    await _mark_subscription_paid(session_id, s.get("subscription"))
                else:
                    await _mark_appointment_paid(session_id, s.get("payment_intent"))
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "kind": record.get("kind", "appointment")}

@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Assinatura inválida")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        kind = (obj.get("metadata") or {}).get("kind", "appointment")
        if kind == "subscription":
            await _mark_subscription_paid(obj["id"], obj.get("subscription"))
        else:
            await _mark_appointment_paid(obj["id"], obj.get("payment_intent"))
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": now_utc()}},
        )
    return {"status": "ok"}

# ----------------------------------------------------------------------------
# Subscriptions (memberships)
# ----------------------------------------------------------------------------
def _stripe_price_id(lookup_key: str) -> Optional[str]:
    try:
        prices = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data
        return prices[0].id if prices else None
    except stripe.error.StripeError as e:
        logger.error(f"Stripe price lookup failed: {e}")
        return None

@api.post("/subscriptions")
async def create_subscription(body: SubscribeBody, user: dict = Depends(get_current_user)):
    plan = PLAN_BY_ID.get(body.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plano inválido")
    base = {
        "id": new_id("sub"), "user_id": user["user_id"], "customer_name": user.get("name", ""),
        "customer_email": user.get("email", ""), "plan_id": plan["id"], "plan_name": plan["name"],
        "price_cents": plan["price_cents"], "created_at": now_utc(), "updated_at": now_utc(),
    }
    if body.method == "cash":
        base.update({"method": "cash", "status": "pending_cash", "payment_status": "pending"})
        await db.subscriptions.insert_one(base)
        return {"method": "cash", "subscription_id": base["id"],
                "message": "Assinatura registrada. Pague em dinheiro na barbearia; o administrador confirmará."}
    price_id = _stripe_price_id(plan["lookup_key"])
    if not price_id:
        raise HTTPException(status_code=500, detail="Plano não configurado no pagamento. Tente pagar em dinheiro.")
    origin = (body.origin_url or FRONTEND_URL).rstrip("/")
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=user.get("email"),
            success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}&kind=subscription",
            cancel_url=f"{origin}/payment/cancel",
            metadata={"kind": "subscription", "plan_id": plan["id"], "user_id": user["user_id"], "subscription_id": base["id"]},
        )
    except Exception as e:
        logger.error(f"Stripe subscription checkout error: {e}")
        raise HTTPException(status_code=500, detail="Não foi possível iniciar a assinatura")
    base.update({"method": "online", "status": "pending", "payment_status": "pending", "session_id": session.id})
    await db.subscriptions.insert_one(base)
    await db.payment_transactions.insert_one({
        "session_id": session.id, "kind": "subscription", "subscription_id": base["id"], "user_id": user["user_id"],
        "amount": plan["price_cents"], "currency": "brl", "status": "initiated", "payment_status": "pending",
        "created_at": now_utc(), "updated_at": now_utc(),
    })
    return {"method": "online", "checkout_url": session.url, "session_id": session.id}

@api.get("/subscriptions/me")
async def my_subscriptions(user: dict = Depends(get_current_user)):
    items = await db.subscriptions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda s: s.get("created_at", now_utc()), reverse=True)
    for s in items:
        s["created_at"] = iso(s.get("created_at"))
        s["updated_at"] = iso(s.get("updated_at"))
        s["activated_at"] = iso(s.get("activated_at"))
    return items

# ----------------------------------------------------------------------------
# Cron reminders
# ----------------------------------------------------------------------------
async def _run_reminders():
    now = now_utc()
    low = now + timedelta(minutes=45)
    high = now + timedelta(minutes=75)
    candidates = await db.appointments.find(
        {"status": "confirmed", "reminder_sent": {"$ne": True}}, {"_id": 0}
    ).to_list(1000)
    for a in candidates:
        try:
            local = datetime.strptime(f"{a['date']} {a['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=SP_TZ)
            starts_at = local.astimezone(timezone.utc)
        except Exception:
            continue
        if low <= starts_at <= high and a.get("phone"):
            info = await enrich_appointment(a)
            body = (f"⏰ *Padrão RD* — Lembrete!\n\nSeu horário é hoje às {a['time']}.\n"
                    f"Serviço: {info['service_name']}\nBarbeiro: {info['barber_name']}\n\n"
                    f"Chegue com 5 min de antecedência. Até já! 🪒")
            await send_whatsapp_async(a["phone"], body)
            await db.appointments.update_one({"id": a["id"]}, {"$set": {"reminder_sent": True}})

@api.post("/cron/reminders", status_code=202)
async def cron_reminders(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(_run_reminders())
    return {"status": "accepted"}

# ----------------------------------------------------------------------------
# Admin
# ----------------------------------------------------------------------------
@api.get("/admin/overview")
async def admin_overview(admin: dict = Depends(require_admin)):
    services = await db.services.find({}, {"_id": 0}).to_list(500)
    barbers = await db.barbers.find({}, {"_id": 0}).to_list(500)
    appts = await db.appointments.find({}, {"_id": 0}).to_list(1000)
    appts.sort(key=lambda a: (a["date"], a["time"]), reverse=True)
    enriched = [await enrich_appointment(a) for a in appts]
    revenue = sum(e["price_cents"] for e in enriched if e["payment_status"] == "paid")
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    return {
        "services": services, "barbers": [await barber_public(b) for b in barbers],
        "appointments": enriched,
        "stats": {"revenue_cents": revenue, "appointments": len(appts),
                  "barbers": len(barbers), "services": len(services), "active_subscriptions": active_subs},
    }

@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)
    users.sort(key=lambda u: u.get("created_at", now_utc()), reverse=True)
    return [{
        "user_id": u["user_id"], "email": u["email"], "name": u.get("name", ""),
        "role": u.get("role", "user"), "auth_method": u.get("auth_method", "password"),
        "phone": u.get("phone", ""), "created_at": iso(u.get("created_at")),
        "is_owner": u["email"].lower() == OWNER_EMAIL,
    } for u in users]

@api.put("/admin/users/{user_id}/role")
async def admin_set_role(user_id: str, body: RoleBody, admin: dict = Depends(require_admin)):
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Papel inválido")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if target["email"].lower() == OWNER_EMAIL and body.role != "admin":
        raise HTTPException(status_code=400, detail="Não é possível remover o administrador principal")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"ok": True, "user_id": user_id, "role": body.role}

@api.get("/admin/subscriptions")
async def admin_subscriptions(admin: dict = Depends(require_admin)):
    items = await db.subscriptions.find({}, {"_id": 0}).to_list(2000)
    items.sort(key=lambda s: s.get("created_at", now_utc()), reverse=True)
    for s in items:
        s["created_at"] = iso(s.get("created_at"))
        s["updated_at"] = iso(s.get("updated_at"))
        s["activated_at"] = iso(s.get("activated_at"))
    return items

@api.post("/admin/subscriptions/{sub_id}/confirm")
async def admin_confirm_subscription(sub_id: str, admin: dict = Depends(require_admin)):
    sub = await db.subscriptions.find_one({"id": sub_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"status": "active", "payment_status": "paid", "activated_at": now_utc(), "updated_at": now_utc()}})
    return {"ok": True}

@api.post("/admin/subscriptions/{sub_id}/cancel")
async def admin_cancel_subscription(sub_id: str, admin: dict = Depends(require_admin)):
    await db.subscriptions.update_one({"id": sub_id}, {"$set": {"status": "cancelled", "updated_at": now_utc()}})
    return {"ok": True}

@api.post("/admin/appointments/{appointment_id}/confirm-cash")
async def admin_confirm_cash(appointment_id: str, admin: dict = Depends(require_admin)):
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"payment_status": "paid", "status": "confirmed"}})
    updated = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return await enrich_appointment(updated)

@api.post("/admin/services")
async def save_service(body: ServiceBody, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    if doc.get("id"):
        sid = doc.pop("id")
        await db.services.update_one({"id": sid}, {"$set": doc})
        return await db.services.find_one({"id": sid}, {"_id": 0})
    doc["id"] = new_id("svc")
    doc["created_at"] = now_utc()
    await db.services.insert_one(doc)
    return await db.services.find_one({"id": doc["id"]}, {"_id": 0})

@api.delete("/admin/services/{service_id}")
async def delete_service(service_id: str, admin: dict = Depends(require_admin)):
    await db.services.delete_one({"id": service_id})
    return {"ok": True}

@api.post("/admin/barbers")
async def save_barber(body: BarberBody, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    avails = doc.get("availabilities", [])
    for a in avails:
        if not a.get("id"):
            a["id"] = new_id("av")
    doc["availabilities"] = avails
    if doc.get("id"):
        bid = doc.pop("id")
        await db.barbers.update_one({"id": bid}, {"$set": doc})
        return await barber_public(await db.barbers.find_one({"id": bid}, {"_id": 0}))
    doc["id"] = new_id("barber")
    doc["created_at"] = now_utc()
    await db.barbers.insert_one(doc)
    return await barber_public(await db.barbers.find_one({"id": doc["id"]}, {"_id": 0}))

@api.delete("/admin/barbers/{barber_id}")
async def delete_barber(barber_id: str, admin: dict = Depends(require_admin)):
    await db.barbers.delete_one({"id": barber_id})
    return {"ok": True}

@api.put("/admin/appointments/{appointment_id}/status")
async def update_appointment_status(appointment_id: str, body: StatusBody, admin: dict = Depends(require_admin)):
    await db.appointments.update_one({"id": appointment_id}, {"$set": {"status": body.status}})
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return await enrich_appointment(appt)

@api.get("/config")
async def config():
    return {"stripe_publishable_key": os.environ.get("STRIPE_PUBLISHABLE_KEY", "")}

# ----------------------------------------------------------------------------
# Startup: indexes, admin seeding, sample data, stripe catalog
# ----------------------------------------------------------------------------
SAMPLE_SERVICES = [
    {"id": "svc_maquina", "name": "Máquina com 1 Pente", "category": "Cortes", "description": "Corte rápido na máquina com um pente.", "duration_minutes": 30, "price_cents": 2000, "active": True},
    {"id": "svc_social", "name": "Corte Social", "category": "Cortes", "description": "Corte clássico social, alinhado e discreto.", "duration_minutes": 30, "price_cents": 2000, "active": True},
    {"id": "svc_degrade", "name": "Corte Degradê", "category": "Cortes", "description": "Degradê moderno com transição suave.", "duration_minutes": 40, "price_cents": 2500, "active": True},
    {"id": "svc_degrade_navalhado", "name": "Degradê Navalhado", "category": "Cortes", "description": "Degradê com acabamento navalhado.", "duration_minutes": 45, "price_cents": 3000, "active": True},
    {"id": "svc_tesoura", "name": "Corte na Tesoura", "category": "Cortes", "description": "Corte totalmente feito na tesoura.", "duration_minutes": 45, "price_cents": 3000, "active": True},
    {"id": "svc_barba", "name": "Barba", "category": "Barba", "description": "Barba modelada com toalha quente.", "duration_minutes": 30, "price_cents": 1500, "active": True},
    {"id": "svc_barba_desenhada", "name": "Barba Desenhada", "category": "Barba", "description": "Barba com contornos desenhados.", "duration_minutes": 30, "price_cents": 1500, "active": True},
    {"id": "svc_barba_pigmentada", "name": "Barba Pigmentada", "category": "Barba", "description": "Barba com pigmentação para preencher falhas.", "duration_minutes": 40, "price_cents": 2000, "active": True},
    {"id": "svc_cavanhaque", "name": "Cavanhaque", "category": "Barba", "description": "Modelagem de cavanhaque.", "duration_minutes": 20, "price_cents": 1000, "active": True},
    {"id": "svc_sob_masc", "name": "Sobrancelha Masculina", "category": "Sobrancelha", "description": "Alinhamento de sobrancelha masculina.", "duration_minutes": 15, "price_cents": 700, "active": True},
    {"id": "svc_sob_fem", "name": "Sobrancelha Feminina", "category": "Sobrancelha", "description": "Design de sobrancelha feminina.", "duration_minutes": 15, "price_cents": 700, "active": True},
    {"id": "svc_sob_henna", "name": "Sobrancelha Henna", "category": "Sobrancelha", "description": "Sobrancelha com aplicação de henna.", "duration_minutes": 30, "price_cents": 2000, "active": True},
    {"id": "svc_pigmentacao", "name": "Pigmentação", "category": "Pintura", "description": "Pigmentação capilar.", "duration_minutes": 30, "price_cents": 1500, "active": True},
    {"id": "svc_platinado", "name": "Platinado + Corte", "category": "Pintura", "description": "Descoloração platinada com corte incluso.", "duration_minutes": 120, "price_cents": 9000, "active": True},
    {"id": "svc_luzes", "name": "Luzes + Corte", "category": "Pintura", "description": "Luzes com corte incluso.", "duration_minutes": 120, "price_cents": 7000, "active": True},
    {"id": "svc_reflexo", "name": "Reflexo + Corte", "category": "Pintura", "description": "Reflexos com corte incluso.", "duration_minutes": 120, "price_cents": 8000, "active": True},
    {"id": "svc_colorido", "name": "Colorido + Corte", "category": "Pintura", "description": "Coloração fantasia com corte incluso.", "duration_minutes": 120, "price_cents": 8000, "active": True},
    {"id": "svc_desenho", "name": "Desenho", "category": "Extras", "description": "Desenho/risco personalizado.", "duration_minutes": 15, "price_cents": 500, "active": True},
    {"id": "svc_pezinho", "name": "Pezinho", "category": "Extras", "description": "Acabamento de pezinho.", "duration_minutes": 15, "price_cents": 1000, "active": True},
    {"id": "svc_selagem", "name": "Selagem", "category": "Extras", "description": "Selagem capilar.", "duration_minutes": 90, "price_cents": 7000, "active": True},
    {"id": "svc_alisante", "name": "Alisante", "category": "Extras", "description": "Alisamento capilar.", "duration_minutes": 90, "price_cents": 4000, "active": True},
]

_CORTES = ["svc_maquina", "svc_social", "svc_degrade", "svc_degrade_navalhado", "svc_tesoura"]
_BARBA = ["svc_barba", "svc_barba_desenhada", "svc_barba_pigmentada", "svc_cavanhaque"]
_SOB = ["svc_sob_masc", "svc_sob_fem", "svc_sob_henna"]
_PINTURA = ["svc_pigmentacao", "svc_platinado", "svc_luzes", "svc_reflexo", "svc_colorido"]
_EXTRAS = ["svc_desenho", "svc_pezinho", "svc_selagem", "svc_alisante"]

def _full_week(start="09:00", end="19:00", days=(1, 2, 3, 4, 5, 6)):
    return [{"id": new_id("av"), "weekday": d, "start_time": start, "end_time": end} for d in days]

SAMPLE_BARBERS = [
    {"id": "barber_rd", "name": "Rafael Dias", "bio": "Fundador da Padrão RD. Especialista em cortes clássicos e degradê navalhado.", "specialties": ["Degradê", "Navalhado", "Clássico"], "image_url": "https://images.pexels.com/photos/8552627/pexels-photo-8552627.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "rating": 5.0, "review_count": 0, "active": True, "service_ids": _CORTES + _BARBA + _SOB + _EXTRAS, "availabilities": _full_week("09:00", "19:00")},
    {"id": "barber_marcos", "name": "Marcos Vieira", "bio": "Barbeiro premiado, referência em barba terapia e visagismo.", "specialties": ["Barba", "Visagismo", "Sobrancelha"], "image_url": "https://images.unsplash.com/photo-1582771498000-8ad44e6c84db?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBiYXJiZXIlMjBwb3J0cmFpdHxlbnwwfHx8fDE3ODg2NDA5ODl8MA&ixlib=rb-4.1.0&q=85", "rating": 4.9, "review_count": 0, "active": True, "service_ids": _BARBA + _SOB + _CORTES + _EXTRAS, "availabilities": _full_week("10:00", "20:00")},
    {"id": "barber_thiago", "name": "Thiago Nunes", "bio": "Mestre em cortes modernos, coloração e projeções.", "specialties": ["Pintura", "Platinado", "Moderno"], "image_url": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?crop=entropy&cs=srgb&fm=jpg&q=85&w=940", "rating": 4.8, "review_count": 0, "active": True, "service_ids": _CORTES + _PINTURA + _EXTRAS, "availabilities": _full_week("09:00", "18:00", days=(2, 3, 4, 5, 6))},
]

async def seed_admin():
    email = OWNER_EMAIL
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "user_id": new_id("user"), "email": email, "name": "Wanderson (Admin)",
            "password_hash": hash_password(password), "role": "admin",
            "auth_method": "password", "picture": None,
            "phone": "", "birthday": "", "notes": "", "created_at": now_utc(),
        })
    else:
        update = {"role": "admin"}
        if not verify_password(password, existing.get("password_hash")):
            update["password_hash"] = hash_password(password)
        await db.users.update_one({"email": email}, {"$set": update})

def _ensure_stripe_catalog_sync():
    """Create the recurring membership prices (idempotent, keyed by lookup_key)."""
    try:
        products = list(stripe.Product.list(active=True, limit=100).auto_paging_iter())
    except stripe.error.StripeError as e:
        logger.error(f"Stripe catalog setup skipped: {e}")
        return
    prod = next((p for p in products if p.get("metadata", {}).get("emergent_product_id") == "rd_membership"), None)
    if not prod:
        prod = stripe.Product.create(name="Padrão RD — Mensalidade",
                                     metadata={"managed_by": "emergent", "emergent_product_id": "rd_membership"})
    for plan in PLANS:
        existing = stripe.Price.list(lookup_keys=[plan["lookup_key"]], active=True, limit=1).data
        if existing and (existing[0].unit_amount != plan["price_cents"] or existing[0].currency != "brl"):
            stripe.Price.modify(existing[0].id, active=False)
            existing = []
        if not existing:
            stripe.Price.create(product=prod.id, unit_amount=plan["price_cents"], currency="brl",
                                lookup_key=plan["lookup_key"], transfer_lookup_key=True,
                                recurring={"interval": "month"}, nickname=plan["name"])
    logger.info("Stripe membership catalog ready")

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.appointments.create_index("user_id")
    await db.services.create_index("id", unique=True)
    await db.barbers.create_index("id", unique=True)
    await db.login_attempts.create_index("email")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.subscriptions.create_index("user_id")
    await seed_admin()
    if await db.barbers.count_documents({}) == 0:
        for b in SAMPLE_BARBERS:
            b = dict(b); b["created_at"] = now_utc()
            await db.barbers.insert_one(b)
    meta = await db.meta.find_one({"key": "menu_version"})
    if not meta or meta.get("value") != "v2":
        await db.services.delete_many({"id": {"$in": ["svc_corte", "svc_combo"]}})
        for s in SAMPLE_SERVICES:
            if not await db.services.find_one({"id": s["id"]}):
                doc = dict(s); doc["created_at"] = now_utc()
                await db.services.insert_one(doc)
        for b in SAMPLE_BARBERS:
            await db.barbers.update_one({"id": b["id"]}, {"$set": {"service_ids": b["service_ids"]}})
            await db.barbers.update_one({"id": b["id"], "review_count": {"$exists": False}}, {"$set": {"review_count": 0}})
        await db.meta.update_one({"key": "menu_version"}, {"$set": {"value": "v2"}}, upsert=True)
    await asyncio.to_thread(_ensure_stripe_catalog_sync)
    logger.info("Padrão RD API ready")

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
