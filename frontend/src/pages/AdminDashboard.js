import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, LineChart, Line,
} from "recharts";
import {
  CalendarDays, Clock3, Users, ListChecks, PartyPopper, Armchair, Ban, BarChart3,
  UserCog, CalendarOff, Settings2, Check, X, Trash2, Plus, IndianRupee, Loader2, ImagePlus, UtensilsCrossed,
} from "lucide-react";
import { ImageUpload, resolveImg } from "../components/ImageUpload";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const CHART = ["#5E7153", "#CC7A5C", "#D4A373", "#6B8E9B", "#B85C5C", "#8A8680"];
const OCCASIONS = ["None", "Birthday", "Anniversary", "Date Night", "Family Gathering", "Business Meeting", "Celebration", "Other"];

function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_CLS = {
  confirmed: "bg-komorebi-green/10 text-komorebi-green",
  pending_approval: "bg-komorebi-warning/15 text-komorebi-warning",
  pending_payment: "bg-komorebi-info/15 text-komorebi-info",
  cancelled: "bg-komorebi-danger/10 text-komorebi-danger",
  rejected: "bg-komorebi-danger/10 text-komorebi-danger",
};

function Stat({ icon: Icon, label, value, tone = "green" }) {
  return (
    <div className="rounded-2xl bg-white hairline p-5 lift">
      <div className={`grid place-items-center h-10 w-10 rounded-xl bg-komorebi-${tone}/10 text-komorebi-${tone}`}>
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <p className="font-display text-4xl mt-3 text-komorebi-ink">{value}</p>
      <p className="text-sm text-komorebi-muted">{label}</p>
    </div>
  );
}

