import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import StandaloneListing from "@/components/StandaloneListing";
import { fmt, modeFor, priceFor, spec } from "@/lib/listing";
import { getListing } from "@/lib/data";

type Params = PageProps<"/home/[id]">["params"];

export async function generateMetadata({ params }: PageProps<"/home/[id]">): Promise<Metadata> {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) return { title: "Property not found" };
  const m = modeFor(l, "buy");
  const title = `${fmt(priceFor(l, m), m)}${m === "rent" ? "/mo" : ""} · ${l.type} at ${l.addr}`;
  return {
    title,
    description: `${spec(l)}. ${m === "rent" ? "For rent" : "For sale"} on Nestmap.`,
    openGraph: { title, description: spec(l), images: [{ url: l.img, width: 600, height: 450 }] },
  };
}

// the id is only known per request, so it is read inside a Suspense boundary
async function Listing({ params }: { params: Params }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  return <StandaloneListing listing={listing} />;
}

export default function ListingPage({ params }: PageProps<"/home/[id]">) {
  return (
    <Suspense fallback={null}>
      <Listing params={params} />
    </Suspense>
  );
}
