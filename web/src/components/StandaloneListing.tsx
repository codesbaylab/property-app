"use client";
import { useRouter } from "next/navigation";
import ListingDetail, { Toast } from "./ListingDetail";
import { useAuth } from "@/lib/auth";
import { startConversation } from "@/lib/chat";
import { isSampleId, reportListing, usingDatabase } from "@/lib/data";
import { useSaved, useTheme, useToast } from "@/lib/hooks";
import type { Listing } from "@/lib/listing";

/** The shareable /home/<id> page: same screen as the map overlay, opened straight from a link. */
export default function StandaloneListing({ listing }: { listing: Listing }) {
  const router = useRouter();
  const { account, ready } = useAuth();
  const { saved, toggle } = useSaved(account?.id ?? null);
  const { toast, toastMsg, toastOn } = useToast();
  useTheme();
  return (
    <>
      <ListingDetail listing={listing} mode={listing.buy > 0 ? "buy" : "rent"} immediate
        report={usingDatabase && !isSampleId(listing.id) ? { signedIn: !!account, send: (reason, details) => (account ? reportListing(account.id, listing.id, reason, details) : Promise.resolve("Sign in first.")) } : undefined}
        onMessage={usingDatabase && !isSampleId(listing.id) ? async () => { const r = await startConversation(listing.id); if ("error" in r) toast(r.error); else router.push(`/#chat=${r.id}`); } : undefined}
        signInRequired={usingDatabase && !account} onNeedLogin={() => router.push("/#profile")}
        saved={saved.has(listing.id)} onToggleSave={id => { if (usingDatabase && !account) { if (ready) router.push("/#profile"); return; } toggle(id); }} onClose={() => router.push("/")} onToast={toast} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
