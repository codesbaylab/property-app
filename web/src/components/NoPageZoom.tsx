"use client";
import { useEffect } from "react";

/**
 * Only the map may zoom. Phones otherwise let people pinch-zoom the whole page, which enlarges the search box,
 * the Buy / Rent control and the menu and pushes them out of place. The map handles its own pinch with touch events,
 * so blocking the browser's page-zoom gestures does not affect it.
 */
export default function NoPageZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    // Safari on iPhone ignores user-scalable=no, but it still fires these events before it zooms the page
    const events = ["gesturestart", "gesturechange", "gestureend"] as const;
    events.forEach(n => document.addEventListener(n, stop, { passive: false }));
    // pinch with two fingers anywhere outside the map
    const multi = (e: TouchEvent) => {
      if (e.touches.length > 1 && !(e.target as Element | null)?.closest?.(".maplibregl-map")) e.preventDefault();
    };
    document.addEventListener("touchmove", multi, { passive: false });
    return () => {
      events.forEach(n => document.removeEventListener(n, stop));
      document.removeEventListener("touchmove", multi);
    };
  }, []);
  return null;
}
