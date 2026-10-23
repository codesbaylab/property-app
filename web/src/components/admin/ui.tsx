"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { PAGE } from "@/lib/admin";
import { fmt } from "@/lib/listing";

/** Loads data when the page opens or `deps` change. `reload()` fetches again and keeps showing the old data meanwhile. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then(
      data => { if (alive) setState({ data, error: "", loading: false }); },
      (e: Error) => { if (alive) setState(s => ({ ...s, error: e.message, loading: false })); },
    );
    return () => { alive = false; };
    // `load` is rebuilt on every render; it only re-runs when the listed inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick(t => t + 1) };
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending: "Pending review", live: "Live", rejected: "Rejected", sold_or_rented: "Sold / rented", expired: "Expired", hidden: "Hidden",
};
const STATUS_TONE: Record<string, string> = { live: "ok", pending: "wr", rejected: "bd", hidden: "gr", draft: "gr", expired: "gr", sold_or_rented: "bl" };

export const Badge = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`adm-badge ${tone}`}>{children}</span>;
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? "gr"}>{STATUS_LABEL[status] ?? status}</Badge>;

export const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartment", house: "House", villa: "Villa", plot: "Plot", commercial: "Commercial", pg_hostel: "PG / Hostel",
};
export const price = (n: number | string, mode: "buy" | "rent") => fmt(Number(n), mode) + (mode === "rent" ? "/mo" : "");

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="adm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`adm-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="adm-modal-head"><h2>{title}</h2><button className="adm-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ total, page, onPage, size = PAGE }: { total: number; page: number; onPage: (p: number) => void; size?: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return <div className="adm-pager"><span>{total} {total === 1 ? "result" : "results"}</span></div>;
  return (
    <div className="adm-pager">
      <span>{page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}</span>
      <div>
        <button className="adm-btn" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
        <span style={{ margin: "0 10px" }}>Page {page + 1} of {pages}</span>
        <button className="adm-btn" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="adm-empty">{children}</div>;
export const Loading = () => <div className="adm-empty" aria-busy="true">Loading…</div>;
export const ErrorBox = ({ message }: { message: string }) => <div className="adm-error" role="alert">{message}</div>;

/** Small map picture with a pin, built from four map tiles. Lets a reviewer check the pin against the address. */
export function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const z = 16, n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const tx = Math.floor(x), ty = Math.floor(y);
  const W = 360, H = 200;
  const left = W / 2 - (x - (tx - 1)) * 256, top = H / 2 - (y - (ty - 1)) * 256;
  const tiles: ReactNode[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    // eslint-disable-next-line @next/next/no-img-element
    tiles.push(<img key={`${dx}${dy}`} alt="" width={256} height={256} draggable={false}
      src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${ty + dy}/${tx + dx}`}
      style={{ position: "absolute", left: left + (dx + 1) * 256, top: top + (dy + 1) * 256 }} />);
  }
  return (
    <a className="adm-map" style={{ width: "100%", height: H }} href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer" aria-label="Open the pin in OpenStreetMap">
      <div style={{ position: "absolute", left: "50%", top: 0, width: W, height: H, marginLeft: -W / 2 }}>{tiles}</div>
      <span className="adm-pin" />
    </a>
  );
}
