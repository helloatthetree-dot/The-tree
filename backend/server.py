from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import jwt
import bcrypt
import asyncio
import re
import requests
import razorpay
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Annotated, Literal

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, UploadFile, File, Header, Query
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator, EmailStr
from bson import ObjectId

# ---------------------------------------------------------------------------
# DB + App setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Café Komorebi Reservations")
api_router = APIRouter(prefix="/api")

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '')
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


async def create_razorpay_order(amount_rupees: int, rid: str) -> dict:
    return await asyncio.to_thread(razorpay_client.order.create, {
        "amount": amount_rupees * 100,
        "currency": "INR",
        "payment_capture": 1,
        "receipt": f"res_{rid}"[:40],
    })


def _verify_signature(order_id: str, payment_id: str, signature: str):
    razorpay_client.utility.verify_payment_signature({
        "razorpay_order_id": order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": signature,
    })


async def refund_razorpay_payment(payment_id: str, amount_rupees: int) -> dict:
    return await asyncio.to_thread(razorpay_client.payment.refund, payment_id, {
        "amount": amount_rupees * 100,
        "speed": "normal",
    })

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("komorebi")

# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def _validate_object_id(v):
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]

def now_utc():
    return datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# Object storage (Emergent-managed)
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "komorebi"
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
              "gif": "image/gif", "webp": "image/webp"}
_storage_key = None

def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------------------------------------------------------------------------
# Auth utils
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": now_utc() + timedelta(days=7), "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        user.setdefault("picture", "")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

require_staff = require_roles("admin", "super_admin")
require_owner = require_roles("super_admin")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = ""

class LoginInput(BaseModel):
    identifier: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str

class GoogleSessionInput(BaseModel):
    session_id: str

class TableInput(BaseModel):
    name: str
    capacity: int
    zone: Literal["indoor", "outdoor"] = "indoor"
    active: bool = True
    notes: Optional[str] = ""
    image_url: Optional[str] = ""
    duration_minutes: int = 120

class MenuItemInput(BaseModel):
    name: str
    description: Optional[str] = ""
    price: int
    category: Optional[str] = "Mains"
    image_url: Optional[str] = ""
    veg_type: Optional[str] = ""  # "veg" | "non_veg" | "egg" | ""
    active: bool = True

