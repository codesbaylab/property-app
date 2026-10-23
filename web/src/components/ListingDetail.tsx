"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
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
}

/** Full property screen. Used as an overlay on the map and as the shareable /home/<id> page. */
export default function ListingDetail({ listing: l, mode, saved, onToggleSave, onClose, onToast, immediate, loading }: Props) {
  const [shown, setShown] = useState(!!immediate);
  const [slide, setSlide] = useState(1);
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
              <span className="tag ok"><Icon name="verified" />Verified</span>
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
                <div style={{ flex: 1 }}><b>{agentOf(l)}</b><small>Verified agent · replies in ~1 hr</small></div>
                <span className="tag ok" style={{ margin: 0 }}><Icon name="verified" /></span>
              </div>
            </>)}
          </div>
        </div>
      </div>
      <div className="dbar glass">
        <div className="in">
          <div><div className="dp">{price}{m === "rent" && <small style={{ fontWeight: 500, color: "var(--muted)" }}> /mo</small>}</div><div className="dm">Verified agent · replies in ~1 hr</div></div>
          <button className="btn ghost" onClick={() => onToast("Chat opens here in the full app")}>Message</button>
          <button className="btn primary" onClick={() => onToast("Calling through Nestmap keeps your number private")}>Call</button>
        </div>
      </div>
    </>
  );
}
