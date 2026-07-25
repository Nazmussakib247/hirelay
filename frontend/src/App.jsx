import { useState, useEffect, useCallback, useRef } from "react";
import Analytics from "./Analytics.jsx";

/* ─── CONFIG ──────────────────────────────────────────────────────────── */
// Single source of truth (src/config.ts): VITE_API_URL override, "/api" via
// the nginx proxy in production builds, localhost:8000 in dev.
import { API_BASE_URL as API } from "./config";

// ── Token store (sessionStorage-backed: survives reload, cleared on tab close)
// Token store lives in a typed module. Import for local use in this file AND
// re-export so sibling files (e.g. Analytics.jsx) keep importing from App.
import { getToken, setToken, clearToken } from "./auth/token";
export { getToken, setToken, clearToken };

// ── JWT decode — extracted to a shared util (decomposition phase 2) ─────
import { decodeJWT } from "./lib/jwt";

// Authenticated fetch wrapper — implemented in a typed module (src/api/client.ts).
import { api, apiDownload } from "./api/client";

/* ─── AUTH CONTEXT (extracted to ./auth/context — decomposition phase 2) ─
   AuthContext is provided by the App root below; useAuth() consumes it in the
   components still living in this file. Kept in its own module so sibling
   feature files can import useAuth without importing App (no import cycle). */
import { AuthContext, useAuth } from "./auth/context";

/* ─── SHARED UI (extracted modules — frontend decomposition phase 1) ──── */
import { T, Icon, GLOBAL_CSS } from "./ui/foundation";
import {
  Spinner, Badge, StatusBadge, SkillPill, ScoreRing, Logo, Card,
  FieldLabel, SectionHead, Alert, EmptyState, Btn, Toggle,
  PlatformIcon, PLATFORM_META, PlatformBadge,
} from "./ui/primitives";
import { ForceChangePasswordModal } from "./features/auth/ForceChangePasswordModal";
import { InterviewsTab } from "./features/interviews/InterviewsTab";

/* ─── STATS BAR (extracted to ./layout/StatsBar — decomposition phase 2) ─ */
import { StatsBar } from "./layout/StatsBar";

