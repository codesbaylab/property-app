"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import { Heart } from "./ListingDetail";
import { fmt, modeFor, priceFor, spec, type Listing, type Mode } from "@/lib/listing";
import type { ThemePref } from "@/lib/hooks";
import type { Account } from "@/lib/auth";

export type Page = "explore" | "saved" | "inbox" | "post" | "profile";

function PropertyCard({ l, mode, saved, onToggle, onOpen }: { l: Listing; mode: Mode; saved: boolean; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  const m = modeFor(l, mode);
  return (
    <article className="pc" onClick={() => onOpen(l.id)}>
      <div className="media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" src={l.img} alt="" />
        <Heart on={saved} id={l.id} cls="hbtn" onToggle={onToggle} />
        <span className="type">{l.type}</span>
      </div>
      <div className="pbody">
        <div className="price">{fmt(priceFor(l, m), m)}{m === "rent" && <small>/mo</small>}</div>
        <div className="meta">{spec(l)}</div>
        <div className="addr">{l.addr}</div>
      </div>
    </article>
  );
}

export function SavedView({ items, mode, savedIds, onToggle, onOpen }: { items: Listing[]; mode: Mode; savedIds: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  return (
    <div className="vw">
      <h1>Saved</h1>
      <div className="sub">{items.length ? `${items.length} ${items.length === 1 ? "property" : "properties"} you've saved` : "Your shortlist lives here"}</div>
      {items.length ? (
        <div className="grid">{items.map(l => <PropertyCard key={l.id} l={l} mode={mode} saved={savedIds.has(l.id)} onToggle={onToggle} onOpen={onOpen} />)}</div>
      ) : (
        <div className="empty"><div className="ei"><Icon name="heart" /></div><h3>Nothing saved yet</h3>Tap the heart on any property to keep it here.</div>
      )}
    </div>
  );
}

export function InboxView({ onToast }: { onToast: (m: string) => void }) {
  const threads: [string, string, string, string, boolean][] = [
    ["Anil Kumar", "24 Beach Rd", "Yes, available Saturday 11am?", "5m", true],
    ["Fathima R.", "12 Lake View St", "Parking for 2 cars.", "2h", true],
    ["Joseph (owner)", "3 Canal Rd", "Thanks for your interest!", "1d", false],
  ];
  return (
    <div className="vw">
      <h1>Inbox</h1>
      <div className="sub">Conversations with agents and owners</div>
      <div className="list">
        {threads.map(t => (
          <button key={t[0]} className="li" onClick={() => onToast("Chat opens here in the full app")}>
            <div className="av">{t[0][0]}</div>
            <div className="tx"><b>{t[0]}</b><small>{t[1]} · {t[2]}</small></div>
            <span className="meta">{t[3]}</span>{t[4] && <i className="unread" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PostView({ onToast }: { onToast: (m: string) => void }) {
  const steps = [["1", "Add photos and details", "Price, size, rooms and a short description"], ["2", "Drop a pin on the map", "So people find the exact spot"], ["3", "We review, then it goes live", "Verified listings get more enquiries"]];
  return (
    <div className="vw">
      <h1>Post a property</h1>
      <div className="sub">Reach buyers and renters near you</div>
      <div className="hero">
        <h2>List your property in 3 minutes</h2>
        <p>Free for up to 3 listings. Our team reviews every listing, usually within an hour.</p>
        <button className="btn" onClick={() => onToast("Posting opens here in the full app")}>Start posting</button>
      </div>
      <div className="steps">{steps.map(s => <div className="step" key={s[0]}><i>{s[0]}</i><div><b>{s[1]}</b><div className="meta">{s[2]}</div></div></div>)}</div>
      <div className="list">
        <button className="li" onClick={() => onToast("Agent sign-up opens here in the full app")}>
          <div className="ic"><Icon name="verified" /></div>
          <div className="tx"><b>I&apos;m an agent</b><small>Get a verified badge and a lead inbox</small></div><Icon name="chevron" />
        </button>
      </div>
    </div>
  );
}

const ADMIN_LABEL = { super_admin: "Super admin", moderator: "Moderator", support: "Support" } as const;

interface ProfileProps {
  pref: ThemePref; onPref: (p: ThemePref) => void; onToast: (m: string) => void;
  account: Account | null;
  /** true when the app is connected to the database, so signing in is possible */
  canSignIn: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export function ProfileView({ pref, onPref, onToast, account, canSignIn, signIn, signOut }: ProfileProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const problem = await signIn(email, password);
    setBusy(false);
    if (problem) setError(problem); else { setPassword(""); onToast("Signed in"); }
  };

  const rows: [string, string, string][] = [["globe", "Language", "English"], ["bell", "Alerts", "Price drops, replies"], ["shield", "Privacy & data", "Your number stays private"], ["help", "Help & support", "FAQ and contact"]];
  return (
    <div className="vw">
      <h1>Profile</h1>
      <div className="sub">{account ? "Your account" : "Log in to save homes and message agents"}</div>

      {account ? (
        <div className="login">
          <div className="who">
            <div className="av" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>{account.name[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0 }}><b>{account.name}</b><div className="meta" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{account.email}</div></div>
          </div>
          <div className="tags" style={{ marginTop: 14 }}>
            <span className="tag">Buyer</span>
            {account.verifiedAgent && <span className="tag ok"><Icon name="verified" />Verified agent</span>}
            {!account.verifiedAgent && account.listings > 0 && <span className="tag">Owner · {account.listings} {account.listings === 1 ? "listing" : "listings"}</span>}
            {account.verifiedAgent && account.listings > 0 && <span className="tag">{account.listings} listings</span>}
            {account.adminRole && <span className="tag" style={{ background: "var(--fg)", color: "var(--bg)" }}>Admin team · {ADMIN_LABEL[account.adminRole]}</span>}
          </div>
          <button className="btn ghost" style={{ marginTop: 14, width: "100%" }} onClick={async () => { await signOut(); onToast("Signed out"); }}>Sign out</button>
        </div>
      ) : canSignIn ? (
        <form className="login" onSubmit={submit}>
          <div className="who"><div className="av"><Icon name="user" /></div><div><b>Welcome to Nestmap</b><div className="meta">Sign in to continue</div></div></div>
          <div className="stack">
            <input type="email" autoComplete="username" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <div className="err" role="alert">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <div className="meta" style={{ fontSize: 12.5 }}>Phone-number login is coming soon.</div>
          </div>
        </form>
      ) : (
        <div className="login">
          <div className="who"><div className="av"><Icon name="user" /></div><div><b>Welcome to Nestmap</b><div className="meta">Enter your phone number to continue</div></div></div>
          <div className="phone"><input inputMode="tel" placeholder="+91 98765 43210" aria-label="Phone number" /><button className="btn primary" onClick={() => onToast("OTP sent (demo)")}>Send OTP</button></div>
        </div>
      )}

      <div className="list">
        {account?.adminRole && (
          <button className="li" onClick={() => onToast("The admin dashboard is the next big piece")}>
            <div className="ic"><Icon name="shield" /></div>
            <div className="tx"><b>Admin dashboard</b><small>{ADMIN_LABEL[account.adminRole]} · review queue, users, reports</small></div><Icon name="chevron" />
          </button>
        )}
        <div className="li">
          <div className="ic"><Icon name="moon" /></div><div className="tx"><b>Appearance</b></div>
          <div className="seg">{(["auto", "light", "dark"] as ThemePref[]).map(t => <button key={t} className={pref === t ? "on" : ""} onClick={() => onPref(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </div>
        {rows.map(r => (
          <button key={r[1]} className="li" onClick={() => onToast(`${r[1]} opens here in the full app`)}>
            <div className="ic"><Icon name={r[0]} /></div><div className="tx"><b>{r[1]}</b><small>{r[2]}</small></div><Icon name="chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}
