import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Coffee, Loader2 } from "lucide-react";

export default function AuthPage({ register: isRegister }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(isRegister ? "register" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const dest = location.state?.from || "/book";

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let user;
      if (mode === "register") user = await register(form);
      else user = await login(form.email, form.password);
      toast.success(`Welcome, ${user.name.split(" ")[0]}!`);
      if (user.role === "admin" || user.role === "super_admin") navigate("/admin");
      else navigate(dest);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1608060146923-7b8ab13e22bb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwxfHxqYXBhbmVzZSUyMHplbiUyMGNhZmUlMjBhcmNoaXRlY3R1cmV8ZW58MHx8fHwxNzg1MTI1NjA3fDA&ixlib=rb-4.1.0&q=85"
          alt="Café Komorebi"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-komorebi-ink/40" />
        <div className="absolute bottom-12 left-12 right-12">
          <h2 className="font-display text-4xl text-white leading-tight">
            A calm table awaits, in the dappled afternoon light.
          </h2>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-14 komorebi-grain">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <span className="grid place-items-center h-10 w-10 rounded-full bg-komorebi-green text-white">
              <Coffee strokeWidth={1.5} size={20} />
            </span>
            <span className="font-display text-3xl text-komorebi-ink">Komorebi</span>
          </div>
          <h1 className="font-display text-4xl text-komorebi-ink">
            {mode === "register" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-komorebi-ink2 mt-2 text-sm">
            {mode === "register" ? "Reserve tables in a moment." : "Sign in to manage your reservations."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Full name</label>
                <input
                  data-testid="auth-name" required value={form.name} onChange={set("name")}
                  className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="Aiko Tanaka"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Email</label>
              <input
                data-testid="auth-email" type="email" required value={form.email} onChange={set("email")}
                className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                placeholder="you@email.com"
              />
            </div>
            {mode === "register" && (
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Phone</label>
                <input
                  data-testid="auth-phone" value={form.phone} onChange={set("phone")}
                  className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="+91 90000 00000"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Password</label>
              <input
                data-testid="auth-password" type="password" required value={form.password} onChange={set("password")}
                className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                placeholder="••••••••"
              />
            </div>
            <button
              data-testid="auth-submit" disabled={loading}
              className="w-full rounded-full bg-komorebi-green text-white py-3.5 font-medium hover:bg-komorebi-greenDark transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 size={17} className="animate-spin" />}
              {mode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-komorebi-ink2 text-center">
            {mode === "register" ? "Already have an account?" : "New to Komorebi?"}{" "}
            <button
              data-testid="auth-toggle"
              onClick={() => setMode(mode === "register" ? "login" : "register")}
              className="text-komorebi-green font-semibold hover:underline"
            >
              {mode === "register" ? "Sign in" : "Create one"}
            </button>
          </p>
          <p className="mt-2 text-center">
            <Link to="/" className="text-xs text-komorebi-muted hover:text-komorebi-green">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
