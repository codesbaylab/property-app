"use client";
/* eslint-disable @next/next/no-img-element -- previews of local files and user uploads, not worth the image optimiser */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Icon } from "./Icon";
import { fmt, PT, type Mode, type PType } from "@/lib/listing";
import type { Account } from "@/lib/auth";
import { daysLeft, loadStats, renewListing, type ListingStats } from "@/lib/stats";
import {
  addPhotos, AMENITIES, deleteListing, emptyForm, FACING, formOf, FURNISHING, hasRooms, loadMine, MAX_PHOTOS, problemWith,
  removePhoto, saveListing, setStatus, typesFor, type Form, type MyListing, type MyPhoto, type Status,
} from "@/lib/posting";

const PinPicker = dynamic(() => import("./PinPicker"), { ssr: false });
const ImportListings = dynamic(() => import("./ImportListings"), { ssr: false });

const START: [number, number] = [75.7804, 11.2588];   // Kozhikode

const STATUS: Record<Status, { label: string; note: string; tone?: "ok" | "bad" }> = {
  draft: { label: "Draft", note: "Not sent for review yet" },
  pending: { label: "In review", note: "Our team is checking it. This usually takes a day." },
  live: { label: "Live", note: "People can see it on the map", tone: "ok" },
  rejected: { label: "Needs changes", note: "", tone: "bad" },
  sold_or_rented: { label: "Closed", note: "Marked as sold or rented" },
  expired: { label: "Expired", note: "Send it for review again to bring it back" },
  hidden: { label: "Hidden", note: "Only you can see it" },
};

interface Props {
  account: Account;
  dark: boolean;
  onToast: (m: string) => void;
  onOpen: (id: string) => void;
  /** called after anything that changes how many listings the account has */
  onChanged?: () => void;
  /** shortcut to the visits screen, with how many requests wait for an answer */
  onOpenVisits?: () => void; visitTodo?: number;
}

