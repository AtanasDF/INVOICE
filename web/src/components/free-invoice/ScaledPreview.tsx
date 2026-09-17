"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

// A4 at 96dpi, with the same 14mm margins @page prints with, so the
// on-screen sheet is always the printed sheet scaled down -- never
// reflowed, so a phone shows exactly what will print.
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_MARGIN = 53;

export default function ScaledPreview({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    const outer = outerRef.current!;
    const inner = innerRef.current!;
    const update = () => {
      const scale = Math.min(1, outer.clientWidth / PAGE_WIDTH);
      setFit({ scale, height: inner.offsetHeight * scale });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full min-w-0 overflow-hidden" style={fit ? { height: fit.height } : undefined}>
      <div
        ref={innerRef}
        className="border bg-white text-neutral-900 shadow-sm"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, padding: PAGE_MARGIN, transform: `scale(${fit?.scale ?? 1})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}
