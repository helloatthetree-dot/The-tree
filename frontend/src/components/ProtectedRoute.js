import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, staff, owner }) {
  const { user, loading, isStaff, isOwner } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-komorebi-muted">
        <div className="animate-pulse font-display text-2xl">The Tree…</div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (owner && !isOwner) return <Navigate to="/" replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  return children;
}
