import { Button, Slider } from "@whitecapgeospatial/ui";
import { useEffect, useMemo, useState } from "react";
import type { FloodEvent } from "../data";

type Props = {
  /** Events after all non-time filters, so the histogram shows what the window would reveal. */
  events: FloodEvent[];
  extent: [number, number];
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
};

/** "range" = free start/end; a number = fixed window length in months, scrubbed by its end. */
type Mode = "range" | 12 | 60 | 120;
const WINDOWS: { mode: Mode; label: string }[] = [
  { mode: "range", label: "Range" },
  { mode: 12, label: "1 yr" },
  { mode: 60, label: "5 yr" },
  { mode: 120, label: "10 yr" },
];
const PLAY_STEP_MS = 140;

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function TimeScrubber({ events, extent, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("range");
  const [playing, setPlaying] = useState(false);

  // Month grid from the first to the last event start.
  const y0 = new Date(extent[0]).getUTCFullYear();
  const m0 = new Date(extent[0]).getUTCMonth();
  const toIdx = (t: number) => (new Date(t).getUTCFullYear() - y0) * 12 + new Date(t).getUTCMonth() - m0;
  const max = toIdx(extent[1]);
  const monthStart = (i: number) => Date.UTC(y0, m0 + i, 1);
  const monthEnd = (i: number) => Date.UTC(y0, m0 + i + 1, 1) - 1;

  const sel: [number, number] = value ? [toIdx(value[0]), toIdx(value[1])] : [0, max];
  const emit = (a: number, b: number) => {
    const lo = Math.max(0, a);
    const hi = Math.min(max, b);
    onChange(lo <= 0 && hi >= max ? null : [monthStart(lo), monthEnd(hi)]);
  };

  // Histogram by year.
  const years = useMemo(() => {
    const y1 = new Date(extent[1]).getUTCFullYear();
    const counts = Array.from({ length: y1 - y0 + 1 }, () => 0);
    for (const e of events) if (e.time != null) counts[new Date(e.time).getUTCFullYear() - y0]++;
    return counts;
  }, [events, extent, y0]);
  const peak = Math.max(1, ...years);

  useEffect(() => {
    if (!playing || mode === "range") return;
    const id = setInterval(() => {
      const end = sel[1] + 1;
      if (end > max) return setPlaying(false);
      emit(end - mode + 1, end);
    }, PLAY_STEP_MS);
    return () => clearInterval(id);
  });

  const chooseMode = (m: Mode) => {
    setMode(m);
    setPlaying(false);
    if (m !== "range") emit(sel[1] - m + 1, sel[1]);
  };

  const label = value ? `${MONTH_FMT.format(value[0])} – ${MONTH_FMT.format(value[1])}` : `All dates · ${y0}–${new Date(extent[1]).getUTCFullYear()}`;
  const undated = events.filter((e) => e.time == null).length;

  return (
    <div className="scrubber" data-open={open || undefined}>
      <button type="button" className="scrubber-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span>{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      {open && (
        <div className="scrubber-body">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Duration" className="segmented">
              {WINDOWS.map((w) => (
                <Button key={w.label} size="sm" variant={mode === w.mode ? "primary" : "ghost"} aria-pressed={mode === w.mode} onClick={() => chooseMode(w.mode)}>
                  {w.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {mode !== "range" && (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => {
                    if (!playing && sel[1] >= max) emit(0, mode - 1);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "❚❚" : "▶"}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!value} onClick={() => (setPlaying(false), onChange(null))}>
                All dates
              </Button>
            </div>
          </div>
          <svg className="histogram" viewBox={`0 0 ${years.length} 1`} preserveAspectRatio="none" aria-hidden>
            {years.map((c, i) => {
              // Year i spans months [i*12 - m0, i*12 - m0 + 11] on the slider grid.
              const inSel = i * 12 - m0 + 11 >= sel[0] && i * 12 - m0 <= sel[1];
              return <rect key={i} x={i + 0.12} width={0.76} y={1 - c / peak} height={c / peak} data-in={inSel || undefined} />;
            })}
          </svg>
          {mode === "range" ? (
            <Slider min={0} max={max} step={1} value={sel} minStepsBetweenThumbs={0} onValueChange={([a, b]) => emit(a, b)} thumbLabel={["Start month", "End month"]} />
          ) : (
            // Fixed-length window: dragging either thumb moves the whole window.
            <Slider
              min={0}
              max={max}
              step={1}
              value={sel}
              onValueChange={([a, b]) => {
                const start = Math.min(Math.max(0, a !== sel[0] ? a : b - mode + 1), Math.max(0, max - mode + 1));
                emit(start, start + mode - 1);
              }}
              thumbLabel={["Window start", "Window end"]}
            />
          )}
          <div className="flex justify-between text-xs text-ds-text-muted">
            <span>{y0}</span>
            {undated > 0 && value && <span>{undated} undated {undated === 1 ? "event" : "events"} hidden</span>}
            <span>{new Date(extent[1]).getUTCFullYear()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
