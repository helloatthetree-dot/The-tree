import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import BookingPage from "./pages/BookingPage";
import PoliciesPage from "./pages/PoliciesPage";
import MyReservations from "./pages/MyReservations";
import AdminDashboard from "./pages/AdminDashboard";

function Shell({ children }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-center" richColors closeButton />
          <Routes>
            <Route path="/" element={<Shell><Landing /></Shell>} />
            <Route path="/login" element={<Shell><AuthPage /></Shell>} />
            <Route path="/register" element={<Shell><AuthPage register /></Shell>} />
            <Route path="/policies" element={<Shell><PoliciesPage /></Shell>} />
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
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
