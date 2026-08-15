/* CV upload drop-zone + parsed-result preview.
   Extracted from App.jsx (frontend decomposition, phase 4). Behaviour unchanged. */

import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/context";
import { T, Icon } from "../../ui/foundation";
import { Spinner, Alert, Card, FieldLabel, SkillPill } from "../../ui/primitives";

export function UploadZone({ onSuccess }) {
  const [drag,  setDrag]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [res,   setRes]   = useState(null);
  const [err,   setErr]   = useState(null);
  const [batch, setBatch] = useState(null); // BulkUploadResponse when >1 file dropped

  // FIX: pull handleLogout so api() redirects to login on 401
  const { handleLogout } = useAuth();

  const handle = async file => {
    if (!file) return;
    if (!file.name.match(/\.(pdf|docx|doc)$/i)) { setErr("Only PDF or DOCX files are supported"); return; }
    setBusy(true); setErr(null); setRes(null); setBatch(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      // FIX: pass handleLogout as 3rd arg — api() now sends JWT Bearer token in headers
      const d = await api(`/upload-cv`, { method: "POST", body: fd }, handleLogout);
      setRes(d);
      onSuccess?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // Multiple files: single request to /upload-cv-bulk, one FormData field
  // per file (same "files" key repeated) — FastAPI collects these into a list.
  const handleMany = async fileList => {
    const files = Array.from(fileList).filter(f =>
      f.name.match(/\.(pdf|docx|doc)$/i)
    );
    if (!files.length) { setErr("Only PDF or DOCX files are supported"); return; }
    setBusy(true); setErr(null); setRes(null); setBatch(null);
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    try {
      const d = await api(`/upload-cv-bulk`, { method: "POST", body: fd }, handleLogout);
      setBatch(d);
      onSuccess?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // Route single vs multi drop/pick to the right call
  const handleFiles = fileList => {
    if (!fileList || fileList.length === 0) return;
    if (fileList.length === 1) handle(fileList[0]);
    else handleMany(fileList);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
      {/* Drop Zone */}
      <div>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => document.getElementById("cvf").click()}
          style={{
            border: `2px dashed ${drag ? T.accent : T.border}`,
            borderRadius: "12px",
            padding: "56px 32px",
            textAlign: "center",
            cursor: "pointer",
            background: drag ? T.accentLo : T.surfaceHi,
            transition: "all .2s",
          }}
        >
          <input id="cvf" type="file" accept=".pdf,.docx,.doc" multiple
            style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
            {busy
              ? <Spinner size={36} color={T.accent} />
              : <Icon.fileText width={36} height={36} style={{ color: T.text3 }} />}
          </div>
          <div style={{ color: T.text1, fontWeight: 600, fontSize: "15px", marginBottom: "6px" }}>
            {busy ? "Parsing CV…" : "Drop CV here or click to upload"}
          </div>
          <div style={{ color: T.text3, fontSize: "13px" }}>PDF · DOCX · DOC supported — select or drop multiple files</div>
        </div>

        {err && <div style={{ marginTop: "12px" }}><Alert type="error"><Icon.alert width={14} height={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />{err}</Alert></div>}
      </div>

      {/* Result */}
      <div>
        {batch ? (
          <Card className="fade-up" style={{ padding: "22px" }}>
            <div style={{ color: T.text1, fontWeight: 700, fontSize: "14px", marginBottom: "14px" }}>
              Batch Upload: {batch.succeeded}/{batch.total} succeeded
              {batch.failed > 0 && (
                <span style={{ color: T.text3, fontWeight: 500 }}> &middot; {batch.failed} failed</span>
              )}
            </div>
            <div style={{ display: "grid", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
              {batch.results.map((r, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", gap: "12px",
                  padding: "8px 10px", borderRadius: "8px",
                  background: r.success ? T.greenLo : T.surfaceHi,
                  border: `1px solid ${r.success ? T.greenBd : T.border}`,
                }}>
                  <span style={{ color: T.text1, fontSize: "13px" }}>{r.filename}</span>
                  <span style={{ color: r.success ? T.green : T.text3, fontSize: "12px" }}>
                    {r.success ? (r.extracted?.name || "Parsed") : r.error}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : res ? (
          <Card className="fade-up" style={{ padding: "22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: T.greenLo, border: `1px solid ${T.greenBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.green,
              }}><Icon.check width={16} height={16} /></div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: "14px" }}>CV Parsed Successfully</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
              {[
                ["Name",       res.extracted?.name],
                ["Email",      res.extracted?.email],
                ["Phone",      res.extracted?.phone],
                ["Experience", `${res.extracted?.experience_years ?? "—"} years`],
              ].map(([l, v]) => (
                <div key={l}>
                  <FieldLabel>{l}</FieldLabel>
                  <div style={{ color: T.text1, fontSize: "13px", fontWeight: 500 }}>{v || "—"}</div>
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <FieldLabel>Education</FieldLabel>
                <div style={{ color: T.text1, fontSize: "13px" }}>{res.extracted?.education || "—"}</div>
              </div>
            </div>
            <div>
              <FieldLabel>Skills Detected ({(res.extracted?.skills || []).length})</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {(res.extracted?.skills || []).map(s => <SkillPill key={s} s={s} matched />)}
              </div>
            </div>
          </Card>
        ) : (
          <div style={{
            height: "100%", minHeight: "200px",
            border: `1px dashed ${T.border}`,
            borderRadius: "12px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: T.text3, fontSize: "13px", gap: "8px",
          }}>
            <Icon.search width={26} height={26} style={{ color: T.text3, opacity: .5 }} />
            <div>Parsed data will appear here</div>
          </div>
        )}
      </div>
    </div>
  );
}
