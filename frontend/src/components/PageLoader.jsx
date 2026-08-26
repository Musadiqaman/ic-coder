import React from "react";
import { Loader2 } from "lucide-react";
import { useTheme, fontDisplay } from "../theme.jsx";

export default function PageLoader({ label = "Loading workspace…" }) {
  const { C } = useTheme();
  return (
    <div className="app-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="app-loader-card" style={{ background: C.panel, borderColor: C.line, boxShadow: `0 20px 50px -30px ${C.gold}55` }}>
        <div className="app-loader-orbit" style={{ borderColor: `${C.gold}30`, borderTopColor: C.gold }}>
          <div className="app-loader-dot" style={{ background: C.teal }} />
        </div>
        <div className="app-loader-title" style={{ color: C.textHi, ...fontDisplay }}>{label}</div>
        <div className="app-loader-bar" style={{ background: C.panelSoft }}><span style={{ background: `linear-gradient(90deg, ${C.gold}, ${C.teal})` }} /></div>
      </div>
    </div>
  );
}
