"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import ListingPanel from "./ListingPanel";
import { Badge, Empty, ErrorBox, Loading, Modal, Pager, StatusBadge, STATUS_LABEL, TYPE_LABEL, ago, price, useLoad } from "./ui";
import { adminApi } from "@/lib/admin";
import { photoUrl } from "@/lib/data";

export default function Listings() {
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [mode, setMode] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);
  const open = params.get("open");
  const { data, error, loading, reload } = useLoad(() => adminApi.listings({ status, search, mode, type, page }), [status, search, mode, type, page]);
  const reset = (fn: () => void) => { fn(); setPage(0); };
  const setOpen = (id: string | null) => router.replace(id ? `/admin/listings?open=${id}` : "/admin/listings", { scroll: false });

  return (
    <div className="adm-page">
      <header className="adm-head"><div><h1>Listings</h1><div className="adm-sub">{data ? `${data.total.toLocaleString("en-IN")} listings` : "All listings"}</div></div></header>
      <div className="adm-filters">
        <input className="adm-input" placeholder="Search address, area, owner, email or ID" aria-label="Search listings" value={search} onChange={e => reset(() => setSearch(e.target.value))} />
        <select className="adm-input" aria-label="Status" value={status} onChange={e => reset(() => setStatus(e.target.value))}>
          <option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="adm-input" aria-label="Buy or rent" value={mode} onChange={e => reset(() => setMode(e.target.value))}>
          <option value="">Buy and rent</option><option value="buy">Buy</option><option value="rent">Rent</option>
        </select>
        <select className="adm-input" aria-label="Property type" value={type} onChange={e => reset(() => setType(e.target.value))}>
          <option value="">All types</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No listings match.</Empty> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Listing</th><th>Type</th><th>Price</th><th>Posted by</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={e => { if (e.key === "Enter") setOpen(r.id); }}>
                  <td>
                    <div className="adm-cell">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.cover ? <img src={photoUrl(r.cover)} alt="" /> : <span className="ph" />}
                      <span><b>{r.address}</b><small>{r.locality ?? "—"}</small></span>
                    </div>
                  </td>
                  <td>{TYPE_LABEL[r.type] ?? r.type}<small>{r.mode === "buy" ? "Sale" : "Rent"}</small></td>
                  <td>{price(r.price, r.mode)}</td>
                  <td>{r.owner_name ?? "—"}<small>{r.owner_email}</small></td>
                  <td><StatusBadge status={r.status} />{r.open_reports > 0 && <> <Badge tone="bd">{r.open_reports} report{r.open_reports > 1 ? "s" : ""}</Badge></>}</td>
                  <td>{ago(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={data?.total ?? 0} page={page} onPage={setPage} />
      {open && <Modal title="Listing" wide onClose={() => setOpen(null)}><ListingPanel key={open} id={open} onChanged={reload} /></Modal>}
    </div>
  );
}
