"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

// Sliding between the dashboard's three panels with a finger, the way a phone
// home screen moves (Atanas, 2026-09-24: "I want to be able to switch between
// them with sliding the finger on the top and the whole page slides and
// change... Tho I just need the text from this three to slide and not the
// actual whole page").
//
// So the header, the scanner and the tabs stay exactly where they are, and
// only this strip moves. Three things make it feel right rather than merely
// work:
//
//  - It follows the finger. A transition that only plays after you let go
//    feels like a button; one that tracks the drag feels like paper.
//  - Vertical scrolling must never be stolen. `touch-action: pan-y` leaves the
//    browser in charge of up and down, and a drag is only claimed once it is
//    clearly sideways -- twice as much x as y, past a few pixels.
//  - The strip is as tall as the panel you are on, not as tall as the tallest,
//    so there is no dead space under a short one. The height is measured and
//    animated with the slide.
//
// Everything stays reachable without a finger: the tabs above are real tab
// buttons, and left/right arrows move between them.
export default function SwipePanels({ panels, index, onIndex, labelledBy }: {
  panels: { id: string; node: ReactNode }[];
  index: number;
  onIndex: (next: number) => void;
  labelledBy?: string;
}) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const start = useRef<{ x: number; y: number; claimed: boolean } | null>(null);

  // As tall as the panel in view, and it keeps up when that panel's own
  // content changes (a list loading, a card appearing).
  useEffect(() => {
    const cell = cells.current[index];
    if (!cell) return;
    const measure = () => setHeight(cell.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cell);
    return () => ro.disconnect();
  }, [index, panels.length]);

  function down(e: React.PointerEvent) {
    // A mouse drag on a desktop would fight text selection, and nobody swipes
    // with a mouse; fingers and pens only.
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, claimed: false };
  }

  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.claimed) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 2) {
        // Still looks like a scroll, or like nothing yet. Let it go.
        if (Math.abs(dy) > 12) start.current = null;
        return;
      }
      s.claimed = true;
      setDragging(true);
    }
    // Pulling past either end gives, rather than stopping dead.
    const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === panels.length - 1);
    setDrag(atEnd ? dx / 3 : dx);
  }

  function up() {
    const s = start.current;
    start.current = null;
    if (!s?.claimed) return;
    const width = frame.current?.clientWidth ?? 1;
    // A quarter of the way across, or a flick that went further than that.
    const moved = Math.abs(drag) > width * 0.25;
    if (moved) onIndex(Math.min(panels.length - 1, Math.max(0, index + (drag < 0 ? 1 : -1))));
    setDragging(false);
    setDrag(0);
  }

  const offset = `calc(${-index * 100}% + ${drag}px)`;

  return (
    <div
      ref={frame}
      className="overflow-hidden"
      style={{ height: height ?? undefined, transition: dragging ? undefined : "height 240ms ease" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div
        className="flex items-start touch-pan-y motion-reduce:transition-none"
        style={{ transform: `translate3d(${offset}, 0, 0)`, transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)" }}
      >
        {panels.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => { cells.current[i] = el; }}
            role="tabpanel"
            id={`panel-${p.id}`}
            aria-labelledby={labelledBy ? `${labelledBy}-${p.id}` : undefined}
            // Off-screen panels are still in the page, so they are hidden from
            // a screen reader and cannot be tabbed into by mistake.
            aria-hidden={i !== index}
            inert={i !== index}
            className="w-full shrink-0 space-y-6 px-px"
          >
            {p.node}
          </div>
        ))}
      </div>
    </div>
  );
}
