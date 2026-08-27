import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { CalendarHeart, Clock, Users, MapPin, PartyPopper, ArrowRight } from "lucide-react";

const STATUS = {
  confirmed: { label: "Confirmed", cls: "bg-komorebi-green/10 text-komorebi-green" },
  pending_approval: { label: "Awaiting approval", cls: "bg-komorebi-warning/15 text-komorebi-warning" },
  pending_payment: { label: "Payment pending", cls: "bg-komorebi-info/15 text-komorebi-info" },
  cancelled: { label: "Cancelled", cls: "bg-komorebi-danger/10 text-komorebi-danger" },
  rejected: { label: "Not approved", cls: "bg-komorebi-danger/10 text-komorebi-danger" },
  completed: { label: "Completed", cls: "bg-komorebi-muted/15 text-komorebi-muted" },
};

function fmt12(t) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function MyReservations() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([api.get("/reservations/mine"), api.get("/waitlist/mine")])
      .then(([r, w]) => { setRows(r.data); setWaitlist(w.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cancel = async (id) => {
    try {
      const { data } = await api.post(`/reservations/${id}/cancel`);
      toast.success(`Cancelled. ${data.refund_amount ? `₹${data.refund_amount} refunded (50%).` : ""}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="komorebi-grain min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-12">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Avatar user={user} size={56} />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Your visits</p>
              <h1 className="font-display text-4xl md:text-5xl mt-1 text-komorebi-ink">My reservations</h1>
              <p className="text-sm text-komorebi-muted mt-1">{user?.name}</p>
            </div>
          </div>
          <Link to="/book" data-testid="new-booking-btn" className="inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-6 py-3 text-sm hover:bg-komorebi-greenDark transition-colors">
            New reservation <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>

        {loading ? (
          <p className="mt-10 text-komorebi-muted">Loading…</p>
        ) : rows.length === 0 && waitlist.length === 0 ? (
          <div className="mt-16 text-center">
            <CalendarHeart size={40} className="mx-auto text-komorebi-muted" strokeWidth={1.2} />
            <p className="mt-4 text-komorebi-ink2">No reservations yet.</p>
            <Link to="/book" className="mt-4 inline-block rounded-full bg-komorebi-green text-white px-6 py-3 text-sm">Reserve a table</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {rows.map((r, i) => {
              const st = STATUS[r.status] || STATUS.completed;
              const canCancel = ["confirmed", "pending_approval", "pending_payment"].includes(r.status);
              return (
                <motion.div
                  key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  data-testid={`reservation-${r.id}`}
                  className="rounded-2xl bg-white hairline p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-display text-2xl text-komorebi-ink">{r.booking_name}</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      {r.special_occasion !== "None" && (
                        <span className="text-xs px-3 py-1 rounded-full bg-komorebi-clay/10 text-komorebi-clay flex items-center gap-1">
                          <PartyPopper size={12} /> {r.special_occasion}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-komorebi-ink2">
                      <span className="flex items-center gap-1.5"><Clock size={15} strokeWidth={1.5} /> {r.date} · {fmt12(r.time)}</span>
                      <span className="flex items-center gap-1.5"><Users size={15} strokeWidth={1.5} /> {r.people} guests</span>
                      {r.table_name && <span className="flex items-center gap-1.5"><MapPin size={15} strokeWidth={1.5} /> {r.table_name}</span>}
                      <span>₹{r.amount} paid</span>
                    </div>
                    {r.status === "cancelled" && r.refund_amount > 0 && (
                      <p data-testid={`refund-${r.id}`} className="text-xs text-komorebi-green mt-2">₹{r.refund_amount} refunded</p>
                    )}
                    {r.status === "rejected" && r.refund_amount > 0 && (
                      <p data-testid={`refund-${r.id}`} className="text-xs text-komorebi-green mt-2">₹{r.refund_amount} refunded in full</p>
                    )}
                    {r.admin_note && <p className="text-xs text-komorebi-muted mt-2 italic">Note: {r.admin_note}</p>}
                  </div>
                  {canCancel && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button data-testid={`cancel-${r.id}`} className="rounded-full hairline bg-white px-5 py-2.5 text-sm text-komorebi-danger hover:bg-komorebi-danger/5 self-start">Cancel</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-3xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-display text-2xl">Cancel this reservation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You'll receive a 50% refund (₹{Math.round(r.amount * 0.5)}) of your ₹{r.amount} reservation fee.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
                          <AlertDialogAction data-testid={`confirm-cancel-${r.id}`} onClick={() => cancel(r.id)} className="rounded-full bg-komorebi-danger hover:bg-komorebi-danger/90">Cancel & refund</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </motion.div>
              );
            })}

            {waitlist.map((w) => (
              <div key={w.id} className="rounded-2xl bg-komorebi-bg2 hairline p-5 flex items-center justify-between">
                <div>
                  <span className="text-xs px-3 py-1 rounded-full bg-komorebi-clay/15 text-komorebi-clay font-medium">Waitlist</span>
                  <p className="mt-2 text-sm text-komorebi-ink2">{w.booking_name} · {w.date} · {fmt12(w.time)} · {w.people} guests</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
