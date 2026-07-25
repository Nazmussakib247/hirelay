/* User account menu (avatar + dropdown: edit profile, add user, sign out).
   Extracted from App.jsx (frontend decomposition, phase 2). Behaviour unchanged. */

import { useState, useEffect, useRef } from "react";
import { T, Icon } from "../ui/foundation";
import { RoleBadge } from "./RoleBadge";

export function UserMenu({ user, onAddUser, onEditProfile, onLogout, up = false, fullWidth = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isAdmin     = user.role === "admin";
  const accentBg    = isAdmin ? T.purple : T.green;
  const accentLo    = isAdmin ? T.purpleLo : T.greenLo;
  const displayName = user.full_name || user.username;
  const initial     = (displayName || "U")[0].toUpperCase();

  return (
    <div ref={ref} style={{
      position: "relative", flexShrink: 0,
      marginLeft: fullWidth ? 0 : "8px",
      width: fullWidth ? "100%" : undefined,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={compact ? displayName : undefined}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          justifyContent: compact ? "center" : "flex-start",
          width: fullWidth ? "100%" : undefined,
          background: open ? T.surfaceHi : "transparent",
          border: `1px solid ${open ? T.borderHi : T.border}`,
          borderRadius: "10px",
          padding: compact ? "6px" : "5px 10px 5px 6px",
          cursor: "pointer", transition: "all .15s",
          fontFamily: "inherit",
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: accentBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>{initial}</div>
        {!compact && (
          <div style={{ textAlign: "left", lineHeight: 1, minWidth: 0, flex: fullWidth ? 1 : undefined }}>
            <div style={{ color: T.text1, fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
            <div style={{ color: T.text3, fontSize: "10px", marginTop: "2px", textTransform: "capitalize" }}>{user.job_title || user.role}</div>
          </div>
        )}
        {!compact && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", marginLeft: "2px", flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </button>

      {open && (
        <div className="slide-down" style={{
          position: "absolute",
          ...(up ? { bottom: "calc(100% + 8px)", left: 0 } : { top: "calc(100% + 8px)", right: 0 }),
          width: 240, background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(22,35,58,.14)",
          overflow: "hidden", zIndex: 200,
        }}>
          <div style={{ padding: "16px", background: accentLo, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: accentBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px", fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>{initial}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", color: T.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
                {user.email && (
                  <div style={{ color: T.text3, fontSize: "11px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                )}
                <div style={{ marginTop: "5px" }}><RoleBadge role={user.role} /></div>
              </div>
            </div>
          </div>
          <div style={{ padding: "6px" }}>
            {onEditProfile && (
              <button
                onClick={() => { setOpen(false); onEditProfile(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", borderRadius: "8px",
                  background: "transparent", border: "none",
                  color: T.text2, fontSize: "13px", fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background .12s", textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = T.surfaceHi)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: T.accent, display: "flex" }}><Icon.user width={15} height={15} /></span>
                Edit Profile
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { setOpen(false); onAddUser(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", borderRadius: "8px",
                  background: "transparent", border: "none",
                  color: T.text2, fontSize: "13px", fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "background .12s", textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = T.surfaceHi)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: T.purple, display: "flex" }}><Icon.userPlus width={15} height={15} /></span>
                Add New User
              </button>
            )}
            <div style={{ height: "1px", background: T.border, margin: "4px 0" }} />
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "8px",
                background: "transparent", border: "none",
                color: T.red, fontSize: "13px", fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
                transition: "background .12s", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = T.redLo)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Icon.logout width={15} height={15} /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
