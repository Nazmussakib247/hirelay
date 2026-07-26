/* Jobs feature: create-job form (with weighted skills, custom announcement and
   custom candidate emails) + active-jobs list with inline skill editing.
   Extracted from App.jsx (frontend decomposition, phase 3). Behaviour unchanged.

   Only JobsTab is exported; the helpers and sub-editors are internal to this
   module because nothing outside the jobs feature uses them. */

import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/context";
import { T, Icon } from "../../ui/foundation";
import { Btn, Spinner, Alert, Card, Badge, FieldLabel, SectionHead, EmptyState } from "../../ui/primitives";

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

export function JobsTab({ jobs, onRefresh }) {
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
  const { handleLogout, isAdmin } = useAuth();
  const [jobBusy, setJobBusy] = useState(null); // job id with a status/delete action in flight

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Admin: pause (close) / reopen (activate) / delete a job. A closed job
  // disappears from the public apply page and is skipped by new posts.
  const setJobStatus = async (jobId, status) => {
    setJobBusy(jobId);
    try {
      await api(`/jobs/${jobId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, handleLogout);
      onRefresh?.();
    } catch (e) { alert(`Could not update job: ${e.message}`); }
    finally { setJobBusy(null); }
  };
  const deleteJob = async (jobId, title) => {
    if (!window.confirm(`Delete "${title}"? This removes the job and unlinks its candidates. This cannot be undone.`)) return;
    setJobBusy(jobId);
    try {
      await api(`/jobs/${jobId}`, { method: "DELETE" }, handleLogout);
      onRefresh?.();
    } catch (e) { alert(`Could not delete job: ${e.message}`); }
    finally { setJobBusy(null); }
  };

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
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Btn size="sm" variant={isEditing ? "secondary" : "ghost"}
                          onClick={() => setEditing(isEditing ? null : j.id)}>
                          {isEditing ? "Close" : "Edit skills"}
                        </Btn>
                        {isAdmin && (j.status === "active" ? (
                          <Btn size="sm" variant="ghost" disabled={jobBusy === j.id}
                            onClick={() => setJobStatus(j.id, "closed")}
                            title="Pause — hide from the apply page & new posts">
                            {jobBusy === j.id ? <Spinner size={11} /> : "⏸ Pause"}
                          </Btn>
                        ) : (
                          <Btn size="sm" variant="success" disabled={jobBusy === j.id}
                            onClick={() => setJobStatus(j.id, "active")}
                            title="Reopen — accept applications again">
                            {jobBusy === j.id ? <Spinner size={11} /> : "▶ Reopen"}
                          </Btn>
                        ))}
                        {isAdmin && (
                          <Btn size="sm" variant="danger" disabled={jobBusy === j.id}
                            onClick={() => deleteJob(j.id, j.title)} title="Delete job">
                            {jobBusy === j.id ? <Spinner size={11} color={T.red} /> : <Icon.trash width={12} height={12} />}
                          </Btn>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <Badge label={`${j.min_experience || 0}+ yrs`} color={T.text2} bg={T.surfaceHi} border={T.border} />
                      {j.status === "active"
                        ? <Badge label="active" color={T.green} bg={T.greenLo} border={T.greenBd} />
                        : <Badge label={j.status || "closed"} color={T.amber} bg={T.amberLo} border={T.amberBd} />}
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
