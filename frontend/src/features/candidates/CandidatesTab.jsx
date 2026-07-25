/* Candidates tab — filter/search/bulk actions, per-row status override,
   schedule-interview dialog, delete/re-upload, and a detail panel with parse
   confidence, AI summary, skills and HR notes. Extracted from App.jsx
   (frontend decomposition, phase 6 — final). Behaviour unchanged. */

import { useState, useEffect } from "react";
import { api, apiDownload } from "../../api/client";
import { useAuth } from "../../auth/context";
import { T, Icon } from "../../ui/foundation";
import { Card, Spinner, Alert, FieldLabel, StatusBadge, ScoreRing, SkillPill, EmptyState, Btn } from "../../ui/primitives";

export function CandidatesTab({ refresh, jobs }) {
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
