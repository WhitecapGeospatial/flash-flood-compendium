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
import { EVENT_COLOR, MAP_THEME, METERS_PER_DEGREE, type Scheme } from "../theme";
import { DashedCircleLayer } from "./DashedCircleLayer";

setWorkerUrl(maplibreWorkerUrl);

type Located = FloodRecord & { lat: number; lon: number };
const isLocated = (r: FloodRecord): r is Located => r.lat != null && r.lon != null;

export type MapPadding = { top: number; right: number; bottom: number; left: number };

type Props = {
  events: FloodEvent[];
  selected: FloodEvent | null;
  highlightedRecord: number | null;
  padding: MapPadding;
  scheme: Scheme;
  onSelect: (e: FloodEvent | null) => void;
  onHoverRecord: (recordId: number | null) => void;
};

const EXPLODE_MS = 650;
/** Smallest on-screen uncertainty ring, so it always clears the 6 px event dot. */
const MIN_RING_PX = 12;

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
        className: "map-tooltip",
      } : null,
  });
  return null;
}

export function MapView({ events, selected, highlightedRecord, padding, scheme, onSelect, onHoverRecord }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [explode, setExplode] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const theme = MAP_THEME[scheme];

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
    const lerp = (a: number, b: number) => a + (b - a) * explode;
    const position = (r: Located): [number, number] =>
      sel && r.level === "location" ? [lerp(sel.lon, r.lon), lerp(sel.lat, r.lat)] : [r.lon, r.lat];
    const isSel = (r: FloodRecord) => r.event_id === sel?.event_id;
    const isHot = (r: Located) => r.record_id === hovered || r.record_id === highlightedRecord;

    // Uncertainty is shown only for the hovered point and the selected event.
    const rings = [...located, ...locations].filter(
      (r) => r.uncertainty_deg != null && (isHot(r) || (r.level === "event" && isSel(r))),
    );

    return [
      new DashedCircleLayer<Located>({
        id: "uncertainty",
        data: rings,
        getPosition: position,
        getRadius: (d) => d.uncertainty_deg! * METERS_PER_DEGREE * (d.level === "location" ? explode : 1),
        radiusUnits: "meters",
        radiusMinPixels: MIN_RING_PX,
        getFillColor: theme.uncertaintyFill,
        getLineColor: theme.uncertaintyLine,
        lineWidthUnits: "pixels",
        getLineWidth: 1.5,
        stroked: true,
        filled: true,
        updateTriggers: { getPosition: explode, getRadius: explode, getFillColor: scheme, getLineColor: scheme },
      }),
      new LineLayer<Located>({
        id: "location-links",
        data: locations,
        visible: locations.length > 0,
        getSourcePosition: () => [sel!.lon, sel!.lat],
        getTargetPosition: position,
        getColor: theme.link,
        getWidth: 1,
        updateTriggers: { getTargetPosition: explode, getSourcePosition: sel?.event_id, getColor: scheme },
      }),
      new ScatterplotLayer<Located>({
        id: "events",
        data: located,
        pickable: true,
        getPosition: position,
        getRadius: (d) => (isSel(d) ? 8 : 6),
        getFillColor: (d) => [...EVENT_COLOR, sel && !isSel(d) ? 90 : 240],
        getLineColor: (d) => [255, 255, 255, sel && !isSel(d) ? 90 : 255],
        getLineWidth: (d) => (isSel(d) ? 2.5 : 1),
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        onHover: ({ object }) => setHovered(object ? (object as Located).record_id : null),
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
        getPosition: position,
        getRadius: (d) => (d.record_id === highlightedRecord ? 6 : 4),
        getFillColor: [...EVENT_COLOR, 255],
        getLineColor: [255, 255, 255, 255],
        getLineWidth: (d) => (d.record_id === highlightedRecord ? 2 : 1),
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        stroked: true,
        onHover: ({ object }) => {
          const id = object ? (object as Located).record_id : null;
          setHovered(id);
          onHoverRecord(id);
        },
        updateTriggers: { getPosition: explode, getRadius: highlightedRecord, getLineWidth: highlightedRecord },
      }),
    ];
  }, [located, locations, selected, explode, hovered, highlightedRecord, theme, scheme, onSelect, onHoverRecord]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: 20, latitude: 10, zoom: 1.6 }}
      mapStyle={theme.basemap}
      style={{ position: "absolute", inset: 0 }}
      dragRotate={false}
      attributionControl={{ compact: true }}
    >
      <DeckOverlay layers={layers} onClickEmpty={() => onSelect(null)} />
      <NavigationControl position="bottom-right" showCompass={false} />
    </Map>
  );
}
