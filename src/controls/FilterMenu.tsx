import { Button, Pill, Popover, PopoverContent, PopoverTrigger } from "@whitecapgeospatial/ui";
import { type ReactNode, useMemo } from "react";
import { CONFIDENCES, eventTitle, type FloodEvent } from "../data";
import { activeCount, emptyFilters, type Filters, impactCounts, toggle, vocabulary } from "../filters";

type Props = {
  events: FloodEvent[];
  filters: Filters;
  shown: number;
  onChange: (f: Filters) => void;
  onSelect: (e: FloodEvent) => void;
};

const SCALES = ["Local", "Medium", "Large"];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="chip">
      <Pill size="sm" variant={on ? "accent" : "outline"}>
        {children}
      </Pill>
    </button>
  );
}

function Group({ title, count, children, open }: { title: string; count: number; children: ReactNode; open?: boolean }) {
  return (
    <details className="filter-group" open={open}>
      <summary>
        <span>{title}</span>
        {count > 0 && <span className="filter-badge">{count}</span>}
      </summary>
      <div className="flex flex-wrap gap-1.5 pt-2">{children}</div>
    </details>
  );
}

export function FilterMenu({ events, filters, shown, onChange, onSelect }: Props) {
  const met = useMemo(() => vocabulary(events, "meteorology"), [events]);
  const hyd = useMemo(() => vocabulary(events, "hydrology"), [events]);
  const impact = useMemo(() => impactCounts(events), [events]);
  const unmapped = useMemo(() => events.filter((e) => e.lat == null), [events]);
  const n = activeCount(filters);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="md" aria-label="Filters" className="map-control gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="hidden sm:inline">Filters</span>
          {n > 0 && <span className="filter-badge">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="filter-popover">
        <div className="flex items-center justify-between gap-2 pb-2">
          <p className="text-sm">
            <strong>{shown}</strong> of {events.length} events
          </p>
          <Button variant="ghost" size="sm" disabled={n === 0} onClick={() => onChange({ ...emptyFilters(), time: filters.time })}>
            Clear
          </Button>
        </div>
        <div className="filter-scroll">
          <Group title="Confidence" count={filters.confidence.size} open>
            {CONFIDENCES.map((c) => (
              <Chip key={c} on={filters.confidence.has(c)} onClick={() => set("confidence", toggle(filters.confidence, c))}>
                {c}
              </Chip>
            ))}
          </Group>
          <Group title="Meteorology" count={filters.meteorology.size}>
            {met.map(([t, c]) => (
              <Chip key={t} on={filters.meteorology.has(t)} onClick={() => set("meteorology", toggle(filters.meteorology, t))}>
                {t} <span className="opacity-60">{c}</span>
              </Chip>
            ))}
          </Group>
          <Group title="Hydrology" count={filters.hydrology.size}>
            {hyd.map(([t, c]) => (
              <Chip key={t} on={filters.hydrology.has(t)} onClick={() => set("hydrology", toggle(filters.hydrology, t))}>
                {t} <span className="opacity-60">{c}</span>
              </Chip>
            ))}
          </Group>
          <Group title="Impact" count={filters.impact.size + filters.scale.size}>
            <p className="w-full text-xs text-ds-text-muted">Reported more than zero</p>
            {impact.map(([k, label, c]) => (
              <Chip key={k} on={filters.impact.has(k)} onClick={() => set("impact", toggle(filters.impact, k))}>
                {label} <span className="opacity-60">{c}</span>
              </Chip>
            ))}
            <p className="w-full pt-2 text-xs text-ds-text-muted">Spatial scale of impact</p>
            {SCALES.map((s) => (
              <Chip key={s} on={filters.scale.has(s)} onClick={() => set("scale", toggle(filters.scale, s))}>
                {s}
              </Chip>
            ))}
          </Group>
          <p className="pt-3 text-xs text-ds-text-muted">Within a section, events match any selected value. Sections combine.</p>
          {unmapped.length > 0 && (
            <details className="filter-group">
              <summary>
                <span>Not on map ({unmapped.length})</span>
              </summary>
              <p className="pt-1 text-xs text-ds-text-muted">These events have no coordinates.</p>
              <ul className="flex flex-col pt-1">
                {unmapped.map((e) => (
                  <li key={e.event_id}>
                    <button type="button" className="link-row w-full text-left" onClick={() => onSelect(e)}>
                      <span className="truncate">
                        {eventTitle(e)} · {e.country}
                      </span>
                      <span aria-hidden>→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
