"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import ModeControl from "./ModeControl";
import ListingDetail, { Heart, Toast } from "./ListingDetail";
import { InboxView, PostView, ProfileView, SavedView, type Page } from "./Views";
import type { FlyTo, View } from "./MapView";
import { useAuth } from "@/lib/auth";
import { useSaved, useTheme, useToast } from "@/lib/hooks";
import { PT, RANGE, RES, fmt, inBounds, modeFor, priceFor, spec, type Listing, type Mode, type PType } from "@/lib/listing";
import { getListing, isSampleId, loadListings, reportListing, usingDatabase } from "@/lib/data";
import { generateListing } from "@/lib/sample";
import { startConversation, useUnread } from "@/lib/chat";
import { requestVisit, useVisitTodo } from "@/lib/visits";

const MapView = dynamic(() => import("./MapView"), { ssr: false });
const Chat = dynamic(() => import("./Chat"), { ssr: false });
const Visits = dynamic(() => import("./Visits"), { ssr: false });
const Leads = dynamic(() => import("./Leads"), { ssr: false });
const AgentApply = dynamic(() => import("./AgentApply"), { ssr: false });
const PostFlow = dynamic(() => import("./PostFlow"), { ssr: false });

type Sheet = null | "card" | "list" | "filter";
const START: [number, number] = [75.7804, 11.2588]; // Kozhikode, until the browser tells us where the user is

