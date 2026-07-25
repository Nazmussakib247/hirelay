/* Login page + password-reset dialog + session-restore on mount.
   Extracted from App.jsx (frontend decomposition, phase 2). Behaviour unchanged. */

import { useState, useEffect } from "react";
import { API_BASE_URL as API } from "../config";
import { getToken, clearToken } from "./token";
import { T, Icon, GLOBAL_CSS } from "../ui/foundation";
import { Spinner, Logo, Card, Alert, FieldLabel, Btn } from "../ui/primitives";

export function LoginPage({ onLogin }) {
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState(null);
  const [showPw,    setShowPw]    = useState(false);
  const [verifying, setVerifying] = useState(true); // checking for existing session

  // Password-reset flow: null | "forgot" | "reset"
  const [pwModal, setPwModal] = useState(null);
  const [pwEmail, setPwEmail] = useState("");
  const [pwToken, setPwToken] = useState("");
  const [pwNew,   setPwNew]   = useState("");
  const [pwBusy,  setPwBusy]  = useState(false);
  const [pwMsg,   setPwMsg]   = useState(null); // { type, text }

  const sendForgot = async () => {
    if (!pwEmail.trim()) return;
    setPwBusy(true); setPwMsg(null);
    try {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pwEmail.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      setPwMsg({ type: "success", text: d.message || "If an account exists, a reset code was emailed." });
      setPwModal("reset");
    } catch { setPwMsg({ type: "error", text: "Something went wrong. Please try again." }); }
    finally { setPwBusy(false); }
  };

  const doReset = async () => {
    if (!pwToken.trim() || pwNew.length < 8) {
      setPwMsg({ type: "error", text: "Enter the code and a new password (at least 8 characters)." });
      return;
    }
    setPwBusy(true); setPwMsg(null);
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pwToken.trim(), new_password: pwNew }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error?.message || d.detail || "Reset failed");
      setPwMsg({ type: "success", text: "Password reset! You can now sign in." });
      setTimeout(() => { setPwModal(null); setPwToken(""); setPwNew(""); setPwEmail(""); setPwMsg(null); }, 1500);
    } catch (e) { setPwMsg({ type: "error", text: e.message }); }
    finally { setPwBusy(false); }
  };

  // ── On mount: call /auth/me to restore session if token exists in memory
  useEffect(() => {
    const existingToken = getToken();
    if (!existingToken) { setVerifying(false); return; }
    // Token exists in memory (e.g. hot-reload); verify it's still valid
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${existingToken}` }
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => onLogin(existingToken, user))
      .catch(() => { clearToken(); setVerifying(false); });
  }, []); // eslint-disable-line

  const submit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Login failed");
      onLogin(data.access_token, data.user);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onKey = e => { if (e.key === "Enter") submit(); };

  if (verifying) {
    return (
      <div style={{
        minHeight: "100vh",
        background: `radial-gradient(1100px 560px at 50% -12%, ${T.accentLo} 0%, ${T.bg} 55%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ textAlign: "center" }}>
          <Spinner size={28} color={T.accent} />
          <div style={{ color: T.text3, fontSize: "13px", marginTop: "12px" }}>Verifying session…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(1100px 560px at 50% -12%, ${T.accentLo} 0%, ${T.bg} 55%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <style>{GLOBAL_CSS}</style>
      <div className="fade-up" style={{ width: "100%", maxWidth: "420px" }}>

        {/* Logo / Hero */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
            <Logo size={56} />
          </div>
          <h1 style={{
            color: T.text1, fontSize: "26px", fontWeight: 800,
            marginBottom: "6px", letterSpacing: "-.4px",
          }}>
            Hirelay
          </h1>
          <p style={{ color: T.text2, fontSize: "13px" }}>
            Sign in to access the recruiting dashboard
          </p>
        </div>

        {/* Card */}
        <Card style={{
          padding: "32px",
          borderTop: `3px solid ${T.accent}`,
          boxShadow: "0 12px 32px rgba(22,35,58,.08), 0 2px 6px rgba(22,35,58,.05)",
        }}>
          {/* Error Alert */}
          {err && (
            <div className="fade-in" style={{ marginBottom: "20px" }}>
              <Alert type="error">
                <Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                <span style={{ fontWeight: 600 }}>Login failed</span> — {err}
              </Alert>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Username */}
            <div>
              <FieldLabel>Username or Email</FieldLabel>
              <input
                type="text"
                placeholder="admin"
                value={username}
                onChange={e => { setUsername(e.target.value); setErr(null); }}
                onKeyDown={onKey}
                disabled={busy}
                autoFocus
                autoComplete="username"
              />
            </div>

            {/* Password */}
            <div>
              <FieldLabel>Password</FieldLabel>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErr(null); }}
                  onKeyDown={onKey}
                  disabled={busy}
                  autoComplete="current-password"
                  style={{ paddingRight: "48px" }}
                />
                <button
                  onClick={() => setShowPw(p => !p)}
                  tabIndex={-1}
                  style={{
                    position: "absolute", right: "12px", top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none", display: "flex",
                    color: T.text3, cursor: "pointer",
                    transition: "color .15s",
                  }}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <Icon.eyeOff width={16} height={16} /> : <Icon.eye width={16} height={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Btn
              onClick={submit}
              disabled={busy || !username.trim() || !password}
              variant="primary"
              size="lg"
              style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}
            >
              {busy
                ? <><Spinner size={16} color={T.bg} /> Signing in…</>
                : <><Icon.lock width={15} height={15} /> Sign In</>}
            </Btn>

            <div style={{ textAlign: "center", marginTop: "2px" }}>
              <button type="button" onClick={() => { setPwModal("forgot"); setPwMsg(null); }}
                style={{ background: "none", border: "none", color: T.accent, cursor: "pointer",
                  fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>
                Forgot password?
              </button>
            </div>
          </div>

          {/* Default credentials hint */}
          <div style={{
            marginTop: "20px",
            padding: "12px 14px",
            background: T.surfaceHi,
            border: `1px solid ${T.border}`,
            borderRadius: "8px",
          }}>
            <div style={{ color: T.text3, fontSize: "11px", textAlign: "center", lineHeight: 1.6 }}>
              Default credentials:&nbsp;
              <span style={{ color: T.accent, fontWeight: 600 }}>admin</span>
              &nbsp;/&nbsp;
              <span style={{ color: T.accent, fontWeight: 600 }}>admin123</span>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <span style={{ color: T.text3, fontSize: "11px" }}>
            © 2026 Hirelay. All rights reserved.
          </span>
        </div>
      </div>

      {/* Forgot / reset password dialog */}
      {pwModal && (
        <div onClick={() => setPwModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} className="fade-up"
            style={{ background: T.surface, borderRadius: "16px", border: `1px solid ${T.border}`,
              width: "100%", maxWidth: "420px", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: "17px", fontWeight: 800, color: T.text1, marginBottom: "4px" }}>
              {pwModal === "forgot" ? "Forgot password" : "Reset password"}
            </div>
            <div style={{ fontSize: "12.5px", color: T.text3, marginBottom: "16px" }}>
              {pwModal === "forgot"
                ? "Enter your account email — we'll send a one-time reset code (valid 1 hour)."
                : "Enter the code from your email and choose a new password."}
            </div>

            {pwMsg && (
              <div style={{ marginBottom: "14px" }}>
                <Alert type={pwMsg.type === "success" ? "success" : "error"}>{pwMsg.text}</Alert>
              </div>
            )}

            {pwModal === "forgot" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <input type="email" value={pwEmail} onChange={e => setPwEmail(e.target.value)}
                    placeholder="you@example.com" autoFocus
                    onKeyDown={e => { if (e.key === "Enter") sendForgot(); }} />
                </div>
                <div style={{ display: "flex", gap: "9px", justifyContent: "flex-end" }}>
                  <Btn variant="ghost" onClick={() => setPwModal(null)}>Cancel</Btn>
                  <Btn variant="primary" onClick={sendForgot} disabled={pwBusy || !pwEmail.trim()}>
                    {pwBusy ? <><Spinner size={13} color={T.bg} /> Sending…</> : <>Send reset code</>}
                  </Btn>
                </div>
                <div style={{ textAlign: "center" }}>
                  <button type="button" onClick={() => { setPwModal("reset"); setPwMsg(null); }}
                    style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: "inherit" }}>
                    Already have a code?
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <FieldLabel>Reset code</FieldLabel>
                  <input type="text" value={pwToken} onChange={e => setPwToken(e.target.value)}
                    placeholder="Paste the code from your email" autoFocus />
                </div>
                <div>
                  <FieldLabel>New password</FieldLabel>
                  <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
                    placeholder="At least 8 characters"
                    onKeyDown={e => { if (e.key === "Enter") doReset(); }} />
                </div>
                <div style={{ display: "flex", gap: "9px", justifyContent: "flex-end" }}>
                  <Btn variant="ghost" onClick={() => setPwModal(null)}>Cancel</Btn>
                  <Btn variant="primary" onClick={doReset} disabled={pwBusy || !pwToken.trim() || pwNew.length < 8}>
                    {pwBusy ? <><Spinner size={13} color={T.bg} /> Resetting…</> : <><Icon.lock width={13} height={13} /> Reset password</>}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
