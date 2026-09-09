import React, { createContext, useContext, useState, useMemo, useEffect } from "react";

export const fontDisplay = { fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif" };
export const fontMono = { fontFamily: "'JetBrains Mono', 'Courier New', monospace" };
export const fontBody = { fontFamily: "'Inter', system-ui, sans-serif" };

// Nexus Institute — dark: deep space + violet/cyan glow. light: clean campus white.
const darkTokens = {
  mode: "dark",
  ink: "#0A0B14",
  bg: "#0A0B14",
  panel: "#12131F",
  panelSoft: "#181A2A",
  line: "#252740",
  gold: "#8B5CF6",       // primary — violet
  goldSoft: "#241C42",
  teal: "#22D3EE",       // secondary — cyan
  tealSoft: "#123640",
  rose: "#F472B6",       // accent — pink
  roseSoft: "#3A1E33",
  textHi: "#F1F2FA",
  textMid: "#9497B5",
  textLow: "#5F6280",
  overlay: "#04050A90",
  gradA: "#8B5CF6",
  gradB: "#22D3EE",
};

const lightTokens = {
  mode: "light",
  ink: "#F7F7FC",
  bg: "#F7F7FC",
  panel: "#FFFFFF",
  panelSoft: "#F0F1FA",
  line: "#E3E4F2",
  gold: "#7C3AED",
  goldSoft: "#EEE7FD",
  teal: "#0891B2",
  tealSoft: "#DFF6FB",
  rose: "#DB2777",
  roseSoft: "#FCE3F0",
  textHi: "#181A2A",
  textMid: "#5F6280",
  textLow: "#9497B5",
  overlay: "#0A0B1460",
  gradA: "#7C3AED",
  gradB: "#0891B2",
};

const ThemeContext = createContext(darkTokens);

const THEME_STORAGE_KEY = "ic-theme-mode";

// Read the saved mode BEFORE first paint (not in a useEffect) so the page
// never flashes the wrong theme on refresh, then falls back to the OS-level
// preference, then finally to light. localStorage is the right tool here —
// it's plain client-side UI preference, not something the server needs to
// see (a cookie would just add bytes to every request for no reason).
function getInitialMode() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage can throw in some locked-down browser contexts — fall
    // through to the OS-preference check below.
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);
  const C = useMemo(() => (mode === "dark" ? darkTokens : lightTokens), [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore — worst case the preference just doesn't persist this session
    }
  }, [mode]);

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"));
  return (
    <ThemeContext.Provider value={{ C, mode, toggle }}>
      <div
        style={{
          background:
            C.mode === "dark"
              ? `radial-gradient(1200px 600px at 10% -10%, ${C.goldSoft}55, transparent 60%), radial-gradient(1000px 500px at 100% 0%, ${C.tealSoft}55, transparent 55%), ${C.bg}`
              : C.bg,
          minHeight: "100vh",
          transition: "background .25s ease",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const GLOBAL_FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');`;

