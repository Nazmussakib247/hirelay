import { useState } from "react";
import { api } from "../../api/client";
import { T, Icon } from "../../ui/foundation";
import { Alert, Btn, FieldLabel, Spinner } from "../../ui/primitives";

/* ─── FORCED PASSWORD CHANGE (seeded/bootstrap accounts) ─────────────────── */
function ForceChangePasswordModal({ onChanged, onLogout }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState(null);

  const submit = async () => {
    if (busy) return;
    if (next.length < 8)   { setErr("New password must be at least 8 characters"); return; }
    if (next !== confirm)  { setErr("New passwords do not match"); return; }
    setBusy(true); setErr(null);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onEnter = e => e.key === "Enter" && submit();

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div className="slide-down" style={{
        width: "100%", maxWidth: 440, background: T.surface,
        border: `1px solid ${T.borderHi}`, borderRadius: "16px",
        overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, background: T.surfaceHi, display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: 34, height: 34, borderRadius: "9px",
            background: T.amberLo, border: `1px solid ${T.amberBd}`,
            display: "flex", alignItems: "center", justifyContent: "center", color: T.amber,
          }}><Icon.lock width={17} height={17} /></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: T.text1 }}>Set a New Password</div>
            <div style={{ color: T.text3, fontSize: "11px", marginTop: "1px" }}>
              This account uses a default password — you must change it before continuing
            </div>
          </div>
        </div>

        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {err && <Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert>}
          <div>
            <FieldLabel>Current Password</FieldLabel>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} onKeyDown={onEnter} autoFocus autoComplete="current-password" />
          </div>
          <div>
            <FieldLabel>New Password (min 8 characters)</FieldLabel>
            <input type="password" value={next} onChange={e => setNext(e.target.value)} onKeyDown={onEnter} autoComplete="new-password" />
          </div>
          <div>
            <FieldLabel>Confirm New Password</FieldLabel>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={onEnter} autoComplete="new-password" />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <Btn variant="primary" onClick={submit} disabled={busy || !current || !next || !confirm} style={{ flex: 1, justifyContent: "center" }}>
              {busy ? <Spinner size={14} color={T.bg} /> : <Icon.check width={14} height={14} />} Change Password
            </Btn>
            <Btn variant="ghost" onClick={onLogout}><Icon.logout width={14} height={14} /> Log out</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ForceChangePasswordModal };
