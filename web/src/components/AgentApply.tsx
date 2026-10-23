"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import type { Account } from "@/lib/auth";
import { applyAgent, loadApplication, MAX_DOCS, type Application } from "@/lib/agent";

interface Props { account: Account; onBack: () => void; onToast: (m: string) => void; onChanged: () => Promise<void> | void }

const PERKS = [
  ["verified", "A Verified badge on every listing you post"],
  ["home", "Post as many listings as you need, not just 3"],
  ["chat", "A leads list to follow up with every enquiry"],
] as const;

/** Becoming a verified agent: apply with agency details and documents; see where the application stands. */
export default function AgentApply({ account, onBack, onToast, onChanged }: Props) {
  const status = account.agentStatus;
  const [app, setApp] = useState<Application | null>(null);
  const [loaded, setLoaded] = useState(status === "none");
  const [f, setF] = useState({ agency: "", licenceNo: "", city: account.city ?? "", phone: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (status === "none") return;
    let alive = true;
    loadApplication(account.id).then(a => {
      if (!alive) return;
      setApp(a); setLoaded(true);
      if (a) setF({ agency: a.agency, licenceNo: a.licenceNo, city: a.city, phone: a.phone });
    }).catch(e => { if (alive) { setError((e as Error).message); setLoaded(true); } });
    return () => { alive = false; };
  }, [account.id, status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    const problem = await applyAgent(account.id, f, files);
    setBusy(false);
    if (problem) { setError(problem); return; }
    onToast("Application sent. We'll check it soon.");
    setEditing(false); setFiles([]);
    await onChanged();
  };

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...list].slice(0, MAX_DOCS);
    if (files.length + list.length > MAX_DOCS) setError(`You can add up to ${MAX_DOCS} documents.`); else setError("");
    setFiles(next);
  };

  const showForm = status === "none" || (status === "rejected" && editing);

  return (
    <div className="vw">
      <button type="button" className="backbtn" onClick={onBack}><Icon name="back" />Profile</button>
      <h1>Become an agent</h1>
      <div className="sub">Get verified so buyers trust your listings</div>

      {status === "verified" && (
        <div className="login">
          <div className="who"><div className="av" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}><Icon name="verified" /></div><div><b>You&apos;re a verified agent</b><div className="meta">The badge shows on all your listings.</div></div></div>
        </div>
      )}

      {status === "pending" && (
        <div className="login">
          <div className="who"><div className="av"><Icon name="clock" /></div><div><b>We&apos;re checking your details</b><div className="meta">This usually takes a day or two. We&apos;ll update this page.</div></div></div>
          {app && <dl className="agdl"><dt>Agency</dt><dd>{app.agency}</dd><dt>City</dt><dd>{app.city}</dd><dt>Sent</dt><dd>{app.submittedAt.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</dd></dl>}
        </div>
      )}

      {status === "rejected" && !editing && (
        <>
          <div className="myl-note bad" style={{ marginBottom: 14 }}><b>Not approved yet.</b> {loaded ? app?.rejectionReason || "The team asked for changes." : "Loading…"}</div>
          <button className="btn primary" style={{ width: "100%" }} onClick={() => setEditing(true)}>Fix and apply again</button>
        </>
      )}

      {showForm && (
        <>
          {status === "none" && <div className="list agperks">{PERKS.map(p => <div className="li" key={p[1]}><div className="ic"><Icon name={p[0]} /></div><div className="tx"><b>{p[1]}</b></div></div>)}</div>}
          {!loaded ? <div className="meta">Loading…</div> : (
            <form className="pform" style={{ marginTop: 18 }} onSubmit={submit}>
              <section>
                <h3>Your business</h3>
                <label className="ff"><span>Agency or business name</span><input value={f.agency} maxLength={120} onChange={e => set("agency", e.target.value)} placeholder="e.g. Kumar Realty" required /></label>
                <label className="ff"><span>RERA or licence number</span><input value={f.licenceNo} maxLength={60} onChange={e => set("licenceNo", e.target.value)} /><small>If you have one. It helps us approve you faster.</small></label>
                <div className="two">
                  <label className="ff"><span>City</span><input value={f.city} maxLength={80} onChange={e => set("city", e.target.value)} required /></label>
                  <label className="ff"><span>Phone</span><input type="tel" inputMode="tel" value={f.phone} maxLength={20} onChange={e => set("phone", e.target.value)} required /></label>
                </div>
              </section>
              <section>
                <h3>Documents</h3>
                <p className="meta" style={{ margin: 0 }}>Add a clear photo or PDF of your agent licence, RERA certificate or a government ID. Only our team can see these.</p>
                {files.length > 0 && (
                  <div className="docs">{files.map((file, i) => (
                    <div className="doc" key={`${file.name}-${i}`}><Icon name={file.type === "application/pdf" ? "list" : "home"} /><span>{file.name}</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><Icon name="x" /></button></div>
                  ))}</div>
                )}
                {files.length < MAX_DOCS && (
                  <label className="btn ghost docadd"><Icon name="plus" />Add a document
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={e => { pick(e.target.files); e.target.value = ""; }} /></label>
                )}
              </section>
              {error && <div className="err" role="alert">{error}</div>}
              <div className="pacts">
                {editing && <button type="button" className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>}
                <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send application"}</button>
              </div>
            </form>
          )}
        </>
      )}
      {!showForm && error && <div className="err" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
