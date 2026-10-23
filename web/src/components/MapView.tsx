"use client";
import { useEffect, useRef } from "react";
import { Map as MLMap, Marker as MLMarker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");   // copied into /public by scripts/copy-maplibre-worker.mjs

export interface Pin { id: string; lat: number; lng: number; label: string }
export interface View { west: number; south: number; east: number; north: number; zoom: number; lat: number; lng: number }
export interface FlyTo { lat: number; lng: number; zoom?: number; key: number }

/**
 * Map style. To switch provider set NEXT_PUBLIC_MAP_STYLE_LIGHT / NEXT_PUBLIC_MAP_STYLE_DARK
 * to a style URL (for example from MapTiler). Without them the free Esri grey basemap is used (demo only).
 */
export function styleFor(dark: boolean): StyleSpecification | string {
  const url = dark ? process.env.NEXT_PUBLIC_MAP_STYLE_DARK : process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT;
  if (url) return url;
  const t = (name: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`;
  const base = dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base";
  const ref = dark ? "World_Dark_Gray_Reference" : "World_Light_Gray_Reference";
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: [t(base)], tileSize: 256, maxzoom: 16, attribution: "Tiles © Esri" },
      ref: { type: "raster", tiles: [t(ref)], tileSize: 256, maxzoom: 16 },
    },
    layers: [{ id: "base", type: "raster", source: "base" }, { id: "ref", type: "raster", source: "ref" }],
  };
}

const toCollection = (pins: Pin[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: pins.map(p => ({
    type: "Feature", properties: { id: p.id, label: p.label }, geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  })),
});

interface Entry { marker: MLMarker; root: HTMLDivElement; child: HTMLDivElement; sig: string; cluster: boolean; id: string; clusterId: number; lng: number; lat: number }

interface Props {
  pins: Pin[];
  selectedId: string | null;
  dark: boolean;
  fly: FlyTo | null;
  start: [number, number];   // [lng, lat]
  /** few homes on screen: show every price instead of grouping them into bubbles */
  plain: boolean;
  onSelect: (id: string) => void;
  onMove: (v: View) => void;
  onBackgroundClick: () => void;
}

export default function MapView({ pins, selectedId, dark, fly, start, plain, onSelect, onMove, onBackgroundClick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const registry = useRef(new Map<string, Entry>());
  // latest values for the long-lived map callbacks
  const live = useRef({ pins, selectedId, plain, onSelect, onMove, onBackgroundClick });
  useEffect(() => { live.current = { pins, selectedId, plain, onSelect, onMove, onBackgroundClick }; });
  const firstStyle = useRef(true);

  function refreshMarkers() {
    const map = mapRef.current;
    if (!map || !map.getSource("listings")) return;
    // prices show when zoomed in close, or whenever there are few enough homes that they will not crowd each other
    const dot = map.getZoom() < 14 && !live.current.plain;
    const seen = new Set<string>();
    for (const f of map.querySourceFeatures("listings")) {
      const p = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string; label?: string };
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const cluster = !!p.cluster;
      const key = cluster ? `c${p.cluster_id}` : `p${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sel = !cluster && p.id === live.current.selectedId;
      const sig = cluster ? `c|${p.point_count}` : `p|${p.label}|${dot}|${sel}`;
      let e = registry.current.get(key);
      if (!e) {
        const root = document.createElement("div");
        root.className = "mk";
        const child = document.createElement("div");
        root.appendChild(child);
        const marker = new MLMarker({ element: root, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        e = { marker, root, child, sig: "", cluster, id: p.id ?? "", clusterId: p.cluster_id ?? -1, lng, lat };
        const entry = e;
        child.addEventListener("click", ev => {
          ev.stopPropagation();
          if (entry.cluster) {
            (map.getSource("listings") as GeoJSONSource).getClusterExpansionZoom(entry.clusterId)
              .then(z => map.easeTo({ center: [entry.lng, entry.lat], zoom: z + 0.4 }));
          } else live.current.onSelect(entry.id);
        });
        registry.current.set(key, e);
      }
      e.id = p.id ?? ""; e.cluster = cluster; e.lng = lng; e.lat = lat;
      if (e.sig !== sig) {
        e.sig = sig;
        e.child.className = cluster ? "clu" : `pin${dot ? " dot" : ""}${sel ? " sel" : ""}`;
        e.child.textContent = cluster ? String(p.point_count) : p.label ?? "";
        e.root.style.zIndex = sel ? "5" : "1";
      }
    }
    for (const [key, e] of registry.current) {
      if (!seen.has(key)) { e.marker.remove(); registry.current.delete(key); }
    }
  }

  // create the map once (theme and start position are only read here; later changes go through the effects below)
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!box.current) return;
    const map = new MLMap({
      container: box.current, style: styleFor(dark), center: start, zoom: 12, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, maxZoom: 18,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.on("style.load", () => {
      map.addSource("listings", { type: "geojson", data: toCollection(live.current.pins), cluster: !live.current.plain, clusterRadius: 56, clusterMaxZoom: 13 });
      // invisible layer: keeps the source loaded so we can read its features for the HTML markers
      map.addLayer({ id: "listings-hit", type: "circle", source: "listings", paint: { "circle-radius": 1, "circle-opacity": 0 } });
    });
    const report = () => {
      const b = map.getBounds(), c = map.getCenter();
      live.current.onMove({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom(), lat: c.lat, lng: c.lng });
    };
    map.on("moveend", () => { report(); refreshMarkers(); });
    map.on("sourcedata", e => { if (e.sourceId === "listings" && e.isSourceLoaded) refreshMarkers(); });
    map.on("idle", refreshMarkers);
    map.on("click", () => live.current.onBackgroundClick());
    map.once("load", report);
    const markers = registry.current;
    return () => { markers.forEach(e => e.marker.remove()); markers.clear(); map.remove(); mapRef.current = null; };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // theme change swaps the basemap
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    mapRef.current?.setStyle(styleFor(dark));
  }, [dark]);

  // new / filtered pins
  useEffect(() => {
    const src = mapRef.current?.getSource("listings") as GeoJSONSource | undefined;
    src?.setData(toCollection(pins));
  }, [pins]);

  // few homes on screen: stop grouping so every price shows; many homes: group again
  useEffect(() => {
    const src = mapRef.current?.getSource("listings") as GeoJSONSource | undefined;
    src?.setClusterOptions({ cluster: !plain });
  }, [plain]);

  // selection highlight
  useEffect(() => { refreshMarkers(); }, [selectedId]);

  // fly to a place (search, locate, pin tap)
  useEffect(() => {
    if (!fly || !mapRef.current) return;
    mapRef.current.flyTo({ center: [fly.lng, fly.lat], zoom: fly.zoom ?? mapRef.current.getZoom(), essential: true });
  }, [fly]);

  return <div id="map" ref={box} />;
}
