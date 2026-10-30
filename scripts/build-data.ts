/**
 * Normalizes the Combined Flash Flood Compendium CSV export into one GeoParquet
 * file the app reads in the browser: public/data/ffc.parquet.
 *
 * The sheet merges two schemas. Columns 0–58 are the current compendium; columns
 * 59–76 repeat several fields from the older compendium with different labels and
 * Excel-mangled ranges ("10-Jan" for 1-10). Current-schema values win; older ones
 * fill gaps.
 *
 * Record hierarchy: an Event_summary row is followed by its Affected_location rows.
 * Only the first rows carry Event_ID/Record_ID, so linkage uses Event_ID when set
 * and file order otherwise. Missing IDs are assigned after the existing maximum.
 *
 * Usage: bun scripts/build-data.ts [path/to/export.csv]
 */
import { parquetWriteBuffer } from "hyparquet-writer";

const SRC = process.argv[2] ?? "data/raw/combined-ffc.csv";
const OUT = "public/data/ffc.parquet";

// ---------- CSV ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- column indices (header names repeat across the two schemas) ----------
const C = {
  eventId: 0, recordId: 1, level: 2, scale: 3, start: 4, end: 5, year: 6, dateUnc: 7,
  rainStart: 8, rainDuration: 9, country: 10, geometry: 11, areaName: 12, lat: 13, lon: 14,
  uncDeg: 15, dynamics: 16, confidence: 17, limitations: 18, meteorology: 19, hydrology: 20,
  humanLand: 21, infrastructure: 22, houses: 23, agriculture: 24, livestock: 25, injured: 26,
  missing: 27, dead: 28, displaced: 29, affected: 30, cost: 31, warning: 32, warningLink: 33,
  ifrcCategory: 34, ifrcLink: 35, dfo: 36, rainfall: 37, iri: 38, gpmMap: 39, gpmSeries: 40,
  weatherReplay: 41, video: [42, 43, 44, 45], media: [46, 47, 48, 49, 50], notes: 51,
  staff: 52, volunteers: 53, actions: 54, /* 55, 56: personal contacts — dropped */
  cmorphLat: 57, cmorphLon: 58, oldName: 59, oldUncKm: 60, oldRegion: 61, oldHumanLand: 62,
  oldInjured: 63, oldMissing: 64, oldDead: 65, oldDisplaced: 66, oldAffected: 67,
  oldHydrology: 68, oldMeteorology: 69, oldDynamics: 70, oldScale: 71, oldLivestock: 73,
  oldAgriculture: 74, oldHouses: 75, oldInfrastructure: 76,
} as const;

