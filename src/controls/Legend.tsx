import { useState } from "react";
import { cssRgb, EVENT_COLOR } from "../theme";

export function Legend({ hidden, defaultOpen }: { hidden: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  return (
    <section className="legend" aria-label="Legend" data-open={open || undefined}>
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Legend
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? undefined : "rotate(180deg)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="flex flex-col gap-2 pt-2">
          <li className="flex items-center gap-2">
            <span aria-hidden className="legend-swatch">
              <span className="legend-dot" style={{ background: cssRgb(EVENT_COLOR) }} />
            </span>
            Flood event
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="legend-swatch">
              <span className="legend-dot legend-dot-sm" style={{ background: cssRgb(EVENT_COLOR) }} />
            </span>
            Affected location
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="legend-swatch">
              <span className="legend-ring" />
            </span>
            <p className="max-w-44 leading-snug">
              <strong>Location uncertainty</strong> (on hover). The event was recorded somewhere inside the ring. It is not the flooded area.
            </p>
          </li>
        </ul>
      )}
    </section>
  );
}
