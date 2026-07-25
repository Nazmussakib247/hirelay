/* Shared presentational primitives (Btn, Card, Badge, …) and platform
   metadata. Extracted from App.jsx (frontend decomposition, phase 1). */

import { T } from "./foundation";

/* ─── PRIMITIVE COMPONENTS ────────────────────────────────────────────── */
const Spinner = ({ size = 16, color = T.accent }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    style={{ flexShrink: 0, animation: "spin .7s linear infinite" }}>
    <circle cx="12" cy="12" r="9" stroke="rgba(22,35,58,.08)" strokeWidth="2.5" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const Badge = ({ label, color, bg, border }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    background: bg, color, border: `1px solid ${border}`,
    borderRadius: "5px", padding: "2px 8px",
    fontSize: "10px", fontWeight: 600,
    letterSpacing: ".6px", textTransform: "uppercase",
    whiteSpace: "nowrap", lineHeight: 1.6,
  }}>
    {label}
  </span>
);

const StatusBadge = ({ status }) => {
  const map = {
    pending:     { color: T.amber,  bg: T.amberLo,  border: T.amberBd  },
    shortlisted: { color: T.green,  bg: T.greenLo,  border: T.greenBd  },
    rejected:    { color: T.red,    bg: T.redLo,    border: T.redBd    },
  };
  const s = map[status] || map.pending;
  return <Badge label={status} {...s} />;
};

const SkillPill = ({ s, matched }) => (
  <span style={{
    background: matched ? T.greenLo : T.surfaceHi,
    color:      matched ? T.green   : T.text3,
    border:     `1px solid ${matched ? T.greenBd : T.border}`,
    borderRadius: "5px", padding: "2px 8px",
    fontSize: "11px", fontWeight: 500,
    display: "inline-block",
  }}>
    {s}
  </span>
);

const ScoreRing = ({ score, size = 60 }) => {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, score / 100)) * circ;
  const color = score >= 80 ? T.green : score >= 60 ? T.amber : T.red;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="rgba(22,35,58,.07)" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray .7s ease" }} />
      <text x={size/2} y={size/2} fill={color}
        fontSize={size > 52 ? 12 : 10} fontWeight="600"
        textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {Math.round(score)}%
      </text>
    </svg>
  );
};

/* ─── LOGO MARK (Hirelay H-monogram) ──────────────────────────────────────
   Geometric monogram: two vertical bars + a crossbar, carved in T.bg out of
   a T.text1 rounded square. Used in header (Phase 2) and login (Phase 2).
   ──────────────────────────────────────────────────────────────────────── */
const Logo = ({ size = 28 }) => {
  const bar    = Math.max(2.5, size * 0.114);
  const inset  = size * 0.18;
  const barLen = size - inset * 2;
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28,
      background: T.accent, position: "relative", flexShrink: 0,
    }}>
      <div style={{ position: "absolute", top: inset, left: inset, width: bar, height: barLen, background: T.bg, borderRadius: bar / 2 }} />
      <div style={{ position: "absolute", top: inset, right: inset, width: bar, height: barLen, background: T.bg, borderRadius: bar / 2 }} />
      <div style={{ position: "absolute", top: size / 2 - bar / 2, left: inset, width: barLen, height: bar, background: T.bg, borderRadius: bar / 2 }} />
    </div>
  );
};

/* ─── LAYOUT PRIMITIVES ───────────────────────────────────────────────── */
const Card = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: "12px",
    boxShadow: "0 1px 2px rgba(22,35,58,.04), 0 1px 1px rgba(22,35,58,.03)",
    ...style,
  }}>
    {children}
  </div>
);

const FieldLabel = ({ children }) => (
  <label style={{
    display: "block",
    color: T.text3,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: ".6px",
    textTransform: "uppercase",
    marginBottom: "6px",
  }}>
    {children}
  </label>
);

const SectionHead = ({ children }) => (
  <div style={{
    color: T.text3,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: ".6px",
    textTransform: "uppercase",
    marginBottom: "14px",
  }}>
    {children}
  </div>
);

const Alert = ({ type = "error", children }) => {
  const cfg = {
    error:   { bg: T.redLo,   border: T.redBd,   color: "#9A2E2E" },
    success: { bg: T.greenLo, border: T.greenBd,  color: "#166B49" },
    warning: { bg: T.amberLo, border: T.amberBd,  color: "#8F5E14" },
    info:    { bg: T.accentLo,border: T.accentBd, color: T.accent   },
  };
  const c = cfg[type];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: "8px", padding: "11px 14px",
      color: c.color, fontSize: "13px", lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
};

const EmptyState = ({ icon, title, sub }) => (
  <div style={{ textAlign: "center", padding: "60px 24px" }}>
    <div style={{ fontSize: "40px", marginBottom: "12px", opacity: .4 }}>{icon}</div>
    <div style={{ color: T.text2, fontWeight: 600, marginBottom: "4px" }}>{title}</div>
    {sub && <div style={{ color: T.text3, fontSize: "13px" }}>{sub}</div>}
  </div>
);

