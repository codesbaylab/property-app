"use client";
/* eslint-disable @next/next/no-img-element -- listing photos come from storage links */
import Link from "next/link";
import { Icon } from "./Icon";
import { fmt } from "@/lib/listing";
import { useTheme } from "@/lib/hooks";
import type { AgentProfile } from "@/lib/data";

/** The public page of a verified agent: who they are and the homes they have live right now. */
export default function AgentProfileView({ agent }: { agent: AgentProfile }) {
  useTheme();
  const since = new Date(agent.since).toLocaleDateString([], { month: "long", year: "numeric" });
  return (
    <div className="legal">
      <div className="vw">
        <Link href="/" className="backbtn"><Icon name="back" />Back to the map</Link>
        <div className="agh">
          <div className="av">{agent.name[0]?.toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 26 }}>{agent.name}</h1>
            <div className="meta">{[agent.agency, agent.city].filter(Boolean).join(" · ")}</div>
            <div className="tags" style={{ marginTop: 8 }}><span className="tag ok"><Icon name="verified" />Verified agent</span><span className="tag">On Nestmap since {since}</span></div>
          </div>
        </div>
        <h2 className="vh" style={{ fontSize: 17 }}>{agent.liveCount} {agent.liveCount === 1 ? "home" : "homes"} listed</h2>
        {agent.listings.length === 0 ? (
          <div className="empty"><div className="ei"><Icon name="home" /></div><h3>No homes listed right now</h3>Check back soon.</div>
        ) : (
          <div className="grid agl">
            {agent.listings.map(l => (
              <Link key={l.id} href={`/home/${l.id}`} className="pc">
                <div className="media"><img src={l.img} alt="" /><span className="type">{l.type}</span></div>
                <div className="pbody">
                  <div className="price">{fmt(l.price, l.mode)}{l.mode === "rent" && <small style={{ fontWeight: 500, color: "var(--muted)" }}> /mo</small>}</div>
                  <div className="meta">{l.beds > 0 ? `${l.beds} bed · ${l.baths} bath · ` : ""}{l.address}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
