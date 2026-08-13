import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PoliciesPage from "./PoliciesPage";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Loader2, Minus, Plus, CheckCircle2, PartyPopper, Clock, ListPlus } from "lucide-react";

const OCCASIONS = ["None", "Birthday", "Anniversary", "Date Night", "Family Gathering", "Business Meeting", "Celebration", "Other"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt12(t) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const dates = useMemo(() => {
    const out = [];
    const start = new Date();
    for (let i = 0; i < 21; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const [selectedDate, setSelectedDate] = useState(null);
  const [people, setPeople] = useState(2);
  const [avail, setAvail] = useState(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);

  const [form, setForm] = useState({ booking_name: user?.name || "", phone: user?.phone || "", special_occasion: "None" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingAvail(true);
    setSelectedTime(null);
    api.get("/availability", { params: { date: iso(selectedDate), people } })
      .then((r) => setAvail(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail)))
      .finally(() => setLoadingAvail(false));
  }, [selectedDate, people]);

  const submitBooking = async () => {
    if (!selectedDate || !selectedTime) return toast.error("Please pick a date and time.");
    if (!form.booking_name || !form.phone) return toast.error("Please add a booking name and phone number.");
    if (!accepted) return toast.error("Please accept the reservation policies.");
    setSubmitting(true);
    try {
      const payload = {
        booking_name: form.booking_name, phone: form.phone, special_occasion: form.special_occasion,
        date: iso(selectedDate), time: selectedTime, people, policies_accepted: true,
      };
      const { data } = await api.post("/reservations", payload);
      // mock payment
      toast.loading("Processing payment…", { id: "pay" });
      const paid = await api.post(`/reservations/${data.reservation_id}/pay`);
      toast.dismiss("pay");
      setConfirmation({ ...paid.data, amount: data.amount, needs_approval: data.needs_approval });
    } catch (e) {
      toast.dismiss("pay");
      const status = e.response?.status;
      if (status === 409) {
        setWaitlistOpen(true);
      } else {
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const joinWaitlist = async () => {
    try {
      await api.post("/waitlist", {
        booking_name: form.booking_name || user.name, phone: form.phone, special_occasion: form.special_occasion,
        date: iso(selectedDate), time: selectedTime, people,
      });
      setWaitlistOpen(false);
      toast.success("You're on the waitlist — we'll reach out if a table opens up.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const amount = 300 * people;

  return (
    <div className="komorebi-grain min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Reserve a table</p>
        <h1 className="font-display text-4xl md:text-5xl mt-2 text-komorebi-ink">Choose your moment</h1>

        <div className="mt-8 grid lg:grid-cols-[1.15fr_1fr] gap-8">
          {/* LEFT: date/time + availability */}
          <div className="space-y-6">
            {/* Party size */}
            <div className="rounded-2xl bg-white hairline p-6">
              <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Number of guests</label>
              <div className="mt-3 flex items-center gap-5">
                <button
                  data-testid="people-minus" onClick={() => setPeople((p) => Math.max(1, p - 1))}
                  className="h-11 w-11 grid place-items-center rounded-full hairline bg-komorebi-bg hover:bg-komorebi-bg2"
                ><Minus size={18} strokeWidth={1.5} /></button>
                <span data-testid="people-count" className="font-display text-4xl w-12 text-center text-komorebi-ink">{people}</span>
                <button
                  data-testid="people-plus" onClick={() => setPeople((p) => Math.min(20, p + 1))}
                  className="h-11 w-11 grid place-items-center rounded-full hairline bg-komorebi-bg hover:bg-komorebi-bg2"
                ><Plus size={18} strokeWidth={1.5} /></button>
                {people > 6 && (
                  <span className="text-sm text-komorebi-warning ml-2">Large group — needs approval</span>
                )}
              </div>
            </div>

            {/* Date strip */}
            <div className="rounded-2xl bg-white hairline p-6">
              <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Select a date</label>
              <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {dates.map((d) => {
                  const closed = d.getDay() === 1;
                  const active = selectedDate && iso(selectedDate) === iso(d);
                  return (
                    <button
                      key={iso(d)} disabled={closed} onClick={() => setSelectedDate(d)}
                      data-testid={`date-${iso(d)}`}
                      className={`shrink-0 w-16 rounded-2xl py-3 text-center border transition-colors ${
                        active ? "bg-komorebi-green text-white border-komorebi-green"
                        : closed ? "opacity-35 cursor-not-allowed border-komorebi-border bg-komorebi-bg"
                        : "bg-white border-komorebi-border hover:border-komorebi-green"
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide">{WEEKDAY[d.getDay()]}</div>
                      <div className="font-display text-2xl leading-none mt-1">{d.getDate()}</div>
                      <div className="text-[10px] mt-1 opacity-70">{MONTH[d.getMonth()]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            <div className="rounded-2xl bg-white hairline p-6 min-h-[200px]">
              <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Available times</label>
              {!selectedDate ? (
                <p className="mt-6 text-komorebi-muted text-sm">Pick a date to see available time slots.</p>
              ) : loadingAvail ? (
                <div className="mt-8 flex items-center gap-2 text-komorebi-muted"><Loader2 className="animate-spin" size={18} /> Checking availability…</div>
              ) : avail && !avail.open ? (
                <p className="mt-6 text-komorebi-danger text-sm">{avail.reason}</p>
              ) : avail && avail.bookable === false ? (
                <p className="mt-6 text-komorebi-warning text-sm">
                  Bookings for this date open on Tuesday at 11:30 AM. Please choose a date within the current booking window.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {avail?.slots.map((s) => (
                    <button
                      key={s.time} disabled={!s.available} onClick={() => setSelectedTime(s.time)}
                      data-testid={`slot-${s.time}`}
                      className={`rounded-xl py-2.5 text-sm border transition-colors ${
                        selectedTime === s.time ? "bg-komorebi-green text-white border-komorebi-green"
                        : !s.available ? "opacity-30 line-through cursor-not-allowed border-komorebi-border"
                        : "bg-komorebi-bg border-komorebi-border hover:border-komorebi-green"
                      }`}
                    >{fmt12(s.time)}</button>
                  ))}
                  {avail?.slots.length === 0 && <p className="text-komorebi-muted text-sm col-span-full">No slots on this day.</p>}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: form + policies */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-white hairline p-6 space-y-4">
              <h3 className="font-display text-2xl text-komorebi-ink">Your details</h3>
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Booking name</label>
                <input
                  data-testid="booking-name" value={form.booking_name} onChange={(e) => setForm({ ...form, booking_name: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="Name for the reservation"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Phone number</label>
                <input
                  data-testid="booking-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="+91 90000 00000"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Special occasion</label>
                <Select value={form.special_occasion} onValueChange={(v) => setForm({ ...form, special_occasion: v })}>
                  <SelectTrigger data-testid="booking-occasion" className="mt-1.5 rounded-xl bg-komorebi-bg border-komorebi-border py-6">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCASIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.special_occasion !== "None" && (
                  <p className="text-xs text-komorebi-warning mt-1.5">Special occasions are confirmed after a quick admin approval.</p>
                )}
              </div>
            </div>

            {/* Policies embedded */}
            <div className="rounded-2xl bg-white hairline p-6">
              <h3 className="font-display text-2xl text-komorebi-ink mb-4">Policies</h3>
              <PoliciesPage embedded accepted={accepted} onAccept={setAccepted} />
            </div>

            {/* Summary + pay */}
            <div className="rounded-2xl bg-komorebi-ink text-white p-6">
              <div className="flex justify-between text-sm text-white/70">
                <span>When</span>
                <span className="text-white">
                  {selectedDate ? `${WEEKDAY[selectedDate.getDay()]}, ${MONTH[selectedDate.getMonth()]} ${selectedDate.getDate()}` : "—"}
                  {selectedTime ? ` · ${fmt12(selectedTime)}` : ""}
                </span>
              </div>
              <div className="flex justify-between text-sm text-white/70 mt-2">
                <span>Guests</span><span className="text-white">{people}</span>
              </div>
              <div className="border-t border-white/15 my-4" />
              <div className="flex justify-between items-end">
                <span className="text-white/70 text-sm">Reservation fee (₹300 × {people})</span>
                <span className="font-display text-3xl">₹{amount}</span>
              </div>
              <button
                data-testid="pay-btn" onClick={submitBooking} disabled={submitting}
                className="mt-5 w-full rounded-full bg-komorebi-clay text-white py-3.5 font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                Pay ₹{amount} & reserve
              </button>
              <p className="text-center text-xs text-white/50 mt-3">Secure payment via Razorpay (demo mode)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmation} onOpenChange={(o) => { if (!o) { setConfirmation(null); navigate("/reservations"); } }}>
        <DialogContent className="rounded-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Reservation status</DialogTitle>
            <DialogDescription>Your reservation confirmation details</DialogDescription>
          </DialogHeader>
          <AnimatePresence>
            {confirmation && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-4">
                <div className="mx-auto grid place-items-center h-16 w-16 rounded-full bg-komorebi-green/10 text-komorebi-green">
                  {confirmation.needs_approval ? <Clock size={30} strokeWidth={1.5} /> : <CheckCircle2 size={30} strokeWidth={1.5} />}
                </div>
                <h2 className="font-display text-3xl mt-4 text-komorebi-ink">
                  {confirmation.needs_approval ? "Awaiting approval" : "Table reserved!"}
                </h2>
                <p className="text-komorebi-ink2 text-sm mt-2 px-4">
                  {confirmation.needs_approval
                    ? "Your payment is received. Our team will confirm your special booking shortly."
                    : `You're all set, ${confirmation.booking_name}. Your table ${confirmation.table_name ? `(${confirmation.table_name}) ` : ""}is confirmed.`}
                </p>
                <div className="mt-5 rounded-2xl bg-komorebi-bg hairline p-4 text-left text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-komorebi-muted">Date</span><span>{confirmation.date} · {fmt12(confirmation.time)}</span></div>
                  <div className="flex justify-between"><span className="text-komorebi-muted">Guests</span><span>{confirmation.people}</span></div>
                  {confirmation.special_occasion !== "None" && (
                    <div className="flex justify-between"><span className="text-komorebi-muted">Occasion</span><span className="flex items-center gap-1"><PartyPopper size={14} /> {confirmation.special_occasion}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-komorebi-muted">Paid</span><span>₹{confirmation.amount}</span></div>
                </div>
                <button
                  data-testid="confirmation-done" onClick={() => { setConfirmation(null); navigate("/reservations"); }}
                  className="mt-6 w-full rounded-full bg-komorebi-green text-white py-3 font-medium hover:bg-komorebi-greenDark transition-colors"
                >View my reservations</button>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Waitlist dialog */}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2"><ListPlus size={22} className="text-komorebi-clay" /> This slot is full</DialogTitle>
            <DialogDescription>
              We're fully booked for {selectedTime ? fmt12(selectedTime) : "this time"}. Join the waitlist and we'll
              reach out if a table opens up — no payment needed now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setWaitlistOpen(false)} className="rounded-full px-5 py-2.5 hairline bg-white text-sm">Not now</button>
            <button data-testid="join-waitlist-btn" onClick={joinWaitlist} className="rounded-full px-5 py-2.5 bg-komorebi-green text-white text-sm hover:bg-komorebi-greenDark">Join waitlist</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
