from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta, date, time
from typing import List, Optional, Annotated, Literal

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
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
    email: EmailStr
    password: str

class TableInput(BaseModel):
    name: str
    capacity: int
    zone: Literal["indoor", "outdoor"] = "indoor"
    active: bool = True
    notes: Optional[str] = ""

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
    s = await db.settings.find_one({"_id": "global"})
    if not s:
        s = {
            "_id": "global", "fee_per_person": 300, "refund_percent": 50,
            "group_threshold": 6, "hold_minutes": 90, "special_needs_approval": True,
        }
        await db.settings.insert_one(s)
    s.pop("_id", None)
    return s

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

def get_booking_window(ref: Optional[datetime] = None):
    """Weekly window opens every Tuesday 11:30. Returns (start_date, end_date)."""
    ref = ref or now_utc()
    # find most recent Tuesday 11:30
    today = ref.date()
    days_since_tue = (today.weekday() - 1) % 7
    last_tue = today - timedelta(days=days_since_tue)
    release_dt = datetime.combine(last_tue, time(11, 30), tzinfo=timezone.utc)
    if ref < release_dt:
        last_tue = last_tue - timedelta(days=7)
    # released week covers the 7 days following the release day
    start = today
    end = last_tue + timedelta(days=8)  # through the upcoming week
    if end < start + timedelta(days=1):
        end = start + timedelta(days=1)
    return start, end

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

async def available_tables_for(d: str, t: str, people: int, hold_minutes: int):
    """Return list of active tables that can seat `people` and are free at date/time."""
    dt_obj = datetime.strptime(d, "%Y-%m-%d").date()
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

    free = []
    for tb in tables:
        tid = str(tb["_id"])
        if tid in blocked_table_ids:
            continue
        occupied = False
        for r in reservations:
            if r.get("table_id") != tid:
                continue
            r_start = _to_minutes(r["time"])
            r_end = r_start + hold_minutes
            if slot_start < r_end and r_start < slot_end:
                occupied = True
                break
        if not occupied:
            free.append(tb)
    free.sort(key=lambda x: x["capacity"])
    return free

def clean_reservation(r: dict) -> dict:
    r["id"] = str(r["_id"])
    r.pop("_id", None)
    return r

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "name": body.name, "email": email, "password_hash": hash_password(body.password),
        "phone": body.phone or "", "role": "customer", "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email, "customer")
    return {"access_token": token, "user": {"id": uid, "name": body.name, "email": email, "role": "customer", "phone": body.phone or ""}}

@api_router.post("/auth/login")
async def login(body: LoginInput):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email, user["role"])
    return {"access_token": token, "user": {"id": uid, "name": user["name"], "email": email, "role": user["role"], "phone": user.get("phone", "")}}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------------------------------------------------------------------
# Public: settings, policies, availability
# ---------------------------------------------------------------------------
@api_router.get("/settings/public")
async def public_settings():
    s = await get_settings()
    return {"fee_per_person": s["fee_per_person"], "refund_percent": s["refund_percent"], "group_threshold": s["group_threshold"]}

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

    slots = generate_slots(d_obj, s["hold_minutes"])
    out = []
    for t in slots:
        free = await available_tables_for(date, t, people, s["hold_minutes"])
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
    if body.time not in generate_slots(d_obj, s["hold_minutes"]):
        raise HTTPException(status_code=400, detail="Invalid time slot")
    if body.people < 1:
        raise HTTPException(status_code=400, detail="Invalid number of people")

    free = await available_tables_for(body.date, body.time, body.people, s["hold_minutes"])
    if not free:
        raise HTTPException(status_code=409, detail="This slot is full. You can join the waitlist.")

    needs_approval = body.people > s["group_threshold"] or (
        s["special_needs_approval"] and body.special_occasion != "None")
    amount = s["fee_per_person"] * body.people

    doc = {
        "user_id": user["id"], "booking_name": body.booking_name, "date": body.date, "time": body.time,
        "people": body.people, "phone": body.phone, "special_occasion": body.special_occasion,
        "status": "pending_payment", "needs_approval": needs_approval, "table_id": None, "table_name": None,
        "amount": amount, "fee_per_person": s["fee_per_person"], "payment_id": None,
        "refund_amount": 0, "created_at": now_utc().isoformat(), "admin_note": "",
    }
    res = await db.reservations.insert_one(doc)
    rid = str(res.inserted_id)
    # mock razorpay order
    order = {"order_id": f"order_mock_{rid}", "amount": amount * 100, "currency": "INR", "key_id": "rzp_test_mock"}
    return {"reservation_id": rid, "needs_approval": needs_approval, "amount": amount, "order": order}

