/* Role badge (Admin / Recruiter). Extracted from App.jsx (decomposition phase 2). */

import { T, Icon } from "../ui/foundation";

export function RoleBadge({ role }) {
  const cfg = {
    admin:     { label: "Admin",     color: T.purple, bg: T.purpleLo, border: T.purpleBd, Ic: Icon.shield },
    recruiter: { label: "Recruiter", color: T.green,  bg: T.greenLo,  border: T.greenBd,  Ic: Icon.user   },
  };
  const c = cfg[role] || cfg.recruiter;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: "6px", padding: "3px 8px",
      fontSize: "10px", fontWeight: 700,
      letterSpacing: ".5px", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <c.Ic width={11} height={11} style={{ flexShrink: 0 }} />
      {c.label}
    </span>
  );
}
