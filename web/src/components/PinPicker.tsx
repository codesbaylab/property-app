"use client";
import { useEffect, useRef } from "react";
import { Map as MLMap, Marker as MLMarker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { styleFor } from "./MapView";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

interface Props {
  pin: { lat: number; lng: number } | null;
  start: [number, number];   // [lng, lat], used until a pin is dropped
  dark: boolean;
  onPin: (p: { lat: number; lng: number }) => void;
}

/** A small map where tapping, or dragging the marker, sets where the property is. */
export default function PinPicker({ pin, start, dark, onPin }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const onPinRef = useRef(onPin);
  useEffect(() => { onPinRef.current = onPin; });

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!box.current) return;
    const map = new MLMap({
      container: box.current, style: styleFor(dark), center: pin ? [pin.lng, pin.lat] : start, zoom: pin ? 16 : 13,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 19,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    const place = (lng: number, lat: number) => {
      if (!markerRef.current) {
        const m = new MLMarker({ draggable: true, color: "#0f766e" }).setLngLat([lng, lat]).addTo(map);
        m.on("dragend", () => { const p = m.getLngLat(); onPinRef.current({ lat: p.lat, lng: p.lng }); });
        markerRef.current = m;
      } else markerRef.current.setLngLat([lng, lat]);
    };
    if (pin) place(pin.lng, pin.lat);
    map.on("click", e => { place(e.lngLat.lng, e.lngLat.lat); onPinRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    return () => { markerRef.current?.remove(); markerRef.current = null; map.remove(); mapRef.current = null; };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    mapRef.current?.setStyle(styleFor(dark));
  }, [dark]);

  return <div ref={box} className="pickmap" role="application" aria-label="Map: tap to drop a pin where the property is" />;
}
