import { Suspense } from "react";
import Listings from "@/components/admin/Listings";

export default function ListingsPage() {
  return <Suspense fallback={null}><Listings /></Suspense>;
}
