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
/* UploadZone extracted to ./features/upload/UploadZone — decomposition phase 4 */
import { UploadZone } from "./features/upload/UploadZone";

/* MatchPanel extracted to ./features/matching/MatchPanel — decomposition phase 4 */
import { MatchPanel } from "./features/matching/MatchPanel";

/* ─── JOB POSTING TAB (extracted to ./features/posting/JobPostingTab) ───── */
import { JobPostingTab } from "./features/posting/JobPostingTab";

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

/* ─── JOBS TAB (extracted to ./features/jobs/JobsTab — phase 3) ────────────
   The jobs feature — skillsToPayload/jobToSkillList helpers, SkillWeightEditor,
   JobSkillsEditor and JobsTab — now lives in its own module. */
import { JobsTab } from "./features/jobs/JobsTab";

/* ─── EVALUATION TAB (extracted to ./features/evaluation/EvaluationTab) ─── */
import { EvaluationTab } from "./features/evaluation/EvaluationTab";

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
