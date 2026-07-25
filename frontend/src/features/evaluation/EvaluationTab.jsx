/* Evaluation tab — seed dataset, run held-out benchmark, and browse metrics,
   the 6-config ablation, and per-sample results. Extracted from App.jsx
   (frontend decomposition, phase 5). Behaviour unchanged. */

import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/context";
import { T, Icon } from "../../ui/foundation";
import { Card, Badge, StatusBadge, SectionHead, EmptyState, Btn, Spinner, Alert } from "../../ui/primitives";

export function EvaluationTab() {
  const { handleLogout } = useAuth();
  const onUnauthed = useCallback(() => handleLogout(), [handleLogout]);

  const [sub,          setSub]          = useState("overview");
  const [evalData,     setEvalData]     = useState(null);
  const [ablationData, setAblationData] = useState(null);
  const [perSample,    setPerSample]    = useState([]);
  const [seeding,      setSeeding]      = useState(false);
  const [running,      setRunning]      = useState(false);
  const [seedMsg,      setSeedMsg]      = useState(null);
  const [err,          setErr]          = useState(null);
  const [datasetSize,  setDatasetSize]  = useState(null);

  const seedDataset = async () => {
    setSeeding(true); setErr(null); setSeedMsg(null);
    try {
      const r = await api("/evaluation/seed-dataset", { method: "POST" }, onUnauthed);
      setSeedMsg(r.message || `Seeded ${r.seeded ?? ""} labelled CV-job pairs`);
    } catch (e) { setErr(e.message); }
    finally { setSeeding(false); }
  };

  const runEvaluation = async () => {
    setRunning(true); setErr(null);
    try {
      const r = await api("/evaluation/run", { method: "POST" }, onUnauthed);
      setEvalData(r);
      const [samples, abl] = await Promise.all([
        api("/evaluation/results", {}, onUnauthed),
        api("/evaluation/ablation", {}, onUnauthed),
      ]);
      setPerSample(Array.isArray(samples) ? samples : []);
      setAblationData(abl);
      if (abl?.dataset_size) setDatasetSize(abl.dataset_size);
      setSub("overview");
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  };

  useEffect(() => {
    Promise.all([
      api("/evaluation/results", {}, onUnauthed).catch(() => []),
      api("/evaluation/ablation", {}, onUnauthed).catch(() => null),
    ]).then(([samples, abl]) => {
      setPerSample(Array.isArray(samples) ? samples : []);
      setAblationData(abl);
      if (abl?.dataset_size) setDatasetSize(abl.dataset_size);
    });
  }, []); // eslint-disable-line

  /* sub-tab pill */
  const SubPill = ({ id, label }) => (
    <button onClick={() => setSub(id)} style={{
      padding: "6px 16px", borderRadius: "7px",
      border: sub === id ? `1px solid ${T.accentBd}` : `1px solid transparent`,
      background: sub === id ? T.accentLo : "transparent",
      color: sub === id ? T.accent : T.text3,
      cursor: "pointer", fontSize: "13px", fontWeight: 600,
      fontFamily: "inherit", transition: "all .15s",
    }}>{label}</button>
  );

  /* metric card */
  const MetricCard = ({ label, value, Ic, color, note }) => (
    <Card style={{ padding: "22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color, borderRadius: "12px 12px 0 0",
      }} />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px", color }}>
        <Ic width={20} height={20} />
      </div>
      <div style={{
        color, fontSize: "32px", fontWeight: 700, lineHeight: 1,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value != null ? value : "—"}
      </div>
      <div style={{
        color: T.text2, fontSize: "11px", fontWeight: 600,
        marginTop: "6px", textTransform: "uppercase", letterSpacing: ".5px",
      }}>{label}</div>
      {note && <div style={{ color: T.text3, fontSize: "11px", marginTop: "3px" }}>{note}</div>}
    </Card>
  );

  /* confusion matrix 2x2 */
  const ConfusionMatrix = ({ cm }) => {
    if (!cm) return null;
    const { TP = 0, TN = 0, FP = 0, FN = 0 } = cm;
    const total = TP + TN + FP + FN;
    const cells = [
      { abbr: "TP", val: TP, color: T.green,  bg: T.greenLo,  border: T.greenBd,  desc: "Correctly Shortlisted" },
      { abbr: "FP", val: FP, color: T.amber,  bg: T.amberLo,  border: T.amberBd,  desc: "Wrongly Shortlisted" },
      { abbr: "FN", val: FN, color: T.red,    bg: T.redLo,    border: T.redBd,    desc: "Wrongly Rejected" },
      { abbr: "TN", val: TN, color: T.accent, bg: T.accentLo, border: T.accentBd, desc: "Correctly Rejected" },
    ];
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: "4px", alignItems: "center", marginBottom: "4px" }}>
          <div />
          <div style={{ textAlign: "center", color: T.text3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>Predicted: Shortlisted</div>
          <div style={{ textAlign: "center", color: T.text3, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>Predicted: Rejected</div>
        </div>
        {[["Actual: Shortlisted", 0, 1], ["Actual: Rejected", 2, 3]].map(([rowLabel, a, b]) => (
          <div key={rowLabel} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: "4px", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "10px" }}>
              <span style={{ color: T.text3, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", textAlign: "right" }}>{rowLabel}</span>
            </div>
            {[cells[a], cells[b]].map(c => (
              <div key={c.abbr} style={{
                background: c.bg, border: `2px solid ${c.border}`,
                borderRadius: "10px", padding: "16px 12px", textAlign: "center",
              }}>
                <div style={{ color: c.color, fontSize: "34px", fontWeight: 700, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{c.val}</div>
                <div style={{ color: c.color, fontSize: "11px", fontWeight: 700, marginTop: "5px" }}>{c.abbr}</div>
                <div style={{ color: T.text3, fontSize: "10px", marginTop: "2px" }}>{c.desc}</div>
                {total > 0 && <div style={{ color: T.text3, fontSize: "9px", marginTop: "2px" }}>{(c.val / total * 100).toFixed(1)}%</div>}
              </div>
            ))}
          </div>
        ))}
        <div style={{ textAlign: "center", marginTop: "8px", color: T.text3, fontSize: "11px" }}>
          Total: <strong style={{ color: T.text2 }}>{total}</strong> samples evaluated
        </div>
      </div>
    );
  };

  /* ── Overview pane ── */
  const OverviewPane = () => (
    <div style={{ display: "grid", gap: "22px" }}>
      {evalData ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricCard label="Accuracy"  value={evalData.accuracy_pct  != null ? `${evalData.accuracy_pct}%`  : null} Ic={Icon.target} color={T.green}  note={`${evalData.correct_predictions ?? ""}/${evalData.total_samples ?? ""} correct`} />
            <MetricCard label="Precision" value={evalData.precision_pct != null ? `${evalData.precision_pct}%` : null} Ic={Icon.search} color={T.accent} note="Of predicted positives" />
            <MetricCard label="Recall"    value={evalData.recall_pct    != null ? `${evalData.recall_pct}%`    : null} Ic={Icon.radar}  color={T.amber}  note="Of actual positives" />
            <MetricCard label="F1 Score"  value={evalData.f1_score      != null ? `${evalData.f1_score}%`      : null} Ic={Icon.zap}    color={T.purple} note="Harmonic mean P+R" />
          </div>
          <Card style={{ padding: "24px" }}>
            <SectionHead>Confusion Matrix</SectionHead>
            <ConfusionMatrix cm={evalData.confusion_matrix} />
          </Card>
        </>
      ) : (
        <EmptyState icon={<Icon.chart width={36} height={36} style={{ color: T.text3 }} />} title="No evaluation data yet" sub="Seed the dataset and run evaluation to see metrics" />
      )}
    </div>
  );

  /* ── Ablation pane ── */
  const AblationPane = () => {
    if (!ablationData) return <EmptyState icon={<Icon.flask width={36} height={36} style={{ color: T.text3 }} />} title="No ablation data yet" sub="Run evaluation first" />;
    const rows = ablationData.ablation || [];
    const PROPOSED = "Proposed (50/30/20)";
    const bestF1 = rows.length ? Math.max(...rows.map(r => parseFloat(r.f1_score) || 0)) : 0;
    return (
      <div style={{ display: "grid", gap: "18px" }}>
        {ablationData.best_config && (
          <div style={{
            padding: "14px 18px",
            background: T.greenLo, border: `1px solid ${T.greenBd}`,
            borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <Icon.trophy width={20} height={20} style={{ color: T.green, flexShrink: 0 }} />
            <div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: "14px" }}>Best Config: {ablationData.best_config}</div>
              {ablationData.conclusion && <div style={{ color: T.text3, fontSize: "12px", marginTop: "2px" }}>{ablationData.conclusion}</div>}
            </div>
          </div>
        )}
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surfaceHi }}>
                {["Configuration", "Skill Wt", "Exp Wt", "TF-IDF Wt", "Accuracy", "Precision", "Recall", "F1 Score", ""].map(h => (
                  <th key={h} style={{
                    textAlign: h === "Configuration" ? "left" : "center",
                    padding: "11px 12px", color: T.text3,
                    fontSize: "10px", letterSpacing: ".5px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isProposed = row.config === PROPOSED;
                const isBest = parseFloat(row.f1_score) === bestF1 && bestF1 > 0;
                return (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${T.border}`,
                    background: isProposed
                      ? T.greenLo
                      : i % 2 === 0 ? "transparent" : T.surfaceHi,
                  }}>
                    <td style={{ padding: "13px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: isProposed ? T.green : T.text2, fontWeight: isProposed ? 700 : 500, fontSize: "13px" }}>
                          {row.config}
                        </span>
                        {isProposed && <Badge label="PROPOSED" color={T.green}  bg={T.greenLo} border={T.greenBd} />}
                        {isBest     && <Badge label="BEST"     color={T.amber}  bg={T.amberLo} border={T.amberBd} />}
                      </div>
                    </td>
                    {[
                      row.weights?.skill       != null ? `${(row.weights.skill       * 100).toFixed(0)}%` : "—",
                      row.weights?.experience  != null ? `${(row.weights.experience  * 100).toFixed(0)}%` : "—",
                      row.weights?.tfidf       != null ? `${(row.weights.tfidf       * 100).toFixed(0)}%` : "—",
                    ].map((v, j) => (
                      <td key={j} style={{ padding: "13px 12px", textAlign: "center", color: T.text3, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace" }}>{v}</td>
                    ))}
                    {[
                      { v: row.accuracy_pct,  c: T.green  },
                      { v: row.precision_pct, c: T.accent },
                      { v: row.recall_pct,    c: T.amber  },
                      { v: row.f1_score,      c: T.purple },
                    ].map(({ v, c }, j) => (
                      <td key={j} style={{ padding: "13px 12px", textAlign: "center" }}>
                        <span style={{
                          color: isProposed || isBest ? c : T.text2,
                          fontWeight: isProposed || isBest ? 700 : 400,
                          fontSize: "13px", fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {v != null ? `${v}%` : "—"}
                        </span>
                      </td>
                    ))}
                    <td style={{ padding: "13px 12px", textAlign: "center" }}>
                      {isProposed && <Icon.star width={13} height={13} style={{ color: T.amber, display: "inline-block" }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        {/* Side-by-side confusion matrices for Proposed vs Equal */}
        {rows.filter(r => r.confusion).length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {rows
              .filter(r => r.config === PROPOSED || r.config === "Equal Weights (33/33/34)")
              .filter(r => r.confusion)
              .map(r => (
                <Card key={r.config} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px", marginBottom: "14px", color: r.config === PROPOSED ? T.green : T.text2 }}>
                    {r.config === PROPOSED && <Icon.star width={13} height={13} style={{ color: T.amber }} />}
                    {r.config}
                  </div>
                  <ConfusionMatrix cm={r.confusion} />
                </Card>
              ))}
          </div>
        )}
      </div>
    );
  };

  /* ── Per-Sample pane ── */
  const PerSamplePane = () => {
    const [filter, setFilter] = useState("all");
    if (!perSample.length) return <EmptyState icon={<Icon.list width={36} height={36} style={{ color: T.text3 }} />} title="No per-sample results yet" sub="Run evaluation to see individual CV results" />;
    const correct   = perSample.filter(r => r.is_correct).length;
    const incorrect = perSample.length - correct;
    const filtered  = filter === "correct" ? perSample.filter(r => r.is_correct)
                    : filter === "incorrect" ? perSample.filter(r => !r.is_correct)
                    : perSample;
    return (
      <div style={{ display: "grid", gap: "14px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {[
            { id: "all",       label: `All (${perSample.length})`, Ic: null },
            { id: "correct",   label: `Correct (${correct})`, Ic: Icon.check },
            { id: "incorrect", label: `Wrong (${incorrect})`, Ic: Icon.xCircle },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "6px 14px", borderRadius: "7px",
              border: filter === f.id ? `1px solid ${T.accentBd}` : `1px solid transparent`,
              background: filter === f.id ? T.accentLo : "transparent",
              color: filter === f.id ? T.accent : T.text3,
              cursor: "pointer", fontSize: "12px", fontWeight: 600,
              fontFamily: "inherit", transition: "all .15s",
            }}>{f.Ic && <f.Ic width={12} height={12} />}{f.label}</button>
          ))}
          <span style={{ marginLeft: "auto", color: T.text3, fontSize: "12px" }}>
            Accuracy: <strong style={{ color: T.green }}>{(correct / perSample.length * 100).toFixed(1)}%</strong>
          </span>
        </div>
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.surfaceHi }}>
                {["#", "CV Snippet", "Ground Truth", "Predicted", "Score", "Skill%", "Exp%", "TF-IDF%", "Result"].map(h => (
                  <th key={h} style={{
                    textAlign: h === "CV Snippet" ? "left" : "center",
                    padding: "10px 11px", color: T.text3,
                    fontSize: "10px", letterSpacing: ".5px", textTransform: "uppercase",
                    borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: r.is_correct ? T.greenLo : T.redLo,
                  opacity: r.is_correct ? 1 : .85,
                }}>
                  <td style={{ padding: "10px 11px", textAlign: "center", color: T.text3, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</td>
                  <td style={{ padding: "10px 11px", maxWidth: "180px" }}>
                    <div style={{ color: T.text2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cv_text}>
                      {(r.cv_text || "").slice(0, 55).replace(/\n/g, " ")}…
                    </div>
                  </td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}><StatusBadge status={r.ground_truth_label === "shortlisted" ? "shortlisted" : "rejected"} /></td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}><StatusBadge status={r.predicted_label  === "shortlisted" ? "shortlisted" : "rejected"} /></td>
                  <td style={{ padding: "10px 11px", textAlign: "center" }}>
                    <span style={{
                      color: r.predicted_score >= 70 ? T.green : r.predicted_score >= 50 ? T.amber : T.red,
                      fontWeight: 700, fontSize: "12px", fontFamily: "'JetBrains Mono', monospace",
                    }}>{r.predicted_score != null ? `${parseFloat(r.predicted_score).toFixed(1)}%` : "—"}</span>
                  </td>
                  {[r.skill_score, r.experience_score, r.tfidf_score].map((v, j) => (
                    <td key={j} style={{ padding: "10px 11px", textAlign: "center", color: T.text3, fontSize: "11px", fontFamily: "'JetBrains Mono', monospace" }}>
                      {v != null ? `${parseFloat(v).toFixed(1)}%` : "—"}
                    </td>
                  ))}
                  <td style={{ padding: "10px 11px", textAlign: "center" }}>
                    {r.is_correct
                      ? <Icon.check width={15} height={15} style={{ color: T.green, display: "inline-block" }} />
                      : <Icon.xCircle width={15} height={15} style={{ color: T.red, display: "inline-block" }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* Action bar */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: T.text1, marginBottom: "3px", display: "flex", alignItems: "center", gap: "7px" }}>
              <Icon.flask width={15} height={15} style={{ color: T.accent }} /> Matching Evaluation Suite
            </div>
            <div style={{ color: T.text3, fontSize: "12px" }}>
              50-sample labelled dataset · 6-config ablation · per-CV results table
              {datasetSize && <span style={{ color: T.accent, marginLeft: "10px" }}>Dataset: {datasetSize} samples</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <Btn onClick={seedDataset} disabled={seeding} variant="secondary">
              {seeding ? <><Spinner size={13} /> Seeding…</> : <><Icon.seedling width={14} height={14} /> Seed Dataset</>}
            </Btn>
            <Btn onClick={runEvaluation} disabled={running} variant="primary">
              {running ? <><Spinner size={13} color={T.bg} /> Evaluating…</> : <><Icon.play width={13} height={13} /> Run Evaluation</>}
            </Btn>
          </div>
        </div>
        {seedMsg && <div style={{ marginTop: "12px" }}><Alert type="success"><Icon.check width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{seedMsg}</Alert></div>}
        {err     && <div style={{ marginTop: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}
      </Card>

      {/* Sub-tab pills */}
      <div style={{ display: "flex", gap: "6px" }}>
        <SubPill id="overview"  label="Metrics & Confusion Matrix" />
        <SubPill id="ablation"  label="Ablation Study (6 configs)" />
        <SubPill id="perSample" label={`Per-Sample Results${perSample.length ? ` (${perSample.length})` : ""}`} />
      </div>

      <div className="fade-in" key={sub}>
        {sub === "overview"  && <OverviewPane />}
        {sub === "ablation"  && <AblationPane />}
        {sub === "perSample" && <PerSamplePane />}
      </div>
    </div>
  );
}
