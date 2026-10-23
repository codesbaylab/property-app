"use client";
import { useRouter } from "next/navigation";
import ListingDetail, { Toast } from "./ListingDetail";
import { useAuth } from "@/lib/auth";
import { isSampleId, reportListing, usingDatabase } from "@/lib/data";
import { useSaved, useTheme, useToast } from "@/lib/hooks";
import type { Listing } from "@/lib/listing";

/** The shareable /home/<id> page: same screen as the map overlay, opened straight from a link. */
export default function StandaloneListing({ listing }: { listing: Listing }) {
  const router = useRouter();
  const { account } = useAuth();
  const { saved, toggle } = useSaved(account?.id ?? null);
  const { toast, toastMsg, toastOn } = useToast();
  useTheme();
  return (
    <>
      <ListingDetail listing={listing} mode={listing.buy > 0 ? "buy" : "rent"} immediate
        report={usingDatabase && !isSampleId(listing.id) ? { signedIn: !!account, send: (reason, details) => (account ? reportListing(account.id, listing.id, reason, details) : Promise.resolve("Sign in first.")) } : undefined}
        saved={saved.has(listing.id)} onToggleSave={toggle} onClose={() => router.push("/")} onToast={toast} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
