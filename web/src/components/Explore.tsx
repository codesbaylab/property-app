"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import ModeControl from "./ModeControl";
import ListingDetail, { Heart, Toast } from "./ListingDetail";
import { InboxView, PostView, ProfileView, SavedView, type Page } from "./Views";
import type { FlyTo, View } from "./MapView";
import { useSaved, useTheme, useToast } from "@/lib/hooks";
import { PT, RANGE, RES, fmt, inBounds, modeFor, priceFor, spec, type Listing, type Mode, type PType } from "@/lib/listing";
import { getListing, isSampleId, loadListings } from "@/lib/data";
import { generateListing } from "@/lib/sample";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

type Sheet = null | "card" | "list" | "filter";
const START: [number, number] = [75.7804, 11.2588]; // Kozhikode, until the browser tells us where the user is

export default function Explore() {
  const { saved, toggle } = useSaved();
  const { pref, setPref, dark } = useTheme();
  const { toast, toastMsg, toastOn } = useToast();

  // what the user is looking for
  const [mode, setMode] = useState<Mode>("buy");
  const [type, setType] = useState<PType | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [beds, setBeds] = useState(0);

  // data + map
  const [byId, setById] = useState<Map<string, Listing>>(new Map());
  const [view, setView] = useState<View | null>(null);
  const [fly, setFly] = useState<FlyTo | null>(null);
  const flyKey = useRef(0);

  // screens
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("explore");
  const [closeSignal, setCloseSignal] = useState(0);
  const [query, setQuery] = useState("");
  const [draftPrice, setDraftPrice] = useState(0);
  const [draftBeds, setDraftBeds] = useState(0);

  const all = useMemo(() => [...byId.values()], [byId]);

  // load listings for whatever part of the world the map is showing, for the chosen mode / type / price / bedrooms
  useEffect(() => {
    if (!view) return;
    let alive = true;
    loadListings(view, { mode, type, maxPrice, beds }, ls => {
      if (!alive) return;
      setById(prev => {
        const changed = ls.some(l => { const old = prev.get(l.id); return !old || (old.approx && !l.approx); });
        if (!changed) return prev;   // nothing new, keep the same map
        const next = new Map(prev);
        for (const l of ls) { const old = next.get(l.id); if (!old || (old.approx && !l.approx)) next.set(l.id, l); }
        return next;
      });
    });
    return () => { alive = false; };
  }, [view, mode, type, maxPrice, beds]);

  // a saved home or an open card may be for a listing the map has not loaded, and an open property page needs the full record
  const tried = useRef(new Set<string>());
  useEffect(() => {
    const need = (id: string, full: boolean) => !isSampleId(id) && (full ? !byId.get(id)?.full : !byId.has(id)) && !tried.current.has(`${id}|${full}`);
    const wanted = [
      ...[...saved, cardId].filter((id): id is string => !!id).filter(id => need(id, false)).map(id => [id, false] as const),
      ...(detailId && need(detailId, true) ? [[detailId, true] as const] : []),
    ];
    if (!wanted.length) return;
    wanted.forEach(([id, full]) => tried.current.add(`${id}|${full}`));
    Promise.all(wanted.map(([id]) => getListing(id))).then(found => {
      const ls = found.filter((l): l is Listing => !!l);
      if (ls.length) setById(prev => { const next = new Map(prev); for (const l of ls) next.set(l.id, l); return next; });
    });
  }, [saved, detailId, cardId, byId]);

  const visible = useMemo(() => all.filter(l =>
    priceFor(l, mode) > 0 && (!type || l.type === type) && (!maxPrice || priceFor(l, mode) <= maxPrice) && l.beds >= beds
  ), [all, mode, type, maxPrice, beds]);
  const pins = useMemo(() => visible.map(l => ({ id: l.id, lat: l.lat, lng: l.lng, label: fmt(priceFor(l, mode), mode) })), [visible, mode]);
  const inView = useMemo(() => (view ? visible.filter(l => inBounds(l, view)) : []), [visible, view]);

  const flyTo = useCallback((lat: number, lng: number, zoom?: number) => setFly({ lat, lng, zoom, key: ++flyKey.current }), []);
  const lookup = (id: string | null) => (id ? byId.get(id) ?? (isSampleId(id) ? generateListing(id) : null) : null);

  const closeSheets = useCallback(() => { setSheet(null); setSelectedId(null); }, []);
  const closeAll = useCallback(() => { closeSheets(); setCloseSignal(n => n + 1); }, [closeSheets]);   // also closes the sub-type list
  const select = useCallback((id: string) => {
    const l = byId.get(id);
    setSelectedId(id); setCardId(id); setSheet("card");
    if (l) flyTo(l.lat, l.lng);
  }, [flyTo, byId]);

  const changeMode = (m: Mode) => {
    setMode(m); setMaxPrice(null);
    setType(t => (t && !PT.find(p => p.k === t)!.m.includes(m) ? null : t));   // e.g. Plot has no rentals
    closeSheets();   // keep the sub-type list open: the user is about to pick from it
  };
  const changeType = (t: PType | null) => {
    setType(t); setMaxPrice(null);
    if (t && !RES.includes(t)) setBeds(0);   // bedrooms only make sense for homes
    closeSheets();
  };

  const go = (p: Page) => { setPage(p); setDetailId(null); closeAll(); };
  const showBeds = !type || RES.includes(type);
  const [rMin, rMax, rStep] = RANGE[mode];
  const filtersOn = !!maxPrice || beds > 0;

  const openFilter = () => { setDraftPrice(maxPrice ?? rMax); setDraftBeds(beds); setSheet("filter"); };
  const applyFilter = () => { setMaxPrice(draftPrice >= rMax ? null : draftPrice); setBeds(showBeds ? draftBeds : 0); closeAll(); };
  const resetFilter = () => { setMaxPrice(null); setBeds(0); setDraftPrice(rMax); setDraftBeds(0); };

  const search = async (q: string) => {
    if (!q.trim()) return;
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`)).json() as { lat: string; lon: string }[];
      if (r[0]) flyTo(+r[0].lat, +r[0].lon, 13); else toast("Couldn't find that place");
    } catch { toast("Search needs an internet connection"); }
  };
  const locate = useCallback((zoom: number) => {
    navigator.geolocation?.getCurrentPosition(p => flyTo(p.coords.latitude, p.coords.longitude, zoom), () => toast("Location is turned off"));
  }, [flyTo, toast]);
  useEffect(() => { navigator.geolocation?.getCurrentPosition(p => flyTo(p.coords.latitude, p.coords.longitude, 13), () => {}); }, [flyTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDetailId(null); closeAll(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [closeAll]);

  const card = lookup(cardId);
  const detail = lookup(detailId);
  const savedItems = [...saved].map(id => lookup(id)).filter((l): l is Listing => !!l);
  const cm = card ? modeFor(card, mode) : mode;

  return (
    <>
      <MapView pins={pins} selectedId={selectedId} dark={dark} fly={fly} start={START}
        onSelect={select} onMove={setView} onBackgroundClick={closeAll} />

      <div className="top">
        <label className="search glass">
          <Icon name="search" />
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { search(query); e.currentTarget.blur(); } }}
            placeholder="Search area, city or landmark" autoComplete="off" aria-label="Search" />
        </label>
        <button className="fbtn glass" onClick={openFilter} aria-label="Filters"><Icon name="sliders" /><i className="dot" style={{ display: filtersOn ? "block" : undefined }} /></button>
      </div>

      <ModeControl mode={mode} type={type} onMode={changeMode} onType={changeType} closeSignal={closeSignal} />

      <button className="listbtn" onClick={() => setSheet("list")}><Icon name="list" /><span>List · {inView.length}</span></button>
      <button className="locate glass" onClick={() => locate(14)} aria-label="My location"><Icon name="locate" /></button>

      <nav className="nav glass" aria-label="Main">
        <div className="brandmark">N</div>
        <button className={page === "explore" ? "on" : ""} onClick={() => go("explore")}><Icon name="map" /><span>Explore</span></button>
        <button className={page === "saved" ? "on" : ""} onClick={() => go("saved")}><Icon name="heart" /><span>Saved</span>{saved.size > 0 && <i className="bdg">{saved.size}</i>}</button>
        <button className={`post${page === "post" ? " on" : ""}`} onClick={() => go("post")} aria-label="Post a property"><Icon name="plus" /><span>Post</span></button>
        <button className={page === "inbox" ? "on" : ""} onClick={() => go("inbox")}><Icon name="chat" /><span>Inbox</span><i className="bdg">2</i></button>
        <button className={`prof${page === "profile" ? " on" : ""}`} onClick={() => go("profile")}><Icon name="user" /><span>Profile</span></button>
      </nav>

      <div className={`view${page !== "explore" ? " open" : ""}`}>
        {page === "saved" && <SavedView items={savedItems} mode={mode} savedIds={saved} onToggle={toggle} onOpen={setDetailId} />}
        {page === "inbox" && <InboxView onToast={toast} />}
        {page === "post" && <PostView onToast={toast} />}
        {page === "profile" && <ProfileView pref={pref} onPref={setPref} onToast={toast} />}
      </div>

      <div className={`scrim${sheet && sheet !== "card" ? " on" : ""}`} onClick={closeAll} />

      <div className={`sheet${sheet === "card" ? " open" : ""}`}>
        {card && <>
          <div className="grab" />
          <div className="media" onClick={() => setDetailId(card.id)} style={{ cursor: "pointer" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.img} alt="" />
            <div className="badge"><span className="b"><Icon name="verified" />Verified</span></div>
            <Heart on={saved.has(card.id)} id={card.id} cls="hbtn" onToggle={toggle} />
          </div>
          <div className="row"><span className="price">{fmt(priceFor(card, cm), cm)}{cm === "rent" && <small>/mo</small>}</span><span className="pill">{card.type}</span></div>
          <div className="meta">{spec(card)}</div><div className="addr">{card.addr}</div>
          <div className="cta">
            <button className="btn ghost icon" onClick={closeAll} aria-label="Close"><Icon name="x" /></button>
            <button className="btn primary" onClick={() => setDetailId(card.id)}>View details</button>
          </div>
        </>}
      </div>

      <div className={`sheet${sheet === "list" ? " open" : ""}`} id="listSheet">
        <div className="grab" />
        <div className="sh"><h2>{inView.length} {inView.length === 1 ? "property" : "properties"} in this area</h2><button className="x" onClick={closeAll} aria-label="Close"><Icon name="x" /></button></div>
        <div className="items">
          {inView.length === 0 && <div className="empty"><h3>No properties here</h3>Try zooming out or clearing filters.</div>}
          {[...inView].sort((a, b) => priceFor(a, mode) - priceFor(b, mode)).slice(0, 60).map(l => (
            <button key={l.id} className="item" onClick={() => select(l.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.img} alt="" />
              <div><b>{fmt(priceFor(l, mode), mode)}{mode === "rent" ? "/mo" : ""}</b><span>{spec(l)}<br />{l.addr}</span></div>
            </button>
          ))}
        </div>
      </div>

      <div className={`sheet${sheet === "filter" ? " open" : ""}`}>
        <div className="grab" />
        <div className="sh"><h2>Filters</h2><button className="x" onClick={closeAll} aria-label="Close"><Icon name="x" /></button></div>
        <div className="field">
          <label>Max price <output>{draftPrice >= rMax ? "Any" : fmt(draftPrice, mode)}</output></label>
          <input type="range" min={rMin} max={rMax} step={rStep} value={draftPrice} onChange={e => setDraftPrice(+e.target.value)} aria-label="Max price" />
        </div>
        {showBeds && (
          <div className="field">
            <label>Bedrooms</label>
            <div className="chips">{[0, 1, 2, 3].map(n => <button key={n} className={`chip${draftBeds === n ? " on" : ""}`} onClick={() => setDraftBeds(n)}>{n ? `${n}+` : "Any"}</button>)}</div>
          </div>
        )}
        <div className="cta"><button className="btn ghost" onClick={resetFilter}>Reset</button><button className="btn primary" style={{ flex: 2 }} onClick={applyFilter}>Show results</button></div>
      </div>

      {detail && (
        <ListingDetail key={detail.id} listing={detail} mode={mode} saved={saved.has(detail.id)}
          loading={!isSampleId(detail.id) && !detail.full}
          onToggleSave={toggle} onClose={() => setDetailId(null)} onToast={toast} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
