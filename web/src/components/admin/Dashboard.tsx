"use client";
import Link from "next/link";
import { useAdmin } from "./AdminShell";
import { ErrorBox, Loading, TYPE_LABEL, useLoad } from "./ui";
import { adminApi } from "@/lib/admin";

export default function Dashboard() {
  const { account } = useAdmin();
  const { data: s, error, loading } = useLoad(() => adminApi.stats(), []);
  if (loading && !s) return <Loading />;
  if (error && !s) return <ErrorBox message={error} />;
  if (!s) return null;

  const live = s.listings.live ?? 0, pending = s.listings.pending ?? 0;
  const max = Math.max(1, ...s.daily.map(d => d.n));
  const total = Object.values(s.listings).reduce((a, b) => a + b, 0);
  const types = Object.entries(s.live_by_type).sort((a, b) => b[1] - a[1]);
  const attention = [
    { n: pending, text: `${pending} listing${pending === 1 ? "" : "s"} waiting for review`, href: "/admin/review" },
    { n: s.open_reports, text: `${s.open_reports} open report${s.open_reports === 1 ? "" : "s"}`, href: "/admin/reports" },
    { n: s.agents_pending, text: `${s.agents_pending} agent verification${s.agents_pending === 1 ? "" : "s"}`, href: "/admin/users?filter=pending_agents" },
    { n: s.suspended, text: `${s.suspended} suspended account${s.suspended === 1 ? "" : "s"}`, href: "/admin/users?filter=suspended" },
  ].filter(a => a.n > 0);

  return (
    <div className="adm-page">
      <header className="adm-head"><div><h1>Dashboard</h1><div className="adm-sub">Welcome back, {account.name}.</div></div></header>

      <div className="adm-kpis">
        <Kpi label="Live listings" value={live} />
        <Kpi label="Pending review" value={pending} tone={pending ? "wr" : undefined} href="/admin/review" />
        <Kpi label="Users" value={s.users} href="/admin/users" />
        <Kpi label="Open reports" value={s.open_reports} tone={s.open_reports ? "bd" : undefined} href="/admin/reports" />
      </div>
      <div className="adm-kpis">
        <Kpi label="Verified agents" value={s.agents_verified} />
        <Kpi label="Agent requests" value={s.agents_pending} />
        <Kpi label="Suspended accounts" value={s.suspended} />
        <Kpi label="Saved homes" value={s.saved} />
      </div>

      <div className="adm-grid2">
        <section className="adm-card">
          <h3>New listings, last 14 days</h3>
          <div className="adm-bars" role="img" aria-label="New listings per day">
            {s.daily.map(d => (
              <div key={d.day} title={`${d.day}: ${d.n}`}><i style={{ height: `${Math.max(3, (d.n / max) * 100)}%` }} /><span>{new Date(d.day).getDate()}</span></div>
            ))}
          </div>
          <div className="adm-sub">{s.daily.reduce((a, d) => a + d.n, 0)} new in total · {total} listings overall</div>
        </section>
        <section className="adm-card">
          <h3>Needs attention</h3>
          {attention.length === 0 ? <div className="adm-sub">Nothing is waiting. 🎉</div> :
            attention.map(a => <Link key={a.href} href={a.href} className="adm-line link"><span>{a.text}</span><span aria-hidden>›</span></Link>)}
          <h3 style={{ marginTop: 20 }}>Live listings by type</h3>
          {types.map(([t, n]) => (
            <div key={t} className="adm-meter"><span>{TYPE_LABEL[t] ?? t}</span><div><i style={{ width: `${(n / (types[0][1] || 1)) * 100}%` }} /></div><b>{n}</b></div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, href }: { label: string; value: number; tone?: string; href?: string }) {
  const body = <><small>{label}</small><b className={tone}>{value.toLocaleString("en-IN")}</b></>;
  return href ? <Link className="adm-kpi link" href={href}>{body}</Link> : <div className="adm-kpi">{body}</div>;
}