class EventInput(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str
    image_url: Optional[str] = ""
    active: bool = True

class ReservationInput(BaseModel):
    booking_name: str
    date: str            # YYYY-MM-DD
    time: str            # HH:MM (24h)
    people: int
    phone: str
    special_occasion: Literal[
        "None", "Birthday", "Anniversary", "Date Night",
        "Family Gathering", "Business Meeting", "Celebration", "Other"
    ] = "None"
    special_service: bool = False
    has_dietary: bool = False
    dietary_note: Optional[str] = ""
    policies_accepted: bool = False

class WaitlistInput(BaseModel):
    booking_name: str
    date: str
    time: str
    people: int
    phone: str
    special_occasion: str = "None"

class BlockInput(BaseModel):
    type: Literal["date", "slot", "table"]
    date: str
    time: Optional[str] = None
    table_id: Optional[str] = None
    reason: Optional[str] = ""

class HolidayInput(BaseModel):
    date: str
    name: str

class SettingsInput(BaseModel):
    fee_per_person: Optional[int] = None
    refund_percent: Optional[int] = None
    group_threshold: Optional[int] = None
    hold_minutes: Optional[int] = None
    special_needs_approval: Optional[bool] = None
    menu_enabled: Optional[bool] = None
    hero_label: Optional[str] = None
    hero_tagline: Optional[str] = None
    gallery_cta_title: Optional[str] = None
    gallery_cta_button: Optional[str] = None
    hero_headline: Optional[str] = None
    hero_intro: Optional[str] = None
    footer_note: Optional[str] = None
    contact_heading: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    policies_intro: Optional[str] = None
    hours: Optional[List[dict]] = None
    policies: Optional[List[dict]] = None

class UserRoleInput(BaseModel):
    role: Literal["customer", "admin", "super_admin"]

class StaffCreateInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["admin", "super_admin"] = "admin"

class ApprovalInput(BaseModel):
    action: Literal["approve", "reject"]
    note: Optional[str] = ""

class PaymentVerifyInput(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

# ---------------------------------------------------------------------------
# Operating hours + slots
# ---------------------------------------------------------------------------
# weekday(): Mon=0 ... Sun=6
OPERATING_HOURS = {
    0: [],                                  # Monday closed
    1: [("12:30", "15:00"), ("18:00", "22:00")],
    2: [("12:30", "15:00"), ("18:00", "22:00")],
    3: [("12:30", "15:00"), ("18:00", "22:00")],
    4: [("12:30", "15:00"), ("18:00", "22:00")],
    5: [("12:30", "22:00")],                # Saturday
    6: [("12:30", "22:00")],                # Sunday
}
SLOT_INTERVAL = 30  # minutes

def _to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m

def _to_hhmm(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"

async def get_settings() -> dict:
    defaults = {"fee_per_person": 300, "refund_percent": 50, "group_threshold": 6,
                "hold_minutes": 90, "special_needs_approval": True, "menu_enabled": True,
                "hero_label": "Now serving", "hero_tagline": "Afternoon light & golden evenings",
                "gallery_cta_title": "Reserve your window seat", "gallery_cta_button": "Start booking",
                "hero_headline": "Where sunlight\nfilters through\nthe trees.",
                "hero_intro": "Reserve a table at The Tree — a calm, light-filled retreat for warm afternoons, golden evenings and quiet celebrations.",
                "footer_note": "The Tree · Open Tuesday to Sunday",
                "contact_heading": "Reach us on WhatsApp",
                "contact_whatsapp": "919148271005",
                "contact_phone": "",
                "contact_email": "",
                "contact_address": "",
                "policies_intro": "A few gentle guidelines so every guest enjoys the calm of The Tree.",
                "hours": [
                    {"days": "Saturday & Sunday", "time": "12:30 PM – 10:00 PM", "note": "Continuous seating"},
                    {"days": "Tuesday – Friday", "time": "12:30 – 3:00 PM · 6:00 – 10:00 PM", "note": "Split shifts"},
                    {"days": "Monday", "time": "Closed", "note": "See you Tuesday"},
                ],
                "policies": [
                    {"title": "Reservation fee", "body": "A fee of ₹300 per guest is collected at the time of booking to confirm your table."},
                    {"title": "Cancellation & refund", "body": "Cancel anytime before your visit for a 50% refund of the reservation fee."},
                    {"title": "Table hold", "body": "Tables are held only for your reserved duration. Please arrive on time to enjoy your full seating."},
                    {"title": "Large groups", "body": "Parties larger than 6 guests require manual confirmation by our team before the table is finalised."},
                    {"title": "Outside food & décor", "body": "Outside food and any decorations (for celebrations) need prior approval from the café."},
                    {"title": "Table reassignment", "body": "The café may reassign tables when operationally necessary to seat everyone comfortably."},
                ]}
    s = await db.settings.find_one({"_id": "global"})
    if not s:
        s = {"_id": "global", **defaults}
        await db.settings.insert_one(s)
    s.pop("_id", None)
    return {**defaults, **s}

def generate_slots(d: date, hold_minutes: int) -> List[str]:
    windows = OPERATING_HOURS[d.weekday()]
    slots = []
    for start, end in windows:
        s, e = _to_minutes(start), _to_minutes(end)
        t = s
        while t + hold_minutes <= e:
            slots.append(_to_hhmm(t))
            t += SLOT_INTERVAL
    return slots

def party_duration(people: int) -> int:
    """Reserved duration is based on the party size (a 2-seater booking keeps its 2h even if seated at a bigger table)."""
    if people <= 4:
        return 120
    if people == 5:
        return 180
    return 210

def get_booking_window(ref: Optional[datetime] = None):
    """Guests can book up to 2 weeks in advance, at any time."""
    ref = ref or now_utc()
    start = ref.date()
    return start, start + timedelta(days=15)

# ---------------------------------------------------------------------------
# Availability logic
# ---------------------------------------------------------------------------
async def is_date_blocked(d: str) -> Optional[str]:
    holiday = await db.holidays.find_one({"date": d})
    if holiday:
        return f"Closed: {holiday['name']}"
    block = await db.blocks.find_one({"type": "date", "date": d})
    if block:
        return block.get("reason") or "Date unavailable"
    return None

def _slots_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end

def _table_is_free(tid: str, reservations: list, slot_start: int, slot_end: int, hold_minutes: int) -> bool:
    for r in reservations:
        if r.get("table_id") != tid:
            continue
        r_start = _to_minutes(r["time"])
        r_dur = r.get("duration_minutes", hold_minutes)
        if _slots_overlap(slot_start, slot_end, r_start, r_start + r_dur):
            return False
    return True

async def available_tables_for(d: str, t: str, people: int, hold_minutes: int):
    """Return list of active tables that can seat `people` and are free at date/time."""
    slot_start = _to_minutes(t)
    slot_end = slot_start + hold_minutes

    tables = await db.tables.find({"active": True, "capacity": {"$gte": people}}).to_list(500)
    # blocked tables for this date/slot
    table_blocks = await db.blocks.find({"date": d, "type": {"$in": ["table", "slot"]}}).to_list(500)
    slot_blocked = any(b["type"] == "slot" and b.get("time") == t for b in table_blocks)
    if slot_blocked:
        return []
    blocked_table_ids = {b["table_id"] for b in table_blocks if b["type"] == "table" and b.get("table_id")}

    # existing reservations that occupy a table on this date
    reservations = await db.reservations.find({
        "date": d,
        "status": {"$in": ["confirmed", "pending_approval", "pending_payment"]},
        "table_id": {"$ne": None},
    }).to_list(1000)

    free = [tb for tb in tables
            if str(tb["_id"]) not in blocked_table_ids
            and _table_is_free(str(tb["_id"]), reservations, slot_start, slot_end, hold_minutes)]
    free.sort(key=lambda x: x["capacity"])
    return free

def clean_reservation(r: dict) -> dict:
    r["id"] = str(r["_id"])
    r.pop("_id", None)
    return r

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
def normalize_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    return digits[-10:] if len(digits) > 10 else digits


@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "name": body.name, "email": email, "password_hash": hash_password(body.password),
        "phone": body.phone or "", "phone_normalized": normalize_phone(body.phone or ""),
        "role": "customer", "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email, "customer")
    return {"access_token": token, "user": {"id": uid, "name": body.name, "email": email, "role": "customer", "phone": body.phone or "", "picture": ""}}

@api_router.post("/auth/login")
async def login(body: LoginInput):
    ident = (body.identifier or (body.email or "")).strip()
    if not ident:
        raise HTTPException(status_code=422, detail="Enter your email or phone number")
    if "@" in ident:
        user = await db.users.find_one({"email": ident.lower()})
    else:
        digits = normalize_phone(ident)
        user = await db.users.find_one({"phone_normalized": digits}) if digits else None
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials. Check your email/phone and password.")
    uid = str(user["_id"])
    token = create_access_token(uid, user["email"], user["role"])
    return {"access_token": token, "user": {"id": uid, "name": user["name"], "email": user["email"], "role": user["role"], "phone": user.get("phone", ""), "picture": user.get("picture", "")}}

EMERGENT_OAUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

def _fetch_google_session(session_id: str) -> dict:
    try:
        resp = requests.get(EMERGENT_OAUTH_URL, headers={"X-Session-ID": session_id}, timeout=30)
    except Exception:
        raise HTTPException(status_code=502, detail="Auth service unavailable")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    return resp.json()

async def _upsert_google_user(data: dict):
    """Create or update the Google user; return (uid, name, role, email, phone, picture)."""
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    picture = data.get("picture", "")
    user = await db.users.find_one({"email": email})
    if not user:
        role = "super_admin" if email == os.environ["SUPER_ADMIN_EMAIL"].lower() else "customer"
        doc = {"name": data.get("name") or email.split("@")[0], "email": email,
               "password_hash": None, "role": role, "phone": "", "picture": picture,
               "auth_provider": "google", "created_at": now_utc().isoformat()}
        res = await db.users.insert_one(doc)
        return str(res.inserted_id), doc["name"], role, email, "", picture
    if picture and not user.get("picture"):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"picture": picture}})
    return (str(user["_id"]), user["name"], user["role"], email,
            user.get("phone", ""), user.get("picture") or picture)

