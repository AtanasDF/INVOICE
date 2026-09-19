"use client";

import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

const INK = "#111827";

// Pixels this close to white become transparent, so a photographed
// signature sits on the invoice without a grey paper box around it.
const PAPER_THRESHOLD = 200;

async function signatureFromPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read this image."));
      el.src = url;
    });
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read this image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum > PAPER_THRESHOLD) {
        px[i + 3] = 0;
        continue;
      }
      px[i] = px[i + 1] = px[i + 2] = 17;
      px[i + 3] = Math.min(255, Math.round((PAPER_THRESHOLD - lum) * 2.2));
      const p = i / 4;
      const x = p % canvas.width;
      const y = Math.floor(p / canvas.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX <= minX || maxY <= minY) throw new Error("No signature found in that photo. Use dark ink on white paper.");
    ctx.putImageData(data, 0, 0);
    const pad = 8;
    const out = document.createElement("canvas");
    out.width = maxX - minX + pad * 2;
    out.height = maxY - minY + pad * 2;
    out.getContext("2d")?.drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Draw with a finger or mouse; the stroke is trimmed to its ink before
// it is saved.
export default function SignaturePad({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<Point | null>(null);
  const inkRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const fileRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(!value);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showPad = drawing || !value;

  // Sized whenever the pad is on screen with a real width: it can mount
  // inside a hidden tab (width 0) or be resized by a rotation, and either
  // leaves the buffer wrong for the finger. Resizing clears the canvas.
  useEffect(() => {
    if (!showPad) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = (initial: boolean) => {
      const ratio = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * ratio);
      const h = Math.round(canvas.clientHeight * ratio);
      if (!w || !h || (canvas.width === w && canvas.height === h)) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      inkRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      if (!initial) setDirty(false);
    };
    setup(true);
    const ro = new ResizeObserver(() => setup(false));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [showPad]);

  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function extend(p: Point) {
    const ink = inkRef.current;
    ink.minX = Math.min(ink.minX, p.x);
    ink.minY = Math.min(ink.minY, p.y);
    ink.maxX = Math.max(ink.maxX, p.x);
    ink.maxY = Math.max(ink.maxY, p.y);
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = point(e);
    lastRef.current = p;
    extend(p);
    const ctx = e.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    if (ctx) ctx.fillStyle = INK;
    ctx?.fill();
    setDirty(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastRef.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    const last = lastRef.current;
    const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    extend(p);
  }

  function up() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inkRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setDirty(false);
  }

  function save() {
    const canvas = canvasRef.current;
    const ink = inkRef.current;
    if (!canvas || !dirty || ink.maxX < ink.minX || !canvas.width || !canvas.clientWidth) return;
    const ratio = canvas.width / canvas.clientWidth;
    const pad = 6;
    const sx = Math.max(0, (ink.minX - pad) * ratio);
    const sy = Math.max(0, (ink.minY - pad) * ratio);
    const sw = Math.min(canvas.width - sx, (ink.maxX - ink.minX + pad * 2) * ratio);
    const sh = Math.min(canvas.height - sy, (ink.maxY - ink.minY + pad * 2) * ratio);
    const out = document.createElement("canvas");
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
    setDrawing(false);
    setDirty(false);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      onChange(await signatureFromPhoto(file));
      setDrawing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this image.");
    }
  }

  const photoInput = <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />;

  if (!showPad && value) {
    return (
      <div className="space-y-2">
        <div className="flex h-24 items-center justify-center rounded-lg border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Your signature" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDrawing(true)} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
            Sign again
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
            Use a photo
          </button>
          <button type="button" onClick={() => onChange(null)} className="px-2 py-1.5 text-sm font-medium text-neutral-600">
            Remove from invoice
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {photoInput}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="h-36 w-full touch-none rounded-lg border bg-white"
          aria-label="Sign here"
        />
        {!dirty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Sign here with your finger</p>}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-neutral-300" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!dirty} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Use this signature
        </button>
        <button type="button" onClick={clear} disabled={!dirty} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50">
          Clear
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border px-3 py-1.5 text-sm font-medium text-neutral-700">
          Use a photo of it
        </button>
        {value && (
          <button type="button" onClick={() => setDrawing(false)} className="px-2 py-1.5 text-sm font-medium text-neutral-600">
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {photoInput}
    </div>
  );
}
