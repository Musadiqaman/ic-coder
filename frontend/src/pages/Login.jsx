import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, Sun, Moon } from "lucide-react";
import { useTheme, fontDisplay, fontMono, GLOBAL_FONT_IMPORT } from "../theme.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { C, mode, toggle } = useTheme();
  const { user, checking, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Already logged in (or the session check just finished confirming it) —
  // don't show the login form, bounce straight to wherever they were
  // headed, or the dashboard.
  if (!checking && user) {
    const from = location.state?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are both required.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <style>{`
        ${GLOBAL_FONT_IMPORT}
        * { box-sizing: border-box; }
        .login-orb { background: linear-gradient(135deg, ${C.gradA}, ${C.gradB}); }
        .login-glow-1 { background: radial-gradient(circle, ${C.gold}33, transparent 70%); }
        .login-glow-2 { background: radial-gradient(circle, ${C.teal}33, transparent 70%); }
        .login-input:focus { outline: none; }
        .login-input-wrap { transition: border-color .15s ease, box-shadow .15s ease; }
        .login-input-wrap:focus-within { border-color: ${C.gold} !important; box-shadow: 0 0 0 3px ${C.gold}22; }
        .login-btn:active { transform: scale(0.98); }
        .fade-up { animation: loginFadeUp .5s ease both; }
        @keyframes loginFadeUp { from { opacity:0; transform: translateY(10px);} to { opacity:1; transform: translateY(0);} }
      `}</style>

      {/* Ambient background glow, matches the rest of the app's look */}
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full login-glow-1 pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full login-glow-2 pointer-events-none" />

      <button
        onClick={toggle}
        title={mode === "dark" ? "Switch to light" : "Switch to dark"}
        className="absolute top-4 right-4 p-2 rounded-lg border transition-all z-10"
        style={{ background: C.panel, borderColor: C.line, color: C.textMid }}
      >
        {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div
        className="w-full max-w-sm rounded-2xl border p-7 md:p-8 relative fade-up backdrop-blur-xl"
        style={{
          background: `${C.panel}EE`,
          borderColor: C.line,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 60px -20px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex flex-col items-center mb-7">
          <div
            className="login-orb h-14 w-14 rounded-2xl flex items-center justify-center text-base font-bold text-white shadow-lg mb-3"
            style={{ ...fontDisplay, boxShadow: `0 10px 28px ${C.gold}55`, letterSpacing: "0.02em" }}
          >
            IC
          </div>
          <h1 className="text-xl font-bold" style={{ color: C.textHi, ...fontDisplay }}>
            IC Coder Institute
          </h1>
          <p className="text-xs mt-1" style={{ color: C.textLow }}>
            Sign in with your admin account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: C.textMid }}>
              Email
            </label>
            <div
              className="login-input-wrap flex items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{ background: C.panelSoft, borderColor: C.line }}
            >
              <Mail size={16} style={{ color: C.textLow }} />
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@iccoder.com"
                className="login-input flex-1 bg-transparent border-none text-sm"
                style={{ color: C.textHi, ...fontMono }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: C.textMid }}>
              Password
            </label>
            <div
              className="login-input-wrap flex items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{ background: C.panelSoft, borderColor: C.line }}
            >
              <Lock size={16} style={{ color: C.textLow }} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-input flex-1 bg-transparent border-none text-sm"
                style={{ color: C.textHi, ...fontMono }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                style={{ color: C.textLow }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="text-xs rounded-lg px-3 py-2 border"
              style={{ background: C.roseSoft, borderColor: C.rose, color: C.rose }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="login-btn w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-70"
            style={{
              background: `linear-gradient(135deg, ${C.gradA}, ${C.gradB})`,
              boxShadow: `0 10px 24px -6px ${C.gold}55`,
            }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}