// ---------- value cleaning ----------
const NULLISH = new Set(["", "n/a", "na", "not available", "not reported", "none", "-", "h:mm", "unknown"]);
function clean(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return NULLISH.has(t.toLowerCase()) ? null : t;
}
function num(v: string | undefined): number | null {
  const t = clean(v);
  if (t == null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function isoDate(v: string | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function isoDateTime(v: string | undefined): string | null {
  const t = clean(v);
  if (!t) return null;
  const date = isoDate(t);
  if (!date) return null;
  const m = t.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return date;
  let h = Number(m[1]) % 12;
  if (m[3]?.toUpperCase() === "PM") h += 12;
  if (!m[3]) h = Number(m[1]);
  return `${date}T${String(h).padStart(2, "0")}:${m[2]}Z`;
}
function url(v: string | undefined): string | null {
  const t = clean(v);
  return t && /^https?:\/\//i.test(t) ? t : null;
}
function first<T>(...vals: (T | null)[]): T | null {
  for (const v of vals) if (v != null) return v;
  return null;
}

// Excel turned old-schema ranges into dates: "10-Jan" = 1-10, "20-Nov" = 11-20.
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** Normalizes an impact range to "a-b", "N+" or a single number. */
function range(v: string | undefined): string | null {
  let t = clean(v)?.replace(/"/g, "").trim();
  if (!t) return null;
  const mangled = t.match(/^(\d+)-([A-Za-z]{3})$/);
  if (mangled && MONTHS[mangled[2].toLowerCase()]) t = `${MONTHS[mangled[2].toLowerCase()]}-${mangled[1]}`;
  const more = t.match(/^([\d,]+)\s*(?:or more|\+)$/i);
  if (more) {
    const n = Number(more[1].replace(/,/g, ""));
    // Old schema says "10000 or more"; the current bins say "10,001+".
    return `${(n % 10 === 0 ? n + 1 : n).toLocaleString("en-US")}+`;
  }
  const r = t.match(/^([\d,]+)\s*-\s*([\d,]+)$/);
  if (r) {
    const a = Number(r[1].replace(/,/g, ""));
    const b = Number(r[2].replace(/,/g, ""));
    return `${a.toLocaleString("en-US")}-${b.toLocaleString("en-US")}`;
  }
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n.toLocaleString("en-US") : t;
}
// Tag vocabularies merge both schemas case-insensitively; the current schema's
// spelling wins. Known typos in the older schema are fixed here.
const TYPOS: Record<string, string> = { "associated with landside": "associated with landslide" };
const canon = new Map<string, string>();
function tagKey(s: string) {
  const k = s.toLowerCase().replace(/\s+/g, " ").trim();
  return TYPOS[k] ?? k;
}
function registerTags(v: string | undefined) {
  for (const t of splitTags(v)) if (!canon.has(tagKey(t))) canon.set(tagKey(t), t);
}
function splitTags(v: string | undefined): string[] {
  const t = clean(v);
  if (!t) return [];
  return t.split(",").map((s) => s.trim()).filter((s) => s && !NULLISH.has(s.toLowerCase()));
}
function tags(...vals: (string | undefined)[]): string[] {
  const out = new Map<string, string>();
  for (const v of vals)
    for (const t of splitTags(v)) {
      const k = tagKey(t);
      if (!out.has(k)) out.set(k, canon.get(k) ?? t);
    }
  return [...out.values()];
}

function scale(v: string | undefined): string | null {
  const t = clean(v)?.toLowerCase();
  if (!t) return null;
  if (t.startsWith("local")) return "Local";
  if (t.startsWith("medium")) return "Medium";
  if (t.startsWith("large")) return "Large";
  return null;
}
const CONF_RANK = ["Low", "Medium", "High"];
/** Mixed tags like "High, Medium" resolve to the lower, more conservative level. */
function confidence(v: string | undefined): string | null {
  const levels = splitTags(v).map((s) => CONF_RANK.find((c) => c.toLowerCase() === s.toLowerCase())).filter(Boolean) as string[];
  if (!levels.length) return null;
  return levels.sort((a, b) => CONF_RANK.indexOf(a) - CONF_RANK.indexOf(b))[0];
}

// ---------- build ----------
type Rec = {
  record_id: number; event_id: number; level: "event" | "location"; name: string | null;
  area_name: string | null; country: string | null; region: string | null;
  start_date: string | null; end_date: string | null; date_uncertainty_days: number | null;
  heavy_rain_start: string | null; heavy_rain_duration_h: number | null;
  lat: number | null; lon: number | null; uncertainty_deg: number | null; coord_source: string | null;
  spatial_scale: string | null; spatial_geometry: string | null; confidence: string | null;
  limitations: string[]; meteorology: string[]; hydrology: string[]; flood_dynamics: string[];
  human_land: string[]; infrastructure: string[];
  dead: string | null; injured: string | null; missing: string | null; displaced: string | null;
  affected: string | null; houses_damaged: string | null; agriculture_ha: string | null; livestock: string | null;
  cost_usd: number | null; warning_issued: string | null; warning_link: string | null;
  ifrc_go_flood: boolean; ifrc_go_link: string | null; dfo_number: string | null;
  reported_rainfall_mm: number | null; iri_link: string | null; gpm_map_link: string | null;
  gpm_series_link: string | null; weather_replay_link: string | null;
  video_links: string[]; media_links: string[]; notes: string | null;
  staff_deployed: string | null; volunteers: string | null; actions: string | null;
  cmorph_lat: string | null; cmorph_lon: string | null;
};

const raw = parseCsv(await Bun.file(SRC).text());
const header = raw[0];
if (header.length !== 77 || header[0] !== "Event_ID" || header[59] !== "Name")
  throw new Error(`Unexpected header shape (${header.length} columns). Update the column map in build-data.ts.`);
// Keep the 1-based file line with each row so warnings point at the sheet.
const rows = raw
  .map((r, i) => Object.assign(r, { line: i + 1 }))
  .slice(1)
  .filter((r) => r.some((c) => c.trim() !== ""));

for (const r of rows)
  for (const i of [C.meteorology, C.hydrology, C.dynamics, C.humanLand, C.infrastructure, C.limitations]) registerTags(r[i]);

let maxEvent = 0;
let maxRecord = 0;
for (const r of rows) {
  maxEvent = Math.max(maxEvent, num(r[C.eventId]) ?? 0);
  maxRecord = Math.max(maxRecord, num(r[C.recordId]) ?? 0);
}

const recs: Rec[] = [];
let parent: Rec | null = null;
const warnings: string[] = [];
const usedEventIds = new Set<number>();

rows.forEach((r) => {
  const line = r.line;
  const lvlRaw = clean(r[C.level]);
  const isEvent = lvlRaw === "Event_summary";
  if (!isEvent && !parent) {
    warnings.push(`line ${line}: affected location before any event summary — skipped`);
    return;
  }
  if (!lvlRaw) warnings.push(`line ${line}: blank Record_Level — treated as Affected_location of event ${parent!.event_id}`);

  // File order is authoritative: a few location rows carry an Event_ID one higher
  // than the summary they sit under while matching its country and date.
  const explicitEvent = num(r[C.eventId]);
  let eventId = isEvent ? (explicitEvent ?? ++maxEvent) : parent!.event_id;
  if (isEvent && usedEventIds.has(eventId)) {
    const fresh = ++maxEvent;
    warnings.push(`line ${line}: Event_ID ${eventId} already used by another summary — assigned ${fresh}`);
    eventId = fresh;
  }
  if (isEvent) usedEventIds.add(eventId);
  if (!isEvent && explicitEvent != null && explicitEvent !== parent!.event_id)
    warnings.push(`line ${line}: Event_ID ${explicitEvent} under summary ${parent!.event_id} — kept with the summary`);

  const lat = num(r[C.lat]);
  const lon = num(r[C.lon]);
  const validCoord = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if ((lat != null || lon != null) && !validCoord) warnings.push(`line ${line}: invalid coordinate ${lat}, ${lon}`);
  const uncKm = num(r[C.oldUncKm]);
  const geometry = clean(r[C.geometry]);

  const p = isEvent ? null : parent!;
  const rec: Rec = {
    record_id: num(r[C.recordId]) ?? ++maxRecord,
    event_id: eventId,
    level: isEvent ? "event" : "location",
    name: isEvent ? clean(r[C.oldName]) : null,
    area_name: clean(r[C.areaName]),
    country: clean(r[C.country]) ?? p?.country ?? null,
    region: clean(r[C.oldRegion]) ?? p?.region ?? null,
    start_date: isoDate(r[C.start]) ?? p?.start_date ?? null,
    end_date: isoDate(r[C.end]) ?? (isoDate(r[C.start]) ? null : (p?.end_date ?? null)),
    date_uncertainty_days: num(r[C.dateUnc]),
    heavy_rain_start: isoDateTime(r[C.rainStart]),
    heavy_rain_duration_h: num(r[C.rainDuration]),
    lat: validCoord ? lat : null,
    lon: validCoord ? lon : null,
    uncertainty_deg: validCoord ? first(num(r[C.uncDeg]), uncKm != null ? uncKm / 111.32 : null) : null,
    coord_source: validCoord ? "recorded" : null,
    spatial_scale: first(scale(r[C.scale]), scale(r[C.oldScale])),
    // Some cells hold expiring Airtable attachment URLs instead of a category.
    spatial_geometry: geometry && !/https?:\/\//.test(geometry) ? geometry : null,
    confidence: confidence(r[C.confidence]) ?? p?.confidence ?? null,
    limitations: tags(r[C.limitations]),
    meteorology: tags(r[C.meteorology], r[C.oldMeteorology]),
    hydrology: tags(r[C.hydrology], r[C.oldHydrology]),
    flood_dynamics: tags(r[C.dynamics], r[C.oldDynamics]),
    human_land: tags(r[C.humanLand], r[C.oldHumanLand]),
    infrastructure: tags(r[C.infrastructure], r[C.oldInfrastructure]),
    dead: first(range(r[C.dead]), range(r[C.oldDead])),
    injured: first(range(r[C.injured]), range(r[C.oldInjured])),
    missing: first(range(r[C.missing]), range(r[C.oldMissing])),
    displaced: first(range(r[C.displaced]), range(r[C.oldDisplaced])),
    affected: first(range(r[C.affected]), range(r[C.oldAffected])),
    houses_damaged: first(range(r[C.houses]), range(r[C.oldHouses])),
    agriculture_ha: first(range(r[C.agriculture]), range(r[C.oldAgriculture])),
    livestock: first(range(r[C.livestock]), range(r[C.oldLivestock])),
    cost_usd: num(r[C.cost]),
    warning_issued: clean(r[C.warning]),
    warning_link: url(r[C.warningLink]),
    ifrc_go_flood: clean(r[C.ifrcCategory]) === "checked",
    ifrc_go_link: url(r[C.ifrcLink]),
    dfo_number: clean(r[C.dfo]),
    reported_rainfall_mm: num(r[C.rainfall]),
    iri_link: url(r[C.iri]),
    gpm_map_link: url(r[C.gpmMap]),
    gpm_series_link: url(r[C.gpmSeries]),
    weather_replay_link: url(r[C.weatherReplay]),
    video_links: [...new Set(C.video.map((i) => url(r[i])).filter(Boolean) as string[])],
    media_links: [...new Set(C.media.map((i) => url(r[i])).filter(Boolean) as string[])],
    notes: clean(r[C.notes]),
    staff_deployed: clean(r[C.staff]),
    volunteers: clean(r[C.volunteers]),
    actions: clean(r[C.actions]),
    cmorph_lat: clean(r[C.cmorphLat]),
    cmorph_lon: clean(r[C.cmorphLon]),
  };
  if (!rec.start_date) warnings.push(`line ${line}: no start date`);
  recs.push(rec);
  if (isEvent) parent = rec;
});

// Events without their own coordinate fall back to the bounding circle of their
// located affected locations, so they still appear on the map.
for (const ev of recs.filter((r) => r.level === "event" && r.lat == null)) {
  const locs = recs.filter((r) => r.level === "location" && r.event_id === ev.event_id && r.lat != null);
  if (!locs.length) continue;
  const lat = locs.reduce((s, l) => s + l.lat!, 0) / locs.length;
  const lon = locs.reduce((s, l) => s + l.lon!, 0) / locs.length;
  const reach = Math.max(...locs.map((l) => Math.hypot(l.lat! - lat, (l.lon! - lon) * Math.cos((lat * Math.PI) / 180)) + (l.uncertainty_deg ?? 0)));
  Object.assign(ev, { lat, lon, uncertainty_deg: Math.max(reach, 0.05), coord_source: "derived" });
}

// ---------- GeoParquet ----------
function wkbPoint(lon: number, lat: number): Uint8Array {
  const b = new DataView(new ArrayBuffer(21));
  b.setUint8(0, 1); // little endian
  b.setUint32(1, 1, true); // Point
  b.setFloat64(5, lon, true);
  b.setFloat64(13, lat, true);
  return new Uint8Array(b.buffer);
}
const located = recs.filter((r) => r.lat != null);
const bbox = [
  Math.min(...located.map((r) => r.lon!)), Math.min(...located.map((r) => r.lat!)),
  Math.max(...located.map((r) => r.lon!)), Math.max(...located.map((r) => r.lat!)),
];
const geo = {
  version: "1.1.0",
  primary_column: "geometry",
  columns: { geometry: { encoding: "WKB", geometry_types: ["Point"], crs: null, bbox } },
};

const LIST = "|";
type Col = { name: string; data: unknown[]; type: "STRING" | "INT32" | "DOUBLE" | "BOOLEAN" | "BYTE_ARRAY" };
const sample = recs[0] as Record<string, unknown>;
const columnData: Col[] = Object.keys(sample).map((name) => {
  const data = recs.map((r) => (r as Record<string, unknown>)[name]);
  const kind = data.find((v) => v != null);
  if (Array.isArray(kind)) return { name, type: "STRING", data: data.map((v) => ((v as string[]).length ? (v as string[]).join(LIST) : null)) };
  if (typeof kind === "boolean") return { name, type: "BOOLEAN", data };
  if (name === "record_id" || name === "event_id" || name.endsWith("_days")) return { name, type: "INT32", data };
  if (typeof kind === "number") return { name, type: "DOUBLE", data };
  return { name, type: "STRING", data };
});
columnData.push({ name: "geometry", type: "BYTE_ARRAY", data: recs.map((r) => (r.lat != null ? wkbPoint(r.lon!, r.lat) : null)) });

const buf = parquetWriteBuffer({
  columnData,
  kvMetadata: [
    { key: "geo", value: JSON.stringify(geo) },
    { key: "ffc:list_separator", value: LIST },
    { key: "ffc:source", value: "Combined Flash Flood Compendium — Combined FFC sheet" },
  ],
});
await Bun.write(OUT, buf);

const events = recs.filter((r) => r.level === "event");
const unmapped = events.filter((e) => e.lat == null);
console.log(`rows ${rows.length} → records ${recs.length} (events ${events.length}, locations ${recs.length - events.length})`);
console.log(`events mapped ${events.length - unmapped.length}, derived coords ${events.filter((e) => e.coord_source === "derived").length}, unmapped ${unmapped.length}`);
console.log(`wrote ${OUT} (${(buf.byteLength / 1024).toFixed(1)} KiB)`);
if (warnings.length) console.log(`${warnings.length} warnings:\n  ${warnings.join("\n  ")}`);
