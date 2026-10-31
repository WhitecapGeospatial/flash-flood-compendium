import { parquetMetadata, parquetReadObjects } from "hyparquet";

export type Confidence = "High" | "Medium" | "Low";
export const CONFIDENCES: Confidence[] = ["High", "Medium", "Low"];

/** One row of public/data/ffc.parquet (see scripts/build-data.ts). */
export type FloodRecord = {
  record_id: number;
  event_id: number;
  level: "event" | "location";
  name: string | null;
  area_name: string | null;
  country: string | null;
  region: string | null;
  start_date: string | null;
  end_date: string | null;
  date_uncertainty_days: number | null;
  heavy_rain_start: string | null;
  heavy_rain_duration_h: number | null;
  lat: number | null;
  lon: number | null;
  uncertainty_deg: number | null;
  coord_source: "recorded" | "derived" | null;
  spatial_scale: string | null;
  spatial_geometry: string | null;
  confidence: Confidence | null;
  limitations: string[];
  meteorology: string[];
  hydrology: string[];
  flood_dynamics: string[];
  human_land: string[];
  infrastructure: string[];
  dead: string | null;
  injured: string | null;
  missing: string | null;
  displaced: string | null;
  affected: string | null;
  houses_damaged: string | null;
  agriculture_ha: string | null;
  livestock: string | null;
  cost_usd: number | null;
  warning_issued: string | null;
  warning_link: string | null;
  ifrc_go_flood: boolean;
  ifrc_go_link: string | null;
  dfo_number: string | null;
  reported_rainfall_mm: number | null;
  iri_link: string | null;
  gpm_map_link: string | null;
  gpm_series_link: string | null;
  weather_replay_link: string | null;
  video_links: string[];
  media_links: string[];
  notes: string | null;
  staff_deployed: string | null;
  volunteers: string | null;
  actions: string | null;
  cmorph_lat: string | null;
  cmorph_lon: string | null;
};

export type FloodEvent = FloodRecord & {
  level: "event";
  /** Start date as epoch ms, for time filtering; null when the sheet has no date. */
  time: number | null;
  locations: FloodRecord[];
};

export type Dataset = {
  events: FloodEvent[];
  extent: [number, number];
};

const LIST_COLUMNS = [
  "limitations", "meteorology", "hydrology", "flood_dynamics", "human_land",
  "infrastructure", "video_links", "media_links",
] as const;

export const IMPACT_FIELDS = [
  { key: "dead", label: "Dead" },
  { key: "injured", label: "Injured" },
  { key: "missing", label: "Missing" },
  { key: "displaced", label: "Displaced" },
  { key: "affected", label: "Affected" },
  { key: "houses_damaged", label: "Houses / buildings damaged" },
  { key: "agriculture_ha", label: "Agriculture impacted (ha)" },
  { key: "livestock", label: "Livestock impacted" },
] as const;
export type ImpactKey = (typeof IMPACT_FIELDS)[number]["key"];

/** Lower bound of a normalized range such as "1-10", "10,001+" or "0". */
export function rangeMin(r: string | null): number | null {
  const m = r?.match(/^[\d,]+/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

export async function loadDataset(): Promise<Dataset> {
  const url = `${import.meta.env.BASE_URL}data/ffc.parquet`;
  // One whole-file fetch, not HTTP range reads: GitHub Pages gzips the response
  // and applies Range to the gzipped bytes, so ranged reads get the wrong footer.
  // The file is ~140 KiB, so ranges would save nothing anyway.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const file = await res.arrayBuffer();
  const metadata = parquetMetadata(file);
  const sep = metadata.key_value_metadata?.find((kv) => kv.key === "ffc:list_separator")?.value ?? "|";
  const columns = metadata.schema.slice(1).map((s) => s.name).filter((n) => n !== "geometry");
  const rows = (await parquetReadObjects({ file, metadata, columns })) as Record<string, unknown>[];

  const records = rows.map((row) => {
    for (const c of LIST_COLUMNS) row[c] = typeof row[c] === "string" ? (row[c] as string).split(sep) : [];
    return row as FloodRecord;
  });

  const byEvent = new Map<number, FloodEvent>();
  for (const r of records)
    if (r.level === "event")
      byEvent.set(r.event_id, { ...(r as FloodRecord & { level: "event" }), time: r.start_date ? Date.parse(`${r.start_date}T00:00:00Z`) : null, locations: [] });
  for (const r of records) if (r.level === "location") byEvent.get(r.event_id)?.locations.push(r);

  const events = [...byEvent.values()];
  const times = events.map((e) => e.time).filter((t): t is number => t != null);
  return { events, extent: [Math.min(...times), Math.max(...times)] };
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function formatDate(d: string | null): string | null {
  return d ? DATE_FMT.format(new Date(`${d}T00:00:00Z`)) : null;
}
export function formatDateRange(start: string | null, end: string | null): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (!s) return "Date unknown";
  return e && end !== start ? `${s} – ${e}` : s;
}
export function eventTitle(e: FloodRecord): string {
  return e.area_name ?? e.name ?? e.country ?? `Event ${e.event_id}`;
}
