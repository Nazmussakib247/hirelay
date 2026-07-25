/* In-app notification bell — polls unread count every 30s, opens a dropdown
   feed and marks read on open. Extracted from App.jsx (decomposition phase 2). */

import { useState, useEffect } from "react";
import { T } from "../ui/foundation";
import { api } from "../api/client";
import { useAuth } from "../auth/context";

export function NotificationBell() {
  const { handleLogout } = useAuth();
  const [open,   setOpen]   = useState(false);
  const [items,  setItems]  = useState([]);
  const [unread, setUnread] = useState(0);

  const loadCount = () => api("/notifications/unread-count", {}, handleLogout)
    .then(d => setUnread(d.unread || 0)).catch(() => {});
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000); // poll every 30s
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      try {
        const d = await api("/notifications", {}, handleLogout);
        setItems(d.items || []);
        if ((d.unread || 0) > 0) {
          await api("/notifications/mark-read", { method: "POST" }, handleLogout);
          setUnread(0);
        }
      } catch { /* non-critical */ }
    }
  };

  const dotColor = t => t === "shortlisted" ? T.green
    : t === "interview_scheduled" ? T.amber
    : t === "cv_uploaded" ? T.accent : T.text3;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={toggle} title="Notifications"
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer",
          color: T.text2, display: "flex", padding: "4px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{ position: "absolute", top: 0, right: 0, minWidth: "15px", height: "15px",
            padding: "0 3px", borderRadius: "8px", background: T.red, color: "#fff", fontSize: "9px",
            fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
          <div style={{ position: "absolute", right: 0, top: "34px", width: "320px", maxHeight: "420px",
            overflowY: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "12px",
            boxShadow: "0 12px 40px rgba(0,0,0,.18)", zIndex: 201 }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`,
              fontWeight: 700, fontSize: "13px", color: T.text1 }}>Notifications</div>
            {items.length === 0 ? (
              <div style={{ padding: "26px", textAlign: "center", color: T.text3, fontSize: "13px" }}>
                No notifications yet
              </div>
            ) : items.map(n => (
              <div key={n.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${T.border}`,
                display: "flex", gap: "9px", alignItems: "flex-start",
                background: n.read ? "transparent" : T.accentLo }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", marginTop: "5px",
                  background: dotColor(n.type), flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "12.5px", color: T.text1, lineHeight: 1.45 }}>{n.message}</div>
                  <div style={{ fontSize: "10.5px", color: T.text3, marginTop: "2px" }}>
                    {new Date(n.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
