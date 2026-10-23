import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import AgentProfileView from "@/components/AgentProfileView";
import { getAgentProfile } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/agent/[id]">): Promise<Metadata> {
  const { id } = await params;
  const a = await getAgentProfile(id);
  if (!a) return { title: "Agent not found" };
  return { title: `${a.name}${a.agency ? ` · ${a.agency}` : ""}`, description: `Verified agent on Nestmap with ${a.liveCount} ${a.liveCount === 1 ? "home" : "homes"} listed.` };
}

// the id is only known per request, so it is read inside a Suspense boundary
async function Agent({ params }: { params: PageProps<"/agent/[id]">["params"] }) {
  const { id } = await params;
  const agent = await getAgentProfile(id);
  if (!agent) notFound();
  return <AgentProfileView agent={agent} />;
}

export default function AgentPage({ params }: PageProps<"/agent/[id]">) {
  return (
    <Suspense fallback={null}>
      <Agent params={params} />
    </Suspense>
  );
}
