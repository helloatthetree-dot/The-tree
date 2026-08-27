import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { IndianRupee, RefreshCw, Clock, Users, Utensils, Shuffle, Check } from "lucide-react";

const ICONS = [IndianRupee, RefreshCw, Clock, Users, Utensils, Shuffle];
const DEFAULT_POLICIES = [
  { title: "Reservation fee", body: "A fee of ₹300 per guest is collected at the time of booking to confirm your table." },
  { title: "Cancellation & refund", body: "Cancel anytime before your visit for a 50% refund of the reservation fee." },
  { title: "Table hold", body: "Tables are held only for your reserved duration. Please arrive on time to enjoy your full seating." },
  { title: "Large groups", body: "Parties larger than 6 guests require manual confirmation by our team before the table is finalised." },
  { title: "Outside food & décor", body: "Outside food and any decorations (for celebrations) need prior approval from the café." },
  { title: "Table reassignment", body: "The café may reassign tables when operationally necessary to seat everyone comfortably." },
];

export default function PoliciesPage({ embedded, accepted, onAccept }) {
  const [fee, setFee] = useState(300);
  const [refund, setRefund] = useState(50);
  const [policies, setPolicies] = useState(DEFAULT_POLICIES);
  const [intro, setIntro] = useState("A few gentle guidelines so every guest enjoys the calm of The Tree.");

  useEffect(() => {
    api.get("/settings/public").then((r) => {
      setFee(r.data.fee_per_person);
      setRefund(r.data.refund_percent);
      if (r.data.policies?.length) setPolicies(r.data.policies);
      if (r.data.policies_intro) setIntro(r.data.policies_intro);
    }).catch(() => {});
  }, []);

  return (
    <div className={embedded ? "" : "komorebi-grain min-h-[calc(100vh-4rem)]"}>
      <div className={embedded ? "" : "max-w-4xl mx-auto px-5 md:px-8 py-14"}>
        {!embedded && (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Before you book</p>
            <h1 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">Reservation policies</h1>
            <p className="mt-4 text-komorebi-ink2 max-w-2xl leading-relaxed">
              {intro}{" "}The reservation fee is{" "}
              <span className="text-komorebi-green font-semibold">₹{fee} per guest</span>, with a{" "}
              <span className="text-komorebi-green font-semibold">{refund}% refund</span> on cancellation.
            </p>
          </>
        )}

        <div className="grid md:grid-cols-2 gap-4 mt-8">
          {policies.map((p, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={i} className="rounded-2xl bg-white hairline p-6 flex gap-4">
                <span className="shrink-0 grid place-items-center h-11 w-11 rounded-xl bg-komorebi-green/10 text-komorebi-green">
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <div>
                  <h3 className="font-semibold text-komorebi-ink">{p.title}</h3>
                  <p className="text-sm text-komorebi-ink2 mt-1 leading-relaxed">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {embedded ? (
          <label className="mt-6 flex items-start gap-3 rounded-2xl bg-komorebi-green/5 hairline p-5 cursor-pointer">
            <input
              type="checkbox" data-testid="accept-policies-checkbox" checked={accepted}
              onChange={(e) => onAccept(e.target.checked)}
              className="mt-1 h-5 w-5 accent-komorebi-green"
            />
            <span className="text-sm text-komorebi-ink2">
              I have read and accept the reservation policies, including the ₹{fee}/guest fee and {refund}% refund on
              cancellation.
            </span>
          </label>
        ) : (
          <div className="mt-10 flex items-center gap-4">
            <Link
              to="/book"
              data-testid="policies-book-btn"
              className="inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-7 py-3.5 text-sm font-medium hover:bg-komorebi-greenDark transition-colors"
            >
              <Check size={17} strokeWidth={1.5} /> Continue to booking
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
