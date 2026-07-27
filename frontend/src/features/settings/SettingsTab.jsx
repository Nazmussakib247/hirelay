/* Settings feature: view & edit the global default message templates
   (interview invite, rejection, job announcement) and copy the public apply
   link. Saving stores the edited text as the new default; Reset restores the
   built-in defaults. Editing is admin-only; others get a read-only view. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/context";
import { T, Icon } from "../../ui/foundation";
import { Btn, Spinner, Alert, Card, FieldLabel, SectionHead, ConfirmModal } from "../../ui/primitives";

const FIELDS = [
  {
    key: "post_message",
    label: "Job Announcement",
    hint: "Posted to Telegram / LinkedIn / X and the webhook when a job has no custom message.",
    rows: 10,
    placeholders: ["{title}", "{location}", "{experience}", "{skills}", "{description}", "{apply_url}", "{contact_email}"],
  },
  {
    key: "interview_message",
    label: "Interview Invite Email",
    hint: "The intro paragraph of the shortlist email. The branded header, interview details and Join button are always added around it.",
    rows: 4,
    placeholders: ["{name}", "{job_title}", "{score}", "{interview_time}", "{meet_link}"],
  },
  {
    key: "rejection_message",
    label: "Rejection Email",
    hint: "The body of the polite rejection email.",
    rows: 4,
    placeholders: ["{name}", "{job_title}"],
  },
];

const taStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
  lineHeight: 1.55, padding: "11px 12px", borderRadius: "9px", border: `1px solid ${T.border}`,
  background: T.surface, color: T.text1, resize: "vertical", outline: "none",
};

function Placeholders({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px", alignItems: "center" }}>
      <span style={{ fontSize: "11px", color: T.text3 }}>Placeholders:</span>
      {items.map((p) => (
        <code key={p} style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", padding: "2px 7px",
          borderRadius: "6px", background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.text2 }}>{p}</code>
      ))}
    </div>
  );
}

export function SettingsTab() {
  const { handleLogout, isAdmin } = useAuth();
  const [form, setForm]   = useState(null); // { interview_message, rejection_message, post_message }
  const [meta, setMeta]   = useState(null); // { apply_url, defaults }
  const [loading, setLoad] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [done, setDone]   = useState(false);
  const [err,  setErr]    = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = async () => {
    setLoad(true); setErr(null);
    try {
      const d = await api("/settings/templates", {}, handleLogout);
      setForm({ interview_message: d.interview_message, rejection_message: d.rejection_message, post_message: d.post_message });
      setMeta({ apply_url: d.apply_url, defaults: d.defaults });
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setErr(null); setDone(false);
    try {
      const d = await api("/settings/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }, handleLogout);
      setForm({ interview_message: d.interview_message, rejection_message: d.rejection_message, post_message: d.post_message });
      setMeta({ apply_url: d.apply_url, defaults: d.defaults });
      setDone(true); setTimeout(() => setDone(false), 3000);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const resetAll = async () => {
    setResetting(true); setErr(null); setDone(false);
    try {
      const d = await api("/settings/templates/reset", { method: "POST" }, handleLogout);
      setForm({ interview_message: d.interview_message, rejection_message: d.rejection_message, post_message: d.post_message });
      setMeta({ apply_url: d.apply_url, defaults: d.defaults });
      setConfirmReset(false);
      setDone(true); setTimeout(() => setDone(false), 3000);
    } catch (e) { setErr(e.message); setConfirmReset(false); }
    finally { setResetting(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(meta.apply_url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked — user can select manually */ }
  };

  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}><Spinner size={22} /></div>;
  if (err && !form) return <Alert type="error">{err}</Alert>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "820px" }}>
      {/* Public apply link */}
      <div>
        <SectionHead>Public Apply Link</SectionHead>
        <Card style={{ padding: "18px" }}>
          <p style={{ margin: "0 0 10px", fontSize: "13px", color: T.text3, lineHeight: 1.5 }}>
            Share this link anywhere. Candidates see every open job and can apply with their CV — applications land in the pipeline as pending.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ flex: 1, minWidth: "240px", fontSize: "13px", fontFamily: "ui-monospace, monospace",
              padding: "10px 12px", borderRadius: "8px", background: T.surfaceHi, border: `1px solid ${T.border}`,
              color: T.text1, wordBreak: "break-all" }}>{meta?.apply_url}</code>
            <Btn onClick={copyLink} variant="secondary" size="sm">
              <Icon.copy width={13} height={13} /> {copied ? "Copied!" : "Copy"}
            </Btn>
            <a href={meta?.apply_url} target="_blank" rel="noreferrer">
              <Btn variant="secondary" size="sm"><Icon.globe width={13} height={13} /> Open</Btn>
            </a>
          </div>
        </Card>
      </div>

      {/* Default templates */}
      <div>
        <SectionHead>Default Templates</SectionHead>

        {done && <div style={{ marginBottom: "12px" }}><Alert type="success"><Icon.check width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />Saved. These are now the defaults.</Alert></div>}
        {err  && <div style={{ marginBottom: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}
        {!isAdmin && <div style={{ marginBottom: "12px" }}><Alert type="info">You can view the defaults here. Only an admin can edit and save them.</Alert></div>}

        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <FieldLabel>{f.label}</FieldLabel>
                <p style={{ margin: "0 0 8px", fontSize: "11.5px", color: T.text3, lineHeight: 1.45 }}>{f.hint}</p>
                <textarea rows={f.rows} value={form?.[f.key] ?? ""} disabled={!isAdmin}
                  onChange={setField(f.key)} style={{ ...taStyle, opacity: isAdmin ? 1 : 0.75 }} />
                <Placeholders items={f.placeholders} />
              </div>
            ))}

            {isAdmin && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderTop: `1px solid ${T.border}`, paddingTop: "16px" }}>
                <Btn onClick={save} disabled={saving || resetting} variant="primary" size="md">
                  {saving ? <><Spinner size={13} color={T.bg} /> Saving…</> : <><Icon.check width={14} height={14} /> Save as Default</>}
                </Btn>
                <Btn onClick={() => setConfirmReset(true)} disabled={saving || resetting} variant="secondary" size="md">
                  <Icon.refresh width={14} height={14} /> Reset to original
                </Btn>
              </div>
            )}
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={confirmReset}
        title="Reset templates?"
        message="Restore all three templates to the built-in defaults? Your saved edits will be discarded."
        confirmLabel="Reset to original"
        cancelLabel="Keep my edits"
        loading={resetting}
        onConfirm={resetAll}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
