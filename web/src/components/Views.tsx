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

export function InboxView() {
  return (
    <div className="vw">
      <h1>Inbox</h1>
      <div className="sub">Conversations with agents and owners</div>
      <div className="empty">
        <div className="ei"><Icon name="chat" /></div>
        <h3>No messages yet</h3>
        Chat with agents and owners is coming soon. Your conversations will appear here.
      </div>
    </div>
  );
}

/** Shown instead of the posting flow when the app isn't connected to a database. */
export function PostView() {
  const steps = [["1", "Add photos and details", "Price, size, rooms and a short description"], ["2", "Drop a pin on the map", "So people find the exact spot"], ["3", "We review, then it goes live", "Every listing is checked by our team first"]];
  return (
    <div className="vw">
      <h1>Post a property</h1>
      <div className="sub">Reach buyers and renters near you</div>
      <div className="hero">
        <h2>List your property in 3 minutes</h2>
        <p>Free for up to 3 listings. Our team reviews every listing before it goes live.</p>
        <button className="btn" disabled>Posting needs a database</button>
      </div>
      <div className="steps">{steps.map(s => <div className="step" key={s[0]}><i>{s[0]}</i><div><b>{s[1]}</b><div className="meta">{s[2]}</div></div></div>)}</div>
      <div className="list">
        <div className="li">
          <div className="ic"><Icon name="verified" /></div>
          <div className="tx"><b>I&apos;m an agent</b><small>Get a verified badge and a lead inbox</small></div><span className="soon">Soon</span>
        </div>
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
  signUp: (name: string, email: string, password: string) => Promise<{ error?: string; confirm?: boolean }>;
  signOut: () => Promise<void>;
}

export function ProfileView({ pref, onPref, onToast, account, canSignIn, signIn, signUp, signOut }: ProfileProps) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");   // set after sign-up when the email must be confirmed first

  const switchTo = (m: "in" | "up") => { setMode(m); setError(""); setSentTo(""); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "up" && password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    setBusy(true);
    if (mode === "in") {
      const problem = await signIn(email, password);
      if (problem) setError(problem); else { setPassword(""); onToast("Signed in"); }
    } else {
      const r = await signUp(name, email, password);
      if (r.error) setError(r.error);
      else if (r.confirm) { setSentTo(email.trim()); setPassword(""); }
      else { setPassword(""); onToast(`Welcome to Nestmap, ${name.trim().split(" ")[0] || "friend"}!`); }
    }
    setBusy(false);
  };

  const rows: [string, string, string, boolean][] = [   // icon, title, note, needs an account
    ["globe", "Language", "English", false], ["bell", "Alerts", "Price drops and replies", true],
    ["shield", "Privacy & data", "Your number stays private", true], ["help", "Help & support", "FAQ and contact", false],
  ];

  return (
    <div className="vw">
      <h1>{account ? "Profile" : "Sign in"}</h1>
      <div className="sub">{account ? "Your account" : "Save homes, contact agents and post your own property"}</div>

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
        sentTo ? (
          <div className="login">
            <div className="who"><div className="av"><Icon name="chat" /></div><div><b>Check your email</b><div className="meta">We sent a link to {sentTo}</div></div></div>
            <p className="meta" style={{ margin: "14px 0" }}>Open the email and tap the link to confirm your account. Then come back here and sign in.</p>
            <button className="btn primary" style={{ width: "100%" }} onClick={() => { setMode("in"); setSentTo(""); }}>Go to sign in</button>
          </div>
        ) : (
          <form className="login" onSubmit={submit}>
            <div className="seg full" role="tablist" aria-label="Sign in or create an account">
              <button type="button" role="tab" aria-selected={mode === "in"} className={mode === "in" ? "on" : ""} onClick={() => switchTo("in")}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === "up"} className={mode === "up" ? "on" : ""} onClick={() => switchTo("up")}>Create account</button>
            </div>
            <div className="stack">
              {mode === "up" && <input type="text" autoComplete="name" placeholder="Your name" aria-label="Your name" value={name} onChange={e => setName(e.target.value)} required maxLength={60} />}
              <input type="email" autoComplete="username" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder={mode === "in" ? "Password" : "Password (8 or more characters)"} aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <div className="err" role="alert">{error}</div>}
              <button className="btn primary" disabled={busy}>{busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}</button>
              <div className="meta" style={{ fontSize: 12.5 }}>{mode === "in" ? "New here? Choose Create account above." : "You'll be able to save homes right away."} Phone-number login is coming soon.</div>
            </div>
          </form>
        )
      ) : (
        <div className="login">
          <div className="who"><div className="av"><Icon name="user" /></div><div><b>Sign-in isn&apos;t set up yet</b><div className="meta">This copy of the app isn&apos;t connected to a database.</div></div></div>
        </div>
      )}

      <div className="list">
        {account?.adminRole && (
          <a className="li" href="/admin">
            <div className="ic"><Icon name="shield" /></div>
            <div className="tx"><b>Admin dashboard</b><small>{ADMIN_LABEL[account.adminRole]} · review queue, users, reports</small></div><Icon name="chevron" />
          </a>
        )}
        <div className="li">
          <div className="ic"><Icon name="moon" /></div><div className="tx"><b>Appearance</b></div>
          <div className="seg">{(["auto", "light", "dark"] as ThemePref[]).map(t => <button key={t} className={pref === t ? "on" : ""} onClick={() => onPref(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </div>
        {rows.filter(r => account || !r[3]).map(r => (
          <button key={r[1]} className="li" onClick={() => onToast(`${r[1]} is coming soon`)}>
            <div className="ic"><Icon name={r[0]} /></div><div className="tx"><b>{r[1]}</b><small>{r[2]}</small></div><span className="soon">Soon</span>
          </button>
        ))}
      </div>
    </div>
  );
}
