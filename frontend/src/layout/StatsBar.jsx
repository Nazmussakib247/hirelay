/* Dashboard stats bar — seven metric cards. Extracted from App.jsx
   (frontend decomposition, phase 2). Behaviour unchanged. */

import { T, Icon } from "../ui/foundation";
import { Card } from "../ui/primitives";

const STAT_CFG = [
  { key: "total_candidates",    label: "Total CVs",   color: T.accent,  Ic: Icon.fileText },
  { key: "pending",             label: "Pending",     color: T.amber,   Ic: Icon.list },
  { key: "shortlisted",         label: "Shortlisted", color: T.green,   Ic: Icon.check },
  { key: "rejected",            label: "Rejected",    color: T.red,     Ic: Icon.xCircle },
  { key: "interviews_scheduled",label: "Interviews",  color: T.purple,  Ic: Icon.calendar },
  { key: "emails_sent",         label: "Emails Sent", color: T.amber, Ic: Icon.mail },
  { key: "evaluation_accuracy", label: "Eval Acc",    color: "#1D7A8C", Ic: Icon.flask, suffix: "%" },
];

export function StatsBar({ stats }) {
  if (!stats) return null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "10px",
      marginBottom: "22px",
    }}>
      {STAT_CFG.map(({ key, label, color, Ic, suffix }) => (
        <Card key={key} style={{ padding: "14px 16px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px", color }}>
            <Ic width={17} height={17} />
          </div>
          <div style={{ color, fontSize: "24px", fontWeight: 700, lineHeight: 1 }}>
            {stats[key] != null && stats[key] !== 0 ? `${stats[key]}${suffix || ""}` : (suffix ? "—" : (stats[key] ?? "—"))}
          </div>
          <div style={{ color: T.text3, fontSize: "10px", marginTop: "5px", letterSpacing: ".5px", textTransform: "uppercase" }}>
            {label}
          </div>
        </Card>
      ))}
    </div>
  );
}
