import type { LayersList, PickingInfo } from "@deck.gl/core";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 loads its worker next to its own module URL, which bundling breaks.
// Let Vite emit the worker as its own chunk and point MapLibre at it.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map, type MapRef, NavigationControl, useControl } from "react-map-gl/maplibre";
import { eventTitle, type FloodEvent, type FloodRecord } from "../data";
import { BASEMAP_STYLE, CONFIDENCE_COLOR, METERS_PER_DEGREE, UNCERTAINTY_COLOR, UNKNOWN_COLOR } from "../theme";
import { FadeCircleLayer } from "./FadeCircleLayer";

setWorkerUrl(maplibreWorkerUrl);

type Located = FloodRecord & { lat: number; lon: number };
const isLocated = (r: FloodRecord): r is Located => r.lat != null && r.lon != null;

export type MapPadding = { top: number; right: number; bottom: number; left: number };

type Props = {
  events: FloodEvent[];
  selected: FloodEvent | null;
  highlightedRecord: number | null;
  padding: MapPadding;
  onSelect: (e: FloodEvent | null) => void;
  onHoverRecord: (recordId: number | null) => void;
};

const EXPLODE_MS = 650;

function DeckOverlay({ layers, onClickEmpty }: { layers: LayersList; onClickEmpty: () => void }) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));
  overlay.setProps({
    layers,
    onClick: (info: PickingInfo) => {
      if (!info.picked) onClickEmpty();
    },
    getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    getTooltip: ({ object }: PickingInfo<FloodRecord>) =>
      object ? {
        text: object.level === "event" ? `${eventTitle(object)} · ${object.country ?? ""}` : eventTitle(object),
        style: { background: "rgba(10,20,35,0.92)", color: "#fff", fontSize: "12px", borderRadius: "6px", padding: "4px 8px" },
      } : null,
  });
  return null;
}

export function MapView({ events, selected, highlightedRecord, padding, onSelect, onHoverRecord }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [explode, setExplode] = useState(0);

  const located = useMemo(() => events.filter(isLocated) as (FloodEvent & Located)[], [events]);
  const locations = useMemo(() => (selected ? selected.locations.filter(isLocated) : []), [selected]);

  // Animate affected locations outward from the event point.
  useEffect(() => {
    if (!selected) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / EXPLODE_MS);
      setExplode(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  // Fly to the event and everything that belongs to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected || !isLocated(selected)) return;
    const pts: [number, number, number][] = [selected, ...locations].map((r) => [r.lon!, r.lat!, r.uncertainty_deg ?? 0]);
    let [w, s, e, n] = [180, 90, -180, -90];
    for (const [lon, lat, u] of pts) {
      const du = u / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      w = Math.min(w, lon - du);
      e = Math.max(e, lon + du);
      s = Math.min(s, lat - u);
      n = Math.max(n, lat + u);
    }
    map.fitBounds([[w, s], [e, n]], { padding: { ...padding, top: padding.top + 40, bottom: padding.bottom + 40, left: padding.left + 40, right: padding.right + 40 }, maxZoom: 11, duration: 1400 });
    // Re-fit only when the selection changes, not on every padding change.
  }, [selected]);

  const layers = useMemo(() => {
    const sel = selected && isLocated(selected) ? selected : null;
    const dim = (id: number) => (sel && sel.event_id !== id ? 70 : 235);
    const lerp = (a: number, b: number) => a + (b - a) * explode;
    const exploded = (r: Located): [number, number] => (sel ? [lerp(sel.lon, r.lon), lerp(sel.lat, r.lat)] : [r.lon, r.lat]);

    return [
      new FadeCircleLayer<Located>({
        id: "event-uncertainty",
        data: located,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => (d.uncertainty_deg ?? 0) * METERS_PER_DEGREE,
        getFillColor: (d) => [...UNCERTAINTY_COLOR, sel ? (d.event_id === sel.event_id ? 80 : 14) : 55],
        radiusUnits: "meters",
        stroked: false,
        updateTriggers: { getFillColor: sel?.event_id },
      }),
      new FadeCircleLayer<Located>({
        id: "location-uncertainty",
        data: locations,
        visible: locations.length > 0,
        getPosition: exploded,
        getRadius: (d) => (d.uncertainty_deg ?? 0) * METERS_PER_DEGREE * explode,
        getFillColor: [...UNCERTAINTY_COLOR, 70],
        radiusUnits: "meters",
        stroked: false,
        updateTriggers: { getPosition: explode, getRadius: explode },
      }),
      new LineLayer<Located>({
        id: "location-links",
        data: locations,
        visible: locations.length > 0,
        getSourcePosition: () => [sel!.lon, sel!.lat],
        getTargetPosition: exploded,
        getColor: [255, 255, 255, 110],
        getWidth: 1,
        updateTriggers: { getTargetPosition: explode, getSourcePosition: sel?.event_id },
      }),
      new ScatterplotLayer<Located>({
        id: "events",
        data: located,
        pickable: true,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => (d.event_id === sel?.event_id ? 9 : 6),
        getFillColor: (d) => [...(d.confidence ? CONFIDENCE_COLOR[d.confidence] : UNKNOWN_COLOR), dim(d.event_id)],
        getLineColor: (d) => [255, 255, 255, d.event_id === sel?.event_id ? 255 : dim(d.event_id) * 0.6],
        getLineWidth: (d) => (d.event_id === sel?.event_id ? 2.5 : 1),
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        onClick: ({ object }) => {
          onSelect(object as FloodEvent);
          return true;
        },
        updateTriggers: { getRadius: sel?.event_id, getFillColor: sel?.event_id, getLineColor: sel?.event_id, getLineWidth: sel?.event_id },
      }),
      new ScatterplotLayer<Located>({
        id: "locations",
        data: locations,
        visible: locations.length > 0,
        pickable: true,
        getPosition: exploded,
        getRadius: (d) => (d.record_id === highlightedRecord ? 7 : 4.5),
        getFillColor: () => [...(sel!.confidence ? CONFIDENCE_COLOR[sel!.confidence] : UNKNOWN_COLOR), 255],
        getLineColor: (d) => (d.record_id === highlightedRecord ? [255, 255, 255, 255] : [10, 20, 35, 255]),
        getLineWidth: 1.5,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        onHover: ({ object }) => onHoverRecord(object ? (object as Located).record_id : null),
        updateTriggers: { getPosition: explode, getRadius: highlightedRecord, getLineColor: highlightedRecord, getFillColor: sel?.event_id },
      }),
    ];
  }, [located, locations, selected, explode, highlightedRecord, onSelect, onHoverRecord]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 20, latitude: 10, zoom: 1.6 }}
      mapStyle={BASEMAP_STYLE}
      style={{ position: "absolute", inset: 0 }}
      dragRotate={false}
      attributionControl={{ compact: true }}
    >
      <DeckOverlay layers={layers} onClickEmpty={() => onSelect(null)} />
      <NavigationControl position="bottom-right" showCompass={false} />
    </Map>
  );
}