@api_router.post("/auth/google/session")
async def google_session(body: GoogleSessionInput):
    """Exchange an Emergent Google session_id for the app's own JWT."""
    data = _fetch_google_session(body.session_id)
    uid, name, role, email, phone, pic = await _upsert_google_user(data)
    token = create_access_token(uid, email, role)
    return {"access_token": token, "user": {"id": uid, "name": name, "email": email, "role": role,
                                            "phone": phone, "picture": pic}}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------------------------------------------------------------------
# Public: settings, policies, availability
# ---------------------------------------------------------------------------
@api_router.get("/settings/public")
async def public_settings():
    s = await get_settings()
    return {"fee_per_person": s["fee_per_person"], "refund_percent": s["refund_percent"],
            "group_threshold": s["group_threshold"], "menu_enabled": s["menu_enabled"],
            "hero_label": s["hero_label"], "hero_tagline": s["hero_tagline"],
            "gallery_cta_title": s["gallery_cta_title"], "gallery_cta_button": s["gallery_cta_button"],
            "hero_headline": s["hero_headline"], "hero_intro": s["hero_intro"],
            "footer_note": s["footer_note"],
            "contact_heading": s["contact_heading"], "contact_whatsapp": s["contact_whatsapp"],
            "contact_phone": s["contact_phone"], "contact_email": s["contact_email"],
            "contact_address": s["contact_address"], "policies_intro": s["policies_intro"],
            "hours": s["hours"], "policies": s["policies"]}

@api_router.get("/booking-window")
async def booking_window():
    start, end = get_booking_window()
    return {"start": start.isoformat(), "end": end.isoformat()}

@api_router.get("/availability")
async def availability(date: str, people: int = 2):
    s = await get_settings()
    try:
        d_obj = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")

    blocked = await is_date_blocked(date)
    if blocked or not OPERATING_HOURS[d_obj.weekday()]:
        reason = blocked or "Café is closed on this day"
        return {"date": date, "open": False, "reason": reason, "slots": []}

    start, end = get_booking_window()
    bookable = start <= d_obj < end

    dur = party_duration(people)
    slots = generate_slots(d_obj, dur)
    now_ist = now_utc() + timedelta(hours=5, minutes=30)
    is_today = d_obj == now_ist.date()
    now_min = now_ist.hour * 60 + now_ist.minute
    out = []
    for t in slots:
        if is_today and _to_minutes(t) <= now_min:
            continue  # hide past slots for today
        free = await available_tables_for(date, t, people, dur)
        out.append({"time": t, "available": len(free) > 0, "seats_left": sum(x["capacity"] for x in free[:3])})
    return {"date": date, "open": True, "bookable": bookable, "slots": out,
            "window_start": start.isoformat(), "window_end": end.isoformat()}

