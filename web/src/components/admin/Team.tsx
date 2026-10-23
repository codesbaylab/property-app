"use client";
import { useState } from "react";
import { useAdmin } from "./AdminShell";
import { Badge, Empty, ErrorBox, Loading, Pager, ago, useLoad } from "./ui";
import { adminApi, type TeamMember } from "@/lib/admin";

const ROLE_LABEL = { super_admin: "Super admin", moderator: "Moderator", support: "Support" } as const;
const ROLE_HELP = {
  super_admin: "Everything, including the team",
  moderator: "Review listings, handle reports, suspend users",
  support: "Look at everything, change nothing",
} as const;
const ACTIONS: Record<string, string> = {
  "listing.approve": "approved a listing", "listing.reject": "rejected a listing", "listing.request_changes": "asked for changes on a listing", "listing.unpublish": "unpublished a listing",
  "listing.auto_hide": "hid a listing after reports", "user.update": "changed a user", "report.dismiss": "dismissed a report", "report.hide_listing": "hid a reported listing",
  "report.suspend_user": "suspended a user from a report", "report.resolve": "resolved a report", "team.set_role": "changed the team",
};

export default function Team() {
  const [tab, setTab] = useState<"team" | "activity">("team");
  return (
    <div className="adm-page">
      <header className="adm-head"><div><h1>Team &amp; activity</h1><div className="adm-sub">Who can use this dashboard, and everything they have done.</div></div></header>
      <div className="adm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "team"} className={tab === "team" ? "on" : ""} onClick={() => setTab("team")}>Team</button>
        <button role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "on" : ""} onClick={() => setTab("activity")}>Activity log</button>
      </div>
      {tab === "team" ? <TeamList /> : <ActivityLog />}
    </div>
  );
}

function TeamList() {
  const { isSuperAdmin, account, toast } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => adminApi.team(), []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"super_admin" | "moderator" | "support">("support");
  const [busy, setBusy] = useState(false);

  const change = async (mail: string, r: "super_admin" | "moderator" | "support" | "none", done: string) => {
    setBusy(true);
    try { await adminApi.setRole(mail, r); toast(done); setEmail(""); reload(); }
    catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : (
        <div className="adm-table-wrap">
          <table className="adm-table static">
            <thead><tr><th>Member</th><th>Role</th><th>Last seen</th>{isSuperAdmin && <th aria-label="Actions" />}</tr></thead>
            <tbody>
              {(data ?? []).map((m: TeamMember) => (
                <tr key={m.user_id}>
                  <td><div className="adm-cell"><span className="adm-av">{(m.name ?? "?")[0]}</span><span><b>{m.name ?? "Unnamed"}</b>{m.user_id === account.id && " (you)"}<small>{m.email}</small></span></div></td>
                  <td><Badge tone="dk">{ROLE_LABEL[m.role]}</Badge><small>{ROLE_HELP[m.role]}</small></td>
                  <td>{ago(m.last_sign_in_at)}</td>
                  {isSuperAdmin && (
                    <td className="right">
                      {m.user_id !== account.id && (
                        <>
                          <select className="adm-input small" aria-label={`Role for ${m.email}`} value={m.role} disabled={busy} onChange={e => change(m.email!, e.target.value as TeamMember["role"], "Role changed.")}>
                            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button className="adm-btn danger" disabled={busy} onClick={() => change(m.email!, "none", "Removed from the team.")}>Remove</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isSuperAdmin ? (
        <section className="adm-card" style={{ marginTop: 18 }}>
          <h3>Add a team member</h3>
          <div className="adm-sub" style={{ marginBottom: 10 }}>They need an account first. Enter the email they signed up with.</div>
          <div className="adm-filters" style={{ marginBottom: 0 }}>
            <input className="adm-input" type="email" placeholder="name@example.com" aria-label="Email of the new team member" value={email} onChange={e => setEmail(e.target.value)} />
            <select className="adm-input" aria-label="Role" value={role} onChange={e => setRole(e.target.value as typeof role)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="adm-btn primary" disabled={busy || !email.trim()} onClick={() => change(email, role, "Added to the team.")}>Add</button>
          </div>
        </section>
      ) : <div className="adm-sub" style={{ marginTop: 14 }}>Only a super admin can change the team.</div>}
    </>
  );
}

function ActivityLog() {
  const [page, setPage] = useState(0);
  const { data, error, loading } = useLoad(() => adminApi.audit(page), [page]);
  return (
    <>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No activity yet.</Empty> : (
        <div className="adm-table-wrap">
          <table className="adm-table static">
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.id}>
                  <td>{ago(r.created_at)}</td><td>{r.actor_name ?? "System"}</td>
                  <td><b>{ACTIONS[r.action] ?? r.action}</b>{typeof r.details?.reason === "string" && r.details.reason ? <small>“{r.details.reason}”</small> : null}{typeof r.details?.note === "string" && r.details.note ? <small>“{r.details.note}”</small> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={data?.total ?? 0} page={page} onPage={setPage} size={50} />
    </>
  );
}
