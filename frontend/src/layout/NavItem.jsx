/* Sidebar navigation item. Extracted from App.jsx (decomposition phase 2). */

import { T } from "../ui/foundation";

export function NavItem({ t, active, expanded, onClick }) {
  const TabIcon = t.icon;
  return (
    <button
      onClick={onClick}
      title={expanded ? undefined : t.label}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: "10px",
        justifyContent: expanded ? "flex-start" : "center",
        width: "100%",
        padding: expanded ? "9px 12px" : "9px 0",
        borderRadius: "8px", border: "none",
        background: active ? T.accentLo : "transparent",
        color: active ? T.accent : T.text2,
        fontSize: "13px", fontWeight: active ? 700 : 500,
        cursor: "pointer", fontFamily: "inherit",
        transition: "all .15s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {active && (
        <span style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
          width: 3, height: 16, borderRadius: 2, background: T.accent,
        }} />
      )}
      <TabIcon width={16} height={16} style={{ flexShrink: 0 }} />
      {expanded && <span>{t.label}</span>}
    </button>
  );
}
