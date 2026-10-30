import { Button } from "@whitecapgeospatial/ui";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { eventTitle, type FloodEvent } from "../data";
import { DetailHeader, DetailTabs } from "./DetailPanel";

type Props = {
  event: FloodEvent | null;
  highlightedRecord: number | null;
  onHoverRecord: (id: number | null) => void;
  onClose: () => void;
};

/** Height of the collapsed mobile drawer: enough for the headline and confidence pill. */
export const SHEET_PEEK_PX = 148;
const SHEET_FULL = 0.94;

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="ghost" size="sm" aria-label="Close details" onClick={onClose} className="shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </Button>
  );
}

export function DesktopPanel({ event, highlightedRecord, onHoverRecord, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!event) return null;
  return (
    <aside className="detail-panel" aria-label="Event details">
      <DetailHeader event={event} actions={<CloseButton onClose={onClose} />} />
      <DetailTabs key={event.event_id} event={event} highlightedRecord={highlightedRecord} onHoverRecord={onHoverRecord} />
    </aside>
  );
}

/** Bottom sheet: opens near full screen, drags down to a peek drawer that keeps the headline. */
export function MobileSheet({ event, highlightedRecord, onHoverRecord, onClose }: Props) {
  const [snap, setSnap] = useState<number | string | null>(SHEET_FULL);
  useEffect(() => {
    if (event) setSnap(SHEET_FULL);
  }, [event]);

  return (
    <Drawer.Root
      open={!!event}
      modal={false}
      dismissible={false}
      snapPoints={[`${SHEET_PEEK_PX}px`, SHEET_FULL]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content className="sheet" aria-describedby={undefined}>
          {/* vaul's Handle also cycles snap points on tap. */}
          <Drawer.Handle className="sheet-handle" />
          {event && (
            <>
              <Drawer.Title className="sr-only">{eventTitle(event)}</Drawer.Title>
              <div className="sheet-body" data-expanded={snap === SHEET_FULL || undefined}>
                <DetailHeader event={event} actions={<CloseButton onClose={onClose} />} />
                <DetailTabs key={event.event_id} event={event} highlightedRecord={highlightedRecord} onHoverRecord={onHoverRecord} />
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
