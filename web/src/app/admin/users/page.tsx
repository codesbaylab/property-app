import { Suspense } from "react";
import Users from "@/components/admin/Users";

export default function UsersPage() {
  return <Suspense fallback={null}><Users /></Suspense>;
}
