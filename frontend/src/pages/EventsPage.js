import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../lib/api";
import { CalendarDays, ArrowRight } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const img = (u) => (u.startsWith("http") ? u : `${BACKEND}${u}`);

function EventCard({ e, i, past }) {
  return (
    <motion.div
      key={e.id}
      data-testid={`event-${e.id}`}
      className="rounded-3xl bg-white hairline overflow-hidden lift md:flex"
    >
      {e.image_url
        ? <img src={img(e.image_url)} alt={e.title} className={`md:w-64 h-48 md:h-auto object-cover ${past ? "grayscale" : ""}`} />
        : <div className="md:w-64 h-48 md:h-auto bg-gradient-to-br from-komorebi-clay/15 to-komorebi-green/10 grid place-items-center"><CalendarDays size={40} className="text-komorebi-clay/50" strokeWidth={1.2} /></div>}
      <div className="p-6 flex-1">
        <p className="text-xs uppercase tracking-wide text-komorebi-clay">{e.date}</p>
        <h3 className="font-display text-3xl text-komorebi-ink mt-1">{e.title}</h3>
        {e.description && <p className="text-komorebi-ink2 mt-3 leading-relaxed">{e.description}</p>}
        {e.gallery?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" data-testid={`event-gallery-${e.id}`}>
            {e.gallery.slice(0, 6).map((u, gi) => (
              <a key={gi} href={img(u)} target="_blank" rel="noreferrer" className="h-16 w-16 rounded-lg overflow-hidden hairline block">
                <img src={img(u)} alt="Event moment" className="h-full w-full object-cover hover:scale-105 transition-transform" />
              </a>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get("/events").then((r) => setEvents(r.data)).catch(() => {});
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();

  return (
    <div className="komorebi-grain min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">What's on</p>
        <h1 className="font-display text-5xl md:text-6xl mt-3 text-komorebi-ink">Upcoming Events</h1>
        <p className="mt-4 text-komorebi-ink2 max-w-xl">Evenings of music, tastings and seasonal suppers at The Tree.</p>

        {events.length === 0 ? (
          <p className="mt-12 text-komorebi-muted">No events scheduled right now — check back soon.</p>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <p className="mt-10 text-komorebi-muted">No upcoming events right now — check back soon.</p>
            ) : (
              <div className="mt-10 space-y-6">
                {upcoming.map((e, i) => <EventCard key={e.id} e={e} i={i} past={false} />)}
              </div>
            )}

            {past.length > 0 && (
              <div className="mt-16">
                <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Memories</p>
                <h2 className="font-display text-4xl md:text-5xl mt-2 text-komorebi-ink">Past Events</h2>
                <div className="mt-8 space-y-6" data-testid="past-events-list">
                  {past.map((e, i) => <EventCard key={e.id} e={e} i={i} past={true} />)}
                </div>
              </div>
            )}
          </>
        )}

        <Link to="/book" className="mt-12 inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-7 py-3 text-sm font-medium hover:bg-komorebi-greenDark transition-colors">Reserve a table <ArrowRight size={16} strokeWidth={1.5} /></Link>
      </div>
    </div>
  );
}
