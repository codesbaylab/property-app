"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { REPORT_REASONS } from "@/lib/data";
import { aboutOf, agentOf, amenitiesOf, factsOf, fmt, modeFor, priceFor, type Listing, type Mode } from "@/lib/listing";

export function Heart({ on, id, cls, onToggle }: { on: boolean; id: string; cls: string; onToggle: (id: string) => void }) {
  return (
    <button className={`${cls}${on ? " on" : ""}`} aria-label={on ? "Remove from saved" : "Save"}
      onClick={e => { e.stopPropagation(); onToggle(id); }}>
      <Icon name="heart" />
    </button>
  );
}

export function Toast({ msg, on }: { msg: string; on: boolean }) {
  return <div className={`toast glass${on ? " on" : ""}`} role="status">{msg}</div>;
}

interface Props {
  listing: Listing;
  mode: Mode;
  saved: boolean;
  onToggleSave: (id: string) => void;
  onClose: () => void;
  onToast: (m: string) => void;
  /** open instantly (used by the shareable page) instead of sliding up */
  immediate?: boolean;
  /** the full record is still being fetched: show placeholders for description, highlights and agent */
  loading?: boolean;
  /** lets signed-in people report the listing to the team (returns an error message or null) */
  report?: { signedIn: boolean; send: (reason: string, details: string) => Promise<string | null> };
  /** messaging, calling and saving need an account: show a sign-in prompt instead */
  signInRequired?: boolean;
  onNeedLogin?: () => void;
}

/** Full property screen. Used as an overlay on the map and as the shareable /home/<id> page. */
export default function ListingDetail({ listing: l, mode, saved, onToggleSave, onClose, onToast, immediate, loading, report, signInRequired, onNeedLogin }: Props) {
  const [shown, setShown] = useState(!!immediate);
  const [slide, setSlide] = useState(1);
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    if (immediate) return;
    const f = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(f);
  }, [immediate]);

  const close = () => {
    if (immediate) { onClose(); return; }
    setShown(false);
    setTimeout(onClose, 300);
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/home/${l.id}`); onToast("Link copied"); }
    catch { onToast("Couldn't copy the link"); }
  };

  const m = modeFor(l, mode);
  const price = fmt(priceFor(l, m), m);
  const shots = l.photos?.length ? l.photos : [0, 1, 2, 3].map(k => `https://picsum.photos/seed/${l.id}-${k}/900/650`);

  return (
    <>
      <div id="detail" className={shown ? "open" : ""}>
        <div className="dwrap">
          <div className="gal">
            <div className="gscroll" onScroll={e => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth) + 1)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {shots.map((s, i) => <img key={`${i}-${s}`} src={s} alt={`${l.type} at ${l.addr}`} />)}
            </div>
            <button className="round back" onClick={close} aria-label="Back"><Icon name="back" /></button>
            <button className="round share" onClick={share} aria-label="Share"><Icon name="share" /></button>
            <Heart on={saved} id={l.id} cls="round heart" onToggle={onToggleSave} />
            <span className="counter">{slide} / {shots.length}</span>
          </div>
          <div className="dbody">
            <div className="tags">
              <span className="tag">{m === "rent" ? "For rent" : "For sale"} · {l.type}</span>
              {l.verified && <span className="tag ok"><Icon name="verified" />Verified</span>}
            </div>
            <div className="big">{price}{m === "rent" && <small> / month</small>}</div>
            <div className="meta" style={{ marginTop: 4, fontSize: 15 }}>{l.addr}</div>
            <div className="facts">{factsOf(l).map(([v, label]) => <div className="fact" key={label}><b>{v}</b><span>{label}</span></div>)}</div>
            {loading ? (
              <div aria-busy="true"><div className="skel" style={{ height: 18, width: "40%", margin: "26px 0 12px" }} /><div className="skel" style={{ height: 70 }} /><div className="skel" style={{ height: 18, width: "30%", margin: "26px 0 12px" }} /><div className="skel" style={{ height: 40 }} /></div>
            ) : (<>
              <h3>About this property</h3>
              <p>{aboutOf(l)}</p>
              <h3>Highlights</h3>
              <div className="ams">{amenitiesOf(l).map(a => <span key={a}>{a}</span>)}</div>
              <h3>Listed by</h3>
              <div className="agent">
                <div className="av">{agentOf(l)[0]}</div>
                <div style={{ flex: 1 }}><b>{agentOf(l)}</b><small>{l.agent ? (l.agent.verified ? "Verified agent" : "Owner") : "Listing agent"}</small></div>
                {(l.agent?.verified ?? true) && <span className="tag ok" style={{ margin: 0 }}><Icon name="verified" /></span>}
              </div>
            </>)}
            {report?.signedIn && <button className="reportlink" onClick={() => setReporting(true)}>Report this listing</button>}
          </div>
        </div>
      </div>
      {reporting && report && <ReportSheet onClose={() => setReporting(false)} send={report.send} onToast={onToast} />}
      <div className="dbar glass">
        <div className="in">
          <div><div className="dp">{price}{m === "rent" && <small style={{ fontWeight: 500, color: "var(--muted)" }}> /mo</small>}</div><div className="dm">{l.agent?.verified ? "Verified agent" : "Listing agent"}</div></div>
          {signInRequired ? (
            <button className="btn primary" onClick={() => onNeedLogin?.()}>Sign in to message or call</button>
          ) : (
            <>
              <button className="btn ghost" onClick={() => onToast("Chat is coming soon")}>Message</button>
              <button className="btn primary" onClick={() => onToast("Calling is coming soon")}>Call</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReportSheet({ onClose, send, onToast }: { onClose: () => void; send: (reason: string, details: string) => Promise<string | null>; onToast: (m: string) => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    const problem = await send(reason, details);
    setBusy(false);
    if (problem) setError(problem); else { onToast("Thanks. Our team will take a look."); onClose(); }
  };
  return (
    <div className="rscrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rsheet" role="dialog" aria-modal="true" aria-label="Report this listing">
        <div className="sh"><h2>Report this listing</h2><button className="x" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map(r => (
            <label key={r} className={`ropt${reason === r ? " on" : ""}`}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}</label>
          ))}
        </div>
        <textarea className="rtext" rows={3} maxLength={1000} placeholder="Anything else we should know? (optional)" aria-label="Details" value={details} onChange={e => setDetails(e.target.value)} />
        {error && <div className="rerr" role="alert">{error}</div>}
        <div className="cta"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send report"}</button></div>
      </div>
    </div>
  );
}
