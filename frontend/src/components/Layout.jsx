import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Mic, Users, GraduationCap, Briefcase, Wallet, Menu, X,
  LayoutGrid, ShieldCheck, ScanFace, Sparkles, ArrowDownRight, Sun, Moon, Zap,
  PanelLeftClose, PanelLeftOpen, LogOut, Settings,
} from "lucide-react";
import { useTheme, fontDisplay, fontMono, GLOBAL_FONT_IMPORT } from "../theme.jsx";
import { HeaderActionsProvider, useHeaderActionsSlot } from "../context/HeaderActionsContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// Sequence: Dashboard, Students, Teachers, Projects, Employees, Expenses, Loans, Attendance
const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/students", label: "Students", icon: GraduationCap },
  { to: "/teachers", label: "Teachers", icon: Sparkles },
  { to: "/projects", label: "Projects", icon: Briefcase },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/expenses", label: "Expenses", icon: ArrowDownRight },
  { to: "/loans", label: "Loans", icon: Wallet },
  { to: "/attendance", label: "Attendance", icon: ScanFace },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  return (
    <HeaderActionsProvider>
      <LayoutInner />
    </HeaderActionsProvider>
  );
}

function LayoutInner() {
  const { C, mode, toggle } = useTheme();
  const location = useLocation();
  const headerActions = useHeaderActionsSlot();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceLog, setVoiceLog] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout(); // RequireAuth picks up user === null and redirects to /login
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("network:offline", goOffline);
    window.addEventListener("network:online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("network:offline", goOffline);
      window.removeEventListener("network:online", goOnline);
    };
  }, []);

  const currentPage = navItems.find(item => {
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  })?.label || "Page";

  const handleVoice = () => {
    if (listening) return;
    setListening(true);
    setVoiceLog("Listening… (Urdu / English)");
    setTimeout(() => {
      setVoiceLog('Heard: "Musadiq Aman ki fee jama karo" → matched student → fee marked paid ✓');
      setListening(false);
    }, 2200);
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{`
        ${GLOBAL_FONT_IMPORT}
        * { box-sizing: border-box; }
        body { transition: background .25s ease, color .25s ease; }
        ::selection { background: ${C.gold}55; }
        .row-hover:hover { background: ${C.panelSoft}; }
        .fade-up { animation: fadeUp .4s ease both; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }
        .modal-in { animation: modalIn .25s ease both; }
        @keyframes modalIn { from { opacity:0; transform: translateY(12px) scale(.98);} to { opacity:1; transform: translateY(0) scale(1);} }
        .tick-pulse { animation: tickPulse 2.2s ease-in-out infinite; }
        @keyframes tickPulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
        .mic-ring { animation: micRing 1.4s ease-out infinite; }
        @keyframes micRing { 0% { box-shadow: 0 0 0 0 ${C.gold}55; } 100% { box-shadow: 0 0 0 14px ${C.gold}00; } }
        .nav-glow.active-nav { box-shadow: inset 0 0 0 1px ${C.gold}66, 0 0 18px ${C.gold}33; }
        .logo-orb { background: linear-gradient(135deg, ${C.gradA}, ${C.gradB}); }
        .btn-grad { background: linear-gradient(135deg, ${C.gradA}, ${C.gradB}); }
        input::placeholder { color: ${C.textLow}; }
        input:focus, select:focus { outline: none; border-color: ${C.gold} !important; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 8px; }
      `}</style>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed z-30 inset-y-0 left-0 border-r flex-col transition-all duration-300 md:translate-x-0 md:flex backdrop-blur-xl ${collapsed ? "w-16 p-2.5" : "w-44 p-4"} ${navOpen ? "translate-x-0 flex" : "-translate-x-full hidden md:flex"}`}
          style={{ background: `${C.panel}CC`, borderColor: C.line }}
        >
          <div className={`flex items-center mb-6 ${collapsed ? "justify-center" : "justify-between"}`}>
            <div className={`flex items-center ${collapsed ? "" : "gap-2.5"}`}>
              <div
                className="logo-orb h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-lg shrink-0"
                style={{ ...fontDisplay, boxShadow: `0 6px 18px ${C.gold}55`, letterSpacing: "0.02em" }}
              >
                IC
              </div>
              {!collapsed && (
                <div>
                  <div className="text-base leading-none whitespace-nowrap" style={{ color: C.textHi, ...fontDisplay, fontWeight: 700 }}>IC Coder</div>
                  <div className="text-[8px] tracking-widest uppercase font-semibold whitespace-nowrap" style={{ color: C.textLow }}>Institute</div>
                </div>
              )}
            </div>
            <button className="md:hidden p-1 rounded-lg" onClick={() => setNavOpen(false)} style={{ color: C.textMid }}>
              <X size={18} />
            </button>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto">
            {(user?.role === "teacher" ? navItems.filter(item => ["/", "/attendance", "/settings"].includes(item.to)) : navItems).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setNavOpen(false)}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `nav-glow flex items-center rounded-lg text-[13px] font-medium transition-all duration-200 ${collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"} ${isActive ? "active-nav" : ""}`}
                style={({ isActive }) => ({
                  background: isActive ? C.goldSoft : "transparent",
                  color: isActive ? C.gold : C.textMid,
                })}
              >
                <item.icon size={16} className="shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={`md:hidden flex items-center rounded-lg mt-2 text-[13px] font-medium transition-all ${collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"}`}
            style={{ color: C.rose, background: "transparent" }}
            title="Logout"
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && <span className="whitespace-nowrap">{loggingOut ? "Logging out…" : "Logout"}</span>}
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className={`hidden md:flex items-center rounded-lg mt-auto pt-3 text-[11px] font-medium transition-all ${collapsed ? "justify-center" : "gap-2 px-1.5"}`}
            style={{ color: C.textLow }}
            title={collapsed ? "Expand menu" : "Collapse menu"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> <span>Collapse</span></>}
          </button>
        </aside>

        {/* Main */}
        <div className={`flex-1 min-h-screen min-w-0 overflow-x-hidden transition-all duration-300 ${collapsed ? "md:ml-16" : "md:ml-44"}`}>
          <header
            className="sticky top-0 z-20 flex items-center gap-1.5 md:gap-4 border-b px-2.5 sm:px-3 md:px-5 py-2.5 md:py-3 backdrop-blur-xl"
            style={{ background: `${C.bg}CC`, borderColor: C.line }}
          >
            <button className="md:hidden p-1 rounded-lg" onClick={() => setNavOpen(true)} style={{ color: C.textHi }}>
              <Menu size={20} />
            </button>

            {/* Page Title with Icon */}
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
              <div
                className="h-9 w-9 md:h-10 md:w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${C.gold}15` }}
              >
                {currentPage === "Dashboard" && <LayoutGrid size={20} style={{ color: C.gold }} />}
                {currentPage === "Students" && <GraduationCap size={20} style={{ color: C.gold }} />}
                {currentPage === "Employees" && <Users size={20} style={{ color: C.gold }} />}
                {currentPage === "Teachers" && <Sparkles size={20} style={{ color: C.gold }} />}
                {currentPage === "Expenses" && <ArrowDownRight size={20} style={{ color: C.gold }} />}
                {currentPage === "Projects" && <Briefcase size={20} style={{ color: C.gold }} />}
                {currentPage === "Loans" && <Wallet size={20} style={{ color: C.gold }} />}
                {currentPage === "Attendance" && <ScanFace size={20} style={{ color: C.gold }} />}
                {currentPage === "Settings" && <Settings size={20} style={{ color: C.gold }} />}
              </div>
              <h1 className="text-lg md:text-xl font-bold truncate" style={{ color: C.textHi, ...fontDisplay }}>
                {currentPage}
              </h1>
            </div>

            {/* Page-specific action buttons (e.g. Students: Leave Calendar + Add Student,
                Teachers: Add Teacher), registered via useHeaderActions() from the page itself. */}
            {headerActions && (
              <div className="flex items-center gap-1.5 md:gap-2 shrink-0">{headerActions}</div>
            )}

            <button
              onClick={toggle}
              title={mode === "dark" ? "Switch to light" : "Switch to dark"}
              className="p-1.5 md:p-2 rounded-lg border transition-all hover:bg-opacity-50 shrink-0"
              style={{ background: C.panel, borderColor: C.line, color: C.textMid }}
            >
              {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              onClick={handleVoice}
              className={`btn-grad flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 md:px-3 md:py-2 text-xs font-semibold text-white transition-all shrink-0 ${listening ? "mic-ring" : ""}`}
              style={{ boxShadow: `0 6px 18px ${C.gold}40` }}
            >
              <Mic size={13} />
              <span className="hidden sm:inline">{listening ? "Sun raha hoon…" : "Voice"}</span>
            </button>

            {user && (
              <div
                className="hidden md:flex items-center gap-2 rounded-lg border pl-1 pr-1 py-1 shrink-0"
                style={{ background: C.panel, borderColor: C.line }}
              >
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${C.gradA}, ${C.gradB})`, ...fontDisplay }}
                  title={user.email}
                >
                  {(user.name || "A").charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium pr-1" style={{ color: C.textMid, maxWidth: 96 }}>
                  {user.name}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Logout"
              className="hidden md:flex p-1.5 md:p-2 rounded-lg border transition-all shrink-0 disabled:opacity-60"
              style={{ background: C.panel, borderColor: C.line, color: C.rose }}
            >
              <LogOut size={16} />
            </button>
          </header>

          {voiceLog && (
            <div className="px-3 md:px-5 pt-2">
              <div className="text-xs rounded-lg px-3 py-1.5 inline-flex items-center gap-2" style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.textMid }}>
                <Sparkles size={12} style={{ color: C.gold }} /> {voiceLog}
              </div>
            </div>
          )}

          <div className="p-3 md:p-5">
            <Outlet />
          </div>
        </div>
      </div>
      {offline && (
        <div className="offline-banner" style={{ background: `${C.panel}F2`, borderColor: C.rose, color: C.textHi }}>
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: C.rose, boxShadow: `0 0 0 4px ${C.roseSoft}` }} />
          <div className="min-w-0"><div className="text-xs font-bold">No internet connection</div><div className="text-[11px]" style={{ color: C.textLow }}>Your data is safe. We’ll reconnect automatically when the network returns.</div></div>
        </div>
      )}
    </div>
  );
}