# ---------------------------------------------------------------------------
# Reservations (customer)
# ---------------------------------------------------------------------------
@api_router.post("/reservations")
async def create_reservation(body: ReservationInput, user: dict = Depends(get_current_user)):
    s = await get_settings()
    if not body.policies_accepted:
        raise HTTPException(status_code=400, detail="You must accept the reservation policies")
    try:
        d_obj = datetime.strptime(body.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")

    if not OPERATING_HOURS[d_obj.weekday()]:
        raise HTTPException(status_code=400, detail="Café is closed on this day")
    if await is_date_blocked(body.date):
        raise HTTPException(status_code=400, detail="This date is not available")
    dur = party_duration(body.people)
    if body.time not in generate_slots(d_obj, dur):
        raise HTTPException(status_code=400, detail="Invalid time slot")
    if body.people < 1:
        raise HTTPException(status_code=400, detail="Invalid number of people")

    free = await available_tables_for(body.date, body.time, body.people, dur)
    if not free:
        raise HTTPException(status_code=409, detail="This slot is full. You can join the waitlist.")

    needs_approval = (body.people > s["group_threshold"]
                      or body.has_dietary
                      or (body.special_occasion != "None" and body.special_service))
    amount = s["fee_per_person"] * body.people

    doc = {
        "user_id": user["id"], "booking_name": body.booking_name, "date": body.date, "time": body.time,
        "people": body.people, "phone": body.phone, "special_occasion": body.special_occasion,
        "special_service": body.special_service, "has_dietary": body.has_dietary,
        "dietary_note": body.dietary_note or "", "duration_minutes": dur,
        "status": "pending_payment", "needs_approval": needs_approval, "table_id": None, "table_name": None,
        "amount": amount, "fee_per_person": s["fee_per_person"], "payment_id": None,
        "refund_amount": 0, "created_at": now_utc().isoformat(), "admin_note": "",
    }
    res = await db.reservations.insert_one(doc)
    rid = str(res.inserted_id)
    order = await create_razorpay_order(amount, rid)
    await db.reservations.update_one({"_id": res.inserted_id}, {"$set": {"razorpay_order_id": order["id"]}})
    return {"reservation_id": rid, "needs_approval": needs_approval, "amount": amount,
            "order": {"order_id": order["id"], "amount": order["amount"],
                      "currency": order["currency"], "key_id": RAZORPAY_KEY_ID}}

@api_router.post("/reservations/{rid}/pay")
async def pay_reservation(rid: str, body: PaymentVerifyInput, user: dict = Depends(get_current_user)):
    """Verify Razorpay payment signature and confirm the reservation."""
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    if not r or r["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] != "pending_payment":
        raise HTTPException(status_code=400, detail="Reservation is not awaiting payment")

    try:
        await asyncio.to_thread(_verify_signature, body.razorpay_order_id,
                                body.razorpay_payment_id, body.razorpay_signature)
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Payment verification failed")

    payment_id = body.razorpay_payment_id
    if r["needs_approval"]:
        new_status, table_id, table_name = "pending_approval", None, None
    else:
        free = await available_tables_for(r["date"], r["time"], r["people"], r.get("duration_minutes", party_duration(r["people"])))
        if not free:
            new_status, table_id, table_name = "pending_approval", None, None
        else:
            tb = free[0]
            new_status, table_id, table_name = "confirmed", str(tb["_id"]), tb["name"]

    await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
        "status": new_status, "payment_id": payment_id, "razorpay_order_id": body.razorpay_order_id,
        "table_id": table_id, "table_name": table_name, "paid_at": now_utc().isoformat(),
    }})
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    return clean_reservation(r)

@api_router.get("/reservations/mine")
async def my_reservations(user: dict = Depends(get_current_user)):
    rows = await db.reservations.find({"user_id": user["id"]}).sort("created_at", -1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.post("/reservations/{rid}/cancel")
async def cancel_reservation(rid: str, user: dict = Depends(get_current_user)):
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    if not r or (r["user_id"] != user["id"] and user["role"] not in ("admin", "super_admin")):
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] in ("cancelled", "rejected", "completed"):
        raise HTTPException(status_code=400, detail="Reservation cannot be cancelled")
    s = await get_settings()
    refund = 0
    refund_id = None
    refund_status = "none"
    if r.get("payment_id"):
        refund = round(r["amount"] * s["refund_percent"] / 100)
        if refund > 0:
            try:
                rf = await refund_razorpay_payment(r["payment_id"], refund)
                refund_id = rf.get("id")
                refund_status = "processed"
            except Exception as e:
                logger.error("Refund failed for %s: %s", rid, e)
                refund_status = "pending"
    await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
        "status": "cancelled", "refund_amount": refund, "refund_id": refund_id,
        "refund_status": refund_status, "cancelled_at": now_utc().isoformat(),
    }})
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    return clean_reservation(r)

# ---------------------------------------------------------------------------
# Waitlist
# ---------------------------------------------------------------------------
@api_router.post("/waitlist")
async def join_waitlist(body: WaitlistInput, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": user["id"], "booking_name": body.booking_name, "date": body.date, "time": body.time,
        "people": body.people, "phone": body.phone, "special_occasion": body.special_occasion,
        "status": "waiting", "created_at": now_utc().isoformat(),
    }
    res = await db.waitlist.insert_one(doc)
    return {"id": str(res.inserted_id), "status": "waiting"}

@api_router.get("/waitlist/mine")
async def my_waitlist(user: dict = Depends(get_current_user)):
    rows = await db.waitlist.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return [clean_reservation(r) for r in rows]

# ---------------------------------------------------------------------------
# Tables (staff)
# ---------------------------------------------------------------------------
@api_router.get("/tables")
async def list_tables(user: dict = Depends(require_staff)):
    rows = await db.tables.find().sort("name", 1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.post("/tables")
async def create_table(body: TableInput, user: dict = Depends(require_owner)):
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.tables.insert_one(doc)
    r = await db.tables.find_one({"_id": res.inserted_id})
    return clean_reservation(r)

@api_router.put("/tables/{tid}")
async def update_table(tid: str, body: TableInput, user: dict = Depends(require_owner)):
    await db.tables.update_one({"_id": ObjectId(tid)}, {"$set": body.model_dump()})
    r = await db.tables.find_one({"_id": ObjectId(tid)})
    if not r:
        raise HTTPException(status_code=404, detail="Table not found")
    return clean_reservation(r)

@api_router.delete("/tables/{tid}")
async def delete_table(tid: str, user: dict = Depends(require_owner)):
    await db.tables.delete_one({"_id": ObjectId(tid)})
    return {"ok": True}

@api_router.get("/tables/status")
async def table_status(date: str, time: str, user: dict = Depends(require_staff)):
    s = await get_settings()
    tables = await db.tables.find().sort("name", 1).to_list(500)
    reservations = await db.reservations.find({
        "date": date, "status": {"$in": ["confirmed", "pending_approval"]}, "table_id": {"$ne": None},
    }).to_list(1000)
    slot_start = _to_minutes(time)
    slot_end = slot_start + s["hold_minutes"]
    out = []
    for tb in tables:
        tid = str(tb["_id"])
        occ = None
        for r in reservations:
            if r.get("table_id") != tid:
                continue
            rs = _to_minutes(r["time"])
            if slot_start < rs + s["hold_minutes"] and rs < slot_end:
                occ = {"booking_name": r["booking_name"], "time": r["time"], "people": r["people"]}
                break
        out.append({"id": tid, "name": tb["name"], "zone": tb["zone"], "capacity": tb["capacity"],
                    "active": tb["active"], "occupied": occ is not None, "reservation": occ})
    return out

# ---------------------------------------------------------------------------
# Admin reservations
# ---------------------------------------------------------------------------
@api_router.get("/admin/reservations")
async def admin_reservations(status: Optional[str] = None, date: Optional[str] = None, user: dict = Depends(require_staff)):
    q = {}
    if status:
        q["status"] = status
    if date:
        q["date"] = date
    rows = await db.reservations.find(q).sort("created_at", -1).to_list(1000)
    return [clean_reservation(r) for r in rows]

@api_router.get("/admin/today")
async def admin_today(user: dict = Depends(require_staff)):
    today = now_utc().date().isoformat()
    rows = await db.reservations.find({"date": today, "status": {"$in": ["confirmed", "pending_approval"]}}).sort("time", 1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.get("/admin/waitlist")
async def admin_waitlist(user: dict = Depends(require_staff)):
    rows = await db.waitlist.find({"status": "waiting"}).sort("created_at", 1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.post("/admin/reservations/{rid}/approval")
async def approve_reservation(rid: str, body: ApprovalInput, user: dict = Depends(require_staff)):
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    s = await get_settings()
    if body.action == "reject":
        refund = 0
        refund_id = None
        refund_status = "none"
        if r.get("payment_id"):
            refund = r["amount"]
            try:
                rf = await refund_razorpay_payment(r["payment_id"], refund)
                refund_id = rf.get("id")
                refund_status = "processed"
            except Exception as e:
                logger.error("Refund failed on reject for %s: %s", rid, e)
                refund_status = "pending"
        await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
            "status": "rejected", "admin_note": body.note or "", "refund_amount": refund,
            "refund_id": refund_id, "refund_status": refund_status}})
    else:
        free = await available_tables_for(r["date"], r["time"], r["people"], r.get("duration_minutes", party_duration(r["people"])))
        if not free:
            raise HTTPException(status_code=409, detail="No table available to assign for this slot")
        tb = free[0]
        await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
            "status": "confirmed", "table_id": str(tb["_id"]), "table_name": tb["name"],
            "admin_note": body.note or ""}})
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    return clean_reservation(r)

