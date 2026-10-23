"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "./AdminShell";
import { Badge, Empty, ErrorBox, Loading, Modal, Pager, ago, useLoad } from "./ui";
import { adminApi, type AdminUser } from "@/lib/admin";

const FILTERS = [["all", "Everyone"], ["agents", "Verified agents"], ["pending_agents", "Agent requests"], ["owners", "Owners"], ["suspended", "Suspended"], ["admins", "Admin team"]] as const;
const ROLE_LABEL = { super_admin: "Super admin", moderator: "Moderator", support: "Support" } as const;

export default function Users() {
  const params = useSearchParams();
  const [filter, setFilter] = useState(FILTERS.some(f => f[0] === params.get("filter")) ? params.get("filter")! : "all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [who, setWho] = useState<AdminUser | null>(null);
  const { data, error, loading, reload } = useLoad(() => adminApi.users({ search, filter, page }), [search, filter, page]);

  return (
    <div className="adm-page">
      <header className="adm-head"><div><h1>Users</h1><div className="adm-sub">{data ? `${data.total.toLocaleString("en-IN")} people` : "Buyers, owners, agents and the team"}</div></div></header>
      <div className="adm-filters">
        <input className="adm-input" placeholder="Search name, email or phone" aria-label="Search users" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <div className="adm-tabs" role="tablist">{FILTERS.map(([k, label]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => { setFilter(k); setPage(0); }}>{label}</button>)}</div>
      </div>
      {error && <ErrorBox message={error} />}
      {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No one matches.</Empty> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Person</th><th>Role</th><th>Listings</th><th>Status</th><th>Joined</th><th>Last seen</th></tr></thead>
            <tbody>
              {data.rows.map(u => (
                <tr key={u.id} tabIndex={0} onClick={() => setWho(u)} onKeyDown={e => { if (e.key === "Enter") setWho(u); }}>
                  <td><div className="adm-cell"><span className="adm-av">{(u.name ?? "?")[0]}</span><span><b>{u.name ?? "Unnamed"}</b><small>{u.email ?? u.phone ?? "—"}</small></span></div></td>
                  <td>{u.admin_role ? <Badge tone="dk">{ROLE_LABEL[u.admin_role]}</Badge> : u.agent_status === "verified" ? <Badge tone="ok">Verified agent</Badge> : u.agent_status === "pending" ? <Badge tone="wr">Agent request</Badge> : u.listings > 0 ? "Owner" : "Buyer"}</td>
                  <td>{u.listings}</td>
                  <td>{u.account_status === "active" ? <Badge tone="ok">Active</Badge> : <Badge tone="bd">{u.account_status}</Badge>}{u.open_reports > 0 && <> <Badge tone="bd">{u.open_reports} report{u.open_reports > 1 ? "s" : ""}</Badge></>}</td>
                  <td>{ago(u.created_at)}</td><td>{ago(u.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={data?.total ?? 0} page={page} onPage={setPage} />
      {who && <UserModal user={who} onClose={() => setWho(null)} onChanged={() => { setWho(null); reload(); }} />}
    </div>
  );
}

function UserModal({ user, onClose, onChanged }: { user: AdminUser; onClose: () => void; onChanged: () => void }) {
  const { canModerate, account, toast, refreshStats } = useAdmin();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const self = user.id === account.id;
  const locked = !canModerate || self;

  const apply = async (change: { account?: string; agent?: string }, done: string) => {
    setBusy(true);
    try {
      const r = await adminApi.setUser(user.id, { ...change, reason });
      toast(r.listings_hidden ? `${done} ${r.listings_hidden} live listing${r.listings_hidden === 1 ? " was" : "s were"} hidden.` : done);
      refreshStats(); onChanged();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  return (
    <Modal title={user.name ?? "User"} onClose={onClose}>
      <dl className="adm-dl">
        <dt>Email</dt><dd>{user.email ?? "—"}</dd><dt>Phone</dt><dd>{user.phone ?? "—"}</dd><dt>City</dt><dd>{user.city ?? "—"}</dd>
        <dt>Listings</dt><dd>{user.listings}</dd><dt>Agent status</dt><dd>{user.agent_status}</dd>
        <dt>Account</dt><dd>{user.account_status}</dd><dt>Joined</dt><dd>{ago(user.created_at)}</dd>
      </dl>
      {locked ? (
        <div className="adm-callout">{self ? "This is your own account." : "Your role can look but not change accounts."}</div>
      ) : (
        <>
          <h3 className="adm-h3">Agent verification</h3>
          <div className="adm-actions left">
            {user.agent_status !== "verified" && <button className="adm-btn primary" disabled={busy} onClick={() => apply({ agent: "verified" }, "Verified as an agent.")}>Verify as agent</button>}
            {user.agent_status === "pending" && <button className="adm-btn" disabled={busy} onClick={() => apply({ agent: "rejected" }, "Agent request declined.")}>Decline request</button>}
            {user.agent_status === "verified" && <button className="adm-btn" disabled={busy} onClick={() => apply({ agent: "none" }, "Agent badge removed.")}>Remove agent badge</button>}
          </div>
          <h3 className="adm-h3">Account</h3>
          {user.account_status === "active" ? (
            <>
              <textarea className="adm-input" rows={2} placeholder="Reason for suspending (kept in the activity log)" aria-label="Reason" value={reason} onChange={e => setReason(e.target.value)} />
              <div className="adm-actions left"><button className="adm-btn danger" disabled={busy || !reason.trim()} onClick={() => apply({ account: "suspended" }, "Account suspended.")}>Suspend account</button></div>
              <div className="adm-sub">Suspending also hides all of this person&apos;s live listings.</div>
            </>
          ) : (
            <div className="adm-actions left"><button className="adm-btn primary" disabled={busy} onClick={() => apply({ account: "active" }, "Account reinstated. Their listings stay hidden until you republish them.")}>Reinstate account</button></div>
          )}
        </>
      )}
    </Modal>
  );
}