function ResRow({ r, onApprove, onReject, onCancel }) {
  return (
    <div data-testid={`admin-res-${r.id}`} className="rounded-xl bg-white hairline p-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-komorebi-ink">{r.booking_name}</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full ${STATUS_CLS[r.status] || "bg-komorebi-muted/10"}`}>{r.status.replace("_", " ")}</span>
          {r.special_occasion !== "None" && <span className="text-xs px-2.5 py-0.5 rounded-full bg-komorebi-clay/10 text-komorebi-clay flex items-center gap-1"><PartyPopper size={11} />{r.special_occasion}</span>}
        </div>
        <p className="text-sm text-komorebi-ink2 mt-1.5">{r.date} · {fmt12(r.time)} · {r.people} guests · {r.phone}{r.table_name ? ` · ${r.table_name}` : ""} · ₹{r.amount}</p>
      </div>
      <div className="flex gap-2">
        {onApprove && (
          <>
            <button data-testid={`approve-${r.id}`} onClick={() => onApprove(r)} className="rounded-full bg-komorebi-green text-white px-4 py-2 text-sm flex items-center gap-1 hover:bg-komorebi-greenDark"><Check size={15} /> Approve</button>
            <button data-testid={`reject-${r.id}`} onClick={() => onReject(r)} className="rounded-full hairline bg-white text-komorebi-danger px-4 py-2 text-sm flex items-center gap-1"><X size={15} /> Reject</button>
          </>
        )}
        {onCancel && ["confirmed", "pending_approval"].includes(r.status) && (
          <button onClick={() => onCancel(r)} className="rounded-full hairline bg-white text-komorebi-danger px-4 py-2 text-sm">Cancel</button>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, isOwner } = useAuth();
  const [tab, setTab] = useState("overview");
  const [analytics, setAnalytics] = useState(null);
  const [todayRes, setTodayRes] = useState([]);
  const [pending, setPending] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [allRes, setAllRes] = useState([]);
  const [tables, setTables] = useState([]);
  const [statusDate, setStatusDate] = useState(today());
  const [statusTime, setStatusTime] = useState("13:00");
  const [tableStatus, setTableStatus] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);

  const loadCore = useCallback(() => {
    api.get("/admin/analytics").then((r) => setAnalytics(r.data)).catch(() => {});
    api.get("/admin/today").then((r) => setTodayRes(r.data)).catch(() => {});
    api.get("/admin/reservations", { params: { status: "pending_approval" } }).then((r) => setPending(r.data)).catch(() => {});
    api.get("/admin/waitlist").then((r) => setWaitlist(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadCore(); }, [loadCore]);

  useEffect(() => {
    if (tab === "reservations") api.get("/admin/reservations").then((r) => setAllRes(r.data));
    if (tab === "tables") { api.get("/tables").then((r) => setTables(r.data)); refreshStatus(); }
    if (tab === "availability") { api.get("/admin/blocks").then((r) => setBlocks(r.data)); api.get("/tables").then((r) => setTables(r.data)); }
    if (tab === "settings") { api.get("/holidays").then((r) => setHolidays(r.data)); api.get("/admin/users").then((r) => setUsers(r.data)).catch(() => {}); api.get("/admin/settings").then((r) => setSettings(r.data)); }
  }, [tab]); // eslint-disable-line

  const refreshStatus = () => {
    api.get("/tables/status", { params: { date: statusDate, time: statusTime } }).then((r) => setTableStatus(r.data)).catch(() => {});
  };

  const approve = async (r, action, note = "") => {
    try {
      await api.post(`/admin/reservations/${r.id}/approval`, { action, note });
      toast.success(action === "approve" ? "Reservation approved" : "Reservation rejected");
      loadCore();
      if (tab === "reservations") api.get("/admin/reservations").then((x) => setAllRes(x.data));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const cancelRes = async (r) => {
    try { await api.post(`/reservations/${r.id}/cancel`); toast.success("Reservation cancelled"); loadCore(); api.get("/admin/reservations").then((x) => setAllRes(x.data)); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const tabs = [
    { v: "overview", label: "Overview", icon: BarChart3 },
    { v: "pending", label: "Pending", icon: ListChecks },
    { v: "waitlist", label: "Waitlist", icon: Users },
    { v: "reservations", label: "Reservations", icon: CalendarDays },
    { v: "tables", label: "Tables & Status", icon: Armchair },
    { v: "availability", label: "Block dates", icon: Ban },
    ...(isOwner ? [{ v: "settings", label: "Owner settings", icon: Settings2 }] : []),
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-komorebi-bg2">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-8">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-komorebi-clay font-semibold">{isOwner ? "Owner console" : "Staff dashboard"}</p>
            <h1 className="font-display text-4xl text-komorebi-ink mt-1">Komorebi operations</h1>
          </div>
          <span className="text-sm text-komorebi-ink2">Signed in as {user.name} · {user.role.replace("_", " ")}</span>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList className="bg-white hairline rounded-full p-1 h-auto flex-wrap justify-start gap-1">
            {tabs.map((t) => (
              <TabsTrigger key={t.v} value={t.v} data-testid={`tab-${t.v}`} className="rounded-full data-[state=active]:bg-komorebi-green data-[state=active]:text-white px-4 py-2 text-sm flex items-center gap-1.5">
                <t.icon size={15} strokeWidth={1.5} /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {analytics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat icon={CalendarDays} label="Total reservations" value={analytics.total_reservations} />
                <Stat icon={Check} label="Confirmed" value={analytics.confirmed} />
                <Stat icon={Clock3} label="Pending approval" value={analytics.pending} tone="warning" />
                <Stat icon={IndianRupee} label="Revenue" value={`₹${analytics.revenue}`} tone="clay" />
              </div>
            )}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-white hairline p-6">
                <h3 className="font-display text-2xl mb-1">Today's reservations</h3>
                <p className="text-sm text-komorebi-muted mb-4">{today()}</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {todayRes.length === 0 ? <p className="text-komorebi-muted text-sm">No reservations today.</p> :
                    todayRes.map((r) => <ResRow key={r.id} r={r} onCancel={cancelRes} />)}
                </div>
              </div>
              <div className="rounded-2xl bg-white hairline p-6">
                <h3 className="font-display text-2xl mb-4">Reservations · last 14 days</h3>
                {analytics?.daily?.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={analytics.daily}>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={24} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#5E7153" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-komorebi-muted text-sm">No data yet.</p>}
              </div>
            </div>
          </TabsContent>

          {/* PENDING */}
          <TabsContent value="pending" className="mt-6">
            <div className="rounded-2xl bg-white hairline p-6">
              <h3 className="font-display text-2xl mb-4">Pending approvals</h3>
              <div className="space-y-2">
                {pending.length === 0 ? <p className="text-komorebi-muted text-sm">Nothing awaiting approval.</p> :
                  pending.map((r) => (
                    <ResRow key={r.id} r={r}
                      onApprove={(x) => approve(x, "approve")}
                      onReject={(x) => approve(x, "reject", "Unable to accommodate at this time")} />
                  ))}
              </div>
            </div>
          </TabsContent>

          {/* WAITLIST */}
          <TabsContent value="waitlist" className="mt-6">
            <div className="rounded-2xl bg-white hairline p-6">
              <h3 className="font-display text-2xl mb-4">Waitlist</h3>
              <div className="space-y-2">
                {waitlist.length === 0 ? <p className="text-komorebi-muted text-sm">No one waiting.</p> :
                  waitlist.map((w) => (
                    <div key={w.id} className="rounded-xl bg-komorebi-bg hairline p-4 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-komorebi-ink">{w.booking_name}</span>
                        <p className="text-sm text-komorebi-ink2 mt-1">{w.date} · {fmt12(w.time)} · {w.people} guests · {w.phone}</p>
                      </div>
                      {w.special_occasion !== "None" && <span className="text-xs px-2.5 py-0.5 rounded-full bg-komorebi-clay/10 text-komorebi-clay">{w.special_occasion}</span>}
                    </div>
                  ))}
              </div>
            </div>
          </TabsContent>

          {/* RESERVATIONS */}
          <TabsContent value="reservations" className="mt-6">
            <div className="rounded-2xl bg-white hairline p-6">
              <h3 className="font-display text-2xl mb-4">All reservations</h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {allRes.map((r) => <ResRow key={r.id} r={r} onCancel={cancelRes} />)}
              </div>
            </div>
          </TabsContent>

          {/* TABLES & STATUS */}
          <TabsContent value="tables" className="mt-6 space-y-6">
            <div className="rounded-2xl bg-white hairline p-6">
              <div className="flex items-end gap-3 flex-wrap mb-4">
                <h3 className="font-display text-2xl">Live table status</h3>
                <input type="date" data-testid="status-date" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} className="rounded-lg hairline px-3 py-2 text-sm bg-komorebi-bg" />
                <input type="time" data-testid="status-time" value={statusTime} onChange={(e) => setStatusTime(e.target.value)} className="rounded-lg hairline px-3 py-2 text-sm bg-komorebi-bg" />
                <button data-testid="refresh-status" onClick={refreshStatus} className="rounded-full bg-komorebi-green text-white px-4 py-2 text-sm">Check</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tableStatus.map((t) => (
                  <div key={t.id} className={`rounded-xl p-4 border ${t.occupied ? "bg-komorebi-danger/5 border-komorebi-danger/30" : "bg-komorebi-green/5 border-komorebi-green/30"}`}>
                    <p className="font-display text-xl text-komorebi-ink">{t.name}</p>
                    <p className="text-xs text-komorebi-muted">{t.capacity} seats · {t.zone}</p>
                    <p className={`text-xs mt-2 font-medium ${t.occupied ? "text-komorebi-danger" : "text-komorebi-green"}`}>{t.occupied ? `Occupied · ${t.reservation?.booking_name}` : "Available"}</p>
                  </div>
                ))}
                {tableStatus.length === 0 && <p className="text-komorebi-muted text-sm col-span-full">Choose a date & time, then Check.</p>}
              </div>
            </div>

            <TablesManager tables={tables} isOwner={isOwner} reload={() => api.get("/tables").then((r) => setTables(r.data))} />
          </TabsContent>

          {/* AVAILABILITY / BLOCKS */}
          <TabsContent value="availability" className="mt-6">
            <BlocksManager blocks={blocks} tables={tables} reload={() => api.get("/admin/blocks").then((r) => setBlocks(r.data))} />
          </TabsContent>

          {/* OWNER SETTINGS */}
          {isOwner && (
            <TabsContent value="settings" className="mt-6 space-y-6">
              <SettingsManager settings={settings} onSaved={setSettings} />
              <MenuManager />
              <GalleryManager />
              <HolidaysManager holidays={holidays} reload={() => api.get("/holidays").then((r) => setHolidays(r.data))} />
              <UsersManager users={users} me={user} reload={() => api.get("/admin/users").then((r) => setUsers(r.data))} />
              {analytics && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-2xl bg-white hairline p-6">
                    <h3 className="font-display text-2xl mb-4">Reservations by status</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={analytics.status_counts} dataKey="value" nameKey="name" outerRadius={90} label>
                          {analytics.status_counts.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rounded-2xl bg-white hairline p-6">
                    <h3 className="font-display text-2xl mb-4">Special occasions</h3>
                    {analytics.occasions.length ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={analytics.occasions}>
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={24} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#CC7A5C" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-komorebi-muted text-sm">No special occasions yet.</p>}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

/* ---------- Tables Manager ---------- */
function TablesManager({ tables, isOwner, reload }) {
  const empty = { name: "", capacity: 2, zone: "indoor", active: true, notes: "", image_url: "" };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const save = async () => {
    try {
      if (editing) await api.put(`/tables/${editing}`, form);
      else await api.post("/tables", form);
      toast.success("Table saved");
      setOpen(false); setForm(empty); setEditing(null); reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { try { await api.delete(`/tables/${id}`); toast.success("Table removed"); reload(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };

  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-2xl">Tables</h3>
        {isOwner && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditing(null); } }}>
            <DialogTrigger asChild>
              <button data-testid="add-table-btn" className="rounded-full bg-komorebi-green text-white px-4 py-2 text-sm flex items-center gap-1"><Plus size={15} /> Add table</button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader><DialogTitle className="font-display text-2xl">{editing ? "Edit table" : "New table"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <input data-testid="table-name" placeholder="Table name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
                <div className="flex gap-3">
                  <input data-testid="table-capacity" type="number" min="1" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} className="w-1/2 rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
                  <Select value={form.zone} onValueChange={(v) => setForm({ ...form, zone: v })}>
                    <SelectTrigger data-testid="table-zone" className="w-1/2 rounded-xl bg-komorebi-bg py-6"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="indoor">Indoor</SelectItem><SelectItem value="outdoor">Outdoor</SelectItem></SelectContent>
                  </Select>
                </div>
                <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
                <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} kind="table" label="Table photo" testid="table-image-upload" />
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Active</label>
              </div>
              <DialogFooter><button data-testid="save-table-btn" onClick={save} className="rounded-full bg-komorebi-green text-white px-6 py-2.5">Save table</button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {tables.map((t) => (
          <div key={t.id} className="rounded-xl bg-komorebi-bg hairline p-4 flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {t.image_url && <img src={resolveImg(t.image_url)} alt="" className="h-12 w-12 rounded-lg object-cover hairline shrink-0" />}
              <div className="min-w-0">
                <p className="font-semibold text-komorebi-ink truncate">{t.name} <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${t.active ? "bg-komorebi-green/10 text-komorebi-green" : "bg-komorebi-muted/15 text-komorebi-muted"}`}>{t.active ? "Active" : "Inactive"}</span></p>
                <p className="text-sm text-komorebi-muted mt-1 truncate">{t.capacity} seats · {t.zone}{t.notes ? ` · ${t.notes}` : ""}</p>
              </div>
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <button onClick={() => { setForm({ name: t.name, capacity: t.capacity, zone: t.zone, active: t.active, notes: t.notes || "", image_url: t.image_url || "" }); setEditing(t.id); setOpen(true); }} className="rounded-full hairline bg-white px-3 py-1.5 text-sm">Edit</button>
                <button onClick={() => del(t.id)} className="rounded-full hairline bg-white text-komorebi-danger px-3 py-1.5"><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Blocks Manager ---------- */
function BlocksManager({ blocks, tables, reload }) {
  const [form, setForm] = useState({ type: "date", date: today(), time: "", table_id: "", reason: "" });
  const add = async () => {
    try {
      const payload = { type: form.type, date: form.date, reason: form.reason };
      if (form.type === "slot") payload.time = form.time;
      if (form.type === "table") payload.table_id = form.table_id;
      await api.post("/admin/blocks", payload);
      toast.success("Block added"); reload();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { await api.delete(`/admin/blocks/${id}`); toast.success("Removed"); reload(); };
  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <h3 className="font-display text-2xl mb-4">Block dates, slots & tables</h3>
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger data-testid="block-type" className="w-40 rounded-xl bg-komorebi-bg py-6"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="date">Whole date</SelectItem><SelectItem value="slot">Time slot</SelectItem><SelectItem value="table">Table</SelectItem></SelectContent>
        </Select>
        <input type="date" data-testid="block-date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-xl hairline px-3 py-3 bg-komorebi-bg text-sm" />
        {form.type === "slot" && <input type="time" data-testid="block-time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="rounded-xl hairline px-3 py-3 bg-komorebi-bg text-sm" />}
        {form.type === "table" && (
          <Select value={form.table_id} onValueChange={(v) => setForm({ ...form, table_id: v })}>
            <SelectTrigger data-testid="block-table" className="w-44 rounded-xl bg-komorebi-bg py-6"><SelectValue placeholder="Table" /></SelectTrigger>
            <SelectContent>{tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="flex-1 min-w-[140px] rounded-xl hairline px-4 py-3 bg-komorebi-bg text-sm" />
        <button data-testid="add-block-btn" onClick={add} className="rounded-full bg-komorebi-clay text-white px-5 py-3 text-sm">Add block</button>
      </div>
      <div className="space-y-2">
        {blocks.length === 0 ? <p className="text-komorebi-muted text-sm">No active blocks.</p> :
          blocks.map((b) => (
            <div key={b.id} className="rounded-xl bg-komorebi-bg hairline p-3 flex justify-between items-center text-sm">
              <span className="text-komorebi-ink2"><span className="font-medium capitalize">{b.type}</span> · {b.date}{b.time ? ` · ${fmt12(b.time)}` : ""}{b.reason ? ` · ${b.reason}` : ""}</span>
              <button onClick={() => del(b.id)} className="text-komorebi-danger"><Trash2 size={16} /></button>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------- Settings Manager ---------- */
function SettingsManager({ settings, onSaved }) {
  const [f, setF] = useState(settings);
  useEffect(() => setF(settings), [settings]);
  if (!f) return null;
  const save = async () => {
    try {
      const { data } = await api.put("/admin/settings", {
        fee_per_person: Number(f.fee_per_person), refund_percent: Number(f.refund_percent),
        group_threshold: Number(f.group_threshold), hold_minutes: Number(f.hold_minutes),
        special_needs_approval: f.special_needs_approval, menu_enabled: f.menu_enabled,
        hero_label: f.hero_label, hero_tagline: f.hero_tagline,
      });
      onSaved(data); toast.success("Settings saved");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const Field = ({ k, label, suffix }) => (
    <div>
      <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">{label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input data-testid={`setting-${k}`} type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-28 rounded-xl bg-komorebi-bg hairline px-4 py-2.5 outline-none" />
        {suffix && <span className="text-sm text-komorebi-muted">{suffix}</span>}
      </div>
    </div>
  );
  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <h3 className="font-display text-2xl mb-4">Reservation rules & policies</h3>
      <div className="flex flex-wrap gap-6">
        <Field k="fee_per_person" label="Fee per guest" suffix="₹" />
        <Field k="refund_percent" label="Refund on cancel" suffix="%" />
        <Field k="group_threshold" label="Large group threshold" suffix="guests" />
        <Field k="hold_minutes" label="Table hold" suffix="min" />
        <label className="flex items-center gap-3 mt-6">
          <Switch data-testid="setting-occasion-approval" checked={f.special_needs_approval} onCheckedChange={(v) => setF({ ...f, special_needs_approval: v })} />
          <span className="text-sm text-komorebi-ink2">Special occasions need approval</span>
        </label>
        <label className="flex items-center gap-3 mt-6">
          <Switch data-testid="setting-menu-enabled" checked={f.menu_enabled} onCheckedChange={(v) => setF({ ...f, menu_enabled: v })} />
          <span className="text-sm text-komorebi-ink2">Show menu on homepage</span>
        </label>
      </div>
      <div className="mt-6 pt-6 border-t border-komorebi-border">
        <p className="text-xs uppercase tracking-[0.15em] text-komorebi-muted mb-3">Homepage hero caption</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-komorebi-muted">Small label</label>
            <input data-testid="setting-hero-label" value={f.hero_label || ""} onChange={(e) => setF({ ...f, hero_label: e.target.value })} className="mt-1 w-full rounded-xl bg-komorebi-bg hairline px-4 py-2.5 outline-none" placeholder="Now serving" />
          </div>
          <div>
            <label className="text-xs text-komorebi-muted">Tagline</label>
            <input data-testid="setting-hero-tagline" value={f.hero_tagline || ""} onChange={(e) => setF({ ...f, hero_tagline: e.target.value })} className="mt-1 w-full rounded-xl bg-komorebi-bg hairline px-4 py-2.5 outline-none" placeholder="Afternoon light & golden evenings" />
          </div>
        </div>
      </div>
      <button data-testid="save-settings-btn" onClick={save} className="mt-6 rounded-full bg-komorebi-green text-white px-6 py-2.5">Save settings</button>
    </div>
  );
}

/* ---------- Holidays Manager ---------- */
function HolidaysManager({ holidays, reload }) {
  const [form, setForm] = useState({ date: today(), name: "" });
  const add = async () => { try { await api.post("/holidays", form); toast.success("Holiday added"); setForm({ date: today(), name: "" }); reload(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const del = async (id) => { await api.delete(`/holidays/${id}`); reload(); };
  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <h3 className="font-display text-2xl mb-4 flex items-center gap-2"><CalendarOff size={22} className="text-komorebi-clay" /> Holidays & closures</h3>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <input type="date" data-testid="holiday-date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-xl hairline px-3 py-3 bg-komorebi-bg text-sm" />
        <input placeholder="Holiday name" data-testid="holiday-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 min-w-[160px] rounded-xl hairline px-4 py-3 bg-komorebi-bg text-sm" />
        <button data-testid="add-holiday-btn" onClick={add} className="rounded-full bg-komorebi-clay text-white px-5 py-3 text-sm">Add</button>
      </div>
      <div className="space-y-2">
        {holidays.map((h) => (
          <div key={h.id} className="rounded-xl bg-komorebi-bg hairline p-3 flex justify-between text-sm">
            <span>{h.date} · {h.name}</span>
            <button onClick={() => del(h.id)} className="text-komorebi-danger"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Gallery Manager ---------- */
function GalleryManager() {
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState("");

  const load = () => api.get("/gallery").then((r) => setImages(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const slots = [
    { key: "hero", label: "Homepage hero", hint: "The large tilted image at the top" },
    { key: "gallery_1", label: "Gallery — left tile", hint: "Lower gallery, left image" },
    { key: "gallery_2", label: "Gallery — right tile", hint: "Lower gallery, right (with booking button)" },
  ];
  const current = (slot) => images.find((i) => i.slot === slot);

  const upload = async (slot, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(slot);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/admin/gallery", fd, { params: { caption: slot, slot } });
      toast.success("Homepage image updated");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Upload failed");
    } finally {
      setBusy("");
      e.target.value = "";
    }
  };

  const remove = async (id) => {
    try { await api.delete(`/admin/gallery/${id}`); toast.success("Reverted to default photo"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <h3 className="font-display text-2xl flex items-center gap-2 mb-1"><ImagePlus size={22} className="text-komorebi-green" /> Homepage photos</h3>
      <p className="text-sm text-komorebi-muted mb-5">Replace the three homepage images. Leave empty to use the default café photos. JPG/PNG/WebP up to 8MB.</p>
      <div className="grid md:grid-cols-3 gap-4">
        {slots.map((s) => {
          const img = current(s.key);
          return (
            <div key={s.key} data-testid={`homeimg-slot-${s.key}`} className="rounded-xl bg-komorebi-bg hairline overflow-hidden">
              <div className="relative h-36 bg-komorebi-bg2">
                {img ? (
                  <img src={`${BACKEND}${img.url}`} alt={s.label} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-komorebi-muted text-sm">Using default</div>
                )}
                {img && (
                  <button onClick={() => remove(img.id)} data-testid={`homeimg-remove-${s.key}`} className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full bg-white/90 text-komorebi-danger hover:bg-white">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="p-3">
                <p className="font-semibold text-komorebi-ink text-sm">{s.label}</p>
                <p className="text-xs text-komorebi-muted mt-0.5">{s.hint}</p>
                <label data-testid={`homeimg-upload-${s.key}`} className="mt-3 cursor-pointer rounded-full bg-komorebi-green text-white px-4 py-2 text-sm flex items-center justify-center gap-1.5 hover:bg-komorebi-greenDark">
                  {busy === s.key ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  {img ? "Replace" : "Upload"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(s.key, e)} disabled={busy === s.key} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Menu Manager ---------- */
function MenuManager() {
  const empty = { name: "", description: "", price: 300, category: "Mains", image_url: "", active: true };
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = () => api.get("/admin/menu").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...form, price: Number(form.price) };
      if (editing) await api.put(`/admin/menu/${editing}`, payload);
      else await api.post("/admin/menu", payload);
      toast.success("Menu item saved");
      setOpen(false); setForm(empty); setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { try { await api.delete(`/admin/menu/${id}`); toast.success("Item removed"); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };

  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-display text-2xl flex items-center gap-2"><UtensilsCrossed size={22} className="text-komorebi-green" /> Menu showcase</h3>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditing(null); } }}>
          <DialogTrigger asChild>
            <button data-testid="add-menu-btn" className="rounded-full bg-komorebi-green text-white px-4 py-2 text-sm flex items-center gap-1"><Plus size={15} /> Add item</button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="font-display text-2xl">{editing ? "Edit item" : "New menu item"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <input data-testid="menu-name" placeholder="Dish name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
              <textarea data-testid="menu-description" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none min-h-[70px]" />
              <div className="flex gap-3">
                <input data-testid="menu-price" type="number" min="0" placeholder="Price ₹" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-1/2 rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="menu-category" className="w-1/2 rounded-xl bg-komorebi-bg py-6"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Coffee", "Small Plates", "Mains", "Dessert", "Drinks"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} kind="menu" label="Dish photo" testid="menu-image-upload" />
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /> Visible</label>
            </div>
            <DialogFooter><button data-testid="save-menu-btn" onClick={save} className="rounded-full bg-komorebi-green text-white px-6 py-2.5">Save item</button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-sm text-komorebi-muted mb-4">Toggle the whole menu section on the homepage from Reservation rules above. Photos are optional.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {items.length === 0 ? <p className="text-komorebi-muted text-sm">No menu items yet.</p> :
          items.map((m) => (
            <div key={m.id} className="rounded-xl bg-komorebi-bg hairline p-3 flex items-center gap-3">
              {m.image_url
                ? <img src={resolveImg(m.image_url)} alt="" className="h-12 w-12 rounded-lg object-cover hairline shrink-0" />
                : <span className="h-12 w-12 rounded-lg bg-komorebi-green/10 grid place-items-center shrink-0"><UtensilsCrossed size={18} className="text-komorebi-green/60" /></span>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-komorebi-ink truncate">{m.name} <span className="text-komorebi-green text-sm">₹{m.price}</span>{!m.active && <span className="ml-1 text-xs text-komorebi-muted">(hidden)</span>}</p>
                <p className="text-xs text-komorebi-muted truncate">{m.category}{m.description ? ` · ${m.description}` : ""}</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setForm({ name: m.name, description: m.description || "", price: m.price, category: m.category || "Mains", image_url: m.image_url || "", active: m.active }); setEditing(m.id); setOpen(true); }} className="rounded-full hairline bg-white px-3 py-1.5 text-sm">Edit</button>
                <button onClick={() => del(m.id)} className="rounded-full hairline bg-white text-komorebi-danger px-3 py-1.5"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function UsersManager({ users, me, reload }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [open, setOpen] = useState(false);
  const create = async () => { try { await api.post("/admin/users", form); toast.success("Staff account created"); setOpen(false); setForm({ name: "", email: "", password: "", role: "admin" }); reload(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const setRole = async (id, role) => { await api.put(`/admin/users/${id}/role`, { role }); toast.success("Role updated"); reload(); };
  const del = async (id) => { try { await api.delete(`/admin/users/${id}`); toast.success("User removed"); reload(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  return (
    <div className="rounded-2xl bg-white hairline p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-2xl flex items-center gap-2"><UserCog size={22} className="text-komorebi-green" /> Users & staff</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><button data-testid="add-staff-btn" className="rounded-full bg-komorebi-green text-white px-4 py-2 text-sm flex items-center gap-1"><Plus size={15} /> Add staff</button></DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle className="font-display text-2xl">New staff account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <input data-testid="staff-name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
              <input data-testid="staff-email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
              <input data-testid="staff-password" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl bg-komorebi-bg hairline px-4 py-3 outline-none" />
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="staff-role" className="rounded-xl bg-komorebi-bg py-6"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem></SelectContent>
              </Select>
            </div>
            <DialogFooter><button data-testid="save-staff-btn" onClick={create} className="rounded-full bg-komorebi-green text-white px-6 py-2.5">Create</button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl bg-komorebi-bg hairline p-3 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="font-medium text-komorebi-ink truncate">{u.name} <span className="text-xs text-komorebi-muted">· {u.email}</span></p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={u.role} onValueChange={(v) => setRole(u.id, v)}>
                <SelectTrigger className="w-36 rounded-lg bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="customer">Customer</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem></SelectContent>
              </Select>
              {u.id !== me.id && <button onClick={() => del(u.id)} className="text-komorebi-danger"><Trash2 size={16} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
