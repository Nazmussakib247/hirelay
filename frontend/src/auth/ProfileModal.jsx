/* Edit-profile modal. Extracted from App.jsx (frontend decomposition, phase 2). */

import { useState } from "react";
import { api } from "../api/client";
import { T, Icon } from "../ui/foundation";
import { Alert, FieldLabel, Btn, Spinner } from "../ui/primitives";

export function ProfileModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name:  user.full_name  || "",
    job_title:  user.job_title  || "",
    department: user.department || "",
    phone:      user.phone      || "",
  });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const [done, setDone] = useState(false);

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      // Empty strings are sent as null so fields can be cleared.
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() || null])
      );
      const updated = await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setDone(true);
      setTimeout(() => { onSaved?.(updated); onClose(); }, 1100);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onBackdrop = e => { if (e.target === e.currentTarget) onClose(); };
  const onEnter = e => e.key === "Enter" && submit();

  return (
    <div onClick={onBackdrop} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.65)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div className="slide-down" style={{
        width: "100%", maxWidth: 440,
        background: T.surface,
        border: `1px solid ${T.borderHi}`,
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        {/* Modal Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: T.surfaceHi,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "9px",
              background: T.accentLo, border: `1px solid ${T.accentBd}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.accent,
            }}><Icon.user width={17} height={17} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: T.text1 }}>Edit Profile</div>
              <div style={{ color: T.text3, fontSize: "11px", marginTop: "1px" }}>@{user.username} · {user.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: T.text3, cursor: "pointer",
            lineHeight: 1, padding: "4px", borderRadius: "6px",
            transition: "color .15s", display: "flex",
          }}><Icon.close width={18} height={18} /></button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px" }}>
          {done ? (
            <div className="fade-in" style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", margin: "0 auto 14px",
                background: T.greenLo, color: T.green,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><Icon.check width={24} height={24} /></div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: "15px" }}>
                Profile Updated
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {err && <Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert>}

              <div>
                <FieldLabel>Full Name</FieldLabel>
                <input
                  placeholder="e.g. Nazmus Sakib"
                  value={form.full_name}
                  onChange={setF("full_name")}
                  onKeyDown={onEnter}
                  maxLength={150}
                  autoFocus
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <FieldLabel>Job Title</FieldLabel>
                  <input
                    placeholder="e.g. Senior Recruiter"
                    value={form.job_title}
                    onChange={setF("job_title")}
                    onKeyDown={onEnter}
                    maxLength={100}
                  />
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <input
                    placeholder="e.g. Talent Acquisition"
                    value={form.department}
                    onChange={setF("department")}
                    onKeyDown={onEnter}
                    maxLength={100}
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Phone</FieldLabel>
                <input
                  placeholder="e.g. +880 1XXX-XXXXXX"
                  value={form.phone}
                  onChange={setF("phone")}
                  onKeyDown={onEnter}
                  maxLength={30}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>
                  Cancel
                </Btn>
                <Btn
                  variant="primary"
                  onClick={submit}
                  disabled={busy}
                  style={{ flex: 2, justifyContent: "center" }}
                >
                  {busy ? <><Spinner size={14} color={T.bg} /> Saving…</> : <><Icon.check width={15} height={15} /> Save Changes</>}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
