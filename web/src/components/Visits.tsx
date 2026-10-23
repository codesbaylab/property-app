"use client";
/* eslint-disable @next/next/no-img-element -- listing thumbnails come from storage links */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { fmt } from "@/lib/listing";
import { loadVisits, respondVisit, type Visit, type VisitAction, type VisitStatus } from "@/lib/visits";

const DAYS = 14;
const SLOTS = [9, 10, 11, 12, 14, 15, 16, 17, 18];   // hours; lunchtime hour 13 left out

const hourLabel = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "pm" : "am"}`;
export const visitTime = (d: Date) =>
  `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

/** Pick a day (next two weeks) and an hour. Used to ask for a visit and to suggest another time. */
export function VisitSheet({ title, intro, confirm, withNote, onClose, onSubmit }: {
  title: string; intro?: string; confirm: string; withNote?: boolean;
  onClose: () => void; onSubmit: (at: Date, note: string) => Promise<string | null>;
}) {
  const days = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return d; });
  }, []);
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const at = (h: number) => { const d = new Date(days[day]); d.setHours(h, 0, 0, 0); return d; };
  const tooSoon = (h: number) => at(h).getTime() < Date.now() + 61 * 60000;

  const submit = async () => {
    if (hour === null) { setError("Pick a time."); return; }
    setBusy(true); setError("");
    const problem = await onSubmit(at(hour), note);
    setBusy(false);
    if (problem) setError(problem); else onClose();
  };

  return (
    <div className="rscrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rsheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sh"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {intro && <p className="meta" style={{ margin: "0 0 12px" }}>{intro}</p>}
        <div className="vdays" role="radiogroup" aria-label="Day">
          {days.map((d, i) => (
            <button key={i} type="button" role="radio" aria-checked={day === i} className={`vday${day === i ? " on" : ""}`} onClick={() => { setDay(i); setHour(null); setError(""); }}>
              <span>{i === 0 ? "Today" : d.toLocaleDateString([], { weekday: "short" })}</span><b>{d.getDate()}</b>
            </button>
          ))}
        </div>
        <div className="vslots" role="radiogroup" aria-label="Time">
          {SLOTS.map(h => (
            <button key={h} type="button" role="radio" aria-checked={hour === h} disabled={tooSoon(h)} className={`chip${hour === h ? " on" : ""}`} onClick={() => { setHour(h); setError(""); }}>{hourLabel(h)}</button>
          ))}
        </div>
        {withNote && <textarea className="rtext" rows={2} maxLength={300} placeholder="Anything the owner should know? (optional)" aria-label="Note" value={note} onChange={e => setNote(e.target.value)} />}
        {error && <div className="rerr" role="alert">{error}</div>}
        <div className="cta"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Sending…" : confirm}</button></div>
      </div>
    </div>
  );
}

const TAG: Record<VisitStatus, { label: string; tone?: "ok" | "bad" }> = {
  requested: { label: "Waiting for a reply" }, proposed: { label: "New time suggested" },
  confirmed: { label: "Confirmed", tone: "ok" }, declined: { label: "Declined", tone: "bad" }, cancelled: { label: "Cancelled" },
};

interface Props { onToast: (m: string) => void; onOpenListing: (id: string) => void; onChanged: () => void }

