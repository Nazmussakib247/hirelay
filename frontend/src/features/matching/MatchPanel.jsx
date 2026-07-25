/* AI match panel — pick a job, run background match-all, poll progress, show
   the shortlist. Extracted from App.jsx (decomposition phase 4). Unchanged. */

import { useState, useEffect, useRef } from "react";
import { api } from "../../api/client";
import { T, Icon } from "../../ui/foundation";
import { Card, Badge, StatusBadge, ScoreRing, SectionHead, FieldLabel, Btn, Toggle, Spinner, Alert } from "../../ui/primitives";

export function MatchPanel({ jobs, onRefresh, emailEnabled }) {
  const [job,       setJob]       = useState("");
  const [busy,      setBusy]      = useState(false);
  const [res,       setRes]       = useState(null);
  const [err,       setErr]       = useState(null);
  const [autoEmail, setAutoEmail] = useState(true);
  const [progress,  setProgress]  = useState(null); // {processed,total,shortlisted,rejected,emails_sent}
  const pollRef = useRef(null);

  // Stop polling if the component unmounts mid-run.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const run = async () => {
    if (!job) return;
    setBusy(true); setRes(null); setErr(null); setProgress(null);
    try {
      // 202: the backend starts a background run; we poll for progress.
      const start = await api(`/match-all/${job}?auto_email=${autoEmail}`, { method: "POST" });
      if (start.total === 0) {
        setRes({ total_processed: 0, shortlisted_count: 0, rejected_count: 0, emails_sent: 0, shortlisted: [] });
        setBusy(false);
        onRefresh?.();
        return;
      }
      setProgress({ processed: 0, total: start.total, shortlisted: 0, rejected: 0, emails_sent: 0 });
      pollRef.current = setInterval(async () => {
        try {
          const run = await api(`/match-runs/${start.run_id}`);
          setProgress({
            processed:   run.processed,
            total:       run.total,
            shortlisted: run.shortlisted,
            rejected:    run.rejected,
            emails_sent: run.emails_sent,
          });
          if (run.status === "completed") {
            clearInterval(pollRef.current); pollRef.current = null;
            setRes(run.result || {
              total_processed: run.processed, shortlisted_count: run.shortlisted,
              rejected_count: run.rejected, emails_sent: run.emails_sent, shortlisted: [],
            });
            setProgress(null); setBusy(false);
            onRefresh?.();
          } else if (run.status === "failed") {
            clearInterval(pollRef.current); pollRef.current = null;
            setErr(run.error || "Match run failed");
            setProgress(null); setBusy(false);
          }
        } catch (e) {
          clearInterval(pollRef.current); pollRef.current = null;
          setErr(e.message); setProgress(null); setBusy(false);
        }
      }, 2000);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div>
      {!emailEnabled && (
        <div style={{ marginBottom: "16px" }}>
          <Alert type="warning"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />Email not configured — add SMTP_USER + SMTP_PASSWORD to .env to enable auto-email</Alert>
        </div>
      )}

      <Card style={{ padding: "20px", marginBottom: "20px" }}>
        <SectionHead>Match Configuration</SectionHead>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <FieldLabel>Target Job Position</FieldLabel>
            <select value={job} onChange={e => setJob(e.target.value)}>
              <option value="">Select a job to match against…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div style={{ padding: "10px 0" }}>
            <Toggle value={autoEmail} onChange={setAutoEmail} label="Auto-send emails" />
          </div>
          <Btn onClick={run} disabled={!job || busy} variant="primary" size="lg">
            {busy ? <><Spinner size={15} color={T.bg} /> Processing…</> : <><Icon.target width={15} height={15} /> Run AI Match</>}
          </Btn>
        </div>
      </Card>

      {err && <div style={{ marginBottom: "16px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}

      {progress && (
        <Card style={{ padding: "20px", marginBottom: "20px" }} className="fade-up">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <span style={{ fontWeight: 700, fontSize: "13px" }}>
              Matching candidates… {progress.processed}/{progress.total}
            </span>
            <span style={{ color: T.text3, fontSize: "12px" }}>
              {progress.shortlisted} shortlisted · {progress.rejected} rejected · {progress.emails_sent} emails
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: T.surfaceHi, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4, background: T.accent, transition: "width .6s",
              width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%`,
            }} />
          </div>
          <div style={{ color: T.text3, fontSize: "11px", marginTop: "8px" }}>
            Runs in the background — safe to keep this tab open; results appear here when done.
          </div>
        </Card>
      )}

      {res && (
        <div className="fade-up">
          {/* Summary row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "20px" }}>
            {[
              { l: "Processed",    v: res.total_processed,   c: T.accent  },
              { l: "Shortlisted",  v: res.shortlisted_count, c: T.green   },
              { l: "Rejected",     v: res.rejected_count,    c: T.red     },
              { l: "Emails Sent",  v: res.emails_sent,       c: T.amber   },
            ].map(({ l, v, c }) => (
              <Card key={l} style={{ padding: "16px", textAlign: "center" }}>
                <div style={{ color: c, fontSize: "28px", fontWeight: 700 }}>{v}</div>
                <div style={{ color: T.text3, fontSize: "11px", marginTop: "4px" }}>{l}</div>
              </Card>
            ))}
          </div>

          {(res.shortlisted || []).length > 0 && (
            <div>
              <SectionHead>Shortlisted Candidates</SectionHead>
              <div style={{ display: "grid", gap: "8px" }}>
                {res.shortlisted.map(c => (
                  <Card key={c.candidate_id} style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <ScoreRing score={c.final_score} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "3px" }}>
                          {c.candidate_name || "Unknown"}
                        </div>
                        <div style={{ color: T.text3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.breakdown?.ai_summary || "—"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                        <StatusBadge status="shortlisted" />
                        {c.email_result?.sent && (
                          <Badge label="Email sent" color={T.green} bg={T.greenLo} border={T.greenBd} />
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