export default function Explore() {
  const { account, ready, signIn, signUp, signOut, refresh } = useAuth();
  const { saved, toggle } = useSaved(account?.id ?? null);
  const { unread, refreshUnread } = useUnread(usingDatabase ? account?.id ?? null : null);
  const { todo, refreshTodo } = useVisitTodo(usingDatabase ? account?.id ?? null : null);
  const [chatId, setChatId] = useState<string | null>(null);
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

  // Show every price when only a few homes are on screen. Switch on at 25 or fewer, off again above 35, so it never flickers at the edge.
  const [plain, setPlain] = useState(false);
  const crowded = inView.length > 35 || (view?.zoom ?? 0) < 11;
  const sparse = inView.length <= 25 && (view?.zoom ?? 0) >= 11;
  if (plain && crowded) setPlain(false);
  else if (!plain && sparse) setPlain(true);

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
    setType(t);   // the price filter stays: Buy and Rent have different price scales, but types within one mode do not
    if (t && !RES.includes(t)) setBeds(0);   // bedrooms only make sense for homes
    closeSheets();
  };

  // With a database connected, saving, messaging and posting need an account. Guests only see Explore and Sign in.
  const gated = usingDatabase && !account;
  const shownPage: Page = gated && (page === "saved" || page === "inbox" || page === "post" || page === "visits" || page === "agent" || page === "leads") ? "explore" : page;
  const go = (p: Page) => { setPage(p); setChatId(null); setDetailId(null); closeAll(); };
  const needLogin = (msg: string) => { toast(msg); go("profile"); };
  const startChat = async (listingId: string) => {
    const r = await startConversation(listingId);
    if ("error" in r) { toast(r.error); return; }
    setChatId(r.id); setPage("inbox"); setDetailId(null); closeAll();
  };
  const toggleSave = (id: string) => {
    if (gated) { needLogin(ready ? "Sign in to save homes" : "One moment…"); return; }
    toggle(id);
  };
  // the shareable listing page sends guests here with /#profile, and people who tap Message there with /#chat=<id>
  useEffect(() => {
    const chat = /^#chat=([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
    if (location.hash !== "#profile" && !chat) return;
    const t = setTimeout(() => { if (chat) { setChatId(chat); setPage("inbox"); } else setPage("profile"); }, 0);
    return () => clearTimeout(t);
  }, []);
  const showBeds = !type || RES.includes(type);
  const [rMin, rMax, rStep] = RANGE[mode];
  const filtersOn = !!maxPrice || beds > 0;

  // how many homes in view match the filter being set, shown on the button so the slider gives feedback as it moves
  const preview = useMemo(() => (view ? all.filter(l => priceFor(l, mode) > 0 && (!type || l.type === type)
    && (draftPrice >= rMax || priceFor(l, mode) <= draftPrice) && l.beds >= (showBeds ? draftBeds : 0) && inBounds(l, view)).length : 0),
    [all, view, mode, type, draftPrice, draftBeds, rMax, showBeds]);

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
      <MapView pins={pins} selectedId={selectedId} dark={dark} fly={fly} start={START} plain={plain}
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

      <nav className={`nav glass${gated ? " guest" : ""}`} aria-label="Main">
        <div className="brandmark">N</div>
        <button className={shownPage === "explore" ? "on" : ""} onClick={() => go("explore")}><Icon name="map" /><span>Explore</span></button>
        {!gated && <button className={shownPage === "saved" ? "on" : ""} onClick={() => go("saved")}><Icon name="heart" /><span>Saved</span>{saved.size > 0 && <i className="bdg">{saved.size}</i>}</button>}
        {!gated && <button className={`post${shownPage === "post" ? " on" : ""}`} onClick={() => go("post")} aria-label="Post a property"><Icon name="plus" /><span>Post</span></button>}
        {!gated && <button className={shownPage === "inbox" ? "on" : ""} onClick={() => go("inbox")}><Icon name="chat" /><span>Inbox</span>{unread > 0 && <i className="bdg">{unread}</i>}</button>}
        <button className={`prof${shownPage === "profile" ? " on" : ""}`} onClick={() => go("profile")}><Icon name="user" /><span>{gated ? "Sign in" : "Profile"}</span></button>
      </nav>

      <div className={`view${shownPage !== "explore" ? " open" : ""}`}>
        {shownPage === "saved" && <SavedView items={savedItems} mode={mode} savedIds={saved} onToggle={toggleSave} onOpen={setDetailId} />}
        {shownPage === "inbox" && (account && usingDatabase ? <Chat account={account} openId={chatId} onOpen={setChatId} onToast={toast} onOpenListing={setDetailId} onRead={refreshUnread} /> : <InboxView />)}
        {shownPage === "post" && (account ? <PostFlow account={account} dark={dark} onToast={toast} onOpen={setDetailId} onOpenVisits={usingDatabase ? () => go("visits") : undefined} visitTodo={todo} /> : <PostView />)}
        {shownPage === "profile" && <ProfileView pref={pref} onPref={setPref} onToast={toast} account={account} canSignIn={usingDatabase} signIn={signIn} signUp={signUp} signOut={signOut} onOpenVisits={usingDatabase ? () => go("visits") : undefined} todo={todo} onOpenAgent={usingDatabase ? () => go("agent") : undefined} onOpenLeads={usingDatabase ? () => go("leads") : undefined} />}
        {shownPage === "leads" && <Leads onToast={toast} onReply={id => { setChatId(id); setPage("inbox"); }} onOpenVisits={() => go("visits")} visitTodo={todo} />}
        {shownPage === "agent" && account && <AgentApply account={account} onBack={() => go("profile")} onToast={toast} onChanged={refresh} />}
        {shownPage === "visits" && <Visits onToast={toast} onOpenListing={setDetailId} onChanged={refreshTodo} />}
      </div>

      <div className={`scrim${sheet && sheet !== "card" ? " on" : ""}`} onClick={closeAll} />

      <div className={`sheet${sheet === "card" ? " open" : ""}`}>
        {card && <>
          <div className="grab" />
          <div className="media" onClick={() => setDetailId(card.id)} style={{ cursor: "pointer" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.img} alt="" />
            {card.verified && <div className="badge"><span className="b"><Icon name="verified" />Verified</span></div>}
            <Heart on={saved.has(card.id)} id={card.id} cls="hbtn" onToggle={toggleSave} />
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
          <input type="range" min={rMin} max={rMax} step={rStep} value={draftPrice} onChange={e => setDraftPrice(+e.target.value)} aria-label="Max price"
            style={{ "--p": `${((draftPrice - rMin) / (rMax - rMin)) * 100}%` } as React.CSSProperties} />
        </div>
        {showBeds && (
          <div className="field">
            <label>Bedrooms</label>
            <div className="chips">{[0, 1, 2, 3].map(n => <button key={n} className={`chip${draftBeds === n ? " on" : ""}`} onClick={() => setDraftBeds(n)}>{n ? `${n}+` : "Any"}</button>)}</div>
          </div>
        )}
        <div className="cta"><button className="btn ghost" onClick={resetFilter}>Reset</button><button className="btn primary" style={{ flex: 2 }} onClick={applyFilter}>Show {preview} {preview === 1 ? "home" : "homes"}</button></div>
      </div>

      {detail && (
        <ListingDetail key={detail.id} listing={detail} mode={mode} saved={saved.has(detail.id)}
          loading={!isSampleId(detail.id) && !detail.full}
          report={usingDatabase && !isSampleId(detail.id) ? { signedIn: !!account, send: (reason, details) => (account ? reportListing(account.id, detail.id, reason, details) : Promise.resolve("Sign in first.")) } : undefined}
          onMessage={usingDatabase && !isSampleId(detail.id) ? () => startChat(detail.id) : undefined}
          onVisit={usingDatabase && !isSampleId(detail.id) ? async (at, note) => { const p = await requestVisit(detail.id, at, note); if (!p) refreshTodo(); return p; } : undefined}
          signInRequired={gated} onNeedLogin={() => needLogin("Sign in to message, call or save")}
          onToggleSave={toggleSave} onClose={() => setDetailId(null)} onToast={toast} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
