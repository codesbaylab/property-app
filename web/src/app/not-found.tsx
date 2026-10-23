import Link from "next/link";
import { Icon } from "@/components/Icon";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)" }}>
      <div className="empty" style={{ maxWidth: 360 }}>
        <div className="ei"><Icon name="map" /></div>
        <h3>We couldn&apos;t find that page</h3>
        <p style={{ margin: "0 0 18px" }}>The link may be old, or the home may have been taken down.</p>
        <Link className="btn primary" href="/" style={{ display: "inline-block", padding: "13px 26px" }}>Back to the map</Link>
      </div>
    </div>
  );
}
