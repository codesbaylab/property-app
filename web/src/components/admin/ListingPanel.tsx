"use client";
import { useState } from "react";
import { useAdmin } from "./AdminShell";
import { Badge, ErrorBox, Loading, Modal, StaticMap, StatusBadge, TYPE_LABEL, ago, price, useLoad } from "./ui";
import { adminApi } from "@/lib/admin";
import { photoUrl } from "@/lib/data";

const REJECT_REASONS = ["Photos don't match the address", "Price looks wrong", "Map pin is in the wrong place", "Duplicate listing", "Not enough details"];
const CHANGE_REASONS = ["Add more photos", "Add the floor number", "Describe the property in more detail", "Move the map pin to the exact spot"];
const ACTION_LABEL: Record<string, string> = {
  "listing.approve": "Approved", "listing.reject": "Rejected", "listing.request_changes": "Asked for changes", "listing.unpublish": "Unpublished", "listing.auto_hide": "Hidden automatically after reports",
};

/** Everything a reviewer needs about one listing, with the actions their role allows. */
export default function ListingPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { canModerate, toast, refreshStats } = useAdmin();
  const { data: l, error, loading, reload } = useLoad(() => adminApi.listing(id), [id]);
  const [ask, setAsk] = useState<null | "reject" | "request_changes">(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(0);

  const run = async (action: "approve" | "reject" | "request_changes" | "unpublish", reason?: string) => {
    setBusy(true);
    try {
      await adminApi.review(id, action, reason);
      toast({ approve: "Approved. It is live now.", reject: "Rejected. The owner can see why.", request_changes: "Sent back to the owner.", unpublish: "Unpublished." }[action]);
      setAsk(null); reload(); refreshStats(); onChanged();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  if (loading && !l) return <Loading />;
  if (error && !l) return <ErrorBox message={error} />;
  if (!l) return <div className="adm-empty">This listing no longer exists.</div>;

  const note = canModerate ? null : "Read-only role";
  const canApprove = ["pending", "hidden", "rejected", "expired"].includes(l.status);
  const shots = l.photos.map(photoUrl);

  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <div>
          <h2>{l.address}{l.locality ? `, ${l.locality}` : ""}</h2>
          <div className="adm-sub">{TYPE_LABEL[l.type] ?? l.type} for {l.mode === "buy" ? "sale" : "rent"} · {price(l.price, l.mode)} · posted {ago(l.created_at)} by {l.posted_as}</div>
        </div>
        <StatusBadge status={l.status} />
      </div>

      {l.reject_reason && <div className="adm-callout bd"><b>Last decision:</b> {l.reject_reason}</div>}

      <div className="adm-gallery">
        {shots.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="main" src={shots[photo] ?? shots[0]} alt={`Photo ${photo + 1} of ${shots.length}`} />
            <div className="thumbs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {shots.map((s, i) => <button key={s + i} className={i === photo ? "on" : ""} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}><img src={s} alt="" /></button>)}
            </div>
          </>
        ) : <div className="adm-empty">No photos</div>}
      </div>

      <div className="adm-cols">
        <section>
          <h3>Automatic checks</h3>
          <ul className="adm-flags">{l.flags.map((f, i) => <li key={i} className={f.level}>{f.level === "ok" ? "✓" : "!"} {f.text}</li>)}</ul>
          <h3>Pin on the map</h3>
          <StaticMap lat={l.lat} lng={l.lng} />
          <div className="adm-sub">{l.lat.toFixed(5)}, {l.lng.toFixed(5)} · click to open the larger map</div>
        </section>
        <section>
          <h3>Details</h3>
          <dl className="adm-dl">
            <dt>Bedrooms / baths</dt><dd>{l.beds} / {l.baths}</dd>
            <dt>Area</dt><dd>{l.area_sqft ? `${l.area_sqft} sq ft` : "—"}</dd>
            <dt>Floor</dt><dd>{l.floor ?? "—"}</dd>
            <dt>Facing</dt><dd>{l.facing ?? "—"}</dd>
            <dt>Furnishing</dt><dd>{l.furnishing ?? "—"}</dd>
            <dt>City</dt><dd>{l.city ?? "—"}</dd>
            {l.deposit ? (<><dt>Deposit</dt><dd>{price(l.deposit, "buy")}</dd></>) : null}
          </dl>
          <h3>Description</h3>
          <p className="adm-text">{l.description || "No description."}</p>
          {l.amenities?.length ? <div className="adm-chips">{l.amenities.map(a => <span key={a}>{a}</span>)}</div> : null}
        </section>
      </div>

      {l.owner && (
        <section className="adm-card-inner">
          <h3>Posted by</h3>
          <div className="adm-owner">
            <div className="adm-av">{(l.owner.name ?? "?")[0]}</div>
            <div>
              <b>{l.owner.name ?? "Unnamed"}</b> {l.owner.agent_status === "verified" && <Badge tone="ok">Verified agent</Badge>} {l.owner.account_status !== "active" && <Badge tone="bd">{l.owner.account_status}</Badge>}
              <div className="adm-sub">{l.owner.email} · {l.owner.listings} listing{l.owner.listings === 1 ? "" : "s"}</div>
            </div>
          </div>
        </section>
      )}

      {l.reports.length > 0 && (
        <section className="adm-card-inner">
          <h3>Reports from users ({l.reports.length})</h3>
          {l.reports.map(r => <div key={r.id} className="adm-line"><span><b>{r.reason}</b>{r.details ? ` — ${r.details}` : ""}</span><span className="adm-sub">{r.status} · {ago(r.created_at)}</span></div>)}
        </section>
      )}

      {l.history.length > 0 && (
        <section className="adm-card-inner">
          <h3>History</h3>
          {l.history.map((h, i) => (
            <div key={i} className="adm-line"><span><b>{ACTION_LABEL[h.action] ?? h.action}</b> · {h.actor_name ?? "System"}{typeof h.details?.reason === "string" && h.details.reason ? ` — “${h.details.reason}”` : ""}</span><span className="adm-sub">{ago(h.created_at)}</span></div>
          ))}
        </section>
      )}

      <div className="adm-actionbar">
        {note && <span className="adm-sub">{note}: you can look but not change.</span>}
        {l.status === "live" && <button className="adm-btn" disabled={!canModerate || busy} onClick={() => run("unpublish")}>Unpublish</button>}
        {l.status === "pending" && <button className="adm-btn" disabled={!canModerate || busy} onClick={() => setAsk("request_changes")}>Request changes</button>}
        {(l.status === "pending" || l.status === "live") && <button className="adm-btn danger" disabled={!canModerate || busy} onClick={() => setAsk("reject")}>Reject</button>}
        {canApprove && <button className="adm-btn primary" disabled={!canModerate || busy} onClick={() => run("approve")}>{l.status === "pending" ? "Approve" : "Approve and publish"}</button>}
      </div>

      {ask && <ReasonModal kind={ask} busy={busy} onClose={() => setAsk(null)} onSubmit={reason => run(ask, reason)} />}
    </div>
  );
}

function ReasonModal({ kind, busy, onClose, onSubmit }: { kind: "reject" | "request_changes"; busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const templates = kind === "reject" ? REJECT_REASONS : CHANGE_REASONS;
  return (
    <Modal title={kind === "reject" ? "Reject this listing" : "Ask the owner for changes"} onClose={onClose}>
      <p className="adm-sub" style={{ marginTop: 0 }}>The owner will see this message. Pick one or write your own.</p>
      <div className="adm-chips pick">{templates.map(t => <button key={t} type="button" className={reason === t ? "on" : ""} onClick={() => setReason(t)}>{t}</button>)}</div>
      <textarea className="adm-input" rows={3} placeholder="Reason" aria-label="Reason" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="adm-actions">
        <button className="adm-btn" onClick={onClose}>Cancel</button>
        <button className={`adm-btn ${kind === "reject" ? "danger" : "primary"}`} disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())}>{kind === "reject" ? "Reject listing" : "Send to owner"}</button>
      </div>
    </Modal>
  );
}
