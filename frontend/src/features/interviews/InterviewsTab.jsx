import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client";
import { T, Icon } from "../../ui/foundation";
import {
  Alert, Badge, Btn, Card, EmptyState, FieldLabel, ScoreRing, Spinner,
} from "../../ui/primitives";

/* ─── INTERVIEWS TAB ──────────────────────────────────────────────────── */

/** Post-interview rating (1-5 stars) + notes, saved per interview. */
function FeedbackEditor({ iv, onSaved }) {
  const [rating, setRating] = useState(iv.rating || 0);
  const [notes,  setNotes]  = useState(iv.feedback || "");
  const [busy,   setBusy]   = useState(false);
  const dirty = rating !== (iv.rating || 0) || notes !== (iv.feedback || "");

  const save = async () => {
    setBusy(true);
    try {
      await api(`/interviews/${iv.id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ rating: rating || null, feedback: notes }),
      });
      onSaved?.();
    } catch (e) { alert(`Could not save feedback: ${e.message}`); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${T.border}` }}>
      <FieldLabel>Interview Feedback</FieldLabel>
      <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "8px" }}>
        {[1, 2, 3, 4, 5].map(n => (
          <span key={n} onClick={() => setRating(n === rating ? 0 : n)}
            title={`${n} / 5`}
            style={{ cursor: "pointer", fontSize: "22px", lineHeight: 1, userSelect: "none",
              color: n <= rating ? T.amber : T.border, transition: "color .1s" }}>★</span>
        ))}
        {rating > 0 && <span style={{ fontSize: "12px", color: T.text3, marginLeft: "6px" }}>{rating}/5</span>}
      </div>
      <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes about the interview…"
        style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "13px",
          lineHeight: 1.5, padding: "9px 11px", borderRadius: "8px", border: `1px solid ${T.border}`,
          background: T.surfaceHi, color: T.text1, resize: "vertical", outline: "none" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <Btn size="sm" variant="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? <><Spinner size={12} color={T.bg} /> Saving…</> : <><Icon.check width={12} height={12} /> Save Feedback</>}
        </Btn>
      </div>
    </div>
  );
}