# ---------------------------------------------------------------------------
# Blocks & holidays
# ---------------------------------------------------------------------------
@api_router.get("/admin/blocks")
async def list_blocks(user: dict = Depends(require_staff)):
    rows = await db.blocks.find().sort("date", 1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.post("/admin/blocks")
async def create_block(body: BlockInput, user: dict = Depends(require_staff)):
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.blocks.insert_one(doc)
    r = await db.blocks.find_one({"_id": res.inserted_id})
    return clean_reservation(r)

@api_router.delete("/admin/blocks/{bid}")
async def delete_block(bid: str, user: dict = Depends(require_staff)):
    await db.blocks.delete_one({"_id": ObjectId(bid)})
    return {"ok": True}

@api_router.get("/holidays")
async def list_holidays(user: dict = Depends(get_current_user)):
    rows = await db.holidays.find().sort("date", 1).to_list(500)
    return [clean_reservation(r) for r in rows]

@api_router.post("/holidays")
async def create_holiday(body: HolidayInput, user: dict = Depends(require_owner)):
    doc = body.model_dump()
    res = await db.holidays.insert_one(doc)
    r = await db.holidays.find_one({"_id": res.inserted_id})
    return clean_reservation(r)

@api_router.delete("/holidays/{hid}")
async def delete_holiday(hid: str, user: dict = Depends(require_owner)):
    await db.holidays.delete_one({"_id": ObjectId(hid)})
    return {"ok": True}

# ---------------------------------------------------------------------------
# Settings (owner)
# ---------------------------------------------------------------------------
@api_router.get("/admin/settings")
async def get_admin_settings(user: dict = Depends(require_staff)):
    return await get_settings()

@api_router.put("/admin/settings")
async def update_settings(body: SettingsInput, user: dict = Depends(require_owner)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.settings.update_one({"_id": "global"}, {"$set": updates}, upsert=True)
    return await get_settings()

# ---------------------------------------------------------------------------
# User management (owner)
# ---------------------------------------------------------------------------
@api_router.get("/admin/users")
async def list_users(user: dict = Depends(require_owner)):
    rows = await db.users.find().sort("created_at", -1).to_list(1000)
    out = []
    for u in rows:
        out.append({"id": str(u["_id"]), "name": u["name"], "email": u["email"],
                    "role": u["role"], "phone": u.get("phone", "")})
    return out

@api_router.post("/admin/users")
async def create_staff(body: StaffCreateInput, user: dict = Depends(require_owner)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": body.role, "phone": "", "created_at": now_utc().isoformat()}
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "name": body.name, "email": email, "role": body.role}

@api_router.put("/admin/users/{uid}/role")
async def set_user_role(uid: str, body: UserRoleInput, user: dict = Depends(require_owner)):
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"role": body.role}})
    return {"ok": True}

@api_router.delete("/admin/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_owner)):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"ok": True}

# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
@api_router.get("/admin/analytics")
async def analytics(user: dict = Depends(require_staff)):
    all_res = await db.reservations.find().to_list(5000)
    status_counts = {}
    revenue = 0
    occasion_counts = {}
    daily = {}
    for r in all_res:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1
        if r.get("payment_id") and r["status"] not in ("cancelled", "rejected"):
            revenue += r["amount"]
        occ = r.get("special_occasion", "None")
        if occ != "None":
            occasion_counts[occ] = occasion_counts.get(occ, 0) + 1
        if r["status"] in ("confirmed", "pending_approval", "completed"):
            daily[r["date"]] = daily.get(r["date"], 0) + 1
    total_tables = await db.tables.count_documents({"active": True})
    daily_series = [{"date": k, "count": v} for k, v in sorted(daily.items())][-14:]
    return {
        "total_reservations": len(all_res),
        "confirmed": status_counts.get("confirmed", 0),
        "pending": status_counts.get("pending_approval", 0),
        "cancelled": status_counts.get("cancelled", 0),
        "revenue": revenue,
        "waitlist": await db.waitlist.count_documents({"status": "waiting"}),
        "active_tables": total_tables,
        "status_counts": [{"name": k, "value": v} for k, v in status_counts.items()],
        "occasions": [{"name": k, "value": v} for k, v in occasion_counts.items()],
        "daily": daily_series,
    }

# ---------------------------------------------------------------------------
# Gallery / media (public read, owner-managed)
# ---------------------------------------------------------------------------
@api_router.get("/gallery")
async def list_gallery():
    rows = await db.gallery.find({"is_deleted": False}).sort("created_at", -1).to_list(100)
    return [{"id": g["id"], "url": f"/api/files/{g['storage_path']}",
             "caption": g.get("caption", ""), "slot": g.get("slot", "gallery")} for g in rows]

@api_router.post("/admin/gallery")
async def upload_gallery(file: UploadFile = File(...), caption: str = Query(""),
                         slot: str = Query("gallery"), user: dict = Depends(require_owner)):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin")
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only image files (jpg, png, gif, webp) are allowed")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 8MB")
    path = f"{APP_NAME}/gallery/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, MIME_TYPES[ext])
    if slot in ("hero", "gallery_1", "gallery_2"):
        await db.gallery.update_many({"slot": slot, "is_deleted": False}, {"$set": {"is_deleted": True}})
    doc = {"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
           "content_type": MIME_TYPES[ext], "size": result.get("size", len(data)), "caption": caption,
           "slot": slot, "is_deleted": False, "created_at": now_utc().isoformat()}
    await db.gallery.insert_one(doc)
    return {"id": doc["id"], "url": f"/api/files/{doc['storage_path']}", "caption": caption, "slot": slot}

@api_router.delete("/admin/gallery/{gid}")
async def delete_gallery(gid: str, user: dict = Depends(require_owner)):
    await db.gallery.update_one({"id": gid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.gallery.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        record = await db.media.find_one({"storage_path": path})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type),
                    headers={"Cache-Control": "public, max-age=86400"})