@api_router.post("/reservations/{rid}/pay")
async def pay_reservation(rid: str, user: dict = Depends(get_current_user)):
    """Mocked payment verification."""
    r = await db.reservations.find_one({"_id": ObjectId(rid)})
    if not r or r["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] != "pending_payment":
        raise HTTPException(status_code=400, detail="Reservation is not awaiting payment")

    s = await get_settings()
    payment_id = f"pay_mock_{rid}"
    if r["needs_approval"]:
        new_status, table_id, table_name = "pending_approval", None, None
    else:
        free = await available_tables_for(r["date"], r["time"], r["people"], s["hold_minutes"])
        if not free:
            new_status, table_id, table_name = "pending_approval", None, None
        else:
            tb = free[0]
            new_status, table_id, table_name = "confirmed", str(tb["_id"]), tb["name"]

    await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
        "status": new_status, "payment_id": payment_id, "table_id": table_id, "table_name": table_name,
        "paid_at": now_utc().isoformat(),
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
    if r.get("payment_id"):
        refund = round(r["amount"] * s["refund_percent"] / 100)
    await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
        "status": "cancelled", "refund_amount": refund, "cancelled_at": now_utc().isoformat(),
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
        refund = round(r["amount"] * s["refund_percent"] / 100) if r.get("payment_id") else 0
        await db.reservations.update_one({"_id": ObjectId(rid)}, {"$set": {
            "status": "rejected", "admin_note": body.note or "", "refund_amount": refund}})
    else:
        free = await available_tables_for(r["date"], r["time"], r["people"], s["hold_minutes"])
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
# Startup seeding
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await get_settings()

    async def ensure_user(email_env, pass_env, name, role):
        email = os.environ[email_env].lower()
        pw = os.environ[pass_env]
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({"name": name, "email": email, "password_hash": hash_password(pw),
                                       "role": role, "phone": "", "created_at": now_utc().isoformat()})
        elif not verify_password(pw, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw), "role": role}})

    await ensure_user("SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD", "Café Owner", "super_admin")
    await ensure_user("ADMIN_EMAIL", "ADMIN_PASSWORD", "Café Manager", "admin")

    # demo customer
    if not await db.users.find_one({"email": "guest@komorebi.cafe"}):
        await db.users.insert_one({"name": "Aiko Tanaka", "email": "guest@komorebi.cafe",
                                   "password_hash": hash_password("Guest@123"), "role": "customer",
                                   "phone": "+91 90000 12345", "created_at": now_utc().isoformat()})

    # seed tables
    if await db.tables.count_documents({}) == 0:
        seed_tables = [
            {"name": "Sakura 1", "capacity": 2, "zone": "indoor", "active": True, "notes": "Window seat"},
            {"name": "Sakura 2", "capacity": 2, "zone": "indoor", "active": True, "notes": ""},
            {"name": "Bamboo 1", "capacity": 4, "zone": "indoor", "active": True, "notes": ""},
            {"name": "Bamboo 2", "capacity": 4, "zone": "indoor", "active": True, "notes": ""},
            {"name": "Zen Hall", "capacity": 8, "zone": "indoor", "active": True, "notes": "Large groups"},
            {"name": "Garden 1", "capacity": 2, "zone": "outdoor", "active": True, "notes": "Under the maple"},
            {"name": "Garden 2", "capacity": 4, "zone": "outdoor", "active": True, "notes": ""},
            {"name": "Terrace", "capacity": 6, "zone": "outdoor", "active": True, "notes": "Sunset view"},
        ]
        for t in seed_tables:
            t["created_at"] = now_utc().isoformat()
        await db.tables.insert_many(seed_tables)
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
