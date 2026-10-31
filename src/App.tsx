import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterMenu } from "./controls/FilterMenu";
import { Legend } from "./controls/Legend";
import { TimeScrubber } from "./controls/TimeScrubber";
import { type Dataset, type FloodEvent, loadDataset } from "./data";
import { emptyFilters, type Filters, matches } from "./filters";
import { MapView, type MapPadding } from "./map/MapView";
import { DesktopPanel, MobileSheet, SHEET_PEEK_PX } from "./panel/DetailShell";
import { useColorScheme } from "./theme";

const MOBILE_QUERY = "(max-width: 640px)";
const DESKTOP_PANEL_PX = 440;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<FloodEvent | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const mobile = useIsMobile();
  const scheme = useColorScheme();

  useEffect(() => {
    loadDataset().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // #event=<id> deep-links to one event, on load and when the hash is edited.
  useEffect(() => {
    if (!data) return;
    const fromHash = () => {
      const id = Number(new URLSearchParams(location.hash.slice(1)).get("event"));
      setSelected(data.events.find((e) => e.event_id === id) ?? null);
      setHighlighted(null);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [data]);

  const events = data?.events ?? [];
  const untimed = useMemo(() => events.filter((e) => matches(e, filters, true)), [events, filters]);
  const visible = useMemo(() => (filters.time ? untimed.filter((e) => matches(e, filters)) : untimed), [untimed, filters]);

  // replaceState keeps the hash in sync without firing hashchange.
  const select = useCallback((e: FloodEvent | null) => {
    setSelected(e);
    setHighlighted(null);
    history.replaceState(null, "", e ? `#event=${e.event_id}` : location.pathname + location.search);
  }, []);
  const close = useCallback(() => select(null), [select]);

  const padding: MapPadding = mobile
    ? { top: 64, right: 0, bottom: selected ? SHEET_PEEK_PX : 72, left: 0 }
    : { top: 64, right: selected ? DESKTOP_PANEL_PX : 0, bottom: 96, left: 0 };

  return (
    <main className="app">
      <MapView events={visible} selected={selected} highlightedRecord={highlighted} padding={padding} scheme={scheme} onSelect={select} onHoverRecord={setHighlighted} />

      <div className="top-bar">
        {data && <FilterMenu events={events} filters={filters} shown={visible.length} onChange={setFilters} onSelect={select} />}
        <h1 className="app-title">
          Flash Flood Compendium
          {data && (
            <span className="app-count">
              {visible.length} of {events.length} events
            </span>
          )}
        </h1>
      </div>

      {!data && <div className="status">{error ? `Could not load data: ${error}` : "Loading events…"}</div>}

      <Legend hidden={mobile && !!selected} defaultOpen={!mobile} />

      {data && !(mobile && selected) && (
        <TimeScrubber events={untimed} extent={data.extent} value={filters.time} onChange={(time) => setFilters({ ...filters, time })} />
      )}

      {mobile ? (
        <MobileSheet event={selected} highlightedRecord={highlighted} onHoverRecord={setHighlighted} onClose={close} />
      ) : (
        <DesktopPanel event={selected} highlightedRecord={highlighted} onHoverRecord={setHighlighted} onClose={close} />
      )}
    </main>
  );
}
