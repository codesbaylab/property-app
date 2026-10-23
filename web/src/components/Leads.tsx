"use client";
/* eslint-disable @next/next/no-img-element -- listing thumbnails come from storage links */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { fmt } from "@/lib/listing";
import { loadLeads, setLeadStage, STAGES, type Lead, type Stage } from "@/lib/leads";
import { loadStats } from "@/lib/stats";
import { onNewMessage } from "@/lib/chat";

interface Props { onToast: (m: string) => void; onReply: (conversationId: string) => void; onOpenVisits: () => void; visitTodo: number }

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now.getTime() - d.getTime()) / 864e5);
  return days < 7 ? d.toLocaleDateString([], { weekday: "short" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
};

/** The agent work screen: how the listings are doing, and every enquiry moving through New, Contacted, Viewing, Closed. */
export default function Leads({ onToast, onReply, onOpenVisits, visitTodo }: Props) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [totals, setTotals] = useState<{ live: number; views: number } | null>(null);
  const [stage, setStage] = useState<Stage>("new");
  const [error, setError] = useState("");
  const [moving, setMoving] = useState("");

  const refresh = useCallback(async () => {
    try { setLeads(await loadLeads()); setError(""); } catch (e) { setError((e as Error).message); setLeads(l => l ?? []); }
  }, []);
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    loadStats().then(s => {
      const rows = Object.values(s);
      setTotals({ live: rows.filter(r => r.expiresAt && r.expiresAt.getTime() > Date.now()).length, views: rows.reduce((n, r) => n + r.views7d, 0) });
    }).catch(() => {});
    const off = onNewMessage(null, () => refresh());
    return () => { clearTimeout(t); off(); };
  }, [refresh]);

  const move = async (l: Lead, to: Stage) => {
    if (moving) return;
    setMoving(l.id);
    setLeads(cur => cur && cur.map(x => (x.id === l.id ? { ...x, stage: to } : x)));   // show it moving straight away
    const problem = await setLeadStage(l.id, to);
    if (problem) { onToast(problem); await refresh(); } else onToast(`Moved to ${STAGES.find(s => s.k === to)!.label}`);
    setMoving("");
  };

  const count = (k: Stage) => (leads ?? []).filter(l => l.stage === k).length;
  const shown = (leads ?? []).filter(l => l.stage === stage);

  return (
    <div className="vw">
      <h1>Leads</h1>
      <div className="sub">Everyone who has asked about your homes</div>
      <div className="lstats big" aria-label="Summary">
        <div><b>{totals?.live ?? "–"}</b><span>Live homes</span></div><div><b>{totals?.views ?? "–"}</b><span>Views · 7d</span></div>
        <div><b>{leads?.length ?? "–"}</b><span>Leads</span></div>
        <button type="button" onClick={onOpenVisits}><b>{visitTodo}</b><span>Visits to answer</span></button>
      </div>
      {error && <div className="err" role="alert" style={{ margin: "12px 0" }}>{error}</div>}
      <div className="seg full lstages" role="tablist" aria-label="Stage">
        {STAGES.map(s => <button key={s.k} role="tab" aria-selected={stage === s.k} className={stage === s.k ? "on" : ""} onClick={() => setStage(s.k)}>{s.label} {count(s.k)}</button>)}
      </div>
      {leads === null ? <div className="meta">Loading…</div> : shown.length === 0 ? (
        <div className="empty"><div className="ei"><Icon name="chat" /></div><h3>{leads.length === 0 ? "No leads yet" : `Nothing in ${STAGES.find(s => s.k === stage)!.label}`}</h3>
          {leads.length === 0 ? "When someone messages you about a home, they show up here." : "Move leads between stages as you follow up."}</div>
      ) : (
        <div className="mylist">
          {shown.map(l => (
            <article className="myl" key={l.id}>
              <div className="myl-top">
                {l.cover ? <img src={l.cover} alt="" /> : <div className="noimg"><Icon name="home" /></div>}
                <div className="myl-tx">
                  <div className="tags" style={{ marginBottom: 6 }}>
                    {l.unread > 0 && <span className="tag ok">{l.unread} new {l.unread === 1 ? "message" : "messages"}</span>}
                    {l.visit && <span className="tag">Visit {l.visit === "confirmed" ? "confirmed" : "pending"}</span>}
                  </div>
                  <b>{l.buyerName} <small style={{ fontWeight: 500, color: "var(--muted)" }}>{when(l.lastMessageAt)}</small></b>
                  <div className="meta">{l.type} · {fmt(l.price, l.mode)}{l.mode === "rent" && "/mo"} · {l.address}</div>
                </div>
              </div>
              {l.last && <p className="myl-note">{l.last.mine ? "You: " : ""}{l.last.body}</p>}
              <div className="myl-acts">
                <button className="btn primary" disabled={moving === l.id} onClick={() => onReply(l.id)}>Reply</button>
                {STAGES.filter(s => s.k !== l.stage).map(s => <button key={s.k} className="btn ghost" disabled={moving === l.id} onClick={() => move(l, s.k)}>{s.label}</button>)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