/** One list for both sides: visits you asked for, and requests from people who want to see your homes. */
export default function Visits({ onToast, onOpenListing, onChanged }: Props) {
  const [list, setList] = useState<Visit[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [suggest, setSuggest] = useState<Visit | null>(null);

  const refresh = useCallback(async () => {
    try { setList(await loadVisits()); setError(""); } catch (e) { setError((e as Error).message); setList(l => l ?? []); }
  }, []);
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [refresh]);

  const act = async (v: Visit, action: VisitAction, done: string) => {
    setBusy(v.id);
    const problem = await respondVisit(v.id, action);
    setBusy("");
    if (problem) onToast(problem); else onToast(done);
    await refresh(); onChanged();
  };

  const now = Date.now();
  const open = (v: Visit) => v.status !== "declined" && v.status !== "cancelled" && v.at.getTime() > now - 2 * 3600e3;
  const needs = (v: Visit) => v.at.getTime() > now && (v.asBuyer ? v.status === "proposed" : v.status === "requested");
  const waiting = (list ?? []).filter(needs);
  const upcoming = (list ?? []).filter(v => open(v) && !needs(v));
  const past = (list ?? []).filter(v => !open(v)).reverse();

  const card = (v: Visit) => {
    const t = TAG[v.status];
    const mine = v.asBuyer;
    return (
      <article className="myl" key={v.id}>
        <div className="myl-top">
          {v.cover ? <img src={v.cover} alt="" /> : <div className="noimg"><Icon name="home" /></div>}
          <div className="myl-tx">
            <div className="tags" style={{ marginBottom: 6 }}>
              <span className={`tag${t.tone === "ok" ? " ok" : t.tone === "bad" ? " bad" : ""}`}>{t.label}</span>
              <span className="tag">{mine ? "You asked" : "Asked by " + v.otherName}</span>
            </div>
            <b>{visitTime(v.at)}</b>
            <div className="meta">{v.type} · {fmt(v.price, v.mode)}{v.mode === "rent" && "/mo"} · {v.address}</div>
          </div>
        </div>
        {mine && <p className="myl-note">{v.status === "proposed" ? `${v.otherName} suggested this time instead.` : `With ${v.otherName}`}</p>}
        {v.note && <p className="myl-note">&ldquo;{v.note}&rdquo;</p>}
        <div className="myl-acts">
          {!mine && v.status === "requested" && v.at.getTime() > now && <>
            <button className="btn primary" disabled={busy === v.id} onClick={() => act(v, "accept", "Visit confirmed")}>Accept</button>
            <button className="btn ghost" disabled={busy === v.id} onClick={() => setSuggest(v)}>Suggest another time</button>
            <button className="btn ghost danger" disabled={busy === v.id} onClick={() => act(v, "decline", "Request declined")}>Decline</button>
          </>}
          {mine && v.status === "proposed" && v.at.getTime() > now && <>
            <button className="btn primary" disabled={busy === v.id} onClick={() => act(v, "accept", "Visit confirmed")}>Accept this time</button>
            <button className="btn ghost danger" disabled={busy === v.id} onClick={() => act(v, "decline", "Visit cancelled")}>Cancel</button>
          </>}
          {((mine && v.status === "requested") || v.status === "confirmed") && v.at.getTime() > now && (
            <button className="btn ghost danger" disabled={busy === v.id} onClick={() => { if (confirm("Cancel this visit?")) act(v, "cancel", "Visit cancelled"); }}>Cancel visit</button>
          )}
          <button className="btn ghost" onClick={() => onOpenListing(v.listingId)}>View home</button>
        </div>
      </article>
    );
  };

  const section = (title: string, items: Visit[]) => items.length > 0 && (
    <>
      <h3 className="vh">{title} · {items.length}</h3>
      <div className="mylist">{items.map(card)}</div>
    </>
  );

  return (
    <div className="vw">
      <h1>Visits</h1>
      <div className="sub">Homes you want to see, and people who want to see yours</div>
      {error && <div className="err" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      {list === null ? <div className="meta">Loading…</div> : list.length === 0 ? (
        <div className="empty"><div className="ei"><Icon name="home" /></div><h3>No visits yet</h3>Tap Request a visit on any home to pick a time. Requests for your own homes show up here.</div>
      ) : (<>
        {section("Needs your reply", waiting)}
        {section("Coming up", upcoming)}
        {section("Past and closed", past)}
      </>)}
      {suggest && (
        <VisitSheet title="Suggest another time" intro={`${suggest.otherName} asked for ${visitTime(suggest.at)}. Pick a time that works for you.`} confirm="Send suggestion"
          onClose={() => setSuggest(null)}
          onSubmit={async at => {
            const problem = await respondVisit(suggest.id, "propose", at);
            if (!problem) { onToast("New time sent"); await refresh(); onChanged(); }
            return problem;
          }} />
      )}
    </div>
  );
}