/* ─── CV UPLOAD ───────────────────────────────────────────────────────── */
function UploadZone({ onSuccess }) {
  const [drag,  setDrag]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [res,   setRes]   = useState(null);
  const [err,   setErr]   = useState(null);

  // FIX: pull handleLogout so api() redirects to login on 401
  const { handleLogout } = useAuth();

  const handle = async file => {
    if (!file) return;
    if (!file.name.match(/\.(pdf|docx|doc)$/i)) { setErr("Only PDF or DOCX files are supported"); return; }
    setBusy(true); setErr(null); setRes(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      // FIX: pass handleLogout as 3rd arg — api() now sends JWT Bearer token in headers
      const d = await api(`/upload-cv`, { method: "POST", body: fd }, handleLogout);
      setRes(d);
      onSuccess?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      {/* Drop Zone */}
      <div>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("cvf").click()}
          style={{
            border: `2px dashed ${drag ? T.accent : T.border}`,
            borderRadius: "12px",
            padding: "56px 32px",
            textAlign: "center",
            cursor: "pointer",
            background: drag ? T.accentLo : T.surfaceHi,
            transition: "all .2s",
          }}
        >
          <input id="cvf" type="file" accept=".pdf,.docx,.doc"
            style={{ display: "none" }} onChange={e => handle(e.target.files[0])} />
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
            {busy
              ? <Spinner size={36} color={T.accent} />
              : <Icon.fileText width={36} height={36} style={{ color: T.text3 }} />}
          </div>
          <div style={{ color: T.text1, fontWeight: 600, fontSize: "15px", marginBottom: "6px" }}>
            {busy ? "Parsing CV…" : "Drop CV here or click to upload"}
          </div>
          <div style={{ color: T.text3, fontSize: "13px" }}>PDF · DOCX · DOC supported</div>
        </div>

        {err && <div style={{ marginTop: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}
      </div>

      {/* Result */}
      <div>
        {res ? (
          <Card className="fade-up" style={{ padding: "22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: T.greenLo, border: `1px solid ${T.greenBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.green,
              }}><Icon.check width={16} height={16} /></div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: "14px" }}>CV Parsed Successfully</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
              {[
                ["Name",       res.extracted?.name],
                ["Email",      res.extracted?.email],
                ["Phone",      res.extracted?.phone],
                ["Experience", `${res.extracted?.experience_years ?? "—"} years`],
              ].map(([l, v]) => (
                <div key={l}>
                  <FieldLabel>{l}</FieldLabel>
                  <div style={{ color: T.text1, fontSize: "13px", fontWeight: 500 }}>{v || "—"}</div>
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <FieldLabel>Education</FieldLabel>
                <div style={{ color: T.text1, fontSize: "13px" }}>{res.extracted?.education || "—"}</div>
              </div>
            </div>
            <div>
              <FieldLabel>Skills Detected ({(res.extracted?.skills || []).length})</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {(res.extracted?.skills || []).map(s => <SkillPill key={s} s={s} matched />)}
              </div>
            </div>
          </Card>
        ) : (
          <div style={{
            height: "100%", minHeight: "200px",
            border: `1px dashed ${T.border}`,
            borderRadius: "12px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: T.text3, fontSize: "13px", gap: "8px",
          }}>
            <Icon.search width={26} height={26} style={{ color: T.text3, opacity: .5 }} />
            <div>Parsed data will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── AI MATCH PANEL ──────────────────────────────────────────────────── */
function MatchPanel({ jobs, onRefresh, emailEnabled }) {
  const [job,       setJob]       = useState("");
  const [busy,      setBusy]      = useState(false);
  const [res,       setRes]       = useState(null);
  const [err,       setErr]       = useState(null);
  const [autoEmail, setAutoEmail] = useState(true);
  const [progress,  setProgress]  = useState(null); // {processed,total,shortlisted,rejected,emails_sent}
  const pollRef = useRef(null);

  // Stop polling if the component unmounts mid-run.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const run = async () => {
    if (!job) return;
    setBusy(true); setRes(null); setErr(null); setProgress(null);
    try {
      // 202: the backend starts a background run; we poll for progress.
      const start = await api(`/match-all/${job}?auto_email=${autoEmail}`, { method: "POST" });
      if (start.total === 0) {
        setRes({ total_processed: 0, shortlisted_count: 0, rejected_count: 0, emails_sent: 0, shortlisted: [] });
        setBusy(false);
        onRefresh?.();
        return;
      }
      setProgress({ processed: 0, total: start.total, shortlisted: 0, rejected: 0, emails_sent: 0 });
      pollRef.current = setInterval(async () => {
        try {
          const run = await api(`/match-runs/${start.run_id}`);
          setProgress({
            processed:   run.processed,
            total:       run.total,
            shortlisted: run.shortlisted,
            rejected:    run.rejected,
            emails_sent: run.emails_sent,
          });
          if (run.status === "completed") {
            clearInterval(pollRef.current); pollRef.current = null;
            setRes(run.result || {
              total_processed: run.processed, shortlisted_count: run.shortlisted,
              rejected_count: run.rejected, emails_sent: run.emails_sent, shortlisted: [],
            });
            setProgress(null); setBusy(false);
            onRefresh?.();
          } else if (run.status === "failed") {
            clearInterval(pollRef.current); pollRef.current = null;
            setErr(run.error || "Match run failed");
            setProgress(null); setBusy(false);
          }
        } catch (e) {
          clearInterval(pollRef.current); pollRef.current = null;
          setErr(e.message); setProgress(null); setBusy(false);
        }
      }, 2000);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div>
      {!emailEnabled && (
        <div style={{ marginBottom: "16px" }}>
          <Alert type="warning"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />Email not configured — add SMTP_USER + SMTP_PASSWORD to .env to enable auto-email</Alert>
        </div>
      )}

      <Card style={{ padding: "20px", marginBottom: "20px" }}>
        <SectionHead>Match Configuration</SectionHead>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <FieldLabel>Target Job Position</FieldLabel>
            <select value={job} onChange={e => setJob(e.target.value)}>
              <option value="">Select a job to match against…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div style={{ padding: "10px 0" }}>
            <Toggle value={autoEmail} onChange={setAutoEmail} label="Auto-send emails" />
          </div>
          <Btn onClick={run} disabled={!job || busy} variant="primary" size="lg">
            {busy ? <><Spinner size={15} color={T.bg} /> Processing…</> : <><Icon.target width={15} height={15} /> Run AI Match</>}
          </Btn>
        </div>
      </Card>

      {err && <div style={{ marginBottom: "16px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}

      {progress && (
        <Card style={{ padding: "20px", marginBottom: "20px" }} className="fade-up">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontWeight: 700, fontSize: "13px" }}>
              Matching candidates… {progress.processed}/{progress.total}
            </span>
            <span style={{ color: T.text3, fontSize: "12px" }}>
              {progress.shortlisted} shortlisted · {progress.rejected} rejected · {progress.emails_sent} emails
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: T.surfaceHi, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4, background: T.accent, transition: "width .6s",
              width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%`,
            }} />
          </div>
          <div style={{ color: T.text3, fontSize: "11px", marginTop: "8px" }}>
            Runs in the background — safe to keep this tab open; results appear here when done.
          </div>
        </Card>
      )}

      {res && (
        <div className="fade-up">
          {/* Summary row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "20px" }}>
            {[
              { l: "Processed",    v: res.total_processed,   c: T.accent  },
              { l: "Shortlisted",  v: res.shortlisted_count, c: T.green   },
              { l: "Rejected",     v: res.rejected_count,    c: T.red     },
              { l: "Emails Sent",  v: res.emails_sent,       c: T.amber   },
            ].map(({ l, v, c }) => (
              <Card key={l} style={{ padding: "16px", textAlign: "center" }}>
                <div style={{ color: c, fontSize: "28px", fontWeight: 700 }}>{v}</div>
                <div style={{ color: T.text3, fontSize: "11px", marginTop: "4px" }}>{l}</div>
              </Card>
            ))}
          </div>

          {(res.shortlisted || []).length > 0 && (
            <div>
              <SectionHead>Shortlisted Candidates</SectionHead>
              <div style={{ display: "grid", gap: "8px" }}>
                {res.shortlisted.map(c => (
                  <Card key={c.candidate_id} style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <ScoreRing score={c.final_score} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px" }}>
                          {c.candidate_name || "Unknown"}
                        </div>
                        <div style={{ color: T.text3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.breakdown?.ai_summary || "—"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                        <StatusBadge status="shortlisted" />
                        {c.email_result?.sent && (
                          <Badge label="Email sent" color={T.green} bg={T.greenLo} border={T.greenBd} />
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── JOB POSTING TAB ─────────────────────────────────────────────────── */
function JobPostingTab({ jobs }) {
  const [platforms,    setPlatforms]    = useState({});
  const [posting,      setPosting]      = useState(null);
  const [results,      setResults]      = useState({});
  const [history,      setHistory]      = useState([]);
  const [selPlatforms, setSelPlatforms] = useState({
    linkedin: true, telegram: true, twitter: true, bdjobs: true, webhook: true,
  });

  useEffect(() => {
    api("/platforms").then(setPlatforms).catch(() => {});
    api("/job-postings").then(setHistory).catch(() => {});
  }, []);

  const post = async job => {
    setPosting(job.id);
    try {
      const chosen = Object.entries(selPlatforms).filter(([, v]) => v).map(([k]) => k).join(",");
      const r = await api(`/jobs/${job.id}/post?platforms=${chosen}`, { method: "POST" });
      setResults(prev => ({ ...prev, [job.id]: r.posting }));
      api("/job-postings").then(setHistory).catch(() => {});
    } catch (e) { console.error(e); }
    finally { setPosting(null); }
  };

  const configured = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Platform Status + Selector */}
      <Card style={{ padding: "20px" }}>
        <SectionHead>Platform Configuration</SectionHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
          {Object.entries(PLATFORM_META).map(([key, { label, color, bg, border }]) => {
            const on = platforms[key];
            const Ic = PlatformIcon[key];
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: on ? bg : T.surfaceHi,
                border: `1px solid ${on ? border : T.border}`,
                borderRadius: "8px", padding: "8px 14px",
                opacity: on ? 1 : 0.5,
              }}>
                {Ic ? <Ic /> : null}
                <span style={{ color: on ? color : T.text3, fontSize: "13px", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: "9px", color: on ? T.green : T.red, fontWeight: 700 }}>
                  {on ? "●" : "○"}
                </span>
              </div>
            );
          })}
        </div>

        <SectionHead>Select Posting Targets</SectionHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {Object.entries(PLATFORM_META).map(([key, { label, color, bg, border }]) => {
            const on = platforms[key];
            const checked = selPlatforms[key];
            const Ic = PlatformIcon[key];
            return (
              <button key={key}
                onClick={() => on && setSelPlatforms(p => ({ ...p, [key]: !p[key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  background:  checked && on ? bg  : T.surfaceHi,
                  border: `2px solid ${checked && on ? border : T.border}`,
                  borderRadius: "8px", padding: "8px 14px",
                  cursor: on ? "pointer" : "not-allowed",
                  opacity: on ? 1 : 0.4, transition: "all .15s",
                  fontFamily: "inherit",
                }}>
                {Ic ? <Ic /> : null}
                <span style={{ color: checked && on ? color : T.text3, fontSize: "13px", fontWeight: 600 }}>{label}</span>
                {checked && on && <span style={{ color: T.green, fontSize: "13px" }}>✓</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Jobs list */}
      {jobs.length === 0
        ? <EmptyState icon={<Icon.briefcase width={36} height={36} style={{ color: T.text3 }} />} title="No jobs available" sub="Create a job in the Jobs tab first" />
        : jobs.map(job => {
          const result    = results[job.id];
          const isPosting = posting === job.id;
          return (
            <Card key={job.id} style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "8px" }}>{job.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
                    {(job.required_skills || []).slice(0, 7).map(s => <SkillPill key={s} s={s} matched />)}
                  </div>
                  {job.description && (
                    <div style={{ color: T.text3, fontSize: "12px", lineHeight: 1.6 }}>
                      {job.description.slice(0, 150)}{job.description.length > 150 ? "…" : ""}
                    </div>
                  )}
                </div>
                <Btn onClick={() => post(job)}
                  disabled={isPosting || configured.length === 0}
                  variant="primary">
                  {isPosting ? <><Spinner size={13} color={T.bg} /> Posting…</> : <><Icon.megaphone width={14} height={14} /> Post Now</>}
                </Btn>
              </div>

              {result && (
                <div className="fade-up" style={{
                  marginTop: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ color: T.green, fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Icon.check width={14} height={14} /> Posted to {result.summary?.total_posted || 0} platform(s)
                    </span>
                    {result.summary?.failed?.length > 0 && (
                      <span style={{ color: T.red, fontSize: "12px" }}>
                        · {result.summary.failed.length} failed
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {Object.entries(result.results || {}).map(([p, r]) => (
                      <PlatformBadge key={p} platform={p} status={r.status} />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

      {/* Posting History */}
      {history.length > 0 && (
        <Card style={{ padding: "20px" }}>
          <SectionHead>Posting History</SectionHead>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Job", "Platforms", "Result", "Posted At"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 12px",
                    color: T.text3, fontSize: "10px",
                    letterSpacing: ".6px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map(h => {
                const res = typeof h.results === "string" ? JSON.parse(h.results) : h.results || {};
                const successes = Object.values(res).filter(r => r.status === "success").length;
                return (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "11px 12px", color: T.text1, fontWeight: 600, fontSize: "13px" }}>
                      {h.job_title || "—"}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {(h.platforms_attempted || []).map(p => {
                          const Ic = PlatformIcon[p];
                          return Ic
                            ? <span key={p} title={PLATFORM_META[p]?.label || p}><Ic /></span>
                            : <span key={p} style={{ fontSize: "13px" }} title={p}>🌐</span>;
                        })}
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <Badge label={`${successes} posted`} color={T.green} bg={T.greenLo} border={T.greenBd} />
                    </td>
                    <td style={{ padding: "11px 12px", color: T.text3, fontSize: "12px" }}>
                      {new Date(h.posted_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ─── CANDIDATES TAB ──────────────────────────────────────────────────── */
function CandidatesTab({ refresh, jobs }) {
  const [cands,     setCands]     = useState([]);
  const [filter,    setFilter]    = useState("all");
  const [sel,       setSel]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [resending, setResending] = useState(null);
  // NEW: delete + re-upload state
  const [deleting,  setDeleting]  = useState(null);   // candidate id being deleted
  const [reuploadFor, setReuploadFor] = useState(null); // candidate id awaiting file pick
  const [reupBusy,  setReupBusy]  = useState(false);
  const [reupMsg,   setReupMsg]   = useState(null);   // { type, text }

  const { handleLogout, isAdmin } = useAuth();

  const [jobFilter, setJobFilter] = useState("all"); // "all" | job id | "unmatched"
  const [search,    setSearch]    = useState("");    // name / email / skill query
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // bulk selection
  const [bulkBusy,  setBulkBusy]  = useState(false);

  const loadCands = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (jobFilter !== "all") params.set("job", jobFilter);
    if (search.trim()) params.set("q", search.trim());
    const qs = params.toString();
    api(qs ? `/candidates?${qs}` : "/candidates", {}, handleLogout)
      .then(d => setCands(Array.isArray(d) ? d : (d.items || [])))
      .catch(() => [])
      .finally(() => setLoading(false));
  };

  // Debounce search so we don't fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(loadCands, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [refresh, filter, jobFilter, search]); // eslint-disable-line

  // Clear any stale selections whenever the visible list changes.
  useEffect(() => { setSelectedIds(new Set()); }, [filter, jobFilter, search, refresh]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allVisibleSelected = cands.length > 0 && cands.every(c => selectedIds.has(c.id));
  const toggleSelectAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(cands.map(c => c.id)));

  const bulkStatus = async (status) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Set ${ids.length} candidate(s) to "${status}"?`)) return;
    setBulkBusy(true);
    try {
      await api("/candidates/bulk-status", { method: "POST", body: JSON.stringify({ candidate_ids: ids, status }) }, handleLogout);
      setSelectedIds(new Set());
      loadCands();
    } catch (e) { alert(`Bulk update failed: ${e.message}`); }
    finally { setBulkBusy(false); }
  };
  const bulkEmail = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Send the appropriate email to ${ids.length} candidate(s)?`)) return;
    setBulkBusy(true);
    try {
      const r = await api("/candidates/bulk-email", { method: "POST", body: JSON.stringify({ candidate_ids: ids }) }, handleLogout);
      alert(`Emails sent: ${r.sent}/${r.requested}. (Some may be skipped — e.g. pending or no interview scheduled.)`);
      setSelectedIds(new Set());
      loadCands();
    } catch (e) { alert(`Bulk email failed: ${e.message}`); }
    finally { setBulkBusy(false); }
  };

  const jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j.title]));

  const resend = async cid => {
    setResending(cid);
    try { await api(`/send-email/${cid}`, { method: "POST" }, handleLogout); }
    finally { setResending(null); }
  };

  // Manual HR override of the automated shortlist/reject decision.
  const [statusBusy, setStatusBusy] = useState(null);
  const changeStatus = async (cid, status) => {
    setStatusBusy(cid);
    try {
      await api(`/candidates/${cid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }, handleLogout);
      loadCands();
    } catch (e) { alert(`Could not update status: ${e.message}`); }
    finally { setStatusBusy(null); }
  };

  // HR-triggered interview scheduling with a confirmation dialog so HR can
  // see/adjust the time (and spot clashes) before the invite email goes out.
  const [schedulingId, setSchedulingId] = useState(null);      // confirm-in-flight
  const [schedModal, setSchedModal]     = useState(null);      // { cand, busy }
  const [schedTime, setSchedTime]       = useState("");        // datetime-local value

  const isoToLocalInput = iso => {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const openScheduleModal = async cand => {
    setSchedulingId(cand.id);
    try {
      const info = await api("/interviews/schedule-info", {}, handleLogout);
      setSchedTime(isoToLocalInput(info.proposed_time));
      setSchedModal({ cand, busy: info.busy || [] });
    } catch (e) { alert(`Could not load scheduling info: ${e.message}`); }
    finally { setSchedulingId(null); }
  };

  // Clash if an existing interview falls in the same calendar hour.
  const scheduleClash = (() => {
    if (!schedModal || !schedTime) return null;
    const c = new Date(schedTime);
    return schedModal.busy.find(b => {
      const d = new Date(b.time);
      return d.getFullYear() === c.getFullYear() && d.getMonth() === c.getMonth()
        && d.getDate() === c.getDate() && d.getHours() === c.getHours();
    }) || null;
  })();

  const confirmSchedule = async () => {
    if (!schedModal) return;
    const cid = schedModal.cand.id;
    setSchedulingId(cid);
    try {
      const r = await api(`/schedule-interview/${cid}`, {
        method: "POST",
        body: JSON.stringify({ interview_time: new Date(schedTime).toISOString() }),
      }, handleLogout);
      setSchedModal(null);
      alert(r.email_sent
        ? "Interview scheduled and invite emailed to the candidate."
        : "Interview scheduled, but the email could not be sent (check SMTP / Email Logs).");
      loadCands();
    } catch (e) { alert(`Could not schedule interview: ${e.message}`); }
    finally { setSchedulingId(null); }
  };

  // NEW: delete candidate
  const handleDelete = async cid => {
    if (!window.confirm("Delete this candidate and all their match/interview data? This cannot be undone.")) return;
    setDeleting(cid);
    try {
      await api(`/candidates/${cid}`, { method: "DELETE" }, handleLogout);
      setSel(null);
      loadCands();
    } catch (e) { alert(`Delete failed: ${e.message}`); }
    finally { setDeleting(null); }
  };

  // NEW: re-upload CV for existing candidate
  const handleReupload = async (cid, file) => {
    if (!file) return;
    setReupBusy(true); setReupMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/candidates/${cid}/reupload`, { method: "POST", body: fd }, handleLogout);
      setReupMsg({ type: "success", text: "CV replaced — candidate reset to pending" });
      setReuploadFor(null);
      setSel(null);
      loadCands();
    } catch (e) {
      setReupMsg({ type: "error", text: e.message });
    } finally { setReupBusy(false); }
  };

  const scoreColor = s => s >= 80 ? T.green : s >= 60 ? T.amber : T.red;

  // HR private notes on the selected candidate.
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy,  setNoteBusy]  = useState(false);
  useEffect(() => { setNoteDraft(sel?.notes || ""); }, [sel]);
  const saveNote = async () => {
    if (!sel) return;
    setNoteBusy(true);
    try {
      await api(`/candidates/${sel.id}/notes`, { method: "PATCH", body: JSON.stringify({ notes: noteDraft }) }, handleLogout);
      setSel({ ...sel, notes: noteDraft.trim() || null });
      setCands(cs => cs.map(c => c.id === sel.id ? { ...c, notes: noteDraft.trim() || null } : c));
    } catch (e) { alert(`Could not save notes: ${e.message}`); }
    finally { setNoteBusy(false); }
  };

  return (
    <div>
      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "18px", alignItems: "center" }}>
        {["all", "pending", "shortlisted", "rejected"].map(f => (
          <button key={f} onClick={() => { setFilter(f); setSel(null); }} style={{
            padding: "6px 14px", borderRadius: "8px",
            border: "none",
            background: filter === f ? T.accentLo : "transparent",
            color: filter === f ? T.accent : T.text3,
            cursor: "pointer", fontSize: "12px", fontWeight: 600,
            textTransform: "capitalize", fontFamily: "inherit", transition: "all .15s",
          }}>{f}</button>
        ))}
        {/* Job filter — view candidates for a specific position (additive; does
            not affect matching or match-all, only which rows are shown). */}
        <select
          value={jobFilter}
          onChange={e => { setJobFilter(e.target.value); setSel(null); }}
          title="Filter candidates by job"
          style={{
            marginLeft: "10px", fontSize: "12px", fontWeight: 600,
            padding: "6px 26px 6px 12px", borderRadius: "8px",
            border: `1px solid ${T.border}`, background: `${T.surface} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 9px center`,
            color: T.text2, cursor: "pointer", fontFamily: "inherit",
            appearance: "none", WebkitAppearance: "none", MozAppearance: "none", outline: "none",
          }}>
          <option value="all">All Jobs</option>
          {(jobs || []).map(j => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
          <option value="unmatched">Unmatched (no job yet)</option>
        </select>
        {/* Search by name / email / skill */}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, or skill…"
          style={{ marginLeft: "10px", minWidth: "220px", fontSize: "12px", padding: "7px 12px",
            borderRadius: "8px", border: `1px solid ${T.border}`, background: T.surface,
            color: T.text1, fontFamily: "inherit", outline: "none" }} />
        {cands.length > 0 && (
          <span style={{ marginLeft: "auto", color: T.text3, fontSize: "12px" }}>
            {cands.length} result{cands.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Bulk action bar — appears when rows are selected */}
      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px",
          padding: "10px 14px", borderRadius: "10px", background: T.accentLo, border: `1px solid ${T.accentBd}` }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: T.accent }}>{selectedIds.size} selected</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: "7px", alignItems: "center" }}>
            {/* Bulk status changes are admin-only; emailing is open to recruiters. */}
            {isAdmin && (
              <>
                <Btn size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkStatus("shortlisted")}>
                  <Icon.check width={12} height={12} /> Shortlist
                </Btn>
                <Btn size="sm" variant="ghost" disabled={bulkBusy} onClick={() => bulkStatus("rejected")}>
                  <Icon.close width={12} height={12} /> Reject
                </Btn>
              </>
            )}
            <Btn size="sm" variant="primary" disabled={bulkBusy} onClick={bulkEmail}>
              {bulkBusy ? <Spinner size={11} color={T.bg} /> : <Icon.mail width={12} height={12} />} Email
            </Btn>
            <Btn size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>Clear</Btn>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Spinner size={24} />
        </div>
      ) : cands.length === 0 ? (
        <EmptyState icon={<Icon.inbox width={36} height={36} style={{ color: T.text3 }} />} title="No candidates found"
          sub={filter !== "all" ? "Try a different filter" : "Upload CVs to get started"} />
      ) : (
        <>
          <Card>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "11px 8px 11px 16px", borderBottom: `1px solid ${T.border}`, width: "34px" }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                      title="Select all"
                      style={{ width: "15px", height: "15px", margin: 0, accentColor: T.accent, cursor: "pointer" }} />
                  </th>
                  {["Name", "Email", "Exp", "Match Score", "Status", "Job", ""].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "11px 16px",
                      color: T.text3, fontSize: "10px",
                      letterSpacing: ".6px", textTransform: "uppercase",
                      borderBottom: `1px solid ${T.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cands.map(c => (
                  <tr key={c.id}
                    onClick={() => setSel(sel?.id === c.id ? null : c)}
                    style={{
                      borderBottom: `1px solid ${T.border}`,
                      cursor: "pointer",
                      background: selectedIds.has(c.id) ? T.accentLo : sel?.id === c.id ? T.surfaceHi : "transparent",
                      transition: "background .1s",
                    }}>
                    <td style={{ padding: "12px 8px 12px 16px" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)}
                        style={{ width: "15px", height: "15px", margin: 0, accentColor: T.accent, cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", color: T.text1 }}>{c.name || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 16px", color: T.text3, fontSize: "12px" }}>{c.email || "—"}</td>
                    <td style={{ padding: "12px 16px", color: T.text2, fontSize: "12px" }}>{c.experience_years || 0}yr</td>
                    <td style={{ padding: "12px 16px" }}>
                      {c.match_score > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: T.surfaceHi, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${c.match_score}%`, background: scoreColor(c.match_score), borderRadius: 3, transition: "width .5s" }} />
                          </div>
                          <span style={{ color: scoreColor(c.match_score), fontSize: "12px", fontWeight: 700 }}>
                            {Math.round(c.match_score)}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: T.text3, fontSize: "12px" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" }}>
                        <StatusBadge status={c.status} />
                        {/* Manual HR override — change the auto decision */}
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <select
                            value={c.status || "pending"}
                            disabled={statusBusy === c.id}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); changeStatus(c.id, e.target.value); }}
                            title="Manually change status (overrides the automated decision)"
                            style={{
                              fontSize: "11px", fontWeight: 600, padding: "3px 24px 3px 9px",
                              borderRadius: "7px", border: `1px solid ${T.border}`,
                              background: `${T.surface} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 7px center`,
                              color: T.text2, cursor: "pointer", fontFamily: "inherit",
                              appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                              outline: "none",
                            }}>
                            <option value="pending">Set Pending</option>
                            <option value="shortlisted">Set Shortlisted</option>
                            <option value="rejected">Set Rejected</option>
                          </select>
                          {statusBusy === c.id && <Spinner size={12} />}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", color: T.text3, fontSize: "12px" }}>
                      {c.matched_job_id ? (jobMap[c.matched_job_id] || "—") : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {/* Schedule interview + send invite — for shortlisted
                            candidates (manual shortlist sends nothing on its own). */}
                        {c.status === "shortlisted" && c.email && (
                          <Btn size="sm" variant="primary"
                            onClick={e => { e.stopPropagation(); openScheduleModal(c); }}
                            disabled={schedulingId === c.id}
                            title="Schedule an interview and email the invite">
                            {schedulingId === c.id ? <Spinner size={11} color={T.bg} /> : <Icon.calendar width={12} height={12} />} Schedule
                          </Btn>
                        )}
                        {c.email && c.status !== "pending" && (
                          <Btn size="sm" variant="ghost"
                            onClick={e => { e.stopPropagation(); resend(c.id); }}
                            disabled={resending === c.id}>
                            {resending === c.id ? <Spinner size={11} /> : <Icon.mail width={12} height={12} />} Resend
                          </Btn>
                        )}
                        {/* download original CV */}
                        <Btn size="sm" variant="ghost"
                          onClick={e => {
                            e.stopPropagation();
                            apiDownload(`/candidates/${c.id}/cv`, c.cv_filename || "cv.pdf", handleLogout)
                              .catch(err => alert(`Download failed: ${err.message}`));
                          }}>
                          <Icon.fileText width={12} height={12} />
                        </Btn>
                        {/* re-upload trigger */}
                        <Btn size="sm" variant="ghost"
                          onClick={e => { e.stopPropagation(); setReuploadFor(c.id); setReupMsg(null); }}
                          style={{ borderColor: T.accentBd, color: T.accent }}>
                          <Icon.refresh width={12} height={12} />
                        </Btn>
                        {/* delete — admin only */}
                        {isAdmin && (
                          <Btn size="sm" variant="danger"
                            onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                            disabled={deleting === c.id}>
                            {deleting === c.id ? <Spinner size={11} color={T.red} /> : <Icon.trash width={12} height={12} />}
                          </Btn>
                        )}
                        {/* Hidden file input for re-upload */}
                        <input
                          id={`reup-${c.id}`}
                          type="file" accept=".pdf,.docx,.doc"
                          style={{ display: "none" }}
                          onChange={e => handleReupload(c.id, e.target.files[0])}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Schedule-interview confirmation dialog */}
          {schedModal && (
            <div onClick={() => setSchedModal(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
              <div onClick={e => e.stopPropagation()} className="fade-up"
                style={{ background: T.surface, borderRadius: "16px", border: `1px solid ${T.border}`,
                  width: "100%", maxWidth: "440px", padding: "22px", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "4px" }}>
                  <Icon.calendar width={18} height={18} style={{ color: T.accent }} />
                  <span style={{ fontSize: "16px", fontWeight: 700, color: T.text1 }}>Schedule Interview</span>
                </div>
                <div style={{ fontSize: "12.5px", color: T.text3, marginBottom: "16px" }}>
                  Invite <b style={{ color: T.text2 }}>{schedModal.cand.name || "this candidate"}</b> for{" "}
                  <b style={{ color: T.text2 }}>{jobMap[schedModal.cand.matched_job_id] || "the position"}</b>. A Jitsi
                  meeting link is generated and emailed on confirm.
                </div>

                <FieldLabel>Interview date &amp; time</FieldLabel>
                <input type="datetime-local" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
                    padding: "10px 12px", borderRadius: "9px", border: `1px solid ${scheduleClash ? T.red : T.border}`,
                    background: T.surfaceHi, color: T.text1, outline: "none", marginBottom: "10px" }} />

                {/* Availability indicator */}
                {scheduleClash ? (
                  <div style={{ display: "flex", gap: "7px", alignItems: "flex-start", padding: "9px 11px",
                    borderRadius: "9px", background: T.redLo, border: `1px solid ${T.redBd}`, marginBottom: "14px" }}>
                    <Icon.alert width={14} height={14} style={{ color: T.red, marginTop: "1px", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: T.red, lineHeight: 1.45 }}>
                      This hour clashes with <b>{scheduleClash.candidate_name || "another interview"}</b>
                      {scheduleClash.job_title ? ` (${scheduleClash.job_title})` : ""}. You can still confirm, or pick another time.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "7px", alignItems: "center", padding: "9px 11px",
                    borderRadius: "9px", background: T.greenLo, border: `1px solid ${T.greenBd}`, marginBottom: "14px" }}>
                    <Icon.check width={14} height={14} style={{ color: T.green, flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: T.green }}>This time slot is free.</span>
                  </div>
                )}

                {schedModal.busy.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase",
                      color: T.text3, marginBottom: "6px" }}>Upcoming interviews</div>
                    <div style={{ maxHeight: "104px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px" }}>
                      {schedModal.busy.slice(0, 12).map((b, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px",
                          fontSize: "11.5px", color: T.text3 }}>
                          <span style={{ color: T.text2 }}>{new Date(b.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                          <span style={{ textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.candidate_name || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "9px", justifyContent: "flex-end" }}>
                  <Btn size="md" variant="ghost" onClick={() => setSchedModal(null)}>Cancel</Btn>
                  <Btn size="md" variant="primary" onClick={confirmSchedule}
                    disabled={!schedTime || schedulingId === schedModal.cand.id}>
                    {schedulingId === schedModal.cand.id
                      ? <><Spinner size={13} color={T.bg} /> Sending…</>
                      : <><Icon.mail width={13} height={13} /> Confirm &amp; Send Invite</>}
                  </Btn>
                </div>
              </div>
            </div>
          )}

          {/* re-upload panel shown when refresh icon is clicked */}
          {reuploadFor && (
            <Card className="fade-up" style={{ marginTop: "14px", padding: "18px", border: `1px solid ${T.accentBd}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ color: T.accent, fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon.refresh width={14} height={14} /> Replace CV for {cands.find(c => c.id === reuploadFor)?.name || "candidate"}
                </div>
                <Btn size="sm" variant="ghost" onClick={() => { setReuploadFor(null); setReupMsg(null); }}>
                  <Icon.close width={12} height={12} /> Cancel
                </Btn>
              </div>
              {reupMsg && (
                <div style={{ marginBottom: "10px" }}>
                  <Alert type={reupMsg.type}>
                    {reupMsg.type === "success" ? <Icon.check width={13} height={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> : <Icon.alert width={13} height={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />}
                    {reupMsg.text}
                  </Alert>
                </div>
              )}
              <div
                onClick={() => !reupBusy && document.getElementById(`reup-${reuploadFor}`)?.click()}
                style={{
                  border: `2px dashed ${T.accentBd}`, borderRadius: "10px",
                  padding: "28px", textAlign: "center", cursor: reupBusy ? "wait" : "pointer",
                  background: T.accentLo, transition: "all .2s",
                }}
              >
                <input
                  id={`reup-panel-${reuploadFor}`}
                  type="file" accept=".pdf,.docx,.doc"
                  style={{ display: "none" }}
                  onChange={e => handleReupload(reuploadFor, e.target.files[0])}
                />
                {reupBusy
                  ? <><Spinner size={22} color={T.accent} /><div style={{ color: T.text3, fontSize: "13px", marginTop: "8px" }}>Uploading…</div></>
                  : <><Icon.fileText width={26} height={26} style={{ color: T.accent, marginBottom: "6px" }} /><div style={{ color: T.text2, fontSize: "13px" }}>Click to select new CV (PDF · DOCX · DOC)</div></>}
              </div>
            </Card>
          )}

          {sel && (
            <Card className="fade-up" style={{ marginTop: "14px", padding: "22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "17px", marginBottom: "4px" }}>{sel.name}</div>
                  <div style={{ color: T.text3, fontSize: "13px" }}>{sel.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {sel.match_score > 0 && <ScoreRing score={sel.match_score} size={54} />}
                  <StatusBadge status={sel.status} />
                </div>
              </div>

              {/* CV parse confidence — warn HR when the parser was unsure */}
              {sel.parse_confidence != null && (() => {
                const pc = sel.parse_confidence;
                const low = pc < 50;
                const mid = pc >= 50 && pc < 75;
                const col = low ? T.red : mid ? T.amber : T.green;
                const bg  = low ? T.redLo : mid ? T.surfaceHi : T.greenLo;
                const bd  = low ? T.redBd : mid ? T.border : T.greenBd;
                return (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "9px 12px",
                    borderRadius: "8px", background: bg, border: `1px solid ${bd}`, marginBottom: "14px" }}>
                    {low ? <Icon.alert width={14} height={14} style={{ color: col, flexShrink: 0 }} />
                         : <Icon.fileText width={14} height={14} style={{ color: col, flexShrink: 0 }} />}
                    <span style={{ fontSize: "12.5px", color: col, fontWeight: 600 }}>
                      Parse confidence: {pc}%
                    </span>
                    <span style={{ fontSize: "11.5px", color: T.text3 }}>
                      {low ? "— several fields may be missing; review the CV or re-upload."
                           : mid ? "— mostly parsed; a quick check is worth it."
                           : "— all key fields extracted."}
                    </span>
                  </div>
                );
              })()}

              {sel.ai_summary && (
                <div style={{
                  background: T.accentLo, border: `1px solid ${T.accentBd}`,
                  borderRadius: "8px", padding: "12px 14px",
                  color: T.text2, fontSize: "13px", lineHeight: 1.65, marginBottom: "14px",
                  display: "flex", gap: "8px", alignItems: "flex-start",
                }}>
                  <Icon.fileText width={14} height={14} style={{ color: T.accent, flexShrink: 0, marginTop: "2px" }} />
                  <span>{sel.ai_summary}</span>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {(sel.skills || []).map(s => <SkillPill key={s} s={s} matched />)}
              </div>

              {/* HR private notes */}
              <div style={{ marginTop: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "14px" }}>
                <FieldLabel>HR Notes <span style={{ fontWeight: 400, color: T.text3, textTransform: "none", letterSpacing: 0 }}>(private — not emailed)</span></FieldLabel>
                <textarea rows={3} value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                  placeholder="Add a note about this candidate…"
                  style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
                    lineHeight: 1.5, padding: "10px 12px", borderRadius: "9px", border: `1px solid ${T.border}`,
                    background: T.surfaceHi, color: T.text1, resize: "vertical", outline: "none" }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                  <Btn size="sm" variant="primary" onClick={saveNote}
                    disabled={noteBusy || noteDraft === (sel.notes || "")}>
                    {noteBusy ? <><Spinner size={12} color={T.bg} /> Saving…</> : <><Icon.check width={12} height={12} /> Save Note</>}
                  </Btn>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ─── JOBS TAB ────────────────────────────────────────────────────────── */
/* ── Weighted skill helpers ──────────────────────────────────────────────
   Skills are edited as [{ name, weight }] where weight ∈ 1..10 and controls
   how much each keyword contributes to the AI skill-match score. */
const skillsToPayload = skills => ({
  required_skills: skills.map(s => s.name),
  skill_weights:   Object.fromEntries(skills.map(s => [s.name, s.weight])),
});

const jobToSkillList = j => {
  const w = (typeof j.skill_weights === "string"
    ? (() => { try { return JSON.parse(j.skill_weights); } catch { return {}; } })()
    : j.skill_weights) || {};
  return (j.required_skills || []).map(name => ({ name, weight: w[name] ?? 5 }));
};

const WeightedSkillPill = ({ name, weight }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: "5px",
    background: T.greenLo, color: T.green, border: `1px solid ${T.greenBd}`,
    borderRadius: "5px", padding: "2px 4px 2px 8px",
    fontSize: "11px", fontWeight: 500,
  }}>
    {name}
    <span style={{
      background: T.surface, border: `1px solid ${T.greenBd}`,
      borderRadius: "4px", padding: "0 5px",
      fontSize: "10px", fontWeight: 700, color: T.green,
    }} title="Skill weight (1–10)">×{weight}</span>
  </span>
);

/* Editable keyword + weight list, with an optional "Suggest with AI" action
   that asks the backend (Groq) to extract keywords + weights from the JD. */
function SkillWeightEditor({ skills, setSkills, description, title }) {
  const [input,      setInput]      = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [sugErr,     setSugErr]     = useState(null);
  const { handleLogout } = useAuth();

  const add = () => {
    const name = input.trim().toLowerCase();
    if (!name) return;
    setSkills(prev => prev.some(s => s.name === name) ? prev : [...prev, { name, weight: 5 }]);
    setInput("");
  };

  const setWeight = (name, w) => {
    const weight = Math.max(1, Math.min(10, parseInt(w) || 1));
    setSkills(prev => prev.map(s => s.name === name ? { ...s, weight } : s));
  };

  const remove = name => setSkills(prev => prev.filter(s => s.name !== name));

  const suggest = async () => {
    if (!description?.trim() || description.trim().length < 10) {
      setSugErr("Write a job description first (at least 10 characters)"); return;
    }
    setSuggesting(true); setSugErr(null);
    try {
      const r = await api("/jobs/suggest-skills", {
        method: "POST",
        body: JSON.stringify({ description, title: title || null }),
      }, handleLogout);
      setSkills(prev => {
        const existing = new Set(prev.map(s => s.name));
        const merged = [...prev];
        (r.skills || []).forEach(({ skill, weight }) => {
          if (!existing.has(skill)) merged.push({ name: skill, weight });
        });
        return merged;
      });
      if (r.source !== "ai") setSugErr("AI unavailable — used keyword extraction instead");
    } catch (e) { setSugErr(e.message); }
    finally { setSuggesting(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input placeholder="Add a skill keyword, e.g. python" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Btn onClick={add} variant="secondary" disabled={!input.trim()}>Add</Btn>
        <Btn onClick={suggest} variant="ghost" disabled={suggesting}>
          {suggesting
            ? <><Spinner size={13} /> Suggesting…</>
            : <><Icon.zap width={13} height={13} /> Suggest with AI</>}
        </Btn>
      </div>
      {sugErr && <div style={{ marginTop: "8px" }}><Alert type="warning">{sugErr}</Alert></div>}
      {skills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
          {skills.map(s => (
            <div key={s.name} style={{
              display: "flex", alignItems: "center", gap: "10px",
              background: T.surfaceHi, border: `1px solid ${T.border}`,
              borderRadius: "8px", padding: "6px 10px",
            }}>
              <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: T.text1 }}>{s.name}</span>
              <span style={{ color: T.text3, fontSize: "11px" }}>weight</span>
              <input type="number" min={1} max={10} value={s.weight}
                onChange={e => setWeight(s.name, e.target.value)}
                style={{ width: "58px", padding: "4px 8px", fontSize: "13px" }} />
              <input type="range" min={1} max={10} value={s.weight}
                onChange={e => setWeight(s.name, e.target.value)}
                style={{ width: "90px", padding: 0, border: "none", boxShadow: "none" }} />
              <button onClick={() => remove(s.name)} title="Remove skill" style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: T.text3, display: "flex", padding: "2px",
              }}><Icon.close width={14} height={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Per-job inline editor: lets recruiters edit keywords + weights on an
   existing job (PATCH /jobs/{id}/skills). */
function JobSkillsEditor({ job, onSaved }) {
  const [skills, setSkills] = useState(() => jobToSkillList(job));
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const { handleLogout } = useAuth();

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await api(`/jobs/${job.id}/skills`, {
        method: "PATCH",
        body: JSON.stringify(skillsToPayload(skills)),
      }, handleLogout);
      onSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: "12px", borderTop: `1px solid ${T.border}`, paddingTop: "12px" }}>
      <SkillWeightEditor skills={skills} setSkills={setSkills}
        description={job.description} title={job.title} />
      {err && <div style={{ marginTop: "8px" }}><Alert type="error">{err}</Alert></div>}
      <div style={{ marginTop: "10px" }}>
        <Btn onClick={save} disabled={saving} variant="primary" size="sm">
          {saving ? <><Spinner size={12} color={T.bg} /> Saving…</> : <><Icon.check width={12} height={12} /> Save Skills</>}
        </Btn>
      </div>
    </div>
  );
}

function JobsTab({ jobs, onRefresh }) {
  const blank = { title: "", description: "", min_experience: 0, location: "", post_message: "",
    interview_message: "", rejection_message: "" };
  const [form,    setForm]    = useState(blank);
  const [skills,  setSkills]  = useState([]);   // [{ name, weight }]
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState(null);
  const [editing, setEditing] = useState(null); // job id whose skills are being edited
  const [customMsg, setCustomMsg] = useState(false); // show the custom-message box
  const [customEmails, setCustomEmails] = useState(false); // show the email-template boxes
  const { handleLogout } = useAuth();

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setSaving(true); setErr(null);
    try {
      await api("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...skillsToPayload(skills),
          min_experience: parseInt(form.min_experience) || 0,
          location: (form.location || "").trim() || null,
          // Only send a custom message when the box is enabled; otherwise the
          // backend uses the default announcement template.
          post_message: customMsg && form.post_message.trim() ? form.post_message : null,
          interview_message: customEmails && form.interview_message.trim() ? form.interview_message : null,
          rejection_message: customEmails && form.rejection_message.trim() ? form.rejection_message : null,
        }),
      }, handleLogout);
      setDone(true); setForm(blank); setSkills([]); setCustomMsg(false); setCustomEmails(false); onRefresh?.();
      setTimeout(() => setDone(false), 3000);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "24px" }}>
      {/* Create Form */}
      <div>
        <SectionHead>Create New Job</SectionHead>
        {done && <div style={{ marginBottom: "12px" }}><Alert type="success"><Icon.check width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />Job created successfully!</Alert></div>}
        {err  && <div style={{ marginBottom: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}

        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <FieldLabel>Job Title *</FieldLabel>
              <input placeholder="e.g. Senior Python Developer" value={form.title} onChange={setF("title")} />
            </div>
            <div>
              <FieldLabel>Job Description</FieldLabel>
              <textarea rows={5}
                placeholder="Describe the role, responsibilities, and requirements…"
                value={form.description} onChange={setF("description")} />
            </div>
            <div>
              <FieldLabel>Required Skills &amp; Weights (1 = nice to have · 10 = critical)</FieldLabel>
              <SkillWeightEditor skills={skills} setSkills={setSkills}
                description={form.description} title={form.title} />
            </div>
            <div>
              <FieldLabel>Minimum Experience (years)</FieldLabel>
              <input type="number" min="0" max="50" step="1" placeholder="2" value={form.min_experience}
                onChange={(e) => {
                  // Clamp to the backend's accepted range (0-50); never below 0.
                  const raw = e.target.value;
                  if (raw === "") { setForm((f) => ({ ...f, min_experience: "" })); return; }
                  const n = Math.max(0, Math.min(50, parseInt(raw, 10) || 0));
                  setForm((f) => ({ ...f, min_experience: n }));
                }} />
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input type="text" placeholder="e.g. Dhaka, Bangladesh / Remote"
                value={form.location} onChange={setF("location")} />
            </div>
            <div style={{
              border: `1px solid ${customMsg ? T.accentBd : T.border}`,
              borderRadius: "12px", padding: "14px",
              background: customMsg ? T.accentLo : T.surfaceHi,
              transition: "all .15s",
            }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "11px", cursor: "pointer" }}>
                <input type="checkbox" checked={customMsg}
                  onChange={e => setCustomMsg(e.target.checked)}
                  style={{ width: "16px", height: "16px", margin: "2px 0 0", padding: 0,
                    minWidth: "16px", flexShrink: 0, accentColor: T.accent, cursor: "pointer",
                    appearance: "auto", WebkitAppearance: "checkbox", border: "none", borderRadius: 0 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: T.text1 }}>
                    Custom announcement message
                  </span>
                  <span style={{ fontSize: "11.5px", color: T.text3, lineHeight: 1.45 }}>
                    Off → the default template is posted to Telegram / LinkedIn. Turn on to write your own.
                  </span>
                </span>
              </label>
              {customMsg && (
                <div style={{ marginTop: "12px" }}>
                  <textarea rows={6}
                    placeholder="Write your announcement here. You can use the placeholders below and they'll be filled in automatically."
                    value={form.post_message} onChange={setF("post_message")}
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit",
                      fontSize: "13px", lineHeight: 1.5, padding: "11px 12px", borderRadius: "9px",
                      border: `1px solid ${T.border}`, background: T.surface, color: T.text1,
                      resize: "vertical", outline: "none" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center",
                    gap: "6px", marginTop: "9px" }}>
                    <span style={{ fontSize: "11px", color: T.text3, marginRight: "2px" }}>Placeholders:</span>
                    {["{title}", "{location}", "{experience}", "{skills}", "{description}", "{apply_url}"].map(p => (
                      <code key={p} style={{
                        fontSize: "11px", fontFamily: "ui-monospace, monospace",
                        padding: "2px 7px", borderRadius: "6px",
                        background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.text2,
                      }}>{p}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Customize the candidate emails (interview invite + rejection) */}
            <div style={{
              border: `1px solid ${customEmails ? T.accentBd : T.border}`,
              borderRadius: "12px", padding: "14px",
              background: customEmails ? T.accentLo : T.surfaceHi, transition: "all .15s",
            }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "11px", cursor: "pointer" }}>
                <input type="checkbox" checked={customEmails}
                  onChange={e => setCustomEmails(e.target.checked)}
                  style={{ width: "16px", height: "16px", margin: "2px 0 0", padding: 0, minWidth: "16px",
                    flexShrink: 0, accentColor: T.accent, cursor: "pointer", appearance: "auto",
                    WebkitAppearance: "checkbox", border: "none", borderRadius: 0 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: T.text1 }}>Custom candidate emails</span>
                  <span style={{ fontSize: "11.5px", color: T.text3, lineHeight: 1.45 }}>
                    Off → the built-in interview &amp; rejection emails are used. Turn on to write your own.
                  </span>
                </span>
              </label>
              {customEmails && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <FieldLabel>Interview invite message</FieldLabel>
                    <textarea rows={4}
                      placeholder="Dear {name}, you're invited for the {job_title} interview on {interview_time}…"
                      value={form.interview_message} onChange={setF("interview_message")}
                      style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
                        lineHeight: 1.5, padding: "11px 12px", borderRadius: "9px", border: `1px solid ${T.border}`,
                        background: T.surface, color: T.text1, resize: "vertical", outline: "none" }} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
                      <span style={{ fontSize: "11px", color: T.text3 }}>Placeholders:</span>
                      {["{name}", "{job_title}", "{score}", "{interview_time}", "{meet_link}"].map(p => (
                        <code key={p} style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", padding: "2px 7px",
                          borderRadius: "6px", background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.text2 }}>{p}</code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Rejection message</FieldLabel>
                    <textarea rows={4}
                      placeholder="Dear {name}, thank you for applying for {job_title}…"
                      value={form.rejection_message} onChange={setF("rejection_message")}
                      style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
                        lineHeight: 1.5, padding: "11px 12px", borderRadius: "9px", border: `1px solid ${T.border}`,
                        background: T.surface, color: T.text1, resize: "vertical", outline: "none" }} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px" }}>
                      <span style={{ fontSize: "11px", color: T.text3 }}>Placeholders:</span>
                      {["{name}", "{job_title}"].map(p => (
                        <code key={p} style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", padding: "2px 7px",
                          borderRadius: "6px", background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.text2 }}>{p}</code>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Btn onClick={submit} disabled={saving || !form.title.trim()} variant="primary" size="lg">
              {saving ? <><Spinner size={14} color={T.bg} /> Creating…</> : <><Icon.briefcase width={15} height={15} /> Create Job</>}
            </Btn>
          </div>
        </Card>
      </div>

      {/* Jobs List */}
      <div>
        <SectionHead>Active Jobs ({jobs.length})</SectionHead>
        {jobs.length === 0
          ? <EmptyState icon={<Icon.briefcase width={36} height={36} style={{ color: T.text3 }} />} title="No jobs yet" sub="Create your first job posting above" />
          : (
            <div style={{ display: "grid", gap: "10px" }}>
              {jobs.map(j => {
                const weighted = jobToSkillList(j);
                const isEditing = editing === j.id;
                return (
                  <Card key={j.id} style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px" }}>{j.title}</div>
                      <Btn size="sm" variant={isEditing ? "secondary" : "ghost"}
                        onClick={() => setEditing(isEditing ? null : j.id)}>
                        {isEditing ? "Close" : "Edit skills"}
                      </Btn>
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <Badge label={`${j.min_experience || 0}+ yrs`} color={T.text2} bg={T.surfaceHi} border={T.border} />
                      <Badge label={j.status || "active"} color={T.green} bg={T.greenLo} border={T.greenBd} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: j.description ? "8px" : 0 }}>
                      {weighted.map(s => <WeightedSkillPill key={s.name} name={s.name} weight={s.weight} />)}
                    </div>
                    {j.description && (
                      <div style={{ color: T.text3, fontSize: "12px", lineHeight: 1.6, marginTop: "6px" }}>
                        {j.description.slice(0, 130)}{j.description.length > 130 ? "…" : ""}
                      </div>
                    )}
                    {isEditing && (
                      <JobSkillsEditor job={j} onSaved={() => { setEditing(null); onRefresh?.(); }} />
                    )}
                  </Card>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

/* ─── EVALUATION TAB (benchmark & scoring accuracy) ───────────────────── */
function EvaluationTab() {
  const { handleLogout } = useAuth();
  const onUnauthed = useCallback(() => handleLogout(), [handleLogout]);

  const [sub,          setSub]          = useState("overview");
  const [evalData,     setEvalData]     = useState(null);
  const [ablationData, setAblationData] = useState(null);
  const [perSample,    setPerSample]    = useState([]);
  const [seeding,      setSeeding]      = useState(false);
  const [running,      setRunning]      = useState(false);
  const [seedMsg,      setSeedMsg]      = useState(null);
  const [err,          setErr]          = useState(null);
  const [datasetSize,  setDatasetSize]  = useState(null);

  const seedDataset = async () => {
    setSeeding(true); setErr(null); setSeedMsg(null);
    try {
      const r = await api("/evaluation/seed-dataset", { method: "POST" }, onUnauthed);
      setSeedMsg(r.message || `Seeded ${r.seeded ?? ""} labelled CV-job pairs`);
    } catch (e) { setErr(e.message); }
    finally { setSeeding(false); }
  };

  const runEvaluation = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await api("/evaluation/run", { method: "POST" }, onUnauthed);
      setEvalData(r);
      const [samples, abl] = await Promise.all([
        api("/evaluation/results", {}, onUnauthed),
        api("/evaluation/ablation", {}, onUnauthed),
      ]);
      setPerSample(Array.isArray(samples) ? samples : []);
      setAblationData(abl);
      if (abl?.dataset_size) setDatasetSize(abl.dataset_size);
      setSub("overview");
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };

  useEffect(() => {
    Promise.all([
      api("/evaluation/results", {}, onUnauthed).catch(() => []),
      api("/evaluation/ablation", {}, onUnauthed).catch(() => null),
    ]).then(([samples, abl]) => {
      setPerSample(Array.isArray(samples) ? samples : []);
      setAblationData(abl);
      if (abl?.dataset_size) setDatasetSize(abl.dataset_size);
    });
  }, []); // eslint-disable-line

  /* sub-tab pill */
  const SubPill = ({ id, label }) => (
    <button onClick={() => setSub(id)} style={{
      padding: "6px 16px", borderRadius: "7px",
      border: sub === id ? `1px solid ${T.accentBd}` : `1px solid transparent`,
      background: sub === id ? T.accentLo : "transparent",
      color: sub === id ? T.accent : T.text3,
      cursor: "pointer", fontSize: "13px", fontWeight: 600,
      fontFamily: "inherit", transition: "all .15s",
    }}>{label}</button>
  );

  /* metric card */
  const MetricCard = ({ label, value, Ic, color, note }) => (
    <Card style={{ padding: "22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color, borderRadius: "12px 12px 0 0",
      }} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px", color }}>
        <Ic width={20} height={20} />
      </div>
      <div style={{
        color, fontSize: "32px", fontWeight: 700, lineHeight: 1,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value != null ? value : "—"}
      </div>
      <div style={{
        color: T.text2, fontSize: "11px", fontWeight: 600,
        marginTop: "6px", textTransform: "uppercase", letterSpacing: ".5px",
      }}>{label}</div>
      {note && <div style={{ color: T.text3, fontSize: "11px", marginTop: "3px" }}>{note}</div>}
    </Card>
  );

  /* confusion matrix 2x2 */
  const ConfusionMatrix = ({ cm }) => {
    if (!cm) return null;
    const { TP = 0, TN = 0, FP = 0, FN = 0 } = cm;
    const total = TP + TN + FP + FN;
    const cells = [
      { abbr: "TP", val: TP, color: T.green,  bg: T.greenLo,  border: T.greenBd,  desc: "Correctly Shortlisted" },
      { abbr: "FP", val: FP, color: T.amber,  bg: T.amberLo,  border: T.amberBd,  desc: "Wrongly Shortlisted" },
      { abbr: "FN", val: FN, color: T.red,    bg: T.redLo,    border: T.redBd,    desc: "Wrongly Rejected" },
      { abbr: "TN", val: TN, color: T.accent, bg: T.accentLo, border: T.accentBd, desc: "Correctly Rejected" },
    ];
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
          <div />
          <div style={{ textAlign: "center", color: T.text3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>Predicted: Shortlisted</div>
          <div style={{ textAlign: "center", color: T.text3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>Predicted: Rejected</div>
        </div>
        {[["Actual: Shortlisted", 0, 1], ["Actual: Rejected", 2, 3]].map(([rowLabel, a, b]) => (
          <div key={rowLabel} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: "4px", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "10px" }}>
              <span style={{ color: T.text3, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", textAlign: "right" }}>{rowLabel}</span>
            </div>
            {[cells[a], cells[b]].map(c => (
              <div key={c.abbr} style={{
                background: c.bg, border: `2px solid ${c.border}`,
                borderRadius: "10px", padding: "16px 12px", textAlign: "center",
              }}>
                <div style={{ color: c.color, fontSize: "34px", fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{c.val}</div>
                <div style={{ color: c.color, fontSize: "11px", fontWeight: 700, marginTop: "5px" }}>{c.abbr}</div>
                <div style={{ color: T.text3, fontSize: "10px", marginTop: "2px" }}>{c.desc}</div>
                {total > 0 && <div style={{ color: T.text3, fontSize: "9px", marginTop: "2px" }}>{(c.val / total * 100).toFixed(1)}%</div>}
              </div>
            ))}
          </div>
        ))}
        <div style={{ textAlign: "center", marginTop: "8px", color: T.text3, fontSize: "11px" }}>
          Total: <strong style={{ color: T.text2 }}>{total}</strong> samples evaluated
        </div>
      </div>
    );
  };

  /* ── Overview pane ── */
  const OverviewPane = () => (
    <div style={{ display: "grid", gap: "22px" }}>
      {evalData ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricCard label="Accuracy"  value={evalData.accuracy_pct  != null ? `${evalData.accuracy_pct}%`  : null} Ic={Icon.target} color={T.green}  note={`${evalData.correct_predictions ?? ""}/${evalData.total_samples ?? ""} correct`} />
            <MetricCard label="Precision" value={evalData.precision_pct != null ? `${evalData.precision_pct}%` : null} Ic={Icon.search} color={T.accent} note="Of predicted positives" />
            <MetricCard label="Recall"    value={evalData.recall_pct    != null ? `${evalData.recall_pct}%`    : null} Ic={Icon.radar}  color={T.amber}  note="Of actual positives" />
            <MetricCard label="F1 Score"  value={evalData.f1_score      != null ? `${evalData.f1_score}%`      : null} Ic={Icon.zap}    color={T.purple} note="Harmonic mean P+R" />
          </div>
          <Card style={{ padding: "24px" }}>
            <SectionHead>Confusion Matrix</SectionHead>
            <ConfusionMatrix cm={evalData.confusion_matrix} />
          </Card>
        </>
      ) : (
        <EmptyState icon={<Icon.chart width={36} height={36} style={{ color: T.text3 }} />} title="No evaluation data yet" sub="Seed the dataset and run evaluation to see metrics" />
      )}
    </div>
  );

  /* ── Ablation pane ── */
  const AblationPane = () => {
    if (!ablationData) return <EmptyState icon={<Icon.flask width={36} height={36} style={{ color: T.text3 }} />} title="No ablation data yet" sub="Run evaluation first" />;
    const rows = ablationData.ablation || [];
    const PROPOSED = "Proposed (50/30/20)";
    const bestF1 = rows.length ? Math.max(...rows.map(r => parseFloat(r.f1_score) || 0)) : 0;
    return (
      <div style={{ display: "grid", gap: "18px" }}>
        {ablationData.best_config && (
          <div style={{
            padding: "14px 18px",
            background: T.greenLo, border: `1px solid ${T.greenBd}`,
            borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <Icon.trophy width={20} height={20} style={{ color: T.green, flexShrink: 0 }} />
            <div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: "14px" }}>Best Config: {ablationData.best_config}</div>
              {ablationData.conclusion && <div style={{ color: T.text3, fontSize: "12px", marginTop: "2px" }}>{ablationData.conclusion}</div>}
            </div>
          </div>
        )}
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surfaceHi }}>
                {["Configuration", "Skill Wt", "Exp Wt", "TF-IDF Wt", "Accuracy", "Precision", "Recall", "F1 Score", ""].map(h => (
                  <th key={h} style={{
                    textAlign: h === "Configuration" ? "left" : "center",
                    padding: "11px 12px", color: T.text3,
                    fontSize: "10px", letterSpacing: ".5px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isProposed = row.config === PROPOSED;
                const isBest = parseFloat(row.f1_score) === bestF1 && bestF1 > 0;
                return (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${T.border}`,
                    background: isProposed
                      ? T.greenLo
                      : i % 2 === 0 ? "transparent" : T.surfaceHi,
                  }}>
                    <td style={{ padding: "13px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: isProposed ? T.green : T.text2, fontWeight: isProposed ? 700 : 500, fontSize: "13px" }}>
                          {row.config}
                        </span>
                        {isProposed && <Badge label="PROPOSED" color={T.green}  bg={T.greenLo} border={T.greenBd} />}
                        {isBest     && <Badge label="BEST"     color={T.amber}  bg={T.amberLo} border={T.amberBd} />}
                      </div>
                    </td>
                    {[
                      row.weights?.skill       != null ? `${(row.weights.skill       * 100).toFixed(0)}%` : "—",
                      row.weights?.experience  != null ? `${(row.weights.experience  * 100).toFixed(0)}%` : "—",
                      row.weights?.tfidf       != null ? `${(row.weights.tfidf       * 100).toFixed(0)}%` : "—",
                    ].map((v, j) => (
                      <td key={j} style={{ padding: "13px 12px", textAlign: "center", color: T.text3, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>{v}</td>
                    ))}
                    {[
                      { v: row.accuracy_pct,  c: T.green  },
                      { v: row.precision_pct, c: T.accent },
                      { v: row.recall_pct,    c: T.amber  },
                      { v: row.f1_score,      c: T.purple },
                    ].map(({ v, c }, j) => (
                      <td key={j} style={{ padding: "13px 12px", textAlign: "center" }}>
                        <span style={{
                          color: isProposed || isBest ? c : T.text2,
                          fontWeight: isProposed || isBest ? 700 : 400,
                          fontSize: "13px", fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {v != null ? `${v}%` : "—"}
                        </span>
                      </td>
                    ))}
                    <td style={{ padding: "13px 12px", textAlign: "center" }}>
                      {isProposed && <Icon.star width={13} height={13} style={{ color: T.amber, display: "inline-block" }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {/* Side-by-side confusion matrices for Proposed vs Equal */}
        {rows.filter(r => r.confusion).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {rows
              .filter(r => r.config === PROPOSED || r.config === "Equal Weights (33/33/34)")
              .filter(r => r.confusion)
              .map(r => (
                <Card key={r.config} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", marginBottom: "14px", color: r.config === PROPOSED ? T.green : T.text2 }}>
                    {r.config === PROPOSED && <Icon.star width={13} height={13} style={{ color: T.amber }} />}
                    {r.config}
                  </div>
                  <ConfusionMatrix cm={r.confusion} />
                </Card>
              ))}
          </div>
        )}
      </div>
    );
  };

  /* ── Per-Sample pane ── */
  const PerSamplePane = () => {
    const [filter, setFilter] = useState("all");
    if (!perSample.length) return <EmptyState icon={<Icon.list width={36} height={36} style={{ color: T.text3 }} />} title="No per-sample results yet" sub="Run evaluation to see individual CV results" />;
    const correct   = perSample.filter(r => r.is_correct).length;
    const incorrect = perSample.length - correct;
    const filtered  = filter === "correct" ? perSample.filter(r => r.is_correct)
                    : filter === "incorrect" ? perSample.filter(r => !r.is_correct)
                    : perSample;
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {[
            { id: "all",       label: `All (${perSample.length})`, Ic: null },
            { id: "correct",   label: `Correct (${correct})`, Ic: Icon.check },
            { id: "incorrect", label: `Wrong (${incorrect})`, Ic: Icon.xCircle },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "6px 14px", borderRadius: "7px",
              border: filter === f.id ? `1px solid ${T.accentBd}` : `1px solid transparent`,
              background: filter === f.id ? T.accentLo : "transparent",
              color: filter === f.id ? T.accent : T.text3,
              cursor: "pointer", fontSize: "12px", fontWeight: 600,
              fontFamily: "inherit", transition: "all .15s",
            }}>{f.Ic && <f.Ic width={12} height={12} />}{f.label}</button>
          ))}
          <span style={{ marginLeft: "auto", color: T.text3, fontSize: "12px" }}>
            Accuracy: <strong style={{ color: T.green }}>{(correct / perSample.length * 100).toFixed(1)}%</strong>
          </span>
        </div>
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surfaceHi }}>
                {["#", "CV Snippet", "Ground Truth", "Predicted", "Score", "Skill%", "Exp%", "TF-IDF%", "Result"].map(h => (
                  <th key={h} style={{
                    textAlign: h === "CV Snippet" ? "left" : "center",
                    padding: "10px 11px", color: T.text3,
                    fontSize: "10px", letterSpacing: ".5px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: r.is_correct ? T.greenLo : T.redLo,
                  opacity: r.is_correct ? 1 : .85,
                }}>
                  <td style={{ padding: "10px 11px", textAlign: "center", color: T.text3, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</td>
                  <td style={{ padding: "10px 11px", maxWidth: "180px" }}>
                    <div style={{ color: T.text2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cv_text}>
                      {(r.cv_text || "").slice(0, 55).replace(/\n/g, " ")}…
                    </div>
                  </td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}><StatusBadge status={r.ground_truth_label === "shortlisted" ? "shortlisted" : "rejected"} /></td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}><StatusBadge status={r.predicted_label  === "shortlisted" ? "shortlisted" : "rejected"} /></td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}>
                    <span style={{
                      color: r.predicted_score >= 70 ? T.green : r.predicted_score >= 50 ? T.amber : T.red,
                      fontWeight: 700, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace",
                    }}>{r.predicted_score != null ? `${parseFloat(r.predicted_score).toFixed(1)}%` : "—"}</span>
                  </td>
                  {[r.skill_score, r.experience_score, r.tfidf_score].map((v, j) => (
                    <td key={j} style={{ padding: "10px 11px", textAlign: "center", color: T.text3, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
                      {v != null ? `${parseFloat(v).toFixed(1)}%` : "—"}
                    </td>
                  ))}
                  <td style={{ padding: "10px 11px", textAlign: "center" }}>
                    {r.is_correct
                      ? <Icon.check width={15} height={15} style={{ color: T.green, display: "inline-block" }} />
                      : <Icon.xCircle width={15} height={15} style={{ color: T.red, display: "inline-block" }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Action bar */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: T.text1, marginBottom: "3px", display: "flex", alignItems: "center", gap: "7px" }}>
              <Icon.flask width={15} height={15} style={{ color: T.accent }} /> Matching Evaluation Suite
            </div>
            <div style={{ color: T.text3, fontSize: "12px" }}>
              50-sample labelled dataset · 6-config ablation · per-CV results table
              {datasetSize && <span style={{ color: T.accent, marginLeft: "10px" }}>Dataset: {datasetSize} samples</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <Btn onClick={seedDataset} disabled={seeding} variant="secondary">
              {seeding ? <><Spinner size={13} /> Seeding…</> : <><Icon.seedling width={14} height={14} /> Seed Dataset</>}
            </Btn>
            <Btn onClick={runEvaluation} disabled={running} variant="primary">
              {running ? <><Spinner size={13} color={T.bg} /> Evaluating…</> : <><Icon.play width={13} height={13} /> Run Evaluation</>}
            </Btn>
          </div>
        </div>
        {seedMsg && <div style={{ marginTop: "12px" }}><Alert type="success"><Icon.check width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{seedMsg}</Alert></div>}
        {err     && <div style={{ marginTop: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}
      </Card>

      {/* Sub-tab pills */}
      <div style={{ display: "flex", gap: "6px" }}>
        <SubPill id="overview"  label="Metrics & Confusion Matrix" />
        <SubPill id="ablation"  label="Ablation Study (6 configs)" />
        <SubPill id="perSample" label={`Per-Sample Results${perSample.length ? ` (${perSample.length})` : ""}`} />
      </div>

      <div className="fade-in" key={sub}>
        {sub === "overview"  && <OverviewPane />}
        {sub === "ablation"  && <AblationPane />}
        {sub === "perSample" && <PerSamplePane />}
      </div>
    </div>
  );
}

/* ─── NAVIGATION ──────────────────────────────────────────────────────── */
const TABS = [
  { id: "upload",     label: "CV Upload",   icon: Icon.fileText,  group: "Recruiting" },
  { id: "match",      label: "AI Match",    icon: Icon.target,    group: "Recruiting" },
  { id: "posting",    label: "Job Posting", icon: Icon.megaphone, group: "Recruiting" },
  { id: "interviews", label: "Interviews",  icon: Icon.calendar,  group: "Recruiting" },
  { id: "candidates", label: "Candidates",  icon: Icon.user,      group: "Manage"     },
  { id: "jobs",       label: "Jobs",        icon: Icon.briefcase, group: "Manage"     },
  { id: "analytics",  label: "Analytics",   icon: Icon.chart,     group: "Insights"   },
  { id: "evaluation", label: "Evaluation",  icon: Icon.flask,     group: "Insights"   },
];
const NAV_GROUPS = ["Recruiting", "Manage", "Insights"];

const TAB_DESC = {
  upload:     "Upload CVs (PDF or DOCX) — AI automatically extracts name, skills, experience, and education",
  match:      "Run AI matching against a job — shortlisted candidates automatically receive interview invitations",
  posting:    "Broadcast job listings to LinkedIn, Telegram, Bdjobs, X/Twitter, or a custom webhook",
  interviews: "View scheduled interviews and monitor email delivery logs",
  candidates: "Browse all candidates, filter by status, review AI analysis, and resend communications",
  jobs:       "Create and manage your open job positions",
  analytics:  "Full recruiting pipeline analytics — funnel metrics, score distribution, top skills, and job performance",
  evaluation: "Benchmark the matching engine — seed a 50-sample labelled dataset, run evaluation, view Accuracy / Precision / Recall / F1, confusion matrix, 6-config ablation study, and per-CV results",
};

/* ══════════════════════════════════════════════════════════════════════════
   PART 2 — AUTH COMPONENTS
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── ROLE BADGE ──────────────────────────────────────────────────────── */
/* UserMenu extracted to ./layout/UserMenu — decomposition phase 2 */
import { UserMenu } from "./layout/UserMenu";

/* RoleBadge extracted to ./layout/RoleBadge — decomposition phase 2 */
import { RoleBadge } from "./layout/RoleBadge";

/* ─── REGISTER USER MODAL (admin only) ───────────────────────────────── */
/* RegisterModal extracted to ./auth/RegisterModal — decomposition phase 2 */
import { RegisterModal } from "./auth/RegisterModal";

/* ─── EDIT PROFILE MODAL ─────────────────────────────────────────────── */
/* ProfileModal extracted to ./auth/ProfileModal — decomposition phase 2 */
import { ProfileModal } from "./auth/ProfileModal";

/* ─── LOGIN PAGE ─────────────────────────────────────────────────────── */
/* ─── NOTIFICATION BELL ───────────────────────────────────────────────── */
/* NotificationBell extracted to ./notifications/NotificationBell — phase 2 */
import { NotificationBell } from "./notifications/NotificationBell";

/* LoginPage extracted to ./auth/LoginPage — decomposition phase 2 */
import { LoginPage } from "./auth/LoginPage";

/* ─── SIDEBAR NAV ITEM ────────────────────────────────────────────────── */
/* NavItem extracted to ./layout/NavItem — decomposition phase 2 */
import { NavItem } from "./layout/NavItem";

/* ─── APP ROOT ────────────────────────────────────────────────────────── */
export default function App() {
  const [tab,     setTab]     = useState("upload");
  const [stats,   setStats]   = useState(null);
  const [jobs,    setJobs]    = useState([]);
  const [key,     setKey]     = useState(0);
  const [navOpen, setNavOpen] = useState(true);
  const sidebarW = navOpen ? 232 : 68;
  // Persists across renders (unlike a plain let) so scheduleExpiry can clear
  // a previously scheduled timer instead of leaking one on every login.
  const refreshTimerRef = useRef(null);

  // ── Auth state ────────────────────────────────────────────────────────
  const [authed,      setAuthed]      = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showRegModal,     setShowRegModal]     = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const onUnauthed = useCallback(() => { setAuthed(false); setCurrentUser(null); }, []);

  // ── Schedule proactive logout 5 min before token expiry ───────────────
  const scheduleExpiry = useCallback((token) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const payload = decodeJWT(token);
    if (!payload?.exp) return;
    const msLeft    = payload.exp * 1000 - Date.now();
    const warnAt    = Math.max(msLeft - 5 * 60 * 1000, 10_000);
    refreshTimerRef.current = setTimeout(() => {
      clearToken();
      setAuthed(false);
      setCurrentUser(null);
    }, warnAt);
  }, []);

  const handleLogin = useCallback((token, user) => {
    setToken(token);
    setAuthed(true);
    setCurrentUser(user);
    scheduleExpiry(token);
  }, [scheduleExpiry]);

  const handleLogout = useCallback(() => {
    clearToken();
    setAuthed(false);
    setCurrentUser(null);
    setStats(null);
    setJobs([]);
  }, []);

  const refresh = useCallback(() => setKey(k => k + 1), []);

  // ── Fetch dashboard data once authenticated ───────────────────────────
  useEffect(() => {
    if (!authed) return;
    Promise.all([
      api("/stats", {}, onUnauthed),
      api("/jobs",  {}, onUnauthed),
    ]).then(([s, j]) => { setStats(s); setJobs(j); }).catch(() => {});
  }, [key, authed, onUnauthed]);

  // ── /auth/me on load — verify token + hydrate user profile ───────────
  // (Runs once; LoginPage also handles this for the initial cold-load path)
  useEffect(() => {
    const token = getToken();
    if (!token || authed) return;
    api("/auth/me", {}, onUnauthed)
      .then(user => {
        setCurrentUser(user);
        setAuthed(true);
        scheduleExpiry(token);
      })
      .catch(() => { clearToken(); });
  }, []); // eslint-disable-line

  // ── Auth Context value ────────────────────────────────────────────────
  const authCtxValue = {
    currentUser,
    isAdmin: currentUser?.role === "admin",
    handleLogout,
    handleLogin,
  };

  // ── Protected route guard ─────────────────────────────────────────────
  if (!authed) return (
    <AuthContext.Provider value={authCtxValue}>
      <LoginPage onLogin={handleLogin} />
    </AuthContext.Provider>
  );

  return (
    <AuthContext.Provider value={authCtxValue}>
      {currentUser?.must_change_password && (
        <ForceChangePasswordModal
          onChanged={() => setCurrentUser(u => ({ ...u, must_change_password: false }))}
          onLogout={handleLogout}
        />
      )}

      {showRegModal && (
        <RegisterModal
          onClose={() => setShowRegModal(false)}
          onSuccess={() => { setShowRegModal(false); }}
        />
      )}

      {showProfileModal && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onSaved={updated => setCurrentUser(updated)}
        />
      )}

      <div style={{ minHeight: "100vh", background: T.bg }}>
        <style>{GLOBAL_CSS}</style>

        {/* ── SIDEBAR ── */}
        <aside style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
          width: sidebarW,
          background: T.surface,
          borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column",
          transition: "width .2s ease",
        }}>
          {/* Collapse toggle — floating on the sidebar edge */}
          <button
            onClick={() => setNavOpen(o => !o)}
            title={navOpen ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              position: "absolute", right: -12, top: 24, zIndex: 110,
              width: 24, height: 24, borderRadius: "50%",
              background: T.surface, border: `1px solid ${T.borderHi}`,
              boxShadow: "0 2px 8px rgba(22,35,58,.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: navOpen ? "none" : "rotate(180deg)", transition: "transform .2s" }}>
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>

          {/* Logo */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            justifyContent: navOpen ? "flex-start" : "center",
            padding: navOpen ? "0 16px" : 0,
            minHeight: 64, flexShrink: 0,
            borderBottom: `1px solid ${T.border}`,
          }}>
            <Logo size={30} />
            {navOpen && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1, color: T.text1, letterSpacing: "-.2px" }}>
                  Hirelay
                </div>
                <div style={{ color: T.text3, fontSize: "10px", marginTop: "1px" }}>Recruiting Platform</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {NAV_GROUPS.map(group => (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "10px" }}>
                {navOpen ? (
                  <div style={{
                    color: T.text3, fontSize: "10px", fontWeight: 700,
                    letterSpacing: "1px", textTransform: "uppercase",
                    padding: "0 12px", marginBottom: "4px",
                  }}>{group}</div>
                ) : (
                  <div style={{ height: 1, background: T.border, margin: "2px 10px 6px" }} />
                )}
                {TABS.filter(t => t.group === group).map(t => (
                  <NavItem key={t.id} t={t} active={tab === t.id} expanded={navOpen} onClick={() => setTab(t.id)} />
                ))}
              </div>
            ))}
          </nav>

          {/* Status + user block */}
          <div style={{ padding: "10px 8px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            {navOpen && (stats?.ai_enabled || stats?.email_enabled) && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "0 4px", marginBottom: "10px" }}>
                {stats?.ai_enabled    && <Badge label="AI Active"   color={T.green}  bg={T.greenLo}  border={T.greenBd} />}
                {stats?.email_enabled && <Badge label="SMTP Active" color={T.accent} bg={T.accentLo} border={T.accentBd} />}
              </div>
            )}
            {currentUser && <UserMenu
              user={currentUser}
              onAddUser={() => setShowRegModal(true)}
              onEditProfile={() => setShowProfileModal(true)}
              onLogout={handleLogout}
              up fullWidth compact={!navOpen}
            />}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div style={{ marginLeft: sidebarW, transition: "margin-left .2s ease" }}>
        <main style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 60px" }}>
          <StatsBar stats={stats} />

          <Card style={{ overflow: "hidden" }}>
            {/* Tab Header */}
            <div style={{
              padding: "18px 26px 16px",
              borderBottom: `1px solid ${T.border}`,
              background: T.surfaceHi,
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
                  {(() => {
                    const ActiveIcon = TABS.find(t => t.id === tab)?.icon;
                    return ActiveIcon ? <ActiveIcon width={17} height={17} style={{ color: T.accent }} /> : null;
                  })()}
                  <h2 style={{ fontWeight: 700, fontSize: "16px", color: T.text1 }}>
                    {TABS.find(t => t.id === tab)?.label}
                  </h2>
                </div>
                <p style={{ color: T.text3, fontSize: "13px", lineHeight: 1.5 }}>{TAB_DESC[tab]}</p>
              </div>
              <NotificationBell />
            </div>

            {/* Tab Body */}
            <div className="fade-up" key={tab} style={{ padding: "26px" }}>
              {tab === "upload"     && <UploadZone    onSuccess={refresh} />}
              {tab === "match"      && <MatchPanel    jobs={jobs} onRefresh={refresh} emailEnabled={stats?.email_enabled} />}
              {tab === "posting"    && <JobPostingTab jobs={jobs} onRefresh={refresh} />}
              {tab === "interviews" && <InterviewsTab refresh={key} />}
              {tab === "candidates" && <CandidatesTab refresh={key} jobs={jobs} />}
              {tab === "jobs"       && <JobsTab       jobs={jobs} onRefresh={refresh} />}
              {tab === "analytics"  && <Analytics />}
              {tab === "evaluation" && <EvaluationTab />}
            </div>
          </Card>
        </main>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
