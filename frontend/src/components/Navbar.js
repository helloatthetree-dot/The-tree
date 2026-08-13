import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Coffee, Menu, X, LogOut, LayoutDashboard, CalendarHeart, User } from "lucide-react";

export default function Navbar() {
  const { user, isStaff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: "/", label: "Home" },
    { to: "/book", label: "Reserve" },
    { to: "/policies", label: "Policies" },
  ];

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-komorebi-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 group">
          <span className="grid place-items-center h-9 w-9 rounded-full bg-komorebi-green text-white">
            <Coffee strokeWidth={1.5} size={18} />
          </span>
          <span className="font-display text-2xl leading-none tracking-tight text-komorebi-ink">
            Komorebi
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.label.toLowerCase()}`}
              className={`text-sm tracking-wide transition-colors hover:text-komorebi-green ${
                location.pathname === n.to ? "text-komorebi-green font-semibold" : "text-komorebi-ink2"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {isStaff && (
                <Link
                  to="/admin"
                  data-testid="nav-admin"
                  className="flex items-center gap-1.5 text-sm text-komorebi-ink2 hover:text-komorebi-green"
                >
                  <LayoutDashboard size={16} strokeWidth={1.5} /> Dashboard
                </Link>
              )}
              <Link
                to="/reservations"
                data-testid="nav-my-reservations"
                className="flex items-center gap-1.5 text-sm text-komorebi-ink2 hover:text-komorebi-green"
              >
                <CalendarHeart size={16} strokeWidth={1.5} /> My Bookings
              </Link>
              <button
                onClick={handleLogout}
                data-testid="nav-logout"
                className="flex items-center gap-1.5 rounded-full bg-komorebi-ink text-white text-sm px-4 py-2 hover:bg-black transition-colors"
              >
                <LogOut size={15} strokeWidth={1.5} /> {user.name.split(" ")[0]}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="text-sm text-komorebi-ink2 hover:text-komorebi-green">
                Sign in
              </Link>
              <Link
                to="/book"
                data-testid="nav-reserve-cta"
                className="rounded-full bg-komorebi-green text-white text-sm px-5 py-2 hover:bg-komorebi-greenDark transition-colors"
              >
                Reserve a table
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden text-komorebi-ink"
          onClick={() => setOpen((v) => !v)}
          data-testid="nav-mobile-toggle"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="md:hidden glass border-t border-komorebi-border px-5 py-4 flex flex-col gap-3">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="text-komorebi-ink2 py-1">
              {n.label}
            </Link>
          ))}
          {user ? (
            <>
              {isStaff && (
                <Link to="/admin" onClick={() => setOpen(false)} className="text-komorebi-ink2 py-1">
                  Dashboard
                </Link>
              )}
              <Link to="/reservations" onClick={() => setOpen(false)} className="text-komorebi-ink2 py-1">
                My Bookings
              </Link>
              <button onClick={handleLogout} className="text-left text-komorebi-danger py-1">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="text-komorebi-ink2 py-1">
                Sign in
              </Link>
              <Link
                to="/book"
                onClick={() => setOpen(false)}
                className="rounded-full bg-komorebi-green text-white text-center py-2"
              >
                Reserve a table
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