const Btn = ({ children, onClick, disabled, variant = "primary", size = "md", style: sx = {} }) => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: "7px",
    borderRadius: "8px", border: "none",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .18s", whiteSpace: "nowrap",
    ...(size === "sm" ? { padding: "6px 12px", fontSize: "12px" }
      : size === "lg" ? { padding: "12px 22px", fontSize: "15px" }
      :                 { padding: "9px 16px",  fontSize: "13px" }),
    ...sx,
  };
  const variants = {
    primary:  {
      background: disabled ? T.borderHi : T.accent, color: disabled ? T.text3 : "#FFFFFF",
      boxShadow: disabled ? "none" : "0 1px 2px rgba(30,76,138,.25)",
    },
    secondary:{ background: T.surfaceHi, color: T.text2, border: `1px solid ${T.border}` },
    success:  { background: disabled ? T.greenLo  : T.green,  color: disabled ? T.text3 : "#FFFFFF" },
    ghost:    { background: "transparent", color: T.text2, border: `1px solid ${T.border}` },
    danger:   { background: T.redLo, color: T.red, border: `1px solid ${T.redBd}` },
  };
  return (
    <button onClick={!disabled ? onClick : undefined} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
};

const Toggle = ({ value, onChange, label }) => (
  <label style={{
    display: "inline-flex", alignItems: "center", gap: "9px",
    cursor: "pointer", userSelect: "none",
  }}>
    <div onClick={() => onChange(!value)} style={{
      width: 34, height: 19, borderRadius: 10,
      background: value ? T.accent : T.text3,
      position: "relative", transition: "background .2s", cursor: "pointer",
    }}>
      <div style={{
        position: "absolute", top: 2.5, left: value ? 15 : 2.5,
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", transition: "left .2s",
      }} />
    </div>
    <span style={{ color: T.text2, fontSize: "13px" }}>{label}</span>
  </label>
);

/* ─── PLATFORM META ───────────────────────────────────────────────────── */
const PlatformIcon = {
  linkedin: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  telegram: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#26A5E4">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  twitter: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  bdjobs: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#006A4E"/>
      <text x="12" y="16.5" textAnchor="middle" fill="#F42A41" fontSize="9" fontWeight="800" fontFamily="sans-serif">BD</text>
    </svg>
  ),
  webhook: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16.016c.93.583 1.5 1.52 1.5 2.484a3 3 0 0 1-6 0c0-.964.57-1.9 1.5-2.484L12 10.5a5 5 0 0 0-9.5 2.5 5 5 0 0 0 9.5 2.5"/>
      <path d="M6 7.984C5.07 7.4 4.5 6.464 4.5 5.5a3 3 0 0 1 6 0c0 .964-.57 1.9-1.5 2.484L12 13.5a5 5 0 0 0 9.5-2.5 5 5 0 0 0-9.5-2.5"/>
    </svg>
  ),
};

const PLATFORM_META = {
  linkedin: { label: "LinkedIn",   color: "#0A66C2", bg: "rgba(10,102,194,.10)",  border: "rgba(10,102,194,.3)"  },
  telegram: { label: "Telegram",   color: "#26A5E4", bg: "rgba(38,165,228,.10)",  border: "rgba(38,165,228,.3)"  },
  twitter:  { label: "X / Twitter",color: "#0F0F0F", bg: "rgba(15,15,15,.07)",    border: "rgba(15,15,15,.18)"   },
  bdjobs:   { label: "Bdjobs",     color: "#006A4E", bg: "rgba(0,106,78,.10)",    border: "rgba(0,106,78,.3)"    },
  webhook:  { label: "Webhook",    color: "#8B5CF6", bg: "rgba(139,92,246,.10)",  border: "rgba(139,92,246,.3)"  },
};

const PlatformBadge = ({ platform, status }) => {
  const m = PLATFORM_META[platform] || { label: platform, color: T.text3, bg: T.surfaceHi, border: T.border };
  const Ic = PlatformIcon[platform];
  const stColors = { success: T.green, skipped: T.text3, failed: T.red };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "6px",
      background: m.bg, border: `1px solid ${m.border}`,
      borderRadius: "7px", padding: "5px 10px",
    }}>
      {Ic ? <Ic /> : <span style={{ fontSize: "13px" }}>🌐</span>}
      <span style={{ color: m.color, fontSize: "12px", fontWeight: 600 }}>{m.label}</span>
      {status && (
        <span style={{ color: stColors[status] || T.text3, fontSize: "10px", fontWeight: 600 }}>
          {status.toUpperCase()}
        </span>
      )}
    </div>
  );
};

export {
  Spinner, Badge, StatusBadge, SkillPill, ScoreRing, Logo, Card,
  FieldLabel, SectionHead, Alert, EmptyState, Btn, Toggle,
  PlatformIcon, PLATFORM_META, PlatformBadge,
};
