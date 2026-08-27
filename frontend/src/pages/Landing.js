import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Leaf, Clock, MapPin, ShieldCheck, ArrowRight, Sun } from "lucide-react";
import api from "../lib/api";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const HERO =
  "https://images.unsplash.com/photo-1774597997646-789e4e62a8a2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHw0fHxzdW5saWdodCUyMGZpbHRlcmluZyUyMHRocm91Z2glMjB0cmVlcyUyMGNhZmUlMjBpbnRlcmlvcnxlbnwwfHx8fDE3ODUxMjU2MDd8MA&ixlib=rb-4.1.0&q=85";
const COFFEE =
  "https://images.unsplash.com/photo-1531752074002-abf991376d04?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwzfHxlbGVnYW50JTIwY29mZmVlJTIwYWVzdGhldGljJTIwbWluaW1hbGlzdHxlbnwwfHx8fDE3ODUxMjU2MDd8MA&ixlib=rb-4.1.0&q=85";
const ZEN =
  "https://images.unsplash.com/photo-1608060146923-7b8ab13e22bb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwxfHxqYXBhbmVzZSUyMHplbiUyMGNhZmUlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg1MTI1NjA3fDA&ixlib=rb-4.1.0&q=85";

function TiltImage({ src, label, tagline }) {
  const ref = useRef(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setT({ x: py * -8, y: px * 10 });
  };
  return (
    <div style={{ perspective: 1200 }} className="w-full">
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setT({ x: 0, y: 0 })}
        animate={{ rotateX: t.x, rotateY: t.y }}
        transition={{ type: "spring", stiffness: 120, damping: 12 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative rounded-[2rem] overflow-hidden shadow-[0_40px_80px_-40px_rgba(44,42,40,0.55)]"
      >
        <img src={src} alt="Sunlight through the café windows" className="w-full h-[380px] md:h-[560px] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-komorebi-ink/25 to-transparent" />
        <div className="absolute bottom-6 left-6 glass rounded-2xl px-5 py-3" style={{ transform: "translateZ(40px)" }}>
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-green font-semibold">{label || "Now serving"}</p>
          <p className="font-display text-2xl text-komorebi-ink">{tagline || "Afternoon light & golden evenings"}</p>
        </div>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, -60]);
  const [gallery, setGallery] = useState([]);
  const [menu, setMenu] = useState({ enabled: true, items: [] });
  const [events, setEvents] = useState([]);
  const [site, setSite] = useState({ hero_label: "Now serving", hero_tagline: "Afternoon light & golden evenings" });

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get("/gallery").then((r) => setGallery(r.data)).catch(() => {});
    api.get("/menu").then((r) => setMenu(r.data)).catch(() => {});
    api.get("/events").then((r) => setEvents(r.data)).catch(() => {});
    api.get("/settings/public").then((r) => setSite(r.data)).catch(() => {});
  }, []);

  const bySlot = (slot, fallback) => {
    const g = gallery.find((x) => x.slot === slot);
    return g ? `${BACKEND}${g.url}` : fallback;
  };

  return (
    <div className="komorebi-grain">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div style={{ y: y1 }}>
          <div className="inline-flex items-center gap-2 rounded-full hairline bg-white px-4 py-1.5 mb-6">
            <Sun size={15} strokeWidth={1.5} className="text-komorebi-clay" />
            <span className="text-xs tracking-[0.15em] uppercase text-komorebi-ink2">Experience-driven café</span>
          </div>
          <h1 className="font-display font-light text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight text-komorebi-ink whitespace-pre-line">
            {site.hero_headline || "Where sunlight\nfilters through\nthe trees."}
          </h1>
          <p className="mt-6 text-base md:text-lg text-komorebi-ink2 max-w-md leading-relaxed">
            {site.hero_intro || "Reserve a table at Café Komorebi — a calm, light-filled retreat for warm afternoons, golden evenings and quiet celebrations."}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/book"
              data-testid="hero-reserve-btn"
              className="group inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-7 py-3.5 text-sm font-medium hover:bg-komorebi-greenDark transition-colors"
            >
              Reserve a table
              <ArrowRight size={17} strokeWidth={1.5} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/policies" className="text-sm text-komorebi-ink2 underline underline-offset-4 hover:text-komorebi-green">
              Read reservation policies
            </Link>
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-komorebi-muted">
            <span className="flex items-center gap-2"><Leaf size={16} strokeWidth={1.5} /> Indoor & garden seating</span>
            <span className="flex items-center gap-2"><Clock size={16} strokeWidth={1.5} /> Open Tue–Sun</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <TiltImage src={bySlot("hero", HERO)} label={site.hero_label} tagline={site.hero_tagline} />
        </motion.div>
      </section>

      {/* Hours */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-10">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { d: "Saturday & Sunday", t: "12:30 PM – 10:00 PM", note: "Continuous seating" },
            { d: "Tuesday – Friday", t: "12:30 – 3:00 PM · 6:00 – 10:00 PM", note: "Split shifts" },
            { d: "Monday", t: "Closed", note: "See you Tuesday" },
          ].map((h) => (
            <div key={h.d} className="rounded-2xl bg-white hairline p-6 lift">
              <p className="text-xs uppercase tracking-[0.2em] text-komorebi-green font-semibold">{h.d}</p>
              <p className="font-display text-2xl mt-2 text-komorebi-ink">{h.t}</p>
              <p className="text-sm text-komorebi-muted mt-1">{h.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Menu highlight */}
      {menu.enabled && menu.items.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-16">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Taste</p>
              <h2 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">Menu</h2>
            </div>
            <Link to="/menu" data-testid="home-menu-link" className="inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-6 py-3 text-sm hover:bg-komorebi-greenDark transition-colors">View full menu <ArrowRight size={16} strokeWidth={1.5} /></Link>
          </div>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {menu.items.slice(0, 3).map((m, i) => (
              <motion.div
                key={m.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08, duration: 0.6 }}
                className="rounded-2xl bg-white hairline overflow-hidden lift"
              >
                {m.image_url ? (
                  <img src={m.image_url.startsWith("http") ? m.image_url : `${BACKEND}${m.image_url}`} alt={m.name} className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-gradient-to-br from-komorebi-green/12 to-komorebi-clay/12 grid place-items-center">
                    <span className="font-display text-3xl text-komorebi-green/40">木漏れ日</span>
                  </div>
                )}
                <div className="p-5">
                  <div className="flex justify-between items-start gap-3">
                    <h3 className="font-display text-2xl text-komorebi-ink leading-tight">{m.name}</h3>
                    <span className="text-komorebi-green font-semibold whitespace-nowrap">₹{m.price}</span>
                  </div>
                  {m.category && <span className="text-[11px] uppercase tracking-wide text-komorebi-muted">{m.category}</span>}
                  {m.description && <p className="text-sm text-komorebi-ink2 mt-2 leading-relaxed">{m.description}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      {events.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-16" id="events">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">What's on</p>
              <h2 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">Upcoming events</h2>
            </div>
            <Link to="/events" className="text-sm text-komorebi-green underline underline-offset-4 hover:text-komorebi-greenDark">All events</Link>
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {events.slice(0, 3).map((e, i) => (
              <motion.div key={e.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.08, duration: 0.6 }} className="rounded-2xl bg-white hairline overflow-hidden lift">
                {e.image_url ? <img src={e.image_url.startsWith("http") ? e.image_url : `${BACKEND}${e.image_url}`} alt={e.title} className="w-full h-40 object-cover" /> : <div className="w-full h-40 bg-gradient-to-br from-komorebi-clay/15 to-komorebi-green/10 grid place-items-center"><span className="font-display text-2xl text-komorebi-clay/50">Komorebi</span></div>}
                <div className="p-5">
                  <p className="text-xs uppercase tracking-wide text-komorebi-clay">{e.date}</p>
                  <h3 className="font-display text-2xl text-komorebi-ink mt-1">{e.title}</h3>
                  {e.description && <p className="text-sm text-komorebi-ink2 mt-2 leading-relaxed">{e.description}</p>}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-24 grid md:grid-cols-2 gap-5">
        <motion.img
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          src={bySlot("gallery_1", COFFEE)} alt="Elegant coffee" className="w-full h-72 md:h-96 object-cover rounded-3xl lift"
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 }}
          className="relative rounded-3xl overflow-hidden lift"
        >
          <img src={bySlot("gallery_2", ZEN)} alt="Zen interior" className="w-full h-72 md:h-96 object-cover" />
          <div className="absolute inset-0 bg-komorebi-ink/35 grid place-items-center text-center p-8">
            <div>
              <h3 className="font-display text-3xl md:text-4xl text-white">{site.gallery_cta_title || "Reserve your window seat"}</h3>
              <Link
                to="/book"
                data-testid="gallery-reserve-btn"
                className="inline-flex mt-5 items-center gap-2 rounded-full bg-white text-komorebi-ink px-6 py-3 text-sm font-medium hover:bg-komorebi-bg transition-colors"
              >
                {site.gallery_cta_button || "Start booking"} <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-komorebi-border py-12 text-center" id="contact">
        <Link to="/book" data-testid="footer-start-booking" className="inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-7 py-3 text-sm font-medium hover:bg-komorebi-greenDark transition-colors">
          Start booking <ArrowRight size={16} strokeWidth={1.5} />
        </Link>
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-muted">Reach us on WhatsApp</p>
          <a href="https://wa.me/919000012345" target="_blank" rel="noreferrer" data-testid="whatsapp-link" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.597 20.13c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
            Chat with us
          </a>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=https://wa.me/919000012345" alt="WhatsApp QR code" data-testid="whatsapp-qr" className="mt-2 rounded-xl hairline bg-white p-1" width="120" height="120" />
        </div>
        <p className="mt-8 text-sm text-komorebi-muted">Café Komorebi · 木漏れ日 · Open Tuesday to Sunday</p>
      </footer>
    </div>
  );
}
