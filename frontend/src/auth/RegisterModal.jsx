/* Register-new-user modal (admin only). Extracted from App.jsx (phase 2). */

import { useState } from "react";
import { api } from "../api/client";
import { T, Icon } from "../ui/foundation";
import { Alert, FieldLabel, Btn, Spinner } from "../ui/primitives";

export function RegisterModal({ onClose, onSuccess }) {
  const blank = { username: "", email: "", password: "", role: "recruiter" };
  const [form,    setForm]    = useState(blank);
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState(null);
  const [done,    setDone]    = useState(false);
  const [showPw,  setShowPw]  = useState(false);

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setErr("All fields are required"); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErr("Please enter a valid email address"); return;
    }
    if (form.password.length < 6) {
      setErr("Password must be at least 6 characters"); return;
    }
    setBusy(true); setErr(null);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1600);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // Close on backdrop click
  const onBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

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
              background: T.purpleLo, border: `1px solid ${T.purpleBd}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.purple,
            }}><Icon.userPlus width={17} height={17} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: T.text1 }}>Register New User</div>
              <div style={{ color: T.text3, fontSize: "11px", marginTop: "1px" }}>Admin access required</div>
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
              <div style={{ color: T.green, fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
                User Registered Successfully!
              </div>
              <div style={{ color: T.text3, fontSize: "13px" }}>
                {form.username} has been added as {form.role}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {err && <Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert>}

              <div>
                <FieldLabel>Username *</FieldLabel>
                <input
                  placeholder="e.g. john_doe"
                  value={form.username}
                  onChange={setF("username")}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  autoFocus
                />
              </div>

              <div>
                <FieldLabel>Email Address *</FieldLabel>
                <input
                  type="email"
                  placeholder="john@company.com"
                  value={form.email}
                  onChange={setF("email")}
                  onKeyDown={e => e.key === "Enter" && submit()}
                />
              </div>

              <div>
                <FieldLabel>Password *</FieldLabel>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={setF("password")}
                    onKeyDown={e => e.key === "Enter" && submit()}
                    style={{ paddingRight: "44px" }}
                  />
                  <button onClick={() => setShowPw(p => !p)} style={{
                    position: "absolute", right: "12px", top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", display: "flex",
                    color: T.text3, cursor: "pointer",
                  }}>
                    {showPw ? <Icon.eyeOff width={16} height={16} /> : <Icon.eye width={16} height={16} />}
                  </button>
                </div>
              </div>

              <div>
                <FieldLabel>Role *</FieldLabel>
                <select value={form.role} onChange={setF("role")}>
                  <option value="recruiter">Recruiter — can upload CVs, run match, view candidates</option>
                  <option value="admin">Admin — full access including user management</option>
                </select>
              </div>

              <div style={{
                background: T.surfaceHi, border: `1px solid ${T.border}`,
                borderRadius: "8px", padding: "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: form.role === "admin" ? T.purple : T.green, display: "flex" }}>
                    {form.role === "admin" ? <Icon.shield width={13} height={13} /> : <Icon.user width={13} height={13} />}
                  </span>
                  <span style={{ color: T.text3, fontSize: "12px" }}>
                    {form.role === "admin"
                      ? "Admin can register users, view all data, and manage the system"
                      : "Recruiter can manage candidates, jobs, and run AI matching"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <Btn variant="ghost" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>
                  Cancel
                </Btn>
                <Btn
                  variant="primary"
                  onClick={submit}
                  disabled={busy || !form.username || !form.email || !form.password}
                  style={{ flex: 2, justifyContent: "center" }}
                >
                  {busy ? <><Spinner size={14} color={T.bg} /> Registering…</> : <><Icon.userPlus width={15} height={15} /> Register User</>}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
