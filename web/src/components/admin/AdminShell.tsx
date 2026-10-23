"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Toast } from "../ListingDetail";
import { adminApi, type Stats } from "@/lib/admin";
import { useAuth, type Account } from "@/lib/auth";
import { useTheme, useToast } from "@/lib/hooks";
import { supabaseConfigured } from "@/lib/supabase";

interface AdminContext {
  account: Account;
  /** moderators and super admins can change things; support can only look */
  canModerate: boolean;
  isSuperAdmin: boolean;
  toast: (m: string) => void;
  stats: Stats | null;
  refreshStats: () => void;
}
const Ctx = createContext<AdminContext | null>(null);
export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin must be used inside the admin area");
  return c;
}

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/review", label: "Review queue", icon: "verified", badge: "pending" },
  { href: "/admin/listings", label: "Listings", icon: "building" },
  { href: "/admin/users", label: "Users", icon: "user" },
  { href: "/admin/reports", label: "Reports", icon: "bell", badge: "reports" },
  { href: "/admin/team", label: "Team & activity", icon: "shield" },
] as const;

const ROLE_LABEL = { super_admin: "Super admin", moderator: "Moderator", support: "Support" } as const;

export default function AdminShell({ children }: { children: ReactNode }) {
  const { account, ready, signIn, signOut } = useAuth();
  const { toast, toastMsg, toastOn } = useToast();
  useTheme();
  const path = usePathname();
  const [stats, setStats] = useState<Stats | null>(null);
  const role = account?.adminRole ?? null;

  const refreshStats = useCallback(() => { adminApi.stats().then(setStats, () => {}); }, []);
  useEffect(() => { if (role) refreshStats(); }, [role, path, refreshStats]);

  const ctx = useMemo<AdminContext | null>(() => account && role
    ? { account, canModerate: role !== "support", isSuperAdmin: role === "super_admin", toast, stats, refreshStats }
    : null, [account, role, toast, stats, refreshStats]);

  if (!supabaseConfigured) return <Gate title="Admin needs the database">Add your Supabase keys to <code>web/.env.local</code> (see docs/database-setup.md), then reload.</Gate>;
  if (!ready) return <Gate title="Loading…" />;
  if (!account) return <StaffSignIn signIn={signIn} />;
  if (!ctx) {
    return (
      <Gate title="No access">
        <p>{account.email} is not on the Nestmap admin team.</p>
        <div className="adm-actions"><Link className="adm-btn" href="/">Back to the app</Link><button className="adm-btn" onClick={() => signOut()}>Sign out</button></div>
      </Gate>
    );
  }

  const badge = (k?: string) => (k === "pending" ? stats?.listings.pending : k === "reports" ? stats?.open_reports : 0) || 0;
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  return (
    <Ctx.Provider value={ctx}>
      <div className="adm">
        <aside className="adm-side">
          <div className="adm-logo">Nest<i>map</i> <span>admin</span></div>
          <nav aria-label="Admin">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} aria-current={active(n.href) ? "page" : undefined}>
                <Icon name={n.icon} /><span>{n.label}</span>{badge("badge" in n ? n.badge : undefined) > 0 && <b>{badge("badge" in n ? n.badge : undefined)}</b>}
              </Link>
            ))}
          </nav>
          <div className="adm-me">
            <div><b>{account.name}</b><small>{ROLE_LABEL[role!]}</small></div>
            <div className="adm-me-links"><Link href="/">View app</Link><button onClick={() => signOut()}>Sign out</button></div>
          </div>
        </aside>
        <main className="adm-main">
          {role === "support" && <div className="adm-note">You are signed in as <b>Support</b>. You can look at everything, but not change anything.</div>}
          {children}
        </main>
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </Ctx.Provider>
  );
}

function Gate({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="adm-gate"><div className="adm-gate-card"><h1>{title}</h1>{children}</div></div>;
}

function StaffSignIn({ signIn }: { signIn: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const problem = await signIn(email, password);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Gate title="Nestmap admin">
      <p>Sign in with your team account.</p>
      <form onSubmit={submit} className="adm-form">
        <input type="email" autoComplete="username" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <div className="adm-error" role="alert">{error}</div>}
        <button className="adm-btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </Gate>
  );
}
