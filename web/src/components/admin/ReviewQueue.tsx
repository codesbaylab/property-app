"use client";
import { useState } from "react";
import ListingPanel from "./ListingPanel";
import { Empty, ErrorBox, Loading, Pager, TYPE_LABEL, ago, price, useLoad } from "./ui";
import { adminApi } from "@/lib/admin";
import { photoUrl } from "@/lib/data";

/** Pending listings on the left, the one being reviewed on the right. */
export default function ReviewQueue() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(() => adminApi.listings({ status: "pending", search, page }), [search, page]);

  const rows = data?.rows ?? [];
  const active = chosen && rows.some(r => r.id === chosen) ? chosen : rows[0]?.id ?? null;   // after a decision the next one opens

  return (
    <div className="adm-page wide">
      <header className="adm-head">
        <div><h1>Review queue</h1><div className="adm-sub">{data ? `${data.total} waiting, newest first` : "Listings waiting for a decision"}</div></div>
        <input className="adm-input small" placeholder="Search address, owner or email" aria-label="Search the queue" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </header>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : rows.length === 0 ? (
        <Empty>{search ? "Nothing matches that search." : "The queue is empty. New listings from owners and agents will appear here."}</Empty>
      ) : (
        <div className="adm-split">
          <div className="adm-queue">
            {rows.map(r => (
              <button key={r.id} className={`adm-q${r.id === active ? " on" : ""}`} onClick={() => setChosen(r.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.cover ? <img src={photoUrl(r.cover)} alt="" /> : <span className="ph" />}
                <span>
                  <b>{r.address}</b>
                  <small>{TYPE_LABEL[r.type] ?? r.type} · {price(r.price, r.mode)}</small>
                  <small>{r.owner_name ?? "Unnamed"} · {ago(r.created_at)}</small>
                </span>
              </button>
            ))}
            <Pager total={data?.total ?? 0} page={page} onPage={setPage} />
          </div>
          {active && <ListingPanel key={active} id={active} onChanged={reload} />}
        </div>
      )}
    </div>
  );
}
