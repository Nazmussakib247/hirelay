/* Job-posting tab — platform status, target selection, per-job "Post Now" to
   LinkedIn/Telegram/etc., and posting history. Extracted from App.jsx
   (frontend decomposition, phase 5). Behaviour unchanged. */

import { useState, useEffect } from "react";
import { api } from "../../api/client";
import { T, Icon } from "../../ui/foundation";
import { Card, Badge, SkillPill, SectionHead, EmptyState, Btn, Spinner, PlatformIcon, PLATFORM_META, PlatformBadge } from "../../ui/primitives";

export function JobPostingTab({ jobs }) {
  const [platforms,    setPlatforms]    = useState({});
  const [posting,      setPosting]      = useState(null);
  const [results,      setResults]      = useState({});
  const [history,      setHistory]      = useState([]);
  const [selPlatforms, setSelPlatforms] = useState({
    linkedin: true, telegram: true, twitter: true, bdjobs: true, webhook: true,
  });

  useEffect(() => {
    api("/platforms").then(setPlatforms).catch(() => {});
    api("/job-postings").then(setHistory).catch(() => {});
  }, []);

  const post = async job => {
    setPosting(job.id);
    try {
      const chosen = Object.entries(selPlatforms).filter(([, v]) => v).map(([k]) => k).join(",");
      const r = await api(`/jobs/${job.id}/post?platforms=${chosen}`, { method: "POST" });
      setResults(prev => ({ ...prev, [job.id]: r.posting }));
      api("/job-postings").then(setHistory).catch(() => {});
    } catch (e) { console.error(e); }
    finally { setPosting(null); }
  };

  const configured = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);

  // The DB stores naive UTC timestamps (TIMESTAMP without zone). Mark them as
  // UTC so the browser converts to the viewer's local time — otherwise the
  // hours read ~6h off in Bangladesh.
  const fmtWhen = (s) => {
    if (!s) return "—";
    const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(s);
    const iso = hasZone ? s : s.replace(" ", "T") + "Z";
    return new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Platform Status + Selector */}
      <Card style={{ padding: "20px" }}>
        <SectionHead>Platform Configuration</SectionHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
          {Object.entries(PLATFORM_META).map(([key, { label, color, bg, border }]) => {
            const on = platforms[key];
            const Ic = PlatformIcon[key];
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: on ? bg : T.surfaceHi,
                border: `1px solid ${on ? border : T.border}`,
                borderRadius: "8px", padding: "8px 14px",
                opacity: on ? 1 : 0.5,
              }}>
                {Ic ? <Ic /> : null}
                <span style={{ color: on ? color : T.text3, fontSize: "13px", fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: "9px", color: on ? T.green : T.red, fontWeight: 700 }}>
                  {on ? "●" : "○"}
                </span>
              </div>
            );
          })}
        </div>

        <SectionHead>Select Posting Targets</SectionHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {Object.entries(PLATFORM_META).map(([key, { label, color, bg, border }]) => {
            const on = platforms[key];
            const checked = selPlatforms[key];
            const Ic = PlatformIcon[key];
            return (
              <button key={key}
                onClick={() => on && setSelPlatforms(p => ({ ...p, [key]: !p[key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  background:  checked && on ? bg  : T.surfaceHi,
                  border: `2px solid ${checked && on ? border : T.border}`,
                  borderRadius: "8px", padding: "8px 14px",
                  cursor: on ? "pointer" : "not-allowed",
                  opacity: on ? 1 : 0.4, transition: "all .15s",
                  fontFamily: "inherit",
                }}>
                {Ic ? <Ic /> : null}
                <span style={{ color: checked && on ? color : T.text3, fontSize: "13px", fontWeight: 600 }}>{label}</span>
                {checked && on && <span style={{ color: T.green, fontSize: "13px" }}>✓</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Jobs list */}
      {jobs.length === 0
        ? <EmptyState icon={<Icon.briefcase width={36} height={36} style={{ color: T.text3 }} />} title="No jobs available" sub="Create a job in the Jobs tab first" />
        : jobs.map(job => {
          const result    = results[job.id];
          const isPosting = posting === job.id;
          return (
            <Card key={job.id} style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "8px" }}>{job.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
                    {(job.required_skills || []).slice(0, 7).map(s => <SkillPill key={s} s={s} matched />)}
                  </div>
                  {job.description && (
                    <div style={{ color: T.text3, fontSize: "12px", lineHeight: 1.6 }}>
                      {job.description.slice(0, 150)}{job.description.length > 150 ? "…" : ""}
                    </div>
                  )}
                </div>
                <Btn onClick={() => post(job)}
                  disabled={isPosting || configured.length === 0}
                  variant="primary">
                  {isPosting ? <><Spinner size={13} color={T.bg} /> Posting…</> : <><Icon.megaphone width={14} height={14} /> Post Now</>}
                </Btn>
              </div>

              {result && (
                <div className="fade-up" style={{
                  marginTop: "16px", borderTop: `1px solid ${T.border}`, paddingTop: "14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <span style={{ color: T.green, fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Icon.check width={14} height={14} /> Posted to {result.summary?.total_posted || 0} platform(s)
                    </span>
                    {result.summary?.failed?.length > 0 && (
                      <span style={{ color: T.red, fontSize: "12px" }}>
                        · {result.summary.failed.length} failed
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {Object.entries(result.results || {}).map(([p, r]) => (
                      <PlatformBadge key={p} platform={p} status={r.status} />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

      {/* Posting History */}
      {history.length > 0 && (
        <Card style={{ padding: "20px" }}>
          <SectionHead>Posting History</SectionHead>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Job", "Platforms", "Result", "Posted At"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 12px",
                    color: T.text3, fontSize: "10px",
                    letterSpacing: ".6px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map(h => {
                const res = typeof h.results === "string" ? JSON.parse(h.results) : h.results || {};
                const successes = Object.values(res).filter(r => r.status === "success").length;
                return (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "11px 12px", color: T.text1, fontWeight: 600, fontSize: "13px" }}>
                      {h.job_title || "—"}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <div style={{ display: "flex", gap: "11px", alignItems: "center" }}>
                        {(h.platforms_attempted || []).map(p => {
                          const Ic = PlatformIcon[p];
                          const status = res[p]?.status;
                          const ok = status === "success";
                          return (
                            <span key={p}
                              title={`${PLATFORM_META[p]?.label || p}: ${status || "unknown"}`}
                              style={{ position: "relative", display: "inline-flex", alignItems: "center",
                                opacity: ok ? 1 : 0.32 }}>
                              {Ic ? <Ic /> : <span style={{ fontSize: "13px" }}>🌐</span>}
                              {ok && (
                                <span style={{
                                  position: "absolute", right: -5, bottom: -4,
                                  width: 12, height: 12, borderRadius: "50%",
                                  background: T.green, color: "#fff",
                                  fontSize: 8, lineHeight: "12px", textAlign: "center",
                                  fontWeight: 700, border: `1.5px solid ${T.surface}` }}>✓</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <Badge label={`${successes} posted`} color={T.green} bg={T.greenLo} border={T.greenBd} />
                    </td>
                    <td style={{ padding: "11px 12px", color: T.text3, fontSize: "12px" }}>
                      {fmtWhen(h.posted_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
