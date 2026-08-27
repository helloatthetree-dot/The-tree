import "./App.css";
import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { Coffee, Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import BookingPage from "./pages/BookingPage";
import PoliciesPage from "./pages/PoliciesPage";
import MyReservations from "./pages/MyReservations";
import AdminDashboard from "./pages/AdminDashboard";
import MenuPage from "./pages/MenuPage";
import EventsPage from "./pages/EventsPage";

function Shell({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

function AuthCallback() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const sid = params.get("session_id");
    if (!sid) {
      navigate("/login");
      return;
    }
    loginWithGoogle(sid)
      .then((user) => {
        window.history.replaceState(null, "", window.location.pathname);
        toast.success(`Welcome, ${user.name.split(" ")[0]}!`);
        navigate(user.role === "admin" || user.role === "super_admin" ? "/admin" : "/book");
      })
      .catch(() => {
        window.history.replaceState(null, "", window.location.pathname);
        toast.error("Google sign-in failed. Please try again.");
        navigate("/login");
      });
  }, []); // eslint-disable-line

  return (
    <div className="min-h-screen grid place-items-center komorebi-grain">
      <div className="text-center">
        <span className="mx-auto grid place-items-center h-12 w-12 rounded-full bg-komorebi-green text-white">
          <Coffee strokeWidth={1.5} size={22} />
        </span>
        <div className="mt-4 flex items-center gap-2 text-komorebi-ink2">
          <Loader2 className="animate-spin" size={18} /> Signing you in…
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Shell><Landing /></Shell>} />
      <Route path="/login" element={<Shell><AuthPage /></Shell>} />
      <Route path="/register" element={<Shell><AuthPage register /></Shell>} />
      <Route path="/policies" element={<Shell><PoliciesPage /></Shell>} />
      <Route path="/menu" element={<Shell><MenuPage /></Shell>} />
      <Route path="/events" element={<Shell><EventsPage /></Shell>} />
      <Route
        path="/book"
        element={
          <ProtectedRoute>
            <Shell><BookingPage /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reservations"
        element={
          <ProtectedRoute>
            <Shell><MyReservations /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute staff>
            <Shell><AdminDashboard /></Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-center" richColors closeButton />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
