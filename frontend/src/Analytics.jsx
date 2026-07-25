import { useState, useEffect } from "react";

// Shared authenticated API client (single API base URL source — src/config.ts,
// so the Analytics tab also works behind the Docker /api proxy).
import { api } from "./api/client";

// ── Hirelay corporate theme tokens (mirrors App.jsx's T object) ───────────
const T = {
  bg:        "#F4F6FA",
  surface:   "#FFFFFF",
  surfaceHi: "#EEF1F7",
  border:    "#E1E6EF",
  borderHi:  "#C9D2E0",
  text1:     "#16233A",
  text2:     "#5B6B84",
  text3:     "#93A1B7",
  accent:    "#1E4C8A",
  accentLo:  "#E7EEF8",
  accentBd:  "#BFD3EC",
};

// ── Chart accent palette ────────────────────────────────────────────────────
const C = {
  blue:   "#1E4C8A", green:  "#1F8A5F", red:    "#C33C3C",
  orange: "#B7791F", purple: "#6D4FA0", teal:   "#1D7A8C",
  pink:   "#B0507F", yellow: "#B7791F",
};
const SKILL_COLORS = [C.blue, C.green, C.purple, C.orange, C.teal, C.pink, C.red, "#A8A647"];

const calcPct = (v, t) => (t ? Math.round((v / t) * 100) : 0);
const fmt     = v => (v == null ? "—" : v);

// ── Icons (inline SVG, matches App.jsx's icon system) ───────────────────────
const Icon = {
  chart:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/></svg>,
  refresh:  p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>,
  fileText: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>,
  download: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>,
  close:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  checkCircle: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>,
  calendar: p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  target:   p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>,
  flask:    p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6M10 2v6.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V2"/><path d="M8 15h8"/></svg>,
  mail:     p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>,
  list:     p => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>,
};

// ── Primitives ────────────────────────────────────────────────────────────
const Spinner = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
      <animateTransform attributeName="transform" type="rotate"
        from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite" />
    </path>
  </svg>
);

const Card = ({ children, style = {} }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: "12px", padding: "20px", ...style,
  }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <div style={{
    color: T.text3, fontSize: "10px", letterSpacing: ".8px",
    textTransform: "uppercase", marginBottom: "12px", fontWeight: 600,
  }}>
    {children}
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────────
const KPI = ({ icon, label, value, sub, color = C.blue }) => (
  <Card>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <div style={{
          color: T.text3, fontSize: "11px",
          letterSpacing: ".6px", textTransform: "uppercase", marginBottom: "8px",
        }}>{label}</div>
        <div style={{ color, fontSize: "32px", fontWeight: 800, lineHeight: 1 }}>{fmt(value)}</div>
        {sub && <div style={{ color: T.text3, fontSize: "12px", marginTop: "5px" }}>{sub}</div>}
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: "10px", flexShrink: 0,
        background: `${color}1A`, color,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</div>
    </div>
  </Card>
);

