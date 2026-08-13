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

function TiltImage({ src }) {
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
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-green font-semibold">Now serving</p>
          <p className="font-display text-2xl text-komorebi-ink">Afternoon light & slow mornings</p>
        </div>
      </motion.div>
    </div>
  );
}

const zones = [
  { name: "Sakura", zone: "Indoor", seats: "2", x: "6%", y: "12%" },
  { name: "Bamboo", zone: "Indoor", seats: "4", x: "34%", y: "30%" },
  { name: "Zen Hall", zone: "Indoor", seats: "8", x: "8%", y: "56%" },
  { name: "Garden", zone: "Outdoor", seats: "2", x: "62%", y: "16%" },
  { name: "Terrace", zone: "Outdoor", seats: "6", x: "68%", y: "58%" },
];

function TableMap() {
  return (
    <div className="relative w-full aspect-[4/3] rounded-3xl hairline bg-komorebi-bg2 overflow-hidden">
      <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 30% 20%, rgba(255,244,214,0.6), transparent 55%)" }} />
      <span className="absolute top-4 left-4 text-xs uppercase tracking-[0.2em] text-komorebi-muted">Indoor</span>
      <span className="absolute top-4 right-4 text-xs uppercase tracking-[0.2em] text-komorebi-clay">Outdoor</span>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 h-[80%] w-px bg-komorebi-border" />
      {zones.map((z, i) => (
        <motion.div
          key={z.name}
          initial={{ opacity: 0, y: 14, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.12, type: "spring", stiffness: 140, damping: 14 }}
          whileHover={{ y: -6 }}
          style={{ left: z.x, top: z.y }}
          className={`absolute rounded-2xl px-4 py-3 shadow-[0_16px_30px_-18px_rgba(44,42,40,0.5)] cursor-default ${
            z.zone === "Outdoor" ? "bg-komorebi-clay/15 border border-komorebi-clay/40" : "bg-white border border-komorebi-border"
          }`}
        >
          <p className="font-display text-lg leading-none text-komorebi-ink">{z.name}</p>
          <p className="text-[11px] text-komorebi-muted mt-1">{z.seats} seats · {z.zone}</p>
        </motion.div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, -60]);
  const [gallery, setGallery] = useState([]);
  const [menu, setMenu] = useState({ enabled: true, items: [] });
  const [publicTables, setPublicTables] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get("/gallery").then((r) => setGallery(r.data)).catch(() => {});
    api.get("/menu").then((r) => setMenu(r.data)).catch(() => {});
    api.get("/tables/public").then((r) => setPublicTables(r.data)).catch(() => {});
  }, []);

  const galleryImg = (idx, fallback) =>
    gallery[idx] ? `${BACKEND}${gallery[idx].url}` : fallback;

  return (
    <div className="komorebi-grain">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div style={{ y: y1 }}>
          <div className="inline-flex items-center gap-2 rounded-full hairline bg-white px-4 py-1.5 mb-6">
            <Sun size={15} strokeWidth={1.5} className="text-komorebi-clay" />
            <span className="text-xs tracking-[0.15em] uppercase text-komorebi-ink2">Experience-driven café</span>
          </div>
          <h1 className="font-display font-light text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight text-komorebi-ink">
            Where sunlight
            <br />
            filters through
            <br />
            the trees.
          </h1>
          <p className="mt-6 text-base md:text-lg text-komorebi-ink2 max-w-md leading-relaxed">
            Reserve a table at Café Komorebi — a calm, light-filled retreat for slow mornings, warm afternoons and
            quiet celebrations.
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
          <TiltImage src={HERO} />
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

      {/* Table map + story */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-16 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">The room</p>
          <h2 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">Indoor calm, garden air.</h2>
          <p className="mt-5 text-komorebi-ink2 leading-relaxed max-w-md">
            Choose a quiet window seat in the Sakura corner, gather friends at the Bamboo tables, or dine beneath the
            maple on the garden terrace. We assign the right table for your party automatically.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 max-w-sm">
            <div className="rounded-xl bg-white hairline p-4">
              <MapPin size={18} strokeWidth={1.5} className="text-komorebi-green" />
              <p className="font-display text-2xl mt-2">8 tables</p>
              <p className="text-sm text-komorebi-muted">Indoor & outdoor</p>
            </div>
            <div className="rounded-xl bg-white hairline p-4">
              <ShieldCheck size={18} strokeWidth={1.5} className="text-komorebi-green" />
              <p className="font-display text-2xl mt-2">₹300</p>
              <p className="text-sm text-komorebi-muted">per guest, 50% refundable</p>
            </div>
          </div>
        </div>
        <TableMap />
      </section>

      {/* Our tables */}
      {publicTables.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Where you'll sit</p>
          <h2 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">Our tables</h2>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-5">
            {publicTables.map((t, i) => (
              <motion.div
                key={t.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: (i % 4) * 0.08, duration: 0.6 }}
                className="rounded-2xl bg-white hairline overflow-hidden lift"
              >
                {t.image_url ? (
                  <img src={t.image_url.startsWith("http") ? t.image_url : `${BACKEND}${t.image_url}`} alt={t.name} className="w-full h-40 object-cover" />
                ) : (
                  <div className={`w-full h-40 grid place-items-center ${t.zone === "outdoor" ? "bg-gradient-to-br from-komorebi-clay/20 to-komorebi-green/10" : "bg-gradient-to-br from-komorebi-green/15 to-komorebi-bg2"}`}>
                    <span className="font-display text-2xl text-komorebi-green/50">{t.zone === "outdoor" ? "Garden" : "Indoor"}</span>
                  </div>
                )}
                <div className="p-4">
                  <p className="font-display text-xl text-komorebi-ink">{t.name}</p>
                  <p className="text-sm text-komorebi-muted mt-0.5">{t.capacity} seats · {t.zone}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Menu showcase */}
      {menu.enabled && menu.items.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">Taste</p>
          <h2 className="font-display text-4xl md:text-5xl mt-3 text-komorebi-ink">From our kitchen</h2>
          <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {menu.items.map((m, i) => (
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

      {/* Gallery */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-24 grid md:grid-cols-2 gap-5">
        <motion.img
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          src={galleryImg(0, COFFEE)} alt="Elegant coffee" className="w-full h-72 md:h-96 object-cover rounded-3xl lift"
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 }}
          className="relative rounded-3xl overflow-hidden lift"
        >
          <img src={galleryImg(1, ZEN)} alt="Zen interior" className="w-full h-72 md:h-96 object-cover" />
          <div className="absolute inset-0 bg-komorebi-ink/35 grid place-items-center text-center p-8">
            <div>
              <h3 className="font-display text-3xl md:text-4xl text-white">Reserve your window seat</h3>
              <Link
                to="/book"
                data-testid="gallery-reserve-btn"
                className="inline-flex mt-5 items-center gap-2 rounded-full bg-white text-komorebi-ink px-6 py-3 text-sm font-medium hover:bg-komorebi-bg transition-colors"
              >
                Start booking <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-komorebi-border py-10 text-center text-sm text-komorebi-muted">
        Café Komorebi · 木漏れ日 · Open Tuesday to Sunday
      </footer>
    </div>
  );
}
