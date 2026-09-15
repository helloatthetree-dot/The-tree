import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../lib/api";
import { ArrowRight } from "lucide-react";
import { VegBadge } from "../components/VegBadge";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function MenuPage() {
  const [data, setData] = useState({ enabled: true, items: [] });

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get("/menu").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const cats = [...new Set(data.items.map((m) => m.category || "Other"))];

  return (
    <div className="komorebi-grain min-h-[calc(100vh-4rem)]">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">The Tree</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="font-display text-5xl md:text-6xl mt-3 text-komorebi-ink">The Menu</h1>
          <Link to="/book" className="inline-flex items-center gap-2 rounded-full bg-komorebi-green text-white px-6 py-3 text-sm hover:bg-komorebi-greenDark transition-colors">Reserve a table <ArrowRight size={16} strokeWidth={1.5} /></Link>
        </div>

        {data.items.length === 0 ? (
          <p className="mt-12 text-komorebi-muted">Our menu is being prepared — please check back soon.</p>
        ) : (
          cats.map((cat) => (
            <section key={cat} className="mt-12">
              <h2 className="font-display text-2xl md:text-3xl text-white bg-komorebi-green rounded-xl px-5 py-3 inline-block shadow-sm">{cat}</h2>
              <div className="mt-6 grid md:grid-cols-2 gap-6">
                {data.items.filter((m) => (m.category || "Other") === cat).map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 2) * 0.06 }} className="flex gap-4 items-start">
                    {m.image_url && <img src={m.image_url.startsWith("http") ? m.image_url : `${BACKEND}${m.image_url}`} alt={m.name} className="h-20 w-20 rounded-xl object-cover hairline shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-3 border-b border-dashed border-komorebi-border pb-1">
                        <h3 className="font-display text-2xl text-komorebi-ink flex items-center gap-2">
                          {m.veg_type && <VegBadge type={m.veg_type} size={15} />}
                          {m.name}
                        </h3>
                        <span className="text-komorebi-green font-semibold whitespace-nowrap">₹{m.price}</span>
                      </div>
                      {m.description && <p className="text-sm text-komorebi-ink2 mt-2 leading-relaxed">{m.description}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