def _validate_image(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only image files (jpg, png, gif, webp) are allowed")
    return ext

@api_router.post("/admin/upload")
async def admin_upload(file: UploadFile = File(...), kind: str = Query("misc"), user: dict = Depends(require_owner)):
    ext = _validate_image(file.filename)
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 8MB")
    path = f"{APP_NAME}/{kind}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, MIME_TYPES[ext])
    await db.media.insert_one({"storage_path": result["path"], "content_type": MIME_TYPES[ext],
                               "kind": kind, "created_at": now_utc().isoformat()})
    return {"url": f"/api/files/{result['path']}", "path": result["path"]}

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
@api_router.get("/events")
async def get_events():
    rows = await db.events.find({"active": True}).sort("date", 1).to_list(100)
    return [clean_reservation(e) for e in rows]

@api_router.get("/admin/events")
async def admin_events(user: dict = Depends(require_staff)):
    rows = await db.events.find().sort("date", 1).to_list(200)
    return [clean_reservation(e) for e in rows]

@api_router.post("/admin/events")
async def create_event(body: EventInput, user: dict = Depends(require_owner)):
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.events.insert_one(doc)
    return clean_reservation(await db.events.find_one({"_id": res.inserted_id}))

@api_router.put("/admin/events/{eid}")
async def update_event(eid: str, body: EventInput, user: dict = Depends(require_owner)):
    await db.events.update_one({"_id": ObjectId(eid)}, {"$set": body.model_dump()})
    return clean_reservation(await db.events.find_one({"_id": ObjectId(eid)}))

@api_router.delete("/admin/events/{eid}")
async def delete_event(eid: str, user: dict = Depends(require_owner)):
    await db.events.delete_one({"_id": ObjectId(eid)})
    return {"ok": True}

# ---------------------------------------------------------------------------
# Public tables (for "our tables" showcase)
# ---------------------------------------------------------------------------
@api_router.get("/tables/public")
async def public_tables():
    rows = await db.tables.find({"active": True}).sort("capacity", 1).to_list(500)
    return [{"id": str(t["_id"]), "name": t["name"], "zone": t["zone"], "capacity": t["capacity"],
             "image_url": t.get("image_url", ""), "notes": t.get("notes", "")} for t in rows]

# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
@api_router.get("/menu")
async def get_menu():
    s = await get_settings()
    items = await db.menu_items.find({"active": True}).sort("created_at", 1).to_list(300)
    return {"enabled": s.get("menu_enabled", True), "items": [clean_reservation(i) for i in items]}

@api_router.get("/admin/menu")
async def admin_menu(user: dict = Depends(require_staff)):
    items = await db.menu_items.find().sort("created_at", 1).to_list(300)
    return [clean_reservation(i) for i in items]

@api_router.post("/admin/menu")
async def create_menu(body: MenuItemInput, user: dict = Depends(require_owner)):
    doc = body.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.menu_items.insert_one(doc)
    return clean_reservation(await db.menu_items.find_one({"_id": res.inserted_id}))

@api_router.put("/admin/menu/{mid}")
async def update_menu(mid: str, body: MenuItemInput, user: dict = Depends(require_owner)):
    await db.menu_items.update_one({"_id": ObjectId(mid)}, {"$set": body.model_dump()})
    return clean_reservation(await db.menu_items.find_one({"_id": ObjectId(mid)}))

@api_router.delete("/admin/menu/{mid}")
async def delete_menu(mid: str, user: dict = Depends(require_owner)):
    await db.menu_items.delete_one({"_id": ObjectId(mid)})
    return {"ok": True}

@api_router.post("/admin/menu/upload")
async def upload_menu_file(file: UploadFile = File(...), user: dict = Depends(require_owner)):
    """Replace the menu from an uploaded CSV or Excel file.

    Recognised headers (case-insensitive, any order): name/dish, category, price,
    description, image_url, and 'veg / non veg' (Veg / Non veg / Egg). Category is
    carried forward across blank rows; a row with a blank dish name but a star
    ingredient is treated as a veg/non-veg variant of the dish above it.
    """
    import io, csv
    fname = (file.filename or "").lower()
    data = await file.read()
    if fname.endswith(".csv"):
        grid = [list(r) for r in csv.reader(io.StringIO(data.decode("utf-8-sig")))]
    elif fname.endswith((".xlsx", ".xls")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        grid = [list(r) for r in wb.active.iter_rows(values_only=True)]
    else:
        raise HTTPException(status_code=400, detail="Please upload a .csv or .xlsx file")

    header_idx, headers = None, []
    for idx, row in enumerate(grid):
        low = [str(c).strip().lower() if c is not None else "" for c in row]
        if "dish" in low or "name" in low:
            header_idx, headers = idx, low
            break
    if header_idx is None:
        raise HTTPException(status_code=400, detail="Couldn't find a header row. Include a 'name' (or 'dish') column.")

    def find(*names):
        for n in names:
            if n in headers:
                return headers.index(n)
        return -1

    name_i = find("dish", "name")
    cat_i = find("category")
    price_i = find("price")
    desc_i = find("description")
    star_i = find("star ingredient")
    veg_i = next((i for i, h in enumerate(headers) if h.startswith("veg") or h == "type"), -1)

    def cell(row, i):
        if i < 0 or i >= len(row) or row[i] is None:
            return ""
        return str(row[i]).strip()

    def norm_veg(v):
        t = v.lower()
        if not t:
            return ""
        if "non" in t:
            return "non_veg"
        if t.startswith("egg"):
            return "egg"
        if "veg" in t:
            return "veg"
        return ""

    items, last_cat, last_name = [], "", ""
    for row in grid[header_idx + 1:]:
        if not any(c not in (None, "") for c in row):
            continue
        cat = cell(row, cat_i)
        if cat:
            last_cat = cat
        dish = cell(row, name_i)
        star = cell(row, star_i)
        if dish:
            last_name, name = dish, dish
        elif last_name:
            name = f"{last_name} ({star})" if star else last_name
        else:
            continue
        try:
            price = int(float(cell(row, price_i) or 0))
        except (ValueError, TypeError):
            price = 0
        items.append({"name": name, "description": cell(row, desc_i), "price": price,
                      "category": last_cat or "Mains", "veg_type": norm_veg(cell(row, veg_i)),
                      "image_url": "", "active": True, "created_at": now_utc().isoformat()})
    if not items:
        raise HTTPException(status_code=400, detail="No valid rows found. Required column: name (plus price, description, category)")
    await db.menu_items.delete_many({})
    await db.menu_items.insert_many(items)
    return {"count": len(items)}

# ---------------------------------------------------------------------------
# Startup seeding
# ---------------------------------------------------------------------------
async def _ensure_seed_user(email_env: str, pass_env: str, name: str, role: str) -> None:
    email = os.environ[email_env].lower()
    pw = os.environ[pass_env]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"name": name, "email": email, "password_hash": hash_password(pw),
                                   "role": role, "phone": "", "created_at": now_utc().isoformat()})
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw), "role": role}})