export default function PostFlow({ account, dark, onToast, onOpen, onChanged, onOpenVisits, visitTodo = 0 }: Props) {
  const [mine, setMine] = useState<MyListing[] | null>(null);
  const [editing, setEditing] = useState<MyListing | "new" | "import" | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState("");   // the listing an action is running on; its buttons stay off until it finishes
  const [stats, setStats] = useState<Record<string, ListingStats>>({});

  const refresh = useCallback(async () => {
    loadStats().then(setStats).catch(() => {});
    try { setMine(await loadMine()); setLoadError(""); } catch (e) { setLoadError((e as Error).message); setMine(m => m ?? []); }
  }, []);
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [refresh]);

  if (editing === "import") {
    return <ImportListings account={account} onBack={() => setEditing(null)} onToast={onToast} onDone={async () => { setEditing(null); await refresh(); onChanged?.(); }} />;
  }
  if (editing) {
    return (
      <ListingForm
        account={account} dark={dark} initial={editing === "new" ? null : editing} onToast={onToast}
        onDone={async () => { setEditing(null); await refresh(); onChanged?.(); }} onCancel={() => setEditing(null)}
      />
    );
  }

  const guarded = (l: MyListing, run: () => Promise<void>) => async () => {
    if (busyId) return;
    setBusyId(l.id);
    try { await run(); } finally { setBusyId(""); }
  };
  const act = (l: MyListing, status: Status, done: string) => guarded(l, async () => {
    const problem = await setStatus(l.id, status);
    if (problem) onToast(problem); else { onToast(done); onChanged?.(); }
    await refresh();
  });
  const renew = (l: MyListing) => guarded(l, async () => {
    const problem = await renewListing(l.id);
    if (problem) onToast(problem); else { onToast("Renewed for 30 more days"); onChanged?.(); }
    await refresh();
  });
  const remove = (l: MyListing) => guarded(l, async () => {
    if (!confirm("Delete this listing? This can't be undone.")) return;
    const problem = await deleteListing(l);
    if (problem) onToast(problem); else { onToast("Listing deleted"); onChanged?.(); }
    await refresh();
  });

  return (
    <div className="vw">
      <h1>My homes</h1>
      <div className="sub">Post a property and track it here</div>
      <div className="hero">
        <h2>List your property in 3 minutes</h2>
        <p>Free for up to 3 listings. Our team reviews every listing before it goes live.</p>
        <button className="btn" onClick={() => setEditing("new")}>Post a property</button>
        {account.verifiedAgent && <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => setEditing("import")}>Import from spreadsheet</button>}
      </div>
      {onOpenVisits && <button className="li visitlink" onClick={onOpenVisits}><div className="ic"><Icon name="clock" /></div><div className="tx"><b>Visit requests</b><small>People who want to see your homes</small></div>{visitTodo > 0 && <i className="bdg inline">{visitTodo}</i>}<Icon name="chevron" /></button>}
      {loadError && <div className="err" role="alert" style={{ marginBottom: 12 }}>{loadError}</div>}
      {mine === null ? (
        <div className="meta">Loading…</div>
      ) : mine.length === 0 ? (
        <div className="empty"><div className="ei"><Icon name="home" /></div><h3>No listings yet</h3>Homes you post will appear here with their status.</div>
      ) : (
        <div className="mylist">
          {mine.map(l => {
            const st = STATUS[l.status];
            const sx = stats[l.id];
            const left = sx?.expiresAt ? daysLeft(sx.expiresAt) : null;
            const soon = l.status === "live" && left !== null && left <= 7;
            return (
              <article className="myl" key={l.id}>
                <div className="myl-top">
                  
                  {l.photos[0] ? <img src={l.photos[0].url} alt="" /> : <div className="noimg"><Icon name="home" /></div>}
                  <div className="myl-tx">
                    <div className="tags" style={{ marginBottom: 6 }}><span className={`tag${st.tone === "ok" ? " ok" : st.tone === "bad" ? " bad" : ""}`}>{st.label}</span></div>
                    <b>{fmt(l.price, l.mode)}{l.mode === "rent" && <small>/mo</small>} · {l.type}</b>
                    <div className="meta">{l.address}</div>
                  </div>
                </div>
                {l.status === "live" && sx && (
                  <div className="lstats" aria-label="How this listing is doing">
                    <div><b>{sx.views7d}</b><span>Views · 7d</span></div><div><b>{sx.enquiries}</b><span>Enquiries</span></div>
                    <div><b>{sx.visits}</b><span>Visits</span></div><div><b>{sx.saves}</b><span>Saves</span></div>
                  </div>
                )}
                {soon && <p className="myl-note warn">{left! <= 0 ? "Expires today. Renew to keep it on the map." : `Expires in ${left} ${left === 1 ? "day" : "days"}. Is it still available? Renew to keep it on the map.`}</p>}
                {l.status === "live" && !soon && left !== null && <p className="myl-note">{`Live for ${left} more ${left === 1 ? "day" : "days"}`}</p>}
                {l.status === "rejected" ? <p className="myl-note bad">{l.rejectReason || "The team asked for changes."}</p> : st.note && <p className="myl-note">{st.note}</p>}
                <fieldset className="myl-acts" disabled={busyId === l.id} aria-busy={busyId === l.id}>
                  {l.status === "live" && <button className="btn ghost" onClick={() => onOpen(l.id)}>View</button>}
                  {(l.status === "draft" || l.status === "rejected" || l.status === "hidden") && <button className="btn ghost" onClick={() => setEditing(l)}>Edit</button>}
                  {l.status === "pending" && <button className="btn ghost" onClick={act(l, "draft", "Moved back to drafts")}>Withdraw</button>}
                  {(l.status === "rejected" || l.status === "hidden") && <button className="btn primary" onClick={act(l, "pending", "Sent for review")}>Send for review</button>}
                  {l.status === "expired" && <><button className="btn primary" onClick={renew(l)}>Renew for 30 days</button><button className="btn ghost" onClick={act(l, "pending", "Sent for review")}>Send for review</button></>}
                  {soon && <button className="btn primary" onClick={renew(l)}>Still available · Renew</button>}
                  {l.status === "live" && <button className="btn ghost" onClick={act(l, "hidden", "Listing hidden")}>Hide</button>}
                  {l.status === "live" && <button className="btn ghost" onClick={act(l, "sold_or_rented", l.mode === "rent" ? "Marked as rented" : "Marked as sold")}>{l.mode === "rent" ? "Mark rented" : "Mark sold"}</button>}
                  {(l.status === "draft" || l.status === "rejected" || l.status === "hidden") && <button className="btn ghost danger" onClick={remove(l)}>Delete</button>}
                </fieldset>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="ff"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Counter({ value, onChange, min = 0, max = 10 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="cnt">
      <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <b>{value}</b>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

interface FormProps { account: Account; dark: boolean; initial: MyListing | null; onToast: (m: string) => void; onDone: () => void; onCancel: () => void }

function ListingForm({ account, dark, initial, onToast, onDone, onCancel }: FormProps) {
  const [f, setF] = useState<Form>(() => (initial ? formOf(initial) : emptyForm()));
  const [kept, setKept] = useState<MyPhoto[]>(initial?.photos ?? []);
  const [added, setAdded] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "review">("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }));

  const previews = useMemo(() => added.map(file => URL.createObjectURL(file)), [added]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const photoCount = kept.length + added.length;
  const setMode = (m: Mode) => setF(p => ({ ...p, mode: m, type: typesFor(m).includes(p.type) ? p.type : typesFor(m)[0] }));
  const pick = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photoCount;
    const ok = [...files].filter(x => /^image\//.test(x.type));
    if (ok.length > room) setError(`You can add up to ${MAX_PHOTOS} photos.`);
    setAdded(a => [...a, ...ok.slice(0, Math.max(0, room))]);
  };
  const toggleAmenity = (a: string) => set("amenities", f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a]);

  const submit = async (forReview: boolean) => {
    setError("");
    const problem = problemWith(f, photoCount, forReview);
    if (problem) { setError(problem); return; }
    setBusy(forReview ? "review" : "draft");
    try {
      const id = await saveListing(account.id, initial?.id ?? null, f);
      const removed = (initial?.photos ?? []).filter(p => !kept.some(k => k.id === p.id));
      await Promise.all(removed.map(removePhoto));
      const photoProblem = added.length ? await addPhotos(account.id, id, added, kept.length) : null;
      if (forReview) {
        if (photoProblem) { setError(photoProblem + " Your listing is saved as a draft. Try adding them again."); setBusy(""); return; }
        const sent = await setStatus(id, "pending");
        if (sent) { setError(sent); setBusy(""); return; }
        onToast("Sent for review. We'll check it soon.");
      } else onToast(photoProblem ? photoProblem : "Draft saved");
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };

  const showSize = f.type !== "PG / Hostel";
  const typeIcon = (k: PType) => PT.find(t => t.k === k)!.i;

  return (
    <div className="vw">
      <button type="button" className="backbtn" onClick={onCancel}><Icon name="back" />My homes</button>
      <h1>{initial ? "Edit listing" : "Post a property"}</h1>
      <div className="sub">Our team reviews every listing before it goes live.</div>

      {initial?.status === "rejected" && initial.rejectReason && <div className="myl-note bad" style={{ marginBottom: 14 }}><b>Changes requested:</b> {initial.rejectReason}</div>}

      <form className="pform" onSubmit={e => { e.preventDefault(); submit(true); }}>
        <section>
          <h3>The basics</h3>
          <div className="seg full" role="tablist" aria-label="Sell or rent out">
            <button type="button" role="tab" aria-selected={f.mode === "rent"} className={f.mode === "rent" ? "on" : ""} onClick={() => setMode("rent")}>For rent</button>
            <button type="button" role="tab" aria-selected={f.mode === "buy"} className={f.mode === "buy" ? "on" : ""} onClick={() => setMode("buy")}>For sale</button>
          </div>
          <div className="ptypes">
            {typesFor(f.mode).map(k => (
              <button type="button" key={k} className={`typ${f.type === k ? " on" : ""}`} aria-pressed={f.type === k} onClick={() => set("type", k)}><Icon name={typeIcon(k)} />{k}</button>
            ))}
          </div>
          <Field label={f.mode === "rent" ? "Monthly rent (₹)" : "Price (₹)"}><input inputMode="numeric" value={f.price} onChange={e => set("price", e.target.value.replace(/[^\d]/g, ""))} placeholder={f.mode === "rent" ? "e.g. 18000" : "e.g. 6500000"} required /></Field>
          {f.mode === "rent" && <Field label="Deposit (₹)" hint="Optional"><input inputMode="numeric" value={f.deposit} onChange={e => set("deposit", e.target.value.replace(/[^\d]/g, ""))} /></Field>}
        </section>

        <section>
          <h3>Details</h3>
          {hasRooms(f.type) && (
            <div className="two">
              <Field label="Bedrooms"><Counter value={f.beds} onChange={n => set("beds", n)} /></Field>
              <Field label="Bathrooms"><Counter value={f.baths} onChange={n => set("baths", n)} /></Field>
            </div>
          )}
          <div className="two">
            {showSize && <Field label="Size (sq ft)"><input inputMode="numeric" value={f.areaSqft} onChange={e => set("areaSqft", e.target.value.replace(/[^\d]/g, ""))} /></Field>}
            {f.type !== "Plot" && <Field label="Floor"><input inputMode="numeric" value={f.floor} onChange={e => set("floor", e.target.value.replace(/[^\d]/g, ""))} placeholder="0 = ground" /></Field>}
          </div>
          <div className="two">
            <Field label="Facing"><select value={f.facing} onChange={e => set("facing", e.target.value)}><option value="">Not sure</option>{FACING.map(x => <option key={x}>{x}</option>)}</select></Field>
            {hasRooms(f.type) && <Field label="Furnishing"><select value={f.furnishing} onChange={e => set("furnishing", e.target.value)}><option value="">Not stated</option>{FURNISHING.map(x => <option key={x}>{x}</option>)}</select></Field>}
          </div>
          <Field label="Description" hint="What makes it a good home? Nearby places, condition, who it suits."><textarea rows={4} maxLength={1500} value={f.description} onChange={e => set("description", e.target.value)} /></Field>
          <div className="ff"><span>Amenities</span>
            <div className="achips">{AMENITIES.map(a => <button type="button" key={a} className={`achip${f.amenities.includes(a) ? " on" : ""}`} aria-pressed={f.amenities.includes(a)} onClick={() => toggleAmenity(a)}>{a}</button>)}</div>
          </div>
        </section>

        <section>
          <h3>Where is it?</h3>
          <Field label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} placeholder="House or building name, street" maxLength={200} required /></Field>
          <Field label="Area or locality"><input value={f.locality} onChange={e => set("locality", e.target.value)} placeholder="e.g. Mavoor Road" maxLength={80} /></Field>
          <div className="ff"><span>Pin on the map</span>
            <PinPicker pin={f.pin} start={START} dark={dark} onPin={p => set("pin", p)} />
            <small>{f.pin ? "Pin placed. Drag it to fine-tune." : "Tap the map where the property is."}</small>
          </div>
        </section>

        <section>
          <h3>Photos</h3>
          <div className="photos">
            {kept.map(p => (
              <div className="ph" key={p.id}><img src={p.url} alt="" />
                <button type="button" aria-label="Remove photo" onClick={() => setKept(k => k.filter(x => x.id !== p.id))}><Icon name="x" /></button></div>
            ))}
            {added.map((file, i) => (
              <div className="ph" key={previews[i]}><img src={previews[i]} alt="" />
                <button type="button" aria-label="Remove photo" onClick={() => setAdded(a => a.filter((_, j) => j !== i))}><Icon name="x" /></button></div>
            ))}
            {photoCount < MAX_PHOTOS && (
              <label className="ph add"><Icon name="plus" /><span>Add</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { pick(e.target.files); e.target.value = ""; }} /></label>
            )}
          </div>
          <small className="meta">{photoCount}/{MAX_PHOTOS} photos. The first one is the cover. Bright, clear photos get more views.</small>
        </section>

        {error && <div className="err" role="alert">{error}</div>}
        <div className="pacts">
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => submit(false)}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
          <button className="btn primary" disabled={!!busy}>{busy === "review" ? "Sending…" : "Send for review"}</button>
        </div>
      </form>
    </div>
  );
}
