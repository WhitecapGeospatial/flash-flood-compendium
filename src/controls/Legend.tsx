import { useState } from "react";
import { CONFIDENCES } from "../data";
import { CONFIDENCE_COLOR, cssRgb, UNKNOWN_COLOR } from "../theme";

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
        <div className="flex flex-col gap-2 pt-2">
          <div>
            <p className="legend-heading">Flash flood confidence</p>
            <ul className="flex flex-col gap-1">
              {CONFIDENCES.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <span aria-hidden className="legend-dot" style={{ background: cssRgb(CONFIDENCE_COLOR[c]) }} />
                  {c}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span aria-hidden className="legend-dot" style={{ background: cssRgb(UNKNOWN_COLOR) }} />
                Not rated
              </li>
            </ul>
          </div>
          <div className="flex items-start gap-2">
            <span aria-hidden className="legend-haze" />
            <p className="max-w-44 leading-snug">
              <strong>Location uncertainty.</strong> The event was recorded somewhere in this haze. It is not the flooded area.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