// ── Bar Chart (pure SVG/CSS) ──────────────────────────────────────────────
const BarChart = ({ data, colorFn, height = 120, labelKey = "label", valueKey = "count" }) => {
  if (!data?.length) return (
    <div style={{ color: T.text3, textAlign: "center", padding: "30px", fontSize: "13px" }}>
      No data yet
    </div>
  );
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height, paddingTop: "8px" }}>
      {data.map((d, i) => {
        const h     = Math.max((d[valueKey] / max) * height * 0.85, d[valueKey] > 0 ? 4 : 0);
        const color = colorFn ? colorFn(d, i) : SKILL_COLORS[i % SKILL_COLORS.length];
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <div style={{ fontSize: "10px", color, fontWeight: 700 }}>{d[valueKey] || ""}</div>
            <div style={{
              width: "100%", height: h, background: color,
              borderRadius: "4px 4px 0 0", opacity: .85,
              transition: "height .6s ease", minHeight: d[valueKey] > 0 ? 4 : 0,
            }} />
            <div style={{
              fontSize: "9px", color: T.text3, textAlign: "center",
              lineHeight: 1.2, maxWidth: "100%", overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Line Chart (SVG) ──────────────────────────────────────────────────────
const LineChart = ({ data, color = C.blue, height = 100 }) => {
  if (!data?.length) return (
    <div style={{ color: T.text3, textAlign: "center", padding: "30px", fontSize: "13px" }}>
      No data yet
    </div>
  );
  const vals = data.map(d => d.count);
  const max  = Math.max(...vals, 1);
  const W = 100, H = height;
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - (d.count / max) * (H - 10) - 5;
    return [x, y];
  });
  const poly = pts.map(p => p.join(",")).join(" ");
  const area = `M${pts[0].join(",")} `
    + pts.slice(1).map(p => `L${p.join(",")}`).join(" ")
    + ` L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, overflow: "visible" }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity=".22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lg)" />
        <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill={color} stroke={T.surface} strokeWidth="1.5">
            <title>{data[i].day}: {data[i].count} CVs</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
        {data.length <= 7
          ? data.map((d, i) => (
              <span key={i} style={{ fontSize: "9px", color: T.text3 }}>
                {d.day?.slice(5)}
              </span>
            ))
          : (
            <>
              <span style={{ fontSize: "9px", color: T.text3 }}>{data[0]?.day?.slice(5)}</span>
              <span style={{ fontSize: "9px", color: T.text3 }}>{data[Math.floor(data.length / 2)]?.day?.slice(5)}</span>
              <span style={{ fontSize: "9px", color: T.text3 }}>{data[data.length - 1]?.day?.slice(5)}</span>
            </>
          )}
      </div>
    </div>
  );
};

// ── Donut Chart ───────────────────────────────────────────────────────────
const Donut = ({ segments, size = 120 }) => {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const r = 40, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.surfaceHi} strokeWidth="16" />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="16"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset + circ * 0.25}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray .6s ease" }}>
            <title>{seg.label}: {seg.value}</title>
          </circle>
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 6} fill={T.text1} fontSize="16"
        fontWeight="800" textAnchor="middle">{total}</text>
      <text x={cx} y={cy + 10} fill={T.text3} fontSize="8"
        textAnchor="middle">TOTAL</text>
    </svg>
  );
};

// ── Funnel ────────────────────────────────────────────────────────────────
const Funnel = ({ steps }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    {steps.map((s, i) => {
      const w = 100 - i * 12;
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            flex: 1, background: T.surfaceHi, borderRadius: "6px",
            overflow: "hidden", height: 32,
          }}>
            <div style={{
              width: `${w}%`, height: "100%", background: s.color, opacity: .85,
              borderRadius: "6px", display: "flex", alignItems: "center", paddingLeft: "10px",
              transition: "width .8s ease",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </div>
          </div>
          <div style={{ minWidth: 48, textAlign: "right" }}>
            <span style={{ color: s.color, fontWeight: 800, fontSize: "15px" }}>{s.value}</span>
            {s.pct != null && (
              <span style={{ color: T.text3, fontSize: "10px", marginLeft: "4px" }}>
                {s.pct}%
              </span>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Horizontal Bar ────────────────────────────────────────────────────────
const HBar = ({ label, value, max, color }) => (
  <div style={{ marginBottom: "10px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
      <span style={{ color: T.text2, fontSize: "12px", fontWeight: 500 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: "12px" }}>{value}</span>
    </div>
    <div style={{ background: T.surfaceHi, borderRadius: "3px", height: 6, overflow: "hidden" }}>
      <div style={{
        width: `${calcPct(value, max)}%`, height: "100%", background: color,
        borderRadius: "3px", transition: "width .7s ease",
      }} />
    </div>
  </div>
);

// ── Activity Feed ─────────────────────────────────────────────────────────
const ActivityFeed = ({ items }) => {
  const iconMap  = { cv_upload: Icon.fileText, interview: Icon.calendar, email: Icon.mail };
  const colorMap = { cv_upload: C.blue, interview: C.purple, email: C.orange };
  if (!items?.length) return (
    <div style={{ color: T.text3, textAlign: "center", padding: "20px", fontSize: "13px" }}>
      No recent activity
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      {items.map((a, i) => {
        const ItemIcon = iconMap[a.type] || Icon.list;
        const color = colorMap[a.type] || C.teal;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 0", borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: `${color}1A`,
              border: `1px solid ${color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color,
            }}>
              <ItemIcon width={13} height={13} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: T.text2, fontSize: "12px", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {a.label}
              </div>
            </div>
            <div style={{ color: T.text3, fontSize: "10px", flexShrink: 0 }}>
              {a.ts ? new Date(a.ts).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Report Modal ──────────────────────────────────────────────────────────
const ReportModal = ({ onClose }) => {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/analytics/report")
      .then(d => { setReport(d.report); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const download = () => {
    const blob = new Blob([report], { type: "text/plain" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `hirelay-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(22,35,58,.55)", zIndex: 999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: T.surface, border: `1px solid ${T.borderHi}`,
        borderRadius: "14px", width: "100%", maxWidth: 640, maxHeight: "80vh",
        overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(22,35,58,.2)",
      }}>
        <div style={{
          padding: "18px 22px", borderBottom: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: T.surfaceHi,
        }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: T.text1, display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon.chart width={16} height={16} /> Analytics Report
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            {report && (
              <button onClick={download} style={{
                background: T.accentLo, color: T.accent,
                border: `1px solid ${T.accentBd}`, borderRadius: "6px",
                padding: "5px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
              }}>
                <Icon.download width={13} height={13} /> Download
              </button>
            )}
            <button onClick={onClose} style={{
              background: T.surfaceHi, color: T.text2,
              border: `1px solid ${T.border}`, borderRadius: "6px", padding: "5px 9px",
              fontSize: "12px", cursor: "pointer", display: "flex",
            }}><Icon.close width={13} height={13} /></button>
          </div>
        </div>
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {loading
            ? <div style={{ textAlign: "center", padding: "40px" }}><Spinner /></div>
            : (
              <pre style={{
                color: T.text2, fontSize: "12px", lineHeight: 1.7,
                fontFamily: "'JetBrains Mono','Courier New',monospace", whiteSpace: "pre-wrap",
              }}>
                {report}
              </pre>
            )}
        </div>
      </div>
    </div>
  );
};

// ── Main Analytics Component ──────────────────────────────────────────────
export default function Analytics() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [error,      setError]      = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api("/analytics/overview")
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(load, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px", gap: "12px" }}>
      <Spinner />
      <span style={{ color: T.text3, fontSize: "14px" }}>Loading analytics...</span>
    </div>
  );

  if (error || !data) return (
    <div style={{ textAlign: "center", padding: "60px", color: T.text3 }}>
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}>
        <Icon.chart width={36} height={36} style={{ color: T.text3 }} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        {error || "Could not load analytics. Is the backend running?"}
      </div>
      <button onClick={load} style={{
        background: T.accentLo, color: T.accent,
        border: `1px solid ${T.accentBd}`, borderRadius: "7px",
        padding: "7px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: "6px",
      }}>
        <Icon.refresh width={13} height={13} /> Retry
      </button>
    </div>
  );

  const {
    summary: s,
    cvs_per_day,
    status_dist,
    score_buckets,
    top_skills,
    job_funnel,
    recent,
  } = data;

  const statusMap = Object.fromEntries((status_dist || []).map(d => [d.status, d.count]));
  const donutSegs = [
    { label: "Shortlisted", value: statusMap.shortlisted || 0, color: C.green  },
    { label: "Rejected",    value: statusMap.rejected    || 0, color: C.red    },
    { label: "Pending",     value: statusMap.pending     || 0, color: C.orange },
  ].filter(d => d.value > 0);

  const BUCKET_ORDER = ["90-100", "80-89", "70-79", "60-69", "50-59", "Below 50"];
  const scoreBarData = BUCKET_ORDER.map(b => ({
    label: b,
    count: (score_buckets || []).find(x => x.bucket === b)?.count || 0,
  }));

  const funnelSteps = [
    { label: `CVs Received (${s.total_candidates})`, value: s.total_candidates, color: C.blue,   pct: 100 },
    { label: `Shortlisted (${s.shortlisted})`,        value: s.shortlisted,      color: C.green,  pct: s.conv_shortlist_pct },
    { label: `Interviews (${s.interviewed})`,          value: s.interviewed,      color: C.purple, pct: s.conv_interview_pct },
    { label: `Emails Sent (${s.emails_sent})`,         value: s.emails_sent,      color: C.orange, pct: calcPct(s.emails_sent, s.total_candidates) },
  ];

  const maxSkill = Math.max(...(top_skills || []).map(x => x.count), 1);

  return (
    <div style={{ animation: "fi .4s ease" }}>
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "3px", color: T.text1, display: "flex", alignItems: "center", gap: "8px" }}>
            <Icon.chart width={18} height={18} style={{ color: T.accent }} /> Analytics Dashboard
          </div>
          <div style={{ color: T.text3, fontSize: "13px" }}>
            Complete recruiting pipeline overview
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={load} style={{
            background: T.surfaceHi, color: T.text2,
            border: `1px solid ${T.border}`, borderRadius: "7px",
            padding: "7px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <Icon.refresh width={13} height={13} /> Refresh
          </button>
          <button onClick={() => setShowReport(true)} style={{
            background: T.accentLo, color: T.accent,
            border: `1px solid ${T.accentBd}`, borderRadius: "7px",
            padding: "7px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <Icon.fileText width={13} height={13} /> Export Report
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", marginBottom: "18px" }}>
        <KPI icon={<Icon.fileText width={17} height={17} />} label="Total CVs"      value={s.total_candidates} color={C.blue} />
        <KPI icon={<Icon.checkCircle width={17} height={17} />} label="Shortlisted"     value={s.shortlisted}  sub={`${s.conv_shortlist_pct}% conversion rate`} color={C.green} />
        <KPI icon={<Icon.calendar width={17} height={17} />} label="Interviews"      value={s.interviewed}  sub={`${s.conv_interview_pct}% of shortlisted`}  color={C.purple} />
        <KPI icon={<Icon.target width={17} height={17} />} label="Avg Match Score" value={`${s.avg_score}%`} sub={`Top score: ${s.top_score}%`}            color={C.orange} />
        <KPI icon={<Icon.flask width={17} height={17} />} label="Eval Accuracy"
          value={s.evaluation_accuracy > 0 ? `${s.evaluation_accuracy}%` : "—"}
          sub={s.evaluation_accuracy > 0 ? "50-sample benchmark" : "Run /evaluation/run"}
          color={s.evaluation_accuracy >= 80 ? C.green : s.evaluation_accuracy > 0 ? C.orange : C.teal} />
      </div>

      {/* Row 2: Line chart + Donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <Card>
          <Label>CVs Received — Last 14 Days</Label>
          <LineChart data={cvs_per_day} color={C.blue} height={110} />
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Label>Status Breakdown</Label>
          <Donut segments={donutSegs} size={130} />
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap", justifyContent: "center" }}>
            {donutSegs.map(seg => (
              <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color }} />
                <span style={{ color: T.text2, fontSize: "11px" }}>
                  {seg.label} ({seg.value})
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Funnel + Score Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <Card>
          <Label>Recruiting Funnel</Label>
          <Funnel steps={funnelSteps} />
        </Card>
        <Card>
          <Label>Score Distribution</Label>
          <BarChart
            data={scoreBarData}
            colorFn={(_, i) => [C.green, C.green, C.orange, C.orange, C.red, C.red][i]}
            height={120}
            labelKey="label"
            valueKey="count"
          />
        </Card>
      </div>

      {/* Row 4: Top skills + Job funnel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "12px", marginBottom: "12px" }}>
        <Card>
          <Label>Top Skills — Shortlisted Candidates</Label>
          {!(top_skills || []).length
            ? (
              <div style={{ color: T.text3, textAlign: "center", padding: "30px", fontSize: "13px" }}>
                Run AI matching first to see skill data
              </div>
            )
            : (top_skills || []).map((sk, i) => (
              <HBar key={sk.skill} label={sk.skill} value={sk.count}
                max={maxSkill} color={SKILL_COLORS[i % SKILL_COLORS.length]} />
            ))}
        </Card>
        <Card>
          <Label>Job Performance</Label>
          {!(job_funnel || []).length
            ? (
              <div style={{ color: T.text3, textAlign: "center", padding: "30px", fontSize: "13px" }}>
                Create jobs and run matching to see performance data
              </div>
            )
            : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Job Title", "Applied", "Shortlisted", "Rejected", "Avg Score"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "6px 10px",
                          color: T.text3, fontSize: "9px",
                          letterSpacing: ".7px", textTransform: "uppercase",
                          borderBottom: `1px solid ${T.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(job_funnel || []).map(j => (
                      <tr key={j.id}
                        onMouseEnter={e => (e.currentTarget.style.background = T.surfaceHi)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        style={{ borderBottom: `1px solid ${T.border}`, transition: "background .1s" }}>
                        <td style={{
                          padding: "9px 10px", color: T.text1, fontSize: "12px",
                          fontWeight: 600, maxWidth: 160, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {j.title}
                        </td>
                        <td style={{ padding: "9px 10px", color: C.blue,   fontSize: "12px", fontWeight: 700 }}>{j.total_applied}</td>
                        <td style={{ padding: "9px 10px", color: C.green,  fontSize: "12px", fontWeight: 700 }}>{j.shortlisted}</td>
                        <td style={{ padding: "9px 10px", color: C.red,    fontSize: "12px", fontWeight: 700 }}>{j.rejected}</td>
                        <td style={{ padding: "9px 10px" }}>
                          {j.avg_score
                            ? (
                              <span style={{
                                color: j.avg_score >= 70 ? C.green : j.avg_score >= 50 ? C.orange : C.red,
                                fontWeight: 700, fontSize: "12px",
                              }}>
                                {j.avg_score}%
                              </span>
                            )
                            : <span style={{ color: T.text3, fontSize: "12px" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>

      {/* Row 5: Activity Feed */}
      <Card>
        <Label>Recent Activity</Label>
        <ActivityFeed items={recent} />
      </Card>
    </div>
  );
}
