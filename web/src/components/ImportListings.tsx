"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { fmt } from "@/lib/listing";
import type { Account } from "@/lib/auth";
import { checkRows, importRows, MAX_IMPORT_ROWS, parseCsv, TEMPLATE, type Checked } from "@/lib/importer";

interface Props { account: Account; onBack: () => void; onToast: (m: string) => void; onDone: () => void }

/** Verified agents add many homes at once from a spreadsheet. They arrive as drafts, ready for photos. */
export default function ImportListings({ account, onBack, onToast, onDone }: Props) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<Checked | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const read = async (file: File | undefined) => {
    setError(""); setResult(null);
    if (!file) return;
    setName(file.name);
    if (file.size > 1_000_000) { setError("That file is too large. Keep it under 1 MB."); return; }
    try { setResult(checkRows(parseCsv(await file.text()))); } catch { setError("Could not read that file. Save it as CSV and try again."); }
  };

  const add = async () => {
    if (!result?.rows.length) return;
    setBusy(true); setError("");
    const problem = await importRows(account.id, result.rows);
    setBusy(false);
    if (problem) { setError(problem); return; }
    onToast(`${result.rows.length} ${result.rows.length === 1 ? "home" : "homes"} added as drafts. Open each to add photos and send it for review.`);
    onDone();
  };

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <div className="vw">
      <button type="button" className="backbtn" onClick={onBack}><Icon name="back" />My homes</button>
      <h1>Import from a spreadsheet</h1>
      <div className="sub">Add up to {MAX_IMPORT_ROWS} homes at once</div>

      <div className="steps">
        <div className="step"><i>1</i><div><b>Get the template</b><div className="meta">One home per row. Save your sheet as CSV.</div>
          <a className="btn ghost" style={{ display: "inline-block", marginTop: 8, padding: "9px 16px" }} href={template} download="nestmap-import-template.csv">Download template</a></div></div>
        <div className="step"><i>2</i><div><b>Choose your file</b><div className="meta">We check every row before adding anything.</div>
          <label className="btn primary docadd" style={{ marginTop: 8, padding: "9px 16px", display: "inline-flex" }}><Icon name="plus" />{name || "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" hidden onChange={e => { read(e.target.files?.[0]); e.target.value = ""; }} /></label></div></div>
        <div className="step"><i>3</i><div><b>Add photos later</b><div className="meta">Homes arrive as drafts. Open each one to add photos, then send it for review.</div></div></div>
      </div>

      {error && <div className="err" role="alert" style={{ margin: "12px 0" }}>{error}</div>}

      {result && result.problems.length > 0 && (
        <div className="myl-note bad" role="alert" style={{ margin: "14px 0" }}>
          <b>Fix these and choose the file again. Nothing was added.</b>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{result.problems.slice(0, 12).map(p => <li key={p}>{p}</li>)}</ul>
          {result.problems.length > 12 && <div style={{ marginTop: 6 }}>…and {result.problems.length - 12} more.</div>}
        </div>
      )}

      {result && result.rows.length > 0 && (
        <>
          <h3 className="vh">{result.rows.length} {result.rows.length === 1 ? "home" : "homes"} ready to add</h3>
          <div className="list">{result.rows.slice(0, 8).map((r, i) => (
            <div className="li" key={i}><div className="ic"><Icon name="home" /></div><div className="tx"><b>{r.type} · {fmt(r.price, r.mode)}{r.mode === "rent" && "/mo"}</b><small>{r.address}</small></div></div>
          ))}</div>
          {result.rows.length > 8 && <div className="meta" style={{ margin: "8px 2px" }}>…and {result.rows.length - 8} more</div>}
          <div className="pacts"><button className="btn primary" disabled={busy} onClick={add}>{busy ? "Adding…" : `Add ${result.rows.length} ${result.rows.length === 1 ? "home" : "homes"} as drafts`}</button></div>
        </>
      )}
    </div>
  );
}