async def _seed_demo_customer() -> None:
    if not await db.users.find_one({"email": "guest@komorebi.cafe"}):
        await db.users.insert_one({"name": "Aiko Tanaka", "email": "guest@komorebi.cafe",
                                   "password_hash": hash_password("Guest@123"), "role": "customer",
                                   "phone": "+91 90000 12345", "created_at": now_utc().isoformat()})

async def _seed_tables() -> None:
    named = [
        {"name": "Spicy", "capacity": 2, "duration_minutes": 120, "zone": "indoor"},
        {"name": "Umami", "capacity": 2, "duration_minutes": 120, "zone": "indoor"},
        {"name": "Salty", "capacity": 4, "duration_minutes": 120, "zone": "indoor"},
        {"name": "Tangy", "capacity": 4, "duration_minutes": 120, "zone": "indoor"},
        {"name": "Fruity", "capacity": 6, "duration_minutes": 210, "zone": "outdoor"},
        {"name": "Malty", "capacity": 6, "duration_minutes": 210, "zone": "outdoor"},
        {"name": "Smoky", "capacity": 5, "duration_minutes": 180, "zone": "outdoor"},
    ]
    if await db.tables.find_one({"name": "Spicy"}):
        return
    await db.tables.delete_many({})
    for t in named:
        t.update({"active": True, "notes": "", "image_url": "", "created_at": now_utc().isoformat()})
    await db.tables.insert_many(named)

async def _seed_menu() -> None:
    if await db.menu_items.count_documents({}) != 0:
        return
    seed_menu = [
        {"name": "Komorebi Pour-Over", "description": "Single-origin beans, brewed slow over filtered light.", "price": 320, "category": "Coffee", "image_url": "", "active": True},
        {"name": "Matcha Cloud Latte", "description": "Ceremonial matcha, oat milk, a whisper of cane sugar.", "price": 340, "category": "Coffee", "image_url": "", "active": True},
        {"name": "Yuzu Cheesecake", "description": "Baked cheesecake with bright yuzu and a sesame crust.", "price": 380, "category": "Dessert", "image_url": "", "active": True},
        {"name": "Garden Soba Bowl", "description": "Chilled soba, seasonal greens, sesame-ginger dressing.", "price": 460, "category": "Mains", "image_url": "", "active": True},
        {"name": "Maple Miso Toast", "description": "Sourdough, miso butter, maple, toasted walnuts.", "price": 290, "category": "Small Plates", "image_url": "", "active": True},
        {"name": "Hojicha Affogato", "description": "Roasted-tea ice cream drowned in warm espresso.", "price": 300, "category": "Dessert", "image_url": "", "active": True},
    ]
    for m in seed_menu:
        m["created_at"] = now_utc().isoformat()
    await db.menu_items.insert_many(seed_menu)

async def _seed_events() -> None:
    if await db.events.count_documents({}) != 0:
        return
    base = now_utc().date()
    seed = [
        {"title": "Live Jazz & Pour-Over Night", "description": "An evening of slow coffee and live jazz on the terrace.", "date": (base + timedelta(days=6)).isoformat(), "image_url": "", "active": True},
        {"title": "Matcha Masterclass", "description": "Hands-on ceremonial matcha workshop with our head barista.", "date": (base + timedelta(days=13)).isoformat(), "image_url": "", "active": True},
        {"title": "Harvest Supper", "description": "A seasonal set menu celebrating the autumn harvest.", "date": (base + timedelta(days=20)).isoformat(), "image_url": "", "active": True},
    ]
    for e in seed:
        e["created_at"] = now_utc().isoformat()
    await db.events.insert_many(seed)

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await db.users.create_index("email", unique=True)
    async for u in db.users.find({"phone": {"$nin": ["", None]}, "phone_normalized": {"$exists": False}}):
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"phone_normalized": normalize_phone(u.get("phone", ""))}})
    await get_settings()
    await _ensure_seed_user("SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD", "Café Owner", "super_admin")
    await _ensure_seed_user("ADMIN_EMAIL", "ADMIN_PASSWORD", "Café Manager", "admin")
    await _seed_demo_customer()
    await _seed_tables()
    await _seed_menu()
    await _seed_events()
    logger.info("Startup seeding complete")

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
