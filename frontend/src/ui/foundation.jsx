/* Shared UI foundation: design tokens, inline SVG icon set, global CSS.
   Extracted from App.jsx (frontend decomposition, phase 1). */

/* ─── DESIGN TOKENS ───────────────────────────────────────────────────────
   PHASE 1 — "Hirelay" warm light theme (replaces original dark navy theme).
   All T.xxx references throughout the app inherit this palette automatically.
   See team handoff notes for Phase 2-5 (icons, header, candidates, analytics).
   ──────────────────────────────────────────────────────────────────────── */
const T = {
  // surfaces — cool corporate slate
  bg:        "#F4F6FA",
  surface:   "#FFFFFF",
  surfaceHi: "#EEF1F7",
  border:    "#E1E6EF",
  borderHi:  "#C9D2E0",

  // brand accent — enterprise navy blue
  accent:    "#1E4C8A",
  accentLo:  "#E7EEF8",
  accentBd:  "#BFD3EC",

  // semantic
  green:     "#1F8A5F",
  greenLo:   "#E6F5EE",
  greenBd:   "#BEE3D0",

  red:       "#C33C3C",
  redLo:     "#FBEAEA",
  redBd:     "#F0C6C6",

  amber:     "#B7791F",
  amberLo:   "#FBF1DC",
  amberBd:   "#EEDBA8",

  purple:    "#6D4FA0",
  purpleLo:  "#EEE9F7",
  purpleBd:  "#D6C8EC",

  // text
  text1:     "#16233A",
  text2:     "#5B6B84",
  text3:     "#93A1B7",
};

/* ─── ICONS (inline SVG, no dependency — swap for lucide-react if team adopts it) ─
   Moved here (right after T tokens) so module-level consts like STAT_CFG and
   PLATFORM_META can safely reference Icon.x without hitting the temporal dead
   zone — Icon must be initialized before any other top-level const reads it.
   ──────────────────────────────────────────────────────────────────────── */
const Icon = {
  shield:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-4"/></svg>,
  settings:p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>,
  copy:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  user:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>,
  userPlus:p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3.5-6 7-6s7 2 7 6"/><path d="M19 8v6M16 11h6"/></svg>,
  logout:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>,
  lock:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>,
  eye:     p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6 0 10 7 10 7a14 14 0 0 1-3.2 3.7M6.1 6.1A14.3 14.3 0 0 0 2 11s4 7 10 7c1 0 2-.2 3-.5"/></svg>,
  alert:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 2.6 17a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>,
  check:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>,
  close:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  mail:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>,
  refresh: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>,
  trash:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  fileText:p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>,
  inbox:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5.3 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.7A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.3Z"/></svg>,
  search:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  brain:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v1A2.5 2.5 0 0 0 4.5 8 2.5 2.5 0 0 0 3 12.5 2.5 2.5 0 0 0 4.5 17a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5 2.5"/><path d="M14.5 2a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1.5 4.5 2.5 2.5 0 0 1-1.5 4.5 2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5 2.5"/><path d="M9.5 2v20M14.5 2v20"/></svg>,
  megaphone:p=> <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v3a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M14 7a4 4 0 0 1 0 9"/><path d="M18 4a8 8 0 0 1 0 15"/></svg>,
  briefcase:p=> <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  globe:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></svg>,
  target:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>,
  radar:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12 18 7"/><path d="M12 3v3M3 12h3M18 12h3M12 18v3"/></svg>,
  zap:     p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>,
  flask:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6M10 2v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V2"/><path d="M8 15h8"/></svg>,
  trophy:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a2 2 0 0 0 2 4M17 5h3a2 2 0 0 1-2 4"/></svg>,
  star:    p => <svg {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5Z"/></svg>,
  list:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>,
  seedling:p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="M12 12C12 7 16 6 20 6c0 5-2 8-8 8Z"/><path d="M12 12C12 8 9 7 6 7c0 4 1 7 6 7Z"/></svg>,
  play:    p => <svg {...p} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4l13 8-13 8V4Z"/></svg>,
  xCircle: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>,
  chart:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>,
  calendar:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
};

/* ─── GLOBAL CSS ──────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: ${T.bg};
    font-family: 'Inter', system-ui, sans-serif;
    color: ${T.text1};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px) scale(.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .fade-up    { animation: fadeUp    .35s ease both; }
  .fade-in    { animation: fadeIn    .25s ease both; }
  .slide-down { animation: slideDown .25s ease both; }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(22,35,58,.12); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(22,35,58,.2); }

  select option { background: #FFFFFF; }

  input, textarea, select {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 8px;
    padding: 10px 14px;
    color: ${T.text1};
    font-size: 14px;
    font-family: 'Inter', system-ui, sans-serif;
    outline: none;
    transition: border-color .18s, box-shadow .18s;
    width: 100%;
  }
  input:focus, textarea:focus, select:focus {
    border-color: ${T.accent};
    box-shadow: 0 0 0 3px rgba(30,76,138,.14);
  }
  input::placeholder, textarea::placeholder { color: ${T.text3}; }

  textarea { resize: vertical; }
`;

export { T, Icon, GLOBAL_CSS };
