import { type Confidence, type FloodEvent, IMPACT_FIELDS, type ImpactKey, rangeMin } from "./data";

/**
 * Empty set = no constraint. Inside a section an event matches if it has any
 * selected value; across sections all constraints must hold.
 */
export type Filters = {
  confidence: Set<Confidence>;
  meteorology: Set<string>;
  hydrology: Set<string>;
  impact: Set<ImpactKey>;
  scale: Set<string>;
  /** Inclusive [start, end] epoch ms; null = whole record, including undated events. */
  time: [number, number] | null;
};

export const emptyFilters = (): Filters => ({
  confidence: new Set(),
  meteorology: new Set(),
  hydrology: new Set(),
  impact: new Set(),
  scale: new Set(),
  time: null,
});

export type TagSection = "meteorology" | "hydrology";

/** True when the event reports a non-zero value for the impact metric, on the event or any location. */
export function hasImpact(e: FloodEvent, key: ImpactKey): boolean {
  return [e, ...e.locations].some((r) => (rangeMin(r[key]) ?? 0) > 0);
}

export function matches(e: FloodEvent, f: Filters, ignoreTime = false): boolean {
  if (f.confidence.size && !(e.confidence && f.confidence.has(e.confidence))) return false;
  if (f.meteorology.size && !e.meteorology.some((t) => f.meteorology.has(t))) return false;
  if (f.hydrology.size && !e.hydrology.some((t) => f.hydrology.has(t))) return false;
  if (f.scale.size && !(e.spatial_scale && f.scale.has(e.spatial_scale))) return false;
  if (f.impact.size && ![...f.impact].some((k) => hasImpact(e, k))) return false;
  if (!ignoreTime && f.time && (e.time == null || e.time < f.time[0] || e.time > f.time[1])) return false;
  return true;
}

export function activeCount(f: Filters): number {
  return f.confidence.size + f.meteorology.size + f.hydrology.size + f.impact.size + f.scale.size;
}

/** Tag → number of events carrying it, most common first. */
export function vocabulary(events: FloodEvent[], section: TagSection): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of events) for (const t of e[section]) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function impactCounts(events: FloodEvent[]): [ImpactKey, string, number][] {
  return IMPACT_FIELDS.map(({ key, label }) => [key, label, events.filter((e) => hasImpact(e, key)).length]);
}

export function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}
