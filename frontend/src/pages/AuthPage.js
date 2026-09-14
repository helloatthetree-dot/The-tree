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
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", identifier: "" });
  const [loading, setLoading] = useState(false);

  const dest = location.state?.from || "/book";

  const handleGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let user;
      if (mode === "register") user = await register(form);
      else user = await login(form.identifier, form.password);
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
            <span className="font-display text-3xl text-komorebi-ink">The Tree</span>
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
            {mode === "login" ? (
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Email or phone</label>
                <input
                  data-testid="auth-identifier" required value={form.identifier} onChange={set("identifier")}
                  className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="you@email.com  or  9148271005"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Email</label>
                <input
                  data-testid="auth-email" type="email" required value={form.email} onChange={set("email")}
                  className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="you@email.com"
                />
              </div>
            )}
            {mode === "register" && (
              <div>
                <label className="text-xs uppercase tracking-[0.15em] text-komorebi-muted">Phone</label>
                <input
                  data-testid="auth-phone" value={form.phone} onChange={set("phone")}
                  className="mt-1.5 w-full rounded-xl bg-white hairline px-4 py-3 outline-none focus:ring-2 focus:ring-komorebi-green"
                  placeholder="+91 90000 00000"
                />
                <p className="text-xs text-komorebi-muted mt-1">You can use this number to sign in later.</p>
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

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-komorebi-muted">
            <span className="h-px flex-1 bg-komorebi-border" /> or <span className="h-px flex-1 bg-komorebi-border" />
          </div>

          <button
            type="button" data-testid="google-signin" onClick={handleGoogle}
            className="w-full rounded-full bg-white hairline py-3.5 flex items-center justify-center gap-3 text-komorebi-ink font-medium hover:bg-komorebi-bg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.4 36.4 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-sm text-komorebi-ink2 text-center">
            {mode === "register" ? "Already have an account?" : "New to The Tree?"}{" "}
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
