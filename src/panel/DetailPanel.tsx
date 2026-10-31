import { Pill } from "@whitecapgeospatial/ui";
import { type ReactNode, useId, useState } from "react";
import { eventTitle, type FloodEvent, type FloodRecord, formatDateRange, IMPACT_FIELDS } from "../data";
import { VideoViewer } from "./VideoViewer";

const TABS = [
  { id: "met", label: "Meteorology / hydrology" },
  { id: "impact", label: "Impact" },
  { id: "links", label: "Links" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Props = {
  event: FloodEvent;
  highlightedRecord: number | null;
  onHoverRecord: (id: number | null) => void;
  /** Rendered at the right of the headline (close button on desktop). */
  actions?: ReactNode;
};

export function ConfidencePill({ level }: { level: FloodEvent["confidence"] }) {
  return (
    <Pill variant="outline" size="sm" className="shrink-0">
      {level ? `${level} confidence` : "Confidence unknown"}
    </Pill>
  );
}

export function DetailHeader({ event, actions }: { event: FloodEvent; actions?: ReactNode }) {
  const unc = event.date_uncertainty_days;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ds-text-muted">
            {formatDateRange(event.start_date, event.end_date)}
            {unc ? ` · ±${unc} day${unc === 1 ? "" : "s"}` : ""}
          </p>
          <h2 className="text-lg font-semibold leading-tight">{eventTitle(event)}</h2>
          <p className="text-sm text-ds-text-muted">{[event.country, event.name !== event.area_name ? event.name : null].filter(Boolean).join(" · ")}</p>
        </div>
        {actions}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConfidencePill level={event.confidence} />
        {event.limitations.map((l) => (
          <span key={l} className="text-xs text-ds-text-muted">
            Limitation: {l}
          </span>
        ))}
      </div>
    </header>
  );
}

export function DetailTabs({ event, highlightedRecord, onHoverRecord }: Omit<Props, "actions">) {
  const [tab, setTab] = useState<TabId>("met");
  const base = useId();
  return (
    <div className="flex min-h-0 flex-col">
      <div role="tablist" aria-label="Event details" className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${base}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`${base}-${t.id}-panel`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === tab);
              const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
              if (next == null) return;
              const id = TABS[(next + TABS.length) % TABS.length].id;
              setTab(id);
              document.getElementById(`${base}-${id}`)?.focus();
            }}
            tabIndex={tab === t.id ? 0 : -1}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-${tab}-panel`} aria-labelledby={`${base}-${tab}`} className="flex flex-col gap-5 pt-4">
        {tab === "met" && <MetTab e={event} />}
        {tab === "impact" && <ImpactTab e={event} highlightedRecord={highlightedRecord} onHoverRecord={onHoverRecord} />}
        {tab === "links" && <LinksTab e={event} />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

function Tags({ values, empty = "Not recorded" }: { values: string[]; empty?: string }) {
  if (!values.length) return <p className="text-sm text-ds-text-muted">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <Pill key={v} size="sm" variant="neutral">
          {v}
        </Pill>
      ))}
    </div>
  );
}

/** Definition list that drops rows with no value. */
function Facts({ rows }: { rows: [string, ReactNode | null | undefined][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== "");
  if (!shown.length) return null;
  return (
    <dl className="facts">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link-row">
      <span className="min-w-0 truncate">{children}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

const hostname = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function MetTab({ e }: { e: FloodEvent }) {
  const rainStart = e.heavy_rain_start
    ? new Date(e.heavy_rain_start).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", ...(e.heavy_rain_start.includes("T") ? { timeStyle: "short" } : {}) }) + (e.heavy_rain_start.includes("T") ? " UTC" : "")
    : null;
  const precip = [
    e.gpm_map_link && (["GPM IMERG accumulated precipitation map", e.gpm_map_link] as const),
    e.gpm_series_link && (["GPM IMERG precipitation time series", e.gpm_series_link] as const),
    e.iri_link && (["IRI estimated precipitation", e.iri_link] as const),
    e.weather_replay_link && (["Copernicus Weather Replay", e.weather_replay_link] as const),
  ].filter(Boolean) as (readonly [string, string])[];
  return (
    <>
      <Section title="Meteorology">
        <Tags values={e.meteorology} />
      </Section>
      <Section title="Hydrology">
        <Tags values={e.hydrology} />
      </Section>
      <Section title="Flood dynamics">
        <Tags values={e.flood_dynamics} />
      </Section>
      <Section title="Heavy rain">
        <Facts
          rows={[
            ["Start", rainStart],
            ["Duration", e.heavy_rain_duration_h != null ? `${e.heavy_rain_duration_h} h` : null],
            ["Reported rainfall", e.reported_rainfall_mm != null ? `${e.reported_rainfall_mm.toLocaleString("en-US")} mm` : null],
            ["Flash flood watch / warning", e.warning_issued ? (e.warning_link ? <a href={e.warning_link} target="_blank" rel="noreferrer">{e.warning_issued} ↗</a> : e.warning_issued) : null],
          ]}
        />
        {!rainStart && e.heavy_rain_duration_h == null && e.reported_rainfall_mm == null && !e.warning_issued && <p className="text-sm text-ds-text-muted">Not recorded</p>}
      </Section>
      {(precip.length > 0 || e.cmorph_lat || e.cmorph_lon) && (
        <Section title="Precipitation data">
          <Facts rows={[["CMORPH location", e.cmorph_lat || e.cmorph_lon ? [e.cmorph_lat, e.cmorph_lon].filter(Boolean).join(", ") : null]]} />
          {precip.map(([label, href]) => (
            <ExtLink key={href} href={href}>
              {label}
            </ExtLink>
          ))}
        </Section>
      )}
      {e.notes && (
        <Section title="Analyst notes">
          <p className="whitespace-pre-line text-sm">{e.notes}</p>
        </Section>
      )}
    </>
  );
}

function ImpactTab({ e, highlightedRecord, onHoverRecord }: { e: FloodEvent; highlightedRecord: number | null; onHoverRecord: (id: number | null) => void }) {
  return (
    <>
      <Section title="Reported impact">
        <p className="text-xs text-ds-text-muted">Values are reported ranges for the whole event.</p>
        <div className="metrics">
          {IMPACT_FIELDS.map(({ key, label }) => (
            <div key={key} data-empty={e[key] == null || undefined}>
              <span className="metric-value">{e[key] ?? "—"}</span>
              <span className="metric-label">{label}</span>
            </div>
          ))}
        </div>
        <Facts rows={[["Countrywide estimated damages", e.cost_usd != null ? `US$${e.cost_usd.toLocaleString("en-US")}` : null]]} />
      </Section>
      <Section title="Extent">
        <Facts
          rows={[
            ["Spatial scale of impact", e.spatial_scale],
            ["Region", e.region],
            ["Spatial geometry", e.spatial_geometry],
            ["Location", e.coord_source === "derived" ? "Centre of affected locations" : null],
          ]}
        />
      </Section>
      <Section title="Human–land interaction">
        <Tags values={e.human_land} />
      </Section>
      <Section title="Infrastructure impacted">
        <Tags values={e.infrastructure} />
      </Section>
      {(e.staff_deployed || e.volunteers || e.actions) && (
        <Section title="Response">
          <Facts
            rows={[
              ["Local staff deployed", e.staff_deployed],
              ["Volunteers", e.volunteers],
              ["National RC / Gov't actions", e.actions],
            ]}
          />
        </Section>
      )}
      {e.locations.length > 0 && (
        <Section title={`Affected locations (${e.locations.length})`}>
          <ul className="flex flex-col gap-1" onMouseLeave={() => onHoverRecord(null)}>
            {e.locations.map((l) => (
              <LocationRow key={l.record_id} l={l} highlighted={l.record_id === highlightedRecord} onHover={onHoverRecord} />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function LocationRow({ l, highlighted, onHover }: { l: FloodRecord; highlighted: boolean; onHover: (id: number | null) => void }) {
  const impacts = IMPACT_FIELDS.filter(({ key }) => l[key] != null).map(({ key, label }) => `${label}: ${l[key]}`);
  return (
    <li
      className="location-row"
      data-highlighted={highlighted || undefined}
      onMouseEnter={() => onHover(l.lat != null ? l.record_id : null)}
      onFocus={() => onHover(l.lat != null ? l.record_id : null)}
      tabIndex={0}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{eventTitle(l)}</span>
        <span className="shrink-0 text-xs text-ds-text-muted">{l.lat == null ? "No coordinates" : l.spatial_scale}</span>
      </div>
      {impacts.length > 0 && <p className="text-xs text-ds-text-muted">{impacts.join(" · ")}</p>}
    </li>
  );
}

function LinksTab({ e }: { e: FloodEvent }) {
  const records: FloodRecord[] = [e, ...e.locations];
  const videos = [...new Set(records.flatMap((r) => r.video_links))];
  const media = new Map<string, string | null>();
  for (const r of records) for (const m of r.media_links) if (!media.has(m)) media.set(m, r.level === "location" ? eventTitle(r) : null);
  const ifrc = [...new Set(records.map((r) => r.ifrc_go_link).filter((x): x is string => !!x))];
  return (
    <>
      <Section title="IFRC GO">
        {ifrc.length ? ifrc.map((href) => <ExtLink key={href} href={href}>{href.replace(/^https?:\/\/(www\.)?/, "")}</ExtLink>) : <p className="text-sm text-ds-text-muted">No IFRC GO record</p>}
        <Facts
          rows={[
            ["Categorized as flood in IFRC GO", e.ifrc_go_flood ? "Yes" : null],
            ["Dartmouth Flood Observatory #", e.dfo_number],
          ]}
        />
      </Section>
      <Section title={`Video (${videos.length})`}>{videos.length ? <VideoViewer key={e.event_id} urls={videos} /> : <p className="text-sm text-ds-text-muted">No video linked</p>}</Section>
      <Section title={`Media (${media.size})`}>
        {media.size ? (
          [...media].map(([href, where]) => (
            <ExtLink key={href} href={href}>
              {hostname(href)}
              {where && <span className="text-ds-text-muted"> · {where}</span>}
            </ExtLink>
          ))
        ) : (
          <p className="text-sm text-ds-text-muted">No media linked</p>
        )}
      </Section>
    </>
  );
}
