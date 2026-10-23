import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export const LEGAL_UPDATED = "25 October 2026";

/** Shared shell for the Terms and Privacy pages (the app body does not scroll, so this scrolls itself). */
export default function Legal({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="legal">
      <article className="vw">
        <Link href="/" className="backbtn"><Icon name="back" />Back to the map</Link>
        <h1>{title}</h1>
        <div className="sub">Last updated {LEGAL_UPDATED}</div>
        <p className="lead">{intro}</p>
        {children}
        <p className="meta" style={{ marginTop: 28 }}>
          <Link href="/terms">Terms of use</Link> · <Link href="/privacy">Privacy policy</Link>
        </p>
      </article>
    </div>
  );
}
