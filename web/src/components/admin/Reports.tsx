"use client";
import Link from "next/link";
import { useState } from "react";
import { useAdmin } from "./AdminShell";
import { Badge, Empty, ErrorBox, Loading, Pager, ago, useLoad } from "./ui";
import { adminApi, type ReportRow } from "@/lib/admin";

const TABS = [["open", "Open"], ["resolved", "Resolved"], ["dismissed", "Dismissed"]] as const;

export default function Reports() {
  const { canModerate, toast, refreshStats } = useAdmin();
  const [tab, setTab] = useState<string>("open");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(() => adminApi.reports(tab, page), [tab, page]);

  const handle = async (r: ReportRow, outcome: "dismiss" | "hide_listing" | "suspend_user" | "resolve", done: string) => {
    setBusy(r.id);
    try { await adminApi.handleReport(r.id, outcome); toast(done); reload(); refreshStats(); }
    catch (e) { toast((e as Error).message); }
    setBusy(null);
  };

  return (
    <div className="adm-page">
      <header className="adm-head"><div><h1>Reports</h1><div className="adm-sub">Listings and people that users have flagged. Three open reports hide a listing automatically.</div></div></header>
      <div className="adm-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPage(0); }}>{l}</button>)}</div>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>{tab === "open" ? "No open reports." : "Nothing here yet."}</Empty> : (
        <div className="adm-cards">
          {data.rows.map(r => (
            <article key={r.id} className="adm-card">
              <div className="adm-line top">
                <div>
                  <b>{r.reason}</b> {r.same_target > 1 && r.status === "open" && <Badge tone="bd">{r.same_target} reports on this {r.target_type}</Badge>}
                  <div className="adm-sub">{r.target_type === "listing" ? "Listing" : "User"}: {r.target_label ?? "deleted"}{r.target_status ? ` · now ${r.target_status}` : ""} · reported by {r.reporter ?? "someone"} · {ago(r.created_at)}</div>
                </div>
                <Badge tone={r.status === "open" ? "wr" : r.status === "resolved" ? "ok" : "gr"}>{r.status}</Badge>
              </div>
              {r.details && <p className="adm-text">“{r.details}”</p>}
              {r.resolution && <div className="adm-sub">Outcome: {r.resolution}{r.handled_at ? ` · ${ago(r.handled_at)}` : ""}</div>}
              <div className="adm-actions left">
                {r.target_type === "listing" && <Link className="adm-btn" href={`/admin/listings?open=${r.target_id}`}>Open listing</Link>}
                {r.status === "open" && (
                  <>
                    <button className="adm-btn" disabled={!canModerate || busy === r.id} onClick={() => handle(r, "dismiss", "Report dismissed.")}>Dismiss</button>
                    {r.target_type === "listing" && <button className="adm-btn" disabled={!canModerate || busy === r.id} onClick={() => handle(r, "hide_listing", "Listing hidden and reports closed.")}>Hide listing</button>}
                    <button className="adm-btn danger" disabled={!canModerate || busy === r.id} onClick={() => handle(r, "suspend_user", "Account suspended and its listings hidden.")}>Suspend {r.target_type === "listing" ? "owner" : "user"}</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Pager total={data?.total ?? 0} page={page} onPage={setPage} />
      {!canModerate && <div className="adm-sub" style={{ marginTop: 12 }}>Support can read reports but not act on them.</div>}
    </div>
  );
}