/** Month grid of interviews; click a day to act on that day's interviews. */
function InterviewCalendar({ interviews, onReschedule, onCancel, onComplete, acting }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDay, setSelDay] = useState(null); // "YYYY-M-D"

  const ymd = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  // Group scheduled/completed interviews by local day key.
  const byDay = {};
  for (const iv of interviews) {
    if (!iv.interview_time) continue;
    const d = new Date(iv.interview_time);
    (byDay[ymd(d)] = byDay[ymd(d)] || []).push(iv);
  }

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = ymd(new Date());
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });
  const statusDot = { scheduled: T.accent, completed: T.green, cancelled: T.red };
  const dayList = selDay ? (byDay[selDay] || []) : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <Btn size="sm" variant="ghost" onClick={() => { setCursor(new Date(year, month - 1, 1)); setSelDay(null); }}>‹ Prev</Btn>
        <div style={{ fontWeight: 700, fontSize: "15px", color: T.text1 }}>{monthLabel}</div>
        <Btn size="sm" variant="ghost" onClick={() => { setCursor(new Date(year, month + 1, 1)); setSelDay(null); }}>Next ›</Btn>
      </div>

      <Card style={{ padding: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: 700, color: T.text3,
              textTransform: "uppercase", letterSpacing: ".5px", padding: "4px 0" }}>{d}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const key = ymd(d);
            const items = byDay[key] || [];
            const isToday = key === todayKey;
            const isSel = key === selDay;
            return (
              <div key={key} onClick={() => setSelDay(isSel ? null : key)}
                style={{ minHeight: "58px", borderRadius: "8px", padding: "5px 6px", cursor: "pointer",
                  border: `1px solid ${isSel ? T.accentBd : T.border}`,
                  background: isSel ? T.accentLo : isToday ? T.surfaceHi : "transparent", transition: "all .12s" }}>
                <div style={{ fontSize: "11px", fontWeight: isToday ? 700 : 500,
                  color: isToday ? T.accent : T.text2 }}>{d.getDate()}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "3px" }}>
                  {items.slice(0, 4).map(iv => (
                    <span key={iv.id} title={`${iv.candidate_name} · ${iv.status}`}
                      style={{ width: "6px", height: "6px", borderRadius: "50%",
                        background: statusDot[iv.status] || T.accent }} />
                  ))}
                  {items.length > 4 && <span style={{ fontSize: "9px", color: T.text3 }}>+{items.length - 4}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Legend */}
      <div style={{ display: "flex", gap: "14px", marginTop: "10px", fontSize: "11px", color: T.text3 }}>
        {[["scheduled", T.accent], ["completed", T.green], ["cancelled", T.red]].map(([l, c]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c }} /> {l}
          </span>
        ))}
      </div>

      {/* Selected-day interviews with actions */}
      {selDay && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: T.text1, marginBottom: "10px" }}>
            {new Date(...selDay.split("-").map(Number)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {" · "}{dayList.length} interview{dayList.length !== 1 ? "s" : ""}
          </div>
          {dayList.length === 0 ? (
            <div style={{ color: T.text3, fontSize: "13px", padding: "8px 0" }}>No interviews on this day.</div>
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {dayList.map(iv => (
                <Card key={iv.id} style={{ padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "14px" }}>{iv.candidate_name}</div>
                      <div style={{ color: T.text3, fontSize: "12px" }}>
                        {iv.job_title} · {iv.interview_time ? new Date(iv.interview_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "TBD"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <Badge label={iv.status || "scheduled"}
                        color={statusDot[iv.status] || T.accent}
                        bg={iv.status === "completed" ? T.greenLo : iv.status === "cancelled" ? T.redLo : T.accentLo}
                        border={iv.status === "completed" ? T.greenBd : iv.status === "cancelled" ? T.redBd : T.accentBd} />
                      {iv.status === "scheduled" && (
                        <>
                          <Btn size="sm" variant="ghost" disabled={acting === iv.id}
                            onClick={() => onReschedule(iv)} title="Reschedule">
                            <Icon.refresh width={12} height={12} />
                          </Btn>
                          <Btn size="sm" variant="ghost" disabled={acting === iv.id}
                            onClick={() => onComplete(iv.id)} title="Mark completed"
                            style={{ borderColor: T.greenBd, color: T.green }}>
                            <Icon.check width={12} height={12} />
                          </Btn>
                          <Btn size="sm" variant="danger" disabled={acting === iv.id}
                            onClick={() => onCancel(iv.id)} title="Cancel">
                            <Icon.xCircle width={12} height={12} />
                          </Btn>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InterviewsTab({ refresh }) {
  const [interviews, setInterviews] = useState([]);
  const [logs,       setLogs]       = useState([]);
  const [sub,        setSub]        = useState("interviews");
  const [loading,    setLoading]    = useState(true);
  const [resending,  setResending]  = useState(null);
  const [acting,     setActing]     = useState(null);   // interview id with an action in flight
  const [reschedFor, setReschedFor] = useState(null);   // interview id showing the reschedule input
  const [reschedVal, setReschedVal] = useState("");
  const [actionErr,  setActionErr]  = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [iv, lg] = await Promise.all([api("/interviews"), api("/email-logs")]);
      setInterviews(Array.isArray(iv) ? iv : (iv.items || []));
      setLogs(Array.isArray(lg) ? lg : (lg.items || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [refresh, fetchData]);

  const resend = async cid => {
    setResending(cid);
    try { await api(`/send-email/${cid}`, { method: "POST" }); await fetchData(); }
    finally { setResending(null); }
  };

  const doAction = async (id, fn) => {
    setActing(id); setActionErr(null);
    try { await fn(); await fetchData(); }
    catch (e) { setActionErr(e.message); }
    finally { setActing(null); }
  };

  const reschedule = id => doAction(id, async () => {
    await api(`/interviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ interview_time: new Date(reschedVal).toISOString() }),
    });
    setReschedFor(null); setReschedVal("");
  });

  const cancelIv   = id => doAction(id, () => api(`/interviews/${id}/cancel`,   { method: "POST" }));
  const completeIv = id => doAction(id, () => api(`/interviews/${id}/complete`, { method: "POST" }));

  const ivStatusColors = {
    scheduled: { color: T.accent, bg: T.accentLo, border: T.accentBd },
    completed: { color: T.green,  bg: T.greenLo,  border: T.greenBd  },
    cancelled: { color: T.red,    bg: T.redLo,    border: T.redBd    },
  };

  const SubTab = ({ id, label }) => (
    <button onClick={() => setSub(id)} style={{
      padding: "6px 16px", borderRadius: "7px",
      border: sub === id ? `1px solid ${T.accentBd}` : `1px solid transparent`,
      background: sub === id ? T.accentLo : "transparent",
      color: sub === id ? T.accent : T.text3,
      cursor: "pointer", fontSize: "13px", fontWeight: 600,
      fontFamily: "inherit", transition: "all .15s",
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        <SubTab id="interviews" label={`Interviews (${interviews.length})`} />
        <SubTab id="calendar"   label="Calendar" />
        <SubTab id="emails"     label={`Email Logs (${logs.length})`} />
      </div>

      {actionErr && (
        <div style={{ marginBottom: "14px" }}>
          <Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{actionErr}</Alert>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <Spinner size={24} />
        </div>
      ) : sub === "calendar" ? (
        interviews.length === 0
          ? <EmptyState icon={<Icon.calendar width={36} height={36} style={{ color: T.text3 }} />} title="No interviews scheduled" sub="Run AI Match to shortlist candidates" />
          : <InterviewCalendar
              interviews={interviews}
              acting={acting}
              onReschedule={iv => { setSub("interviews"); setReschedFor(iv.id); setReschedVal(""); }}
              onCancel={cancelIv}
              onComplete={completeIv} />
      ) : sub === "interviews" ? (
        interviews.length === 0
          ? <EmptyState icon={<Icon.calendar width={36} height={36} style={{ color: T.text3 }} />} title="No interviews scheduled" sub="Run AI Match to shortlist candidates" />
          : (
            <div style={{ display: "grid", gap: "10px" }}>
              {interviews.map(iv => (
                <Card key={iv.id} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "3px" }}>{iv.candidate_name}</div>
                      <div style={{ color: T.text3, fontSize: "13px" }}>{iv.candidate_email}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                      <ScoreRing score={iv.match_score || 0} size={46} />
                      <Badge label={iv.status || "scheduled"}
                        color={(ivStatusColors[iv.status] || ivStatusColors.scheduled).color}
                        bg={(ivStatusColors[iv.status] || ivStatusColors.scheduled).bg}
                        border={(ivStatusColors[iv.status] || ivStatusColors.scheduled).border} />
                      {iv.email_sent
                        ? <Badge label="Email sent" color={T.green} bg={T.greenLo} border={T.greenBd} />
                        : (
                          <Btn size="sm" variant="ghost" onClick={() => resend(iv.candidate_id)}
                            disabled={resending === iv.candidate_id}>
                            {resending === iv.candidate_id ? <Spinner size={12} /> : <Icon.mail width={12} height={12} />} Resend
                          </Btn>
                        )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                    {[
                      ["Position", iv.job_title],
                      ["Interview Time", iv.interview_time
                        ? new Date(iv.interview_time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
                        : "TBD"],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <FieldLabel>{l}</FieldLabel>
                        <div style={{ color: T.text1, fontSize: "13px" }}>{v}</div>
                      </div>
                    ))}
                    <div>
                      <FieldLabel>Meet Link</FieldLabel>
                      <a href={iv.meet_link} target="_blank" rel="noreferrer"
                        style={{ color: T.accent, fontSize: "13px", textDecoration: "none", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Icon.calendar width={13} height={13} /> Join Meeting ↗
                      </a>
                    </div>
                  </div>

                  {/* Interview management: reschedule / complete / cancel */}
                  {iv.status === "scheduled" && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${T.border}`, alignItems: "center", flexWrap: "wrap" }}>
                      {reschedFor === iv.id ? (
                        <>
                          <input
                            type="datetime-local"
                            value={reschedVal}
                            onChange={e => setReschedVal(e.target.value)}
                            style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid ${T.border}`, fontSize: "12px", fontFamily: "inherit" }}
                          />
                          <Btn size="sm" variant="primary" disabled={!reschedVal || acting === iv.id}
                            onClick={() => reschedule(iv.id)}>
                            {acting === iv.id ? <Spinner size={11} color={T.bg} /> : <Icon.check width={12} height={12} />} Confirm
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => { setReschedFor(null); setReschedVal(""); }}>
                            <Icon.close width={12} height={12} /> Back
                          </Btn>
                        </>
                      ) : (
                        <>
                          <Btn size="sm" variant="ghost" disabled={acting === iv.id}
                            onClick={() => { setReschedFor(iv.id); setReschedVal(""); }}>
                            <Icon.refresh width={12} height={12} /> Reschedule
                          </Btn>
                          <Btn size="sm" variant="ghost" disabled={acting === iv.id}
                            onClick={() => completeIv(iv.id)}
                            style={{ borderColor: T.greenBd, color: T.green }}>
                            {acting === iv.id ? <Spinner size={11} /> : <Icon.check width={12} height={12} />} Mark Completed
                          </Btn>
                          <Btn size="sm" variant="danger" disabled={acting === iv.id}
                            onClick={() => cancelIv(iv.id)}>
                            {acting === iv.id ? <Spinner size={11} color={T.red} /> : <Icon.xCircle width={12} height={12} />} Cancel
                          </Btn>
                        </>
                      )}
                    </div>
                  )}

                  {/* Post-interview rating + notes (not for cancelled ones) */}
                  {iv.status !== "cancelled" && (
                    <FeedbackEditor iv={iv} onSaved={fetchData} />
                  )}
                </Card>
              ))}
            </div>
          )
      ) : (
        logs.length === 0
          ? <EmptyState icon={<Icon.inbox width={36} height={36} style={{ color: T.text3 }} />} title="No email logs yet" />
          : (
            <Card>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Type", "To", "Subject", "Status", "Time"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "11px 16px",
                        color: T.text3, fontSize: "10px",
                        letterSpacing: ".6px", textTransform: "uppercase",
                        borderBottom: `1px solid ${T.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge label={l.email_type}
                          color={l.email_type === "interview" ? T.accent : T.text2}
                          bg={l.email_type === "interview" ? T.accentLo : T.surfaceHi}
                          border={l.email_type === "interview" ? T.accentBd : T.border} />
                      </td>
                      <td style={{ padding: "12px 16px", color: T.text2, fontSize: "12px" }}>{l.to_email}</td>
                      <td style={{
                        padding: "12px 16px", color: T.text2, fontSize: "12px",
                        maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{l.subject}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge label={l.status}
                          color={l.status === "sent" ? T.green : T.red}
                          bg={l.status === "sent" ? T.greenLo : T.redLo}
                          border={l.status === "sent" ? T.greenBd : T.redBd} />
                      </td>
                      <td style={{ padding: "12px 16px", color: T.text3, fontSize: "11px" }}>
                        {new Date(l.sent_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
      )}
    </div>
  );
}

export { InterviewsTab };
