import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Loader2, Minus, Plus, CheckCircle2, PartyPopper, Clock, ListPlus, Camera, Download } from "lucide-react";

const OCCASIONS = ["None", "Birthday", "Anniversary", "Date Night", "Family Gathering", "Business Meeting", "Celebration", "Other"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt12(t) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const dates = useMemo(() => {
    const out = [];
    const start = new Date();
    for (let i = 0; i < 15; i++) {
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

  const [form, setForm] = useState({ booking_name: user?.name || "", phone: user?.phone || "", special_occasion: "None", special_service: false, has_dietary: false, dietary_note: "" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [cfg, setCfg] = useState({ fee_per_person: 300, refund_percent: 50 });

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    api.get("/settings/public")
      .then((r) => setCfg({ fee_per_person: r.data.fee_per_person ?? 300, refund_percent: r.data.refund_percent ?? 50 }))
      .catch(() => {});
  }, []);

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
        special_service: form.special_service, has_dietary: form.has_dietary, dietary_note: form.dietary_note,
        date: iso(selectedDate), time: selectedTime, people, policies_accepted: true,
      };
      const { data } = await api.post("/reservations", payload);
      const order = data.order;

      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        setSubmitting(false);
        return toast.error("Couldn't load the payment window. Check your connection and try again.");
      }

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "The Tree",
        description: `Table reservation · ${people} guest${people > 1 ? "s" : ""}`,
        order_id: order.order_id,
        prefill: { name: form.booking_name, contact: form.phone, email: user?.email || "" },
        theme: { color: "#5c6b4c" },
        handler: async (resp) => {
          try {
            toast.loading("Confirming your booking…", { id: "pay" });
            const paid = await api.post(`/reservations/${data.reservation_id}/pay`, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.dismiss("pay");
            setConfirmation({ ...paid.data, amount: data.amount, needs_approval: data.needs_approval });
          } catch (e) {
            toast.dismiss("pay");
            toast.error(formatApiError(e.response?.data?.detail) || "We couldn't confirm your payment.");
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            toast.info("Payment cancelled — your table isn't reserved yet.");
          },
        },
      });
      rzp.on("payment.failed", () => {
        toast.error("Payment failed. Please try again.");
        setSubmitting(false);
      });
      rzp.open();
    } catch (e) {
      const status = e.response?.status;
      if (status === 409) {
        setWaitlistOpen(true);
      } else {
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
      }
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

  const amount = cfg.fee_per_person * people;

  const downloadPass = () => {
    const c = confirmation;
    if (!c) return;
    const canvas = document.createElement("canvas");
    const W = 720, H = 470;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f4ee"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#5c6b4c"; ctx.fillRect(0, 0, W, 96);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 36px Georgia"; ctx.fillText("The Tree", 40, 56);
    ctx.font = "16px Georgia"; ctx.fillText("Reservation pass", 40, 80);
    ctx.fillStyle = "#2c2a28"; ctx.font = "bold 26px Georgia";
    ctx.fillText(c.needs_approval ? "Awaiting approval" : "Table reserved", 40, 148);
    const rows = [
      ["Name", c.booking_name || ""],
      ["Date", `${c.date}  ·  ${fmt12(c.time)}`],
      ["Guests", String(c.people)],
      ["Table", c.table_name || (c.needs_approval ? "To be assigned" : "—")],
      ["Occasion", c.special_occasion && c.special_occasion !== "None" ? c.special_occasion : "—"],
      ["Paid", `Rs ${c.amount}`],
    ];
    let y = 196;
    rows.forEach(([k, v]) => {
      ctx.font = "16px Georgia"; ctx.fillStyle = "#8a8880"; ctx.fillText(k, 40, y);
      ctx.font = "18px Georgia"; ctx.fillStyle = "#2c2a28"; ctx.fillText(v, 220, y);
      y += 38;
    });
    ctx.fillStyle = "#b3391f"; ctx.font = "15px Georgia";
    ctx.fillText("Please show this at arrival. Table held 30 min past your time.", 40, H - 28);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `TheTree-booking-${c.date}.png`;
    a.click();
  };

  return (
    <div className="komorebi-grain min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Reserve a table</p>
        <h1 className="font-display text-4xl md:text-5xl mt-2 text-komorebi-ink">Choose your moment</h1>

        <div className="mt-8 grid lg:grid-cols-[1.15fr_1fr] gap-8">
          {/* LEFT: date/time + availability */}
          <div className="space-y-6 min-w-0">
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
              <p data-testid="fee-info" className="mt-4 rounded-xl bg-komorebi-green/8 border border-komorebi-green/20 px-4 py-3 text-sm text-komorebi-ink2">
                <span className="font-semibold text-komorebi-green">Reservation fee ₹{cfg.fee_per_person} per guest</span> — collected now to confirm your table. {cfg.refund_percent}% refundable (see cancellation policy).
              </p>
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
              <p data-testid="cancellation-policy" className="mt-3 text-xs text-komorebi-muted">
                Cancellations 24+ hours before your reservation receive a {cfg.refund_percent}% refund. Same-day cancellations are non-refundable. Closed on Mondays.
              </p>
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
                  You can book up to 2 weeks in advance. Please choose an earlier date.
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
                  <label className="mt-2 flex items-center gap-2 text-sm text-komorebi-ink2 cursor-pointer">
                    <input type="checkbox" data-testid="special-service-toggle" checked={form.special_service} onChange={(e) => setForm({ ...form, special_service: e.target.checked })} className="h-4 w-4 accent-komorebi-green" />
                    I'd like extra service (decorations, cake, etc.)
                  </label>
                )}
                {form.special_occasion !== "None" && form.special_service && (
                  <p className="text-xs text-komorebi-warning mt-1.5">Extra-service requests are confirmed after a quick admin approval.</p>
                )}
              </div>

              {/* Dietary */}
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Any dietary issues?</label>
                <div className="mt-2 flex gap-2">
                  {[{ v: false, l: "No" }, { v: true, l: "Yes" }].map((o) => (
                    <button
                      key={o.l} type="button" data-testid={`dietary-${o.l.toLowerCase()}`}
                      onClick={() => setForm({ ...form, has_dietary: o.v })}
                      className={`rounded-full px-5 py-2 text-sm border transition-colors ${form.has_dietary === o.v ? "bg-komorebi-green text-white border-komorebi-green" : "bg-komorebi-bg border-komorebi-border hover:border-komorebi-green"}`}
                    >{o.l}</button>
                  ))}
                </div>
                {form.has_dietary && (
                  <>
                    <textarea
                      data-testid="dietary-note" value={form.dietary_note} onChange={(e) => setForm({ ...form, dietary_note: e.target.value })}
                      placeholder="Please describe the dietary issue (allergies, restrictions…)"
                      className="mt-2 w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none min-h-[70px]"
                    />
                    <p className="text-xs text-komorebi-warning mt-1.5">Dietary requests are confirmed after a quick admin approval.</p>
                  </>
                )}
              </div>
            </div>

            {/* Policies acceptance */}
            <div className="rounded-2xl bg-white hairline p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox" data-testid="accept-policies-checkbox" checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-komorebi-green shrink-0"
                />
                <span className="text-sm text-komorebi-ink2">
                  I have read and accept the{" "}
                  <Link to="/policies" target="_blank" data-testid="policies-link" className="text-komorebi-green font-semibold underline underline-offset-2 hover:text-komorebi-greenDark">
                    reservation policies
                  </Link>
                  {" "}— including the ₹{cfg.fee_per_person}/guest fee and {cfg.refund_percent}% refund on cancellation.
                </span>
              </label>
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
                <span className="text-white/70 text-sm">Reservation fee (₹{cfg.fee_per_person} × {people})</span>
                <span className="font-display text-3xl">₹{amount}</span>
              </div>
              <button
                data-testid="pay-btn" onClick={submitBooking} disabled={submitting}
                className="mt-5 w-full rounded-full bg-komorebi-clay text-white py-3.5 font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                Pay ₹{amount} & reserve
              </button>
              <p data-testid="hold-notice" className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-white/70">
                <Clock size={13} strokeWidth={1.5} /> Your table is held for 30 minutes after your reserved time.
              </p>
              <p className="text-center text-xs text-white/50 mt-2">Secure payment via Razorpay</p>
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
                <div className="mt-4 flex items-start gap-2 text-left text-xs text-komorebi-ink2 rounded-xl bg-komorebi-clay/10 px-3 py-2.5">
                  <Clock size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-komorebi-clay" />
                  <span>Please arrive on time — your table will be held for <span className="font-semibold">30 minutes</span> after your reserved time.</span>
                </div>
                <div data-testid="screenshot-hint" className="mt-4 rounded-xl bg-komorebi-green/8 border border-komorebi-green/20 px-3 py-2.5 text-left text-xs text-komorebi-ink2 flex items-start gap-1.5">
                  <Camera size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-komorebi-green" />
                  Take a screenshot of this confirmation — or download your booking pass below — to show when you arrive.
                </div>
                <button
                  data-testid="download-pass-btn" onClick={downloadPass}
                  className="mt-3 w-full rounded-full hairline bg-white text-komorebi-ink py-3 font-medium flex items-center justify-center gap-2 hover:bg-komorebi-bg transition-colors"
                ><Download size={17} strokeWidth={1.5} /> Download booking pass</button>
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
