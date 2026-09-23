"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mat, MatVector } from "@techstark/opencv-js";
import { CVModule, loadOpenCV } from "@/lib/opencv";
import {
  ScannerMode,
  isIOS,
  readAutoCapture,
  readAutoZoom,
  readScannerMode,
  useIsIOS,
  writeAutoCapture,
  writeAutoZoom,
  writeScannerMode,
} from "@/lib/platform";
import { SAFARI_CAMERA_TIP, forgetCameraDenial, openCamera } from "@/lib/camera";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { useWakeLock } from "@/lib/wakeLock";
import { PhotoIcon, TorchIcon } from "@/components/icons";
import BatchReview, { Shot, groupShots } from "@/components/scan/BatchReview";
import Tip from "@/components/Tip";
import { saveFailed } from "@/lib/errorText";

type Point = { x: number; y: number };
type Quad = [Point, Point, Point, Point];
// Corners in work-frame pixels plus the work frame they were found in,
// so any consumer can rescale them to its own frame.
type WorkQuad = { pts: Quad; w: number; h: number };
// Everything OpenCV needs per tick, allocated once per work-frame size
// and reused: allocating and freeing seven Mats every tick was most of
// the per-frame cost on a phone.
type WorkMats = { w: number; h: number; src: Mat; gray: Mat; blurred: Mat; edges: Mat; kernel: Mat; contours: MatVector; hierarchy: Mat; mask: Mat };
type Status = "starting" | "live" | "denied" | "timeout" | "unsupported";
type CvStatus = "loading" | "ready" | "failed";
type Coach = "line" | "zooming" | "centre" | "closer" | "hold";
type ZoomRange = { min: number; max: number; step: number };
// zoom / focusMode / pointsOfInterest are in the Media Capture spec and
// implemented by Chromium, but not yet in lib.dom.d.ts.
type AdvancedConstraints = MediaTrackConstraintSet & { zoom?: number; focusMode?: string; pointsOfInterest?: Point[]; torch?: boolean };

export type CapturedFile = { dataUrl: string; mediaType: string };

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type PhotoRange = { min: number; max: number };
type ImageCaptureInstance = {
  takePhoto: (settings?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob>;
  getPhotoCapabilities?: () => Promise<PhotoCaps>;
};
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureInstance;
type PhotoCaps = { imageWidth?: PhotoRange; imageHeight?: PhotoRange };

const DETECT_INTERVAL_MS = 150;
const WORK_WIDTH = 480;
// A four-corner contour covering this share of the work frame counts as
// the page -- low enough that a page fitted inside the brackets from
// arm's length still counts.
const MIN_CONTOUR_AREA = 0.06;
// Smaller ones, down to FAR_MIN_AREA (a till receipt on a table from
// standing height), count only if they look like paper: clearly lighter
// than what is around them, clear of the frame edge, solid, and no longer
// than a till roll. That is what auto-zoom then zooms in on.
const FAR_MIN_AREA = 0.012;
const PAPER_CONTRAST = 18;
const EDGE_MARGIN = 0.015;
const MAX_ASPECT = 8;
const MIN_SOLIDITY = 0.85;
const MIN_RECTANGULARITY = 0.9;
const MAX_EDGES_AROUND = 0.2;
// Bent paper: the simplified outline of a folded-over corner, a kink or a
// wavy edge puts a corner somewhere along a side -- the crop comes out skewed
// and, as the page moves, the corner flips between the two ends of the fold.
// Each side is re-fitted as a straight line through the outline points along
// its middle (SIDE_TRIM off each end, within SIDE_BAND of it -- wide, as a
// big fold leaves the simplified side well off the real one -- then again
// within REFIT_BAND of that first line; at least SIDE_SUPPORT of its length
// of them) and the corners go where those lines meet, but only outward (a
// corner curling up at the camera reaches past its sides) and by at most
// CORNER_SHIFT of the shorter side. A corner the outline already has within
// MIN_CORNER_SHIFT stays: a kinked or wavy side pulls its line out a little,
// which would only add a sliver of table. Sides meeting at under ~20°
// (MIN_CORNER_SIN) aren't a corner.
const SIDE_TRIM = 0.15;
const SIDE_BAND = 0.2;
const REFIT_BAND = 0.03;
const SIDE_SUPPORT = 0.25;
const CORNER_SHIFT = 0.3;
const MIN_CORNER_SHIFT = 0.02;
const MIN_CORNER_SIN = 0.35;
// Auto-capture gates (empirical). A quad must hold still for STABLE_MS
// with each corner drifting under MOVE_TOLERANCE of the work-frame width
// per tick, cover at least MIN_COVERAGE of the work frame, and the frame
// must be at least SHARPNESS_RATIO of the sharpest seen in this stable
// run and above SHARPNESS_FLOOR (variance of the Laplacian) -- mostly a
// "focus has settled" check rather than an absolute bar. A run that
// stays stable for STABLE_TIMEOUT_MS captures regardless of sharpness so
// a dim room never dead-locks the scanner.
// 600 fired before the phone had focused (Atanas, first real receipt,
// 2026-09-22): another half second lets the lens settle.
const STABLE_MS = 1100;
const MOVE_TOLERANCE = 0.02;
const MIN_COVERAGE = 0.09;
const SHARPNESS_RATIO = 0.7;
const SHARPNESS_FLOOR = 12;
const STABLE_TIMEOUT_MS = 2500;
// Per-frame easing of the drawn outline toward the latest detected quad,
// so it glides between detection ticks instead of jumping at tick rate.
const OUTLINE_EASE = 0.35;
// The page's corners are the per-corner median of the last SMOOTH_TICKS
// detections -- what's drawn, checked for movement and captured -- so a
// wavy edge read a little differently every tick, or misread once, doesn't
// restart the hold-still count; a real move shows a tick later. A page
// missed for up to LOST_GRACE_TICKS (a curled edge losing contrast) keeps
// its outline and count, but isn't taken until it's seen again.
const SMOOTH_TICKS = 3;
const LOST_GRACE_TICKS = 2;
const FLASH_MS = 150;
// Low light: a view this dark on average (0-255 grey) turns the torch on
// by itself after TORCH_AFTER_MS, on a camera that has one, and auto-capture
// waits for it; without a torch, a hint after DARK_HINT_MS.
const DARK_LEVEL = 55;
const TORCH_AFTER_MS = 400;
const DARK_HINT_MS = 1200;
const FAILURE_MS = 2500;
const FOCUS_RING_MS = 800;
// Batch mode: after a capture, auto-capture waits until the page has left
// the frame (or the detector lost it while pages were swapped) and this
// long has passed, so one page is never taken twice.
const REARM_MS = 900;
const TAKEN_MOVED = 0.2;
const TAKEN_SHRUNK = 0.6;
// Auto-zoom: a page held still while spanning less than AUTO_ZOOM_BELOW
// of the view (see spanOf) is zoomed toward AUTO_ZOOM_TARGET, never past the lens's
// AUTO_ZOOM_MAX_LENS (the camera's own zoom keeps real detail) or the
// cropped AUTO_ZOOM_MAX, and never so far that its corners come within
// FIT_MARGIN of the edge. A page lost for AUTO_ZOOM_LOST_MS zooms back out
// so the next one can be found. The cooldown lets detection settle after
// each step, so it can't hunt in and out.
const AUTO_ZOOM_BELOW = 0.5;
const AUTO_ZOOM_TARGET = 0.75;
const AUTO_ZOOM_MAX = 2.5;
const AUTO_ZOOM_MAX_LENS = 4;
const AUTO_ZOOM_MIN_STEP = 1.15;
const AUTO_ZOOM_SETTLE_MS = 350;
const AUTO_ZOOM_LOST_MS = 1500;
// Zoomed in and the page now runs to the edges -- the phone came closer,
// or the zoom went too far for it: zoom out just enough for it to fit,
// after AUTO_ZOOM_SETTLE_MS, rather than leaving a page too big to read.
const AUTO_ZOOM_OUT_FIT = 0.95;
// A pinch without the camera's own zoom crops the picture: past 3× there's
// too little of the photo left to read.
const PINCH_CSS_MAX = 3;
const AUTO_ZOOM_COOLDOWN_MS = 800;
const FIT_MARGIN = 0.06;
const CV_ERROR_MAX = 140;
const GREEN = "#4ADE80";
// The page itself turns green as it locks on: a faint wash once it is
// found, deepening while it is held steady and in focus.
const FILL_FOUND = 0.12;
const FILL_LOCKED = 0.32;
const FILL_EASE = 0.15;
const GUIDE_IDLE = "rgba(255,255,255,0.7)";
const GUIDE_WIDTH = 0.8;
const GUIDE_MAX_HEIGHT = 0.9;
const A4_RATIO = Math.SQRT2;
// The shot is a still from the camera where the browser can take one
// (Safari 18.4+, Chrome): several times a video frame's pixels, which is
// what makes a receipt from further away readable. Safari hands back its
// smallest still unless asked, and its largest can be 48MP, so it's asked
// for about 12MP and at most PHOTO_MAX_SIDE of that is kept. The still is
// used only if it clearly shows what was on screen (PHOTO_MATCH, a
// correlation of small greyscale thumbnails), otherwise the video frame is.
const PHOTO_ASK = { imageWidth: 3200, imageHeight: 1800 };
const PHOTO_MAX_SIDE = 3200;
const PHOTO_MIN_GAIN = 1.2;
const PHOTO_TIMEOUT_MS = 3000;
const PHOTO_MATCH = 0.6;
// A still on its side is turned whichever way matches the screen by at
// least this much more than the other, or not used.
const TURN_MARGIN = 0.1;
// A still this much less sharp than the video frame (the phone moved while
// it was taken) isn't used.
const STILL_SHARPNESS = 0.6;
const THUMB_SIDE = 40;
// Corners found again in the still may move this share of the frame's
// diagonal from where the video had them (the phone moving a little).
const REFINE_TOLERANCE = 0.05;

// A4 portrait frame, centred, as four corner brackets -- the thing to
// line the page up with whether or not edge detection is running.
function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const gh = Math.min(GUIDE_WIDTH * Math.min(w, h) * A4_RATIO, GUIDE_MAX_HEIGHT * h);
  const gw = gh / A4_RATIO;
  const x0 = (w - gw) / 2;
  const y0 = (h - gh) / 2;
  const x1 = x0 + gw;
  const y1 = y0 + gh;
  const arm = gw * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x1, y1, -1, -1],
    [x0, y1, 1, -1],
  ]) {
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
  }
  ctx.stroke();
}

// Corners in order round the quad, clockwise on screen from the top-left.
// Going by angle about the centre never repeats a corner, as picking the
// extremes of x+y and x-y separately can for a page lying at about 45°.
function orderPoints(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const round = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const start = round.reduce((best, p, i) => (p.x + p.y < round[best].x + round[best].y ? i : best), 0);
  return [0, 1, 2, 3].map((k) => round[(start + k) % 4]) as Quad;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// The quad's corners in the order of ref's, whichever corner orderPoints
// started from (for a page near 45° that can change from one frame to the
// next), and how far the furthest corner is from its match.
function alignTo(q: Quad, ref: Quad): { q: Quad; off: number } {
  let best = { q, off: Infinity };
  for (let k = 0; k < 4; k++) {
    const shifted = [0, 1, 2, 3].map((i) => q[(i + k) % 4]) as Quad;
    const off = Math.max(...shifted.map((p, i) => dist(p, ref[i])));
    if (off < best.off) best = { q: shifted, off };
  }
  return best;
}

const centre = (q: Point[]) => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });

function medianQuad(qs: Quad[]): Quad {
  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    const k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  };
  return [0, 1, 2, 3].map((i) => ({ x: median(qs.map((q) => q[i].x)), y: median(qs.map((q) => q[i].y)) })) as Quad;
}

// The most a centred zoom can enlarge the frame before any corner of the
// quad comes within FIT_MARGIN of the edge.
function fitFactor(q: Quad, w: number, h: number): number {
  const limit = (lo: number, hi: number) =>
    Math.min(lo < 0.5 ? (0.5 - FIT_MARGIN) / (0.5 - lo) : Infinity, hi > 0.5 ? (0.5 - FIT_MARGIN) / (hi - 0.5) : Infinity);
  const xs = q.map((p) => p.x / w);
  const ys = q.map((p) => p.y / h);
  return Math.min(limit(Math.min(...xs), Math.max(...xs)), limit(Math.min(...ys), Math.max(...ys)));
}

function scaleQuad(quad: WorkQuad, w: number, h: number): Quad {
  return quad.pts.map((p) => ({ x: (p.x / quad.w) * w, y: (p.y / quad.h) * h })) as Quad;
}

// How much of the frame the page spans along whichever axis it fills most:
// a till receipt can run the full height of the view while covering little
// of its area, so zooming goes by this rather than by area.
function spanOf(q: Quad, w: number, h: number): number {
  const xs = q.map((p) => p.x / w);
  const ys = q.map((p) => p.y / h);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function createMats(cv: CVModule, w: number, h: number): WorkMats {
  return {
    w,
    h,
    src: new cv.Mat(h, w, cv.CV_8UC4),
    gray: new cv.Mat(),
    blurred: new cv.Mat(),
    edges: new cv.Mat(),
    kernel: cv.Mat.ones(3, 3, cv.CV_8U),
    contours: new cv.MatVector(),
    hierarchy: new cv.Mat(),
    mask: new cv.Mat(h, w, cv.CV_8U),
  };
}

function deleteMats(m: WorkMats) {
  m.src.delete();
  m.gray.delete();
  m.blurred.delete();
  m.edges.delete();
  m.kernel.delete();
  m.contours.delete();
  m.hierarchy.delete();
  m.mask.delete();
}

function polygonArea(pts: Point[]): number {
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function matPoints(m: Mat): Point[] {
  const pts: Point[] = [];
  for (let j = 0; j < m.rows; j++) pts.push({ x: m.data32S[j * 2], y: m.data32S[j * 2 + 1] });
  return pts;
}

// Four corners for a contour that is a page: straight away when it
// simplifies to four, otherwise from its convex hull, which rides over a
// torn edge or a curled corner of a receipt.
function quadOf(cv: CVModule, c: Mat): Point[] | null {
  const approx = new cv.Mat();
  const hull = new cv.Mat();
  try {
    cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
    if (approx.rows === 4 && cv.isContourConvex(approx)) return matPoints(approx);
    cv.convexHull(c, hull, false, true);
    const hullArea = cv.contourArea(hull);
    if (hullArea <= 0 || Math.abs(cv.contourArea(c)) / hullArea < MIN_SOLIDITY) return null;
    cv.approxPolyDP(hull, approx, 0.04 * cv.arcLength(hull, true), true);
    if (approx.rows === 4) return matPoints(approx);
    const box = cv.minAreaRect(hull);
    if (hullArea < MIN_RECTANGULARITY * box.size.width * box.size.height) return null;
    return cv.RotatedRect.points(box).map((p: Point) => ({ x: p.x, y: p.y }));
  } finally {
    approx.delete();
    hull.delete();
  }
}

type Line = { p: Point; d: Point };

// The contour about a point per pixel: CHAIN_APPROX_SIMPLE keeps only the
// ends of each straight run, and a side's fit needs all of it.
function outlinePoints(c: Mat): Point[] {
  const d = c.data32S;
  const n = c.rows;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const ax = d[i * 2];
    const ay = d[i * 2 + 1];
    const bx = d[((i + 1) % n) * 2];
    const by = d[((i + 1) % n) * 2 + 1];
    const steps = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s < steps; s++) out.push({ x: ax + ((bx - ax) * s) / steps, y: ay + ((by - ay) * s) / steps });
  }
  return out;
}

// A robust line through the outline points within band of the line from a
// to b and between trim and 1 - trim of the way along it, or null when too
// few points lie there to call it a side.
function fitSide(cv: CVModule, pts: Point[], a: Point, b: Point, band: number, trim: number): Line | null {
  const len = dist(a, b);
  if (len < 1) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const along: number[] = [];
  for (const p of pts) {
    const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / len;
    if (t >= trim && t <= 1 - trim && Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux) <= band) along.push(p.x, p.y);
  }
  if (along.length / 2 < SIDE_SUPPORT * len) return null;
  const m = cv.matFromArray(along.length / 2, 1, cv.CV_32FC2, along);
  const line = new cv.Mat();
  try {
    cv.fitLine(m, line, cv.DIST_HUBER, 0, 0.01, 0.01);
    return { d: { x: line.data32F[0], y: line.data32F[1] }, p: { x: line.data32F[2], y: line.data32F[3] } };
  } finally {
    m.delete();
    line.delete();
  }
}

function meet(l1: Line, l2: Line): Point | null {
  const cross = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(cross) < MIN_CORNER_SIN) return null;
  const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / cross;
  return { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y };
}

function isConvex(q: Point[]): boolean {
  const turns = q.map((p, i) => {
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    return (b.x - p.x) * (c.y - b.y) - (b.y - p.y) * (c.x - b.x);
  });
  return turns.every((t) => t > 0) || turns.every((t) => t < 0);
}

// The page's corners from its sides rather than from the simplified outline
// (see SIDE_TRIM). Fitted twice: once along the simplified sides, then along
// the first fit's lines, which a folded corner pulled off the side.
function fitCorners(cv: CVModule, c: Mat, approx: Point[], w: number, h: number): Point[] {
  const q = orderPoints(approx);
  const pts = outlinePoints(c);
  let lines = q.map((a, i) => {
    const b = q[(i + 1) % 4];
    const len = dist(a, b) || 1;
    return { p: a, d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
  });
  let corners: Point[] = q;
  for (const [bandK, bandMin, trim] of [
    [SIDE_BAND, 4, SIDE_TRIM],
    [REFIT_BAND, 3, SIDE_TRIM / 2],
  ]) {
    lines = corners.map((a, i) => {
      const b = corners[(i + 1) % 4];
      return fitSide(cv, pts, a, b, Math.max(bandMin, bandK * dist(a, b)), trim) ?? lines[i];
    });
    corners = lines.map((l, i) => meet(lines[(i + 3) % 4], l) ?? q[i]);
  }
  const mid = centre(q);
  const out = q.map((p, i) => {
    const f = corners[i];
    const shorter = Math.min(dist(p, q[(i + 1) % 4]), dist(p, q[(i + 3) % 4]));
    const shift = dist(f, p);
    const inFrame = f.x >= 0 && f.y >= 0 && f.x <= w && f.y <= h;
    return inFrame && shift > MIN_CORNER_SHIFT * shorter && shift <= CORNER_SHIFT * shorter && dist(f, mid) > dist(p, mid) ? f : p;
  });
  return isConvex(out) ? out : q;
}

function fillPolygon(cv: CVModule, mask: Mat, pts: Point[], value: number) {
  const poly = cv.matFromArray(pts.length, 1, cv.CV_32SC2, pts.flatMap((p) => [Math.round(p.x), Math.round(p.y)]));
  cv.fillConvexPoly(mask, poly, new cv.Scalar(value));
  poly.delete();
}

// A small four-corner shape is taken for a page only if it looks like one
// (see FAR_MIN_AREA): the middle of it clearly lighter than a band around
// it, clear of the frame edge, not implausibly long and thin, and with
// little printed round it -- a white box on a coloured bill has text all
// around; a receipt on a table doesn't.
function looksLikePaper(cv: CVModule, m: WorkMats, pts: Point[]): boolean {
  const mx = EDGE_MARGIN * m.w;
  const my = EDGE_MARGIN * m.h;
  if (pts.some((p) => p.x < mx || p.y < my || p.x > m.w - mx || p.y > m.h - my)) return false;
  const [tl, tr, br, bl] = orderPoints(pts);
  const across = (dist(tl, tr) + dist(bl, br)) / 2;
  const down = (dist(tl, bl) + dist(tr, br)) / 2;
  if (Math.max(across, down) > MAX_ASPECT * Math.min(across, down)) return false;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const scaled = (k: number) => [tl, tr, br, bl].map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  const meanOf = (outer: Point[], hole: Point[] | null) => {
    m.mask.setTo(new cv.Scalar(0));
    fillPolygon(cv, m.mask, outer, 255);
    if (hole) fillPolygon(cv, m.mask, hole, 0);
    return cv.mean(m.gray, m.mask)[0];
  };
  const inside = meanOf(scaled(0.6), null);
  const around = meanOf(scaled(1.4), scaled(1.1));
  const printedAround = cv.mean(m.edges, m.mask)[0] / 255;
  return inside - around >= PAPER_CONTRAST && printedAround <= MAX_EDGES_AROUND;
}

// Every page in m.gray, largest first: four-corner shapes big enough to be
// a page outright, and smaller ones that look like paper.
// requirePaper: zoomed in, the frame can be all page, and a text block or a
// table on it makes a clean four-corner shape that would pass for the page
// itself -- so the scanner sat zoomed in on the middle of a receipt, never
// "lost", never backing off (Atanas, 2026-09-22). While zoomed, every
// candidate has to look like paper on a table: lighter than what's round
// it and clear of the edge. A page that has outgrown the frame fails that
// too, which is what sends the zoom back out.
function pageCandidates(cv: CVModule, m: WorkMats, firstOnly = false, requirePaper = false): { pts: Point[]; area: number }[] {
  cv.GaussianBlur(m.gray, m.blurred, new cv.Size(5, 5), 0);
  cv.Canny(m.blurred, m.edges, 50, 150);
  cv.dilate(m.edges, m.edges, m.kernel);
  cv.findContours(m.edges, m.contours, m.hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const frame = m.w * m.h;
  const found: { i: number; approx: Point[]; area: number }[] = [];
  for (let i = 0; i < m.contours.size(); i++) {
    const c = m.contours.get(i);
    const box = cv.boundingRect(c);
    if (box.width * box.height >= frame * FAR_MIN_AREA) {
      const approx = quadOf(cv, c);
      const area = approx ? polygonArea(approx) : 0;
      if (approx && area >= frame * FAR_MIN_AREA) found.push({ i, approx, area });
    }
    c.delete();
  }
  found.sort((a, b) => b.area - a.area);
  const pages: { pts: Point[]; area: number }[] = [];
  for (const f of found) {
    // Corners are fitted only for shapes that get this far: the live loop
    // stops at the first page.
    const c = m.contours.get(f.i);
    const pts = fitCorners(cv, c, f.approx, m.w, m.h);
    c.delete();
    const area = polygonArea(pts);
    if ((area < frame * MIN_CONTOUR_AREA || requirePaper) && !looksLikePaper(cv, m, pts)) continue;
    pages.push({ pts, area });
    if (firstOnly) break;
  }
  return pages;
}

function findPage(cv: CVModule, m: WorkMats, requirePaper = false): { pts: Point[]; area: number } | null {
  return pageCandidates(cv, m, true, requirePaper)[0] ?? null;
}

// Variance of the Laplacian inside the quad's bounding box: how sharp it is.
function sharpnessIn(cv: CVModule, gray: Mat, pts: Point[], w: number, h: number): number {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(w, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(h, Math.ceil(Math.max(...ys)));
  if (x1 - x0 < 3 || y1 - y0 < 3) return 0;
  const roi = gray.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  try {
    cv.Laplacian(roi, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    return stddev.data64F[0] ** 2;
  } finally {
    roi.delete();
    lap.delete();
    mean.delete();
    stddev.delete();
  }
}

// The grey of a canvas at the work width, ready for pageCandidates.
function workGrey(cv: CVModule, source: HTMLCanvasElement): WorkMats | null {
  const w = WORK_WIDTH;
  const h = Math.max(1, Math.round((source.height / source.width) * WORK_WIDTH));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  const m = createMats(cv, w, h);
  m.src.data.set(ctx.getImageData(0, 0, w, h).data);
  cv.cvtColor(m.src, m.gray, cv.COLOR_RGBA2GRAY);
  return m;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// A region of a still, turned by a quarter-turn multiple, drawn at
// outW x outH. The region is in the turned still's own pixels.
function drawTurned(bitmap: ImageBitmap, turn: number, x: number, y: number, w: number, h: number, outW: number, outH: number): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(outW));
  c.height = Math.max(1, Math.round(outH));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  const turnedW = turn % 180 ? bitmap.height : bitmap.width;
  const turnedH = turn % 180 ? bitmap.width : bitmap.height;
  ctx.scale(c.width / w, c.height / h);
  ctx.translate(-x, -y);
  if (turn === 90) ctx.translate(turnedW, 0);
  else if (turn === 180) ctx.translate(turnedW, turnedH);
  else if (turn === 270) ctx.translate(0, turnedH);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(bitmap, 0, 0);
  return c;
}

// Halved step by step on the way down, so every thumbnail pixel averages
// its whole patch rather than sampling a few pixels of it.
function greyThumb(source: HTMLCanvasElement, w: number, h: number): number[] {
  let src = source;
  while (src.width > w * 2 && src.height > h * 2) {
    const half = document.createElement("canvas");
    half.width = Math.max(w, Math.round(src.width / 2));
    half.height = Math.max(h, Math.round(src.height / 2));
    const hctx = half.getContext("2d");
    if (!hctx) return [];
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 4) out.push(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
  return out;
}

// Pearson correlation: how alike two thumbnails are, whatever the
// difference in exposure between a video frame and a processed still.
function likeness(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

// The part of the camera frame the user can actually see: object-cover
// trims whichever axis overflows the viewfinder, and the CSS zoom
// fallback trims further around the centre. Detection, the overlay and
// the capture all work in this region so the green outline lands on the
// document and the captured image is exactly what was on screen.
type Region = { sx: number; sy: number; sw: number; sh: number };

function visibleRegion(video: HTMLVideoElement, zoom: number): Region {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cover = Math.max(video.clientWidth / vw, video.clientHeight / vh);
  const sw = video.clientWidth / cover / zoom;
  const sh = video.clientHeight / cover / zoom;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

// Average grey of every 16th pixel: enough to tell a dark room.
function meanLight(px: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 64) {
    sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    n++;
  }
  return n ? sum / n : 255;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className="pointer-events-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/50 text-ink-on-dark"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

// The iPhone's own camera opens through a file input, which never asks
// this site for permission -- so it still works when the in-app scanner
// is blocked, and that dead end now says so.
function NativeCameraEscape({ onSwitch }: { onSwitch: () => void }) {
  return (
    <button onClick={onSwitch} className="text-xs text-ink-on-dark/70 underline">
      Use the iPhone camera instead — it doesn&apos;t need this permission
    </button>
  );
}

export default function DocumentCapture({
  onCapture,
  onBatch,
  onClose,
  pageNumber,
  failureMessage,
  purpose = "read",
}: {
  onCapture?: (file: CapturedFile) => void;
  // Batch mode: the camera stays open, each capture joins a stack, and the
  // reviewed stack arrives here grouped into documents.
  onBatch?: (docs: CapturedFile[][]) => void;
  onClose: () => void;
  pageNumber?: number;
  failureMessage?: string;
  // "copy": photos for one file (Copy a document); the review says so.
  purpose?: "read" | "copy";
}) {
  const multi = !!onBatch;
  const videoRef = useRef<HTMLVideoElement>(null);
  const liveAreaRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const matsRef = useRef<WorkMats | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  // Latest detected quad, and the eased outline (display pixels) the
  // overlay is currently showing on its way there.
  const quadRef = useRef<WorkQuad | null>(null);
  // This tick's own reading, unsmoothed: what a tap crops to when the
  // smoothed page is lagging a move.
  const rawQuadRef = useRef<WorkQuad | null>(null);
  const outlineRef = useRef<Quad | null>(null);
  const lockedRef = useRef(false);
  const fillRef = useRef(0);
  // Work-frame corners from the previous tick, for the movement check, and
  // the last few ticks' detections they're the median of (SMOOTH_TICKS).
  const lastQuadRef = useRef<Quad | null>(null);
  const recentRef = useRef<Quad[]>([]);
  const missesRef = useRef(0);
  const stableSinceRef = useRef<number | null>(null);
  const peakSharpRef = useRef(0);
  // Set the moment auto-capture fires; the parent unmounts this
  // component on onCapture, so it never fires twice per mount.
  const capturedRef = useRef(false);
  const armedRef = useRef(true);
  const seenClearRef = useRef(false);
  // The page a batch capture took, to tell when it has left the frame.
  const takenRef = useRef<{ pts: Quad; coverage: number } | null>(null);
  const lastCoverageRef = useRef(0);
  const rearmAtRef = useRef(0);
  const reviewingRef = useRef(false);
  const shotIdRef = useRef(0);
  const autoRef = useRef(true);
  const onCaptureRef = useRef(onCapture);
  // processFrame lives in the long-lived effect below; this hands it the
  // current render's capture without restarting the stream.
  const captureRef = useRef<() => void>(() => {});
  const zoomToRef = useRef<(level: number) => void>(() => {});
  const barcodeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const failureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iOSMode = useIsIOS();
  const [scannerMode, setScannerMode] = useState<ScannerMode>(readScannerMode);
  const useNative = iOSMode && scannerMode === "native";

  const [status, setStatus] = useState<Status>("starting");
  const [barcodeValue, setBarcodeValue] = useState<string | null>(null);
  const [coach, setCoach] = useState<Coach>("line");
  // On-screen readout toggled by tapping the hint: the only way to see
  // what the detection loop is doing on a phone in the field.
  const [debug, setDebug] = useState(false);
  const [debugText, setDebugText] = useState("");
  const diagRef = useRef({ ticks: 0, quads: 0, coverage: 0, sharpness: 0, lastTickMs: 0, videoW: 0, videoH: 0 });
  const [autoOn, setAutoOn] = useState(readAutoCapture);
  const [autoZoomOn, setAutoZoomOn] = useState(readAutoZoom);
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<Point | null>(null);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [dark, setDark] = useState(false);
  const torchCapRef = useRef(false);
  const torchRef = useRef(false);
  // Once switched by hand, low light leaves the torch alone.
  const torchByHandRef = useRef(false);
  const darkSinceRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cssZoom, setCssZoom] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  // OpenCV is loaded the moment the live-camera path mounts. "failed"
  // carries the real error text: it is the diagnostic the user will
  // screenshot, so it is never rewritten into something friendlier.
  const [cvStatus, setCvStatus] = useState<CvStatus>("loading");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cameraHint, setCameraHint] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reviewing, setReviewing] = useState(false);
  // The sheet takes focus when it opens; when it closes, focus goes back to
  // what opened it (the stack or "Check and read"), not to the top of the
  // page. After the re-render, not in the handler: until then the opener is
  // under inert and refuses focus. If the shots were all removed the opener
  // is gone, and the shutter is the next best place.
  const reviewOpenerRef = useRef<HTMLElement | null>(null);
  const openReview = () => {
    reviewOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReviewing(true);
  };
  useEffect(() => {
    if (reviewing) return;
    const opener = reviewOpenerRef.current;
    reviewOpenerRef.current = null;
    if (!opener) return;
    (opener.isConnected ? opener : rootRef.current?.querySelector<HTMLElement>('button[aria-label="Capture"], button[aria-label="Take a photo"]'))?.focus();
  }, [reviewing]);

  const [waitingNext, setWaitingNext] = useState(false);
  // processFrame lives inside a long-lived effect that only re-runs on
  // [stopStream, retryKey, useNative] -- it closes over state as it was
  // AT EFFECT-SETUP TIME, so a plain state read there would never observe
  // later updates. These refs are what processFrame actually checks; the
  // state exists only to re-render.
  const cvRef = useRef<CVModule | null>(null);
  const cssZoomRef = useRef(1);
  // Hardware zoom when the camera exposes it (sharper), otherwise the CSS
  // crop. Refs because the detection loop reads them.
  const hwZoomRef = useRef<ZoomRange | null>(null);
  const hwZoomValueRef = useRef(1);
  const autoZoomRef = useRef(readAutoZoom());
  const userZoomedRef = useRef(false);
  const smallSinceRef = useRef<number | null>(null);
  const bigSinceRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const zoomCooldownRef = useRef(0);
  const statusRef = useRef<Status>("starting");
  // The camera's stills, set up when the stream starts so a capture can
  // take one straight away.
  const photoRef = useRef<{ track: MediaStreamTrack; capture: ImageCaptureInstance; caps: PhotoCaps | null } | null>(null);

  useWakeLock(status === "live");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    cssZoomRef.current = cssZoom;
  }, [cssZoom]);

  useEffect(() => {
    autoRef.current = autoOn;
  }, [autoOn]);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  useEffect(() => {
    reviewingRef.current = reviewing;
  }, [reviewing]);

  function addShots(files: CapturedFile[]) {
    setShots((prev) => [...prev, ...files.map((f) => ({ ...f, id: ++shotIdRef.current, joinPrev: false }))]);
  }

  function resetStable() {
    stableSinceRef.current = null;
    lastQuadRef.current = null;
    recentRef.current = [];
    peakSharpRef.current = 0;
  }

  // Every other constraint change restates the torch, in a set of its own
  // so a camera refusing one still takes the other.
  function constrain(track: MediaStreamTrack | undefined, advanced: AdvancedConstraints): Promise<void> {
    if (!track) return Promise.resolve();
    const sets: AdvancedConstraints[] = [advanced];
    if (torchCapRef.current) sets.push({ torch: torchRef.current });
    return track.applyConstraints({ advanced: sets });
  }

  function setTorch(on: boolean) {
    torchRef.current = on;
    setTorchOn(on);
    const advanced: AdvancedConstraints = { torch: on };
    streamRef.current
      ?.getVideoTracks()[0]
      ?.applyConstraints({ advanced: [advanced] })
      .catch(() => {
        torchCapRef.current = false;
        torchRef.current = false;
        setTorchAvailable(false);
        setTorchOn(false);
      });
  }

  function toggleTorch() {
    torchByHandRef.current = true;
    setTorch(!torchRef.current);
  }

  function toggleAuto() {
    const next = !autoOn;
    writeAutoCapture(next);
    resetStable();
    setAutoOn(next);
  }

  function zoomLevel(): number {
    const hw = hwZoomRef.current;
    return hw ? hwZoomValueRef.current / Math.max(hw.min, 1) : cssZoomRef.current;
  }

  // The furthest auto-zoom goes, relative to no zoom.
  function autoZoomMax(): number {
    const hw = hwZoomRef.current;
    return hw ? Math.min(AUTO_ZOOM_MAX_LENS, hw.max / Math.max(hw.min, 1)) : AUTO_ZOOM_MAX;
  }

  // Corners found before a zoom are wrong after it: a shutter tap before the
  // next detection would crop the wrong part of the page. Forget them.
  function forgetPage() {
    quadRef.current = null;
    rawQuadRef.current = null;
    outlineRef.current = null;
    lockedRef.current = false;
    resetStable();
  }

  // Level is relative to no zoom: 1 is the widest view, 2 twice as close.
  function zoomTo(level: number) {
    forgetPage();
    const hw = hwZoomRef.current;
    if (!hw) {
      cssZoomRef.current = level;
      setCssZoom(level);
      return;
    }
    const base = Math.max(hw.min, 1);
    const stepped = hw.step > 0 ? Math.round((base * level) / hw.step) * hw.step : base * level;
    const value = Math.min(hw.max, base * AUTO_ZOOM_MAX_LENS, Math.max(hw.min, stepped));
    hwZoomValueRef.current = value;
    setZoom(value);
    constrain(streamRef.current?.getVideoTracks()[0], { zoom: value }).catch(() => {});
  }

  function toggleAutoZoom() {
    const next = !autoZoomOn;
    // Switching off undoes auto-zoom's zoom, never one chosen by hand.
    const manual = userZoomedRef.current;
    writeAutoZoom(next);
    autoZoomRef.current = next;
    userZoomedRef.current = false;
    smallSinceRef.current = null;
    lostSinceRef.current = null;
    if (!next && !manual && zoomLevel() !== 1) zoomTo(1);
    setAutoZoomOn(next);
  }

  const freeMats = useCallback(() => {
    const m = matsRef.current;
    if (!m) return;
    matsRef.current = null;
    deleteMats(m);
  }, []);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    freeMats();
  }, [freeMats]);

  function showFailure(message: string) {
    setFailure(message);
    if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
    failureTimerRef.current = setTimeout(() => setFailure(null), FAILURE_MS);
  }

  // The parent's failure is shown straight from the prop; this only
  // records when its 2.5s are up so the view returns to live scanning.
  const [expiredFailureMessage, setExpiredFailureMessage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!failureMessage) return;
    const t = setTimeout(() => setExpiredFailureMessage(failureMessage), FAILURE_MS);
    return () => clearTimeout(t);
  }, [failureMessage]);
  const shownFailure = failure ?? (failureMessage && failureMessage !== expiredFailureMessage ? failureMessage : null);

  useEffect(
    () => () => {
      if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    []
  );

  function retry() {
    // Ask the browser again rather than repeating our own remembered no.
    // Without this, Try again on the blocked screen re-reads the refusal we
    // stored and fails without the camera ever being consulted -- a button
    // that cannot work, under a tip telling him to change a setting that
    // would then make no difference.
    forgetCameraDenial();
    setStatus("starting");
    setRetryKey((k) => k + 1);
  }

  function switchScannerMode(mode: ScannerMode) {
    // Choosing the in-app scanner again is a request to use the camera.
    if (mode === "inapp") forgetCameraDenial();
    writeScannerMode(mode);
    setStatus("starting");
    setScannerMode(mode);
  }

  useEffect(() => {
    // Skip entirely on the native-camera path -- see the early return in
    // the render below. Re-runs if iOSMode's post-hydration correction
    // flips it or the user switches scanner mode (useNative is a
    // dependency).
    if (useNative) return;

    let cancelled = false;
    let detecting = false;

    async function start() {
      cvRef.current = null;
      setCvStatus("loading");
      setCvError(null);
      loadOpenCV().then(
        (cv) => {
          if (cancelled) return;
          cvRef.current = cv;
          setCvStatus("ready");
        },
        (err) => {
          if (cancelled) return;
          console.error("OpenCV failed to load", err);
          setCvStatus("failed");
          setCvError((err instanceof Error ? err.message : String(err)).slice(0, CV_ERROR_MAX));
        }
      );

      const BarcodeDetectorGlobal = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (BarcodeDetectorGlobal) {
        try {
          barcodeDetectorRef.current = new BarcodeDetectorGlobal();
        } catch {
          barcodeDetectorRef.current = null;
        }
      }

      // The permission check, the prompt and the "did it have to ask"
      // answer all live in lib/camera, so every capture screen in the app
      // asks at most once and reads the same state.
      const opened = await openCamera({ facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } });
      if (cancelled) {
        if (opened.ok) opened.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!opened.ok) {
        setStatus(opened.reason);
        return;
      }

      try {
        const stream = opened.stream;
        streamRef.current = stream;
        // A capture on the previous stream (the scanner mode switched mid-
        // photo) was dropped; this one starts clear.
        capturedRef.current = false;
        armedRef.current = true;
        seenClearRef.current = false;
        rearmAtRef.current = 0;
        setSaving(false);
        setFlash(false);
        setWaitingNext(false);
        resetStable();
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (cancelled) return;
        const track = stream.getVideoTracks()[0];
        try {
          const advanced: AdvancedConstraints = { focusMode: "continuous" };
          await track?.applyConstraints({ advanced: [advanced] });
        } catch {
          // focusMode unsupported here -- the stream's own default stands
        }
        if (cancelled) return;
        photoRef.current = null;
        const ImageCaptureGlobal = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
        if (ImageCaptureGlobal && track) {
          try {
            const photo = { track, capture: new ImageCaptureGlobal(track), caps: null as PhotoCaps | null };
            photoRef.current = photo;
            photo.capture.getPhotoCapabilities?.().then(
              (c) => {
                photo.caps = c;
              },
              () => {}
            );
          } catch {
            photoRef.current = null;
          }
        }
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomRange; torch?: boolean }) | undefined;
        torchCapRef.current = !!caps?.torch;
        torchRef.current = false;
        darkSinceRef.current = null;
        setTorchAvailable(!!caps?.torch);
        setTorchOn(false);
        if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
          const current = (track.getSettings() as { zoom?: number }).zoom ?? caps.zoom.min;
          hwZoomRef.current = caps.zoom;
          hwZoomValueRef.current = current;
          setZoomRange(caps.zoom);
          setZoom(current);
        } else {
          hwZoomRef.current = null;
          setZoomRange(null);
        }
        setStatus("live");
        if (isIOS() && opened.asked) setCameraHint(true);
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (cancelled) return;
        setStatus("denied");
      }
    }

    // The overlay redraws every frame from the last known quad; only the
    // OpenCV work is throttled, and never overlaps itself.
    function loop(timestamp: number) {
      if (cancelled) return;
      if (statusRef.current === "live") {
        drawOverlay();
        if (!detecting && timestamp - lastRunRef.current >= DETECT_INTERVAL_MS) {
          lastRunRef.current = timestamp;
          detecting = true;
          processFrame().finally(() => {
            detecting = false;
          });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    function drawOverlay() {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.videoWidth === 0) return;
      const displayW = video.clientWidth;
      const displayH = video.clientHeight;
      if (overlay.width !== displayW) overlay.width = displayW;
      if (overlay.height !== displayH) overlay.height = displayH;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, displayW, displayH);

      const quad = quadRef.current;
      if (!quad) {
        outlineRef.current = null;
        fillRef.current = 0;
        drawGuide(octx, displayW, displayH, GUIDE_IDLE);
        return;
      }
      const target = scaleQuad(quad, displayW, displayH);
      const shown = outlineRef.current;
      const outline = shown
        ? (shown.map((p, i) => ({ x: p.x + (target[i].x - p.x) * OUTLINE_EASE, y: p.y + (target[i].y - p.y) * OUTLINE_EASE })) as Quad)
        : target;
      outlineRef.current = outline;
      const fillTarget = lockedRef.current ? FILL_LOCKED : FILL_FOUND;
      fillRef.current += (fillTarget - fillRef.current) * FILL_EASE;
      octx.beginPath();
      octx.moveTo(outline[0].x, outline[0].y);
      for (let i = 1; i < outline.length; i++) octx.lineTo(outline[i].x, outline[i].y);
      octx.closePath();
      octx.fillStyle = `rgba(74, 222, 128, ${fillRef.current.toFixed(3)})`;
      octx.fill();
      octx.strokeStyle = GREEN;
      octx.lineWidth = 3;
      octx.stroke();
      drawGuide(octx, displayW, displayH, GREEN);
    }

    function ensureMats(cv: CVModule, w: number, h: number): WorkMats {
      const m = matsRef.current;
      if (m && m.w === w && m.h === h) return m;
      freeMats();
      const mats = createMats(cv, w, h);
      matsRef.current = mats;
      return mats;
    }

    async function processFrame() {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      const tickStart = performance.now();
      diagRef.current.ticks++;
      diagRef.current.videoW = video.videoWidth;
      diagRef.current.videoH = video.videoHeight;

      // Barcode check runs on the live video frame directly -- cheap,
      // native, and independent of OpenCV, so it still runs even if
      // OpenCV itself failed to load.
      if (barcodeDetectorRef.current) {
        try {
          const codes = await barcodeDetectorRef.current.detect(video);
          if (codes.length > 0) {
            setBarcodeValue(codes[0].rawValue);
          }
        } catch {
          // detector can throw on a transient bad frame; ignore and keep going
        }
      }
      if (cancelled || !streamRef.current) return;

      const { sx, sy, sw, sh } = visibleRegion(video, cssZoomRef.current);
      const workW = WORK_WIDTH;
      const workH = Math.round((sh / sw) * WORK_WIDTH);
      if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
      const work = workCanvasRef.current;
      if (work.width !== workW) work.width = workW;
      if (work.height !== workH) work.height = workH;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      if (!wctx) return;
      wctx.drawImage(video, sx, sy, sw, sh, 0, 0, workW, workH);

      // Light is measured before edge detection, so the torch and the hint
      // work while OpenCV is still loading or when it failed.
      const pixels = wctx.getImageData(0, 0, workW, workH).data;
      const lightAt = performance.now();
      if (meanLight(pixels) < DARK_LEVEL) darkSinceRef.current ??= lightAt;
      else darkSinceRef.current = null;
      const darkFor = darkSinceRef.current === null ? 0 : lightAt - darkSinceRef.current;
      const torchPending = darkSinceRef.current !== null && torchCapRef.current && !torchRef.current && !torchByHandRef.current;
      if (torchPending && darkFor >= TORCH_AFTER_MS && !capturedRef.current) {
        setTorch(true);
        // The hold-still count starts again in the new light.
        resetStable();
      }
      setDark(darkFor >= DARK_HINT_MS && !torchCapRef.current);

      const cv = cvRef.current;
      if (!cv) return;

      try {
        const mats = ensureMats(cv, workW, workH);
        const { src, gray } = mats;
        src.data.set(pixels);
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const page = findPage(cv, mats, zoomLevel() > 1);
        const best = page?.pts ?? null;
        const bestArea = page?.area ?? 0;

        // Variance of the Laplacian over the unblurred grey inside the
        // quad's bounding box -- the sharpness the auto-capture gate uses.
        const sharpness = best ? sharpnessIn(cv, gray, best, workW, workH) : 0;
        const last = lastQuadRef.current;
        const aligned = best ? (last ? alignTo(orderPoints(best), last) : { q: orderPoints(best), off: 0 }) : null;
        const ordered = aligned?.q ?? null;
        if (ordered) {
          recentRef.current.push(ordered);
          if (recentRef.current.length > SMOOTH_TICKS) recentRef.current.shift();
        }
        const smooth = ordered ? medianQuad(recentRef.current) : null;
        const coverage = bestArea / (workW * workH);
        lastCoverageRef.current = coverage;
        const span = smooth ? spanOf(smooth, workW, workH) : 0;
        // A till receipt running most of the way down the view is big
        // enough whatever its area.
        const bigEnough = coverage >= MIN_COVERAGE || span >= AUTO_ZOOM_BELOW;

        diagRef.current.lastTickMs = Math.round(performance.now() - tickStart);
        diagRef.current.sharpness = Math.round(sharpness);
        diagRef.current.coverage = best ? Math.round((bestArea / (workW * workH)) * 100) : 0;
        if (best) diagRef.current.quads++;

        // The page taken counts as gone when it's lost (past the same grace
        // a curled page gets below, or it would be taken again where it
        // lies), when what's found is somewhere else (a receipt waiting in a
        // pile at the edge), or has shrunk well below what was taken -- not
        // on a frame where the same page reads a hair under the capture size.
        if (!armedRef.current) {
          const taken = takenRef.current;
          const gone =
            (!ordered && (!quadRef.current || missesRef.current >= LOST_GRACE_TICKS)) ||
            !taken ||
            (ordered !== null && (dist(centre(ordered), centre(taken.pts)) > TAKEN_MOVED * workW || coverage < TAKEN_SHRUNK * taken.coverage));
          if (gone) seenClearRef.current = true;
          if (seenClearRef.current && performance.now() >= rearmAtRef.current) {
            armedRef.current = true;
            setWaitingNext(false);
          }
        }

        if (smooth) {
          missesRef.current = 0;
          quadRef.current = { pts: smooth, w: workW, h: workH };
          rawQuadRef.current = { pts: ordered!, w: workW, h: workH };

          const now = performance.now();
          const moved = last !== null && Math.max(...smooth.map((p, i) => dist(p, last[i]))) > MOVE_TOLERANCE * workW;
          // This tick's own reading is far from the smoothed page: a misread,
          // or a move the median hasn't caught up with. Never the moment to
          // take the shot.
          const agrees = aligned!.off <= MOVE_TOLERANCE * workW;
          lastQuadRef.current = smooth;
          if (moved || !bigEnough) {
            lockedRef.current = false;
            stableSinceRef.current = null;
            peakSharpRef.current = 0;
          }
          lostSinceRef.current = null;
          // How much further auto-zoom may go, how far this page allows
          // before a corner nears the edge, and so the step it would take.
          const level = zoomLevel();
          const room = autoZoomRef.current && !userZoomedRef.current ? autoZoomMax() / level : 1;
          const fit = fitFactor(smooth, workW, workH);
          const step = Math.min(room, fit, AUTO_ZOOM_TARGET / span);
          const canZoom = span < AUTO_ZOOM_BELOW && step >= AUTO_ZOOM_MIN_STEP;
          // The other way round: a corner already within FIT_MARGIN of the
          // edge while zoomed in. Zoom out to where the page fits, and no
          // further -- "a little", not back to 1.
          const tooClose = fit < 1 && level > 1 && autoZoomRef.current && !userZoomedRef.current;
          if (tooClose && !capturedRef.current && now >= zoomCooldownRef.current) {
            if (bigSinceRef.current === null) bigSinceRef.current = now;
            else if (now - bigSinceRef.current >= AUTO_ZOOM_SETTLE_MS) {
              bigSinceRef.current = null;
              zoomToRef.current(Math.max(1, level * fit * AUTO_ZOOM_OUT_FIT));
              zoomCooldownRef.current = now + AUTO_ZOOM_COOLDOWN_MS;
              resetStable();
              setCoach("zooming");
              return;
            }
          } else {
            bigSinceRef.current = null;
          }
          if (canZoom && !capturedRef.current && now >= zoomCooldownRef.current && !moved) {
            if (smallSinceRef.current === null) smallSinceRef.current = now;
            else if (now - smallSinceRef.current >= AUTO_ZOOM_SETTLE_MS) {
              smallSinceRef.current = null;
              zoomToRef.current(level * step);
              zoomCooldownRef.current = now + AUTO_ZOOM_COOLDOWN_MS;
              resetStable();
              setCoach("zooming");
              return;
            }
          } else {
            smallSinceRef.current = null;
          }
          if (!bigEnough) {
            // Only ask the person to move when zooming can't do it for them.
            setCoach(canZoom ? "zooming" : room >= AUTO_ZOOM_MIN_STEP && fit < AUTO_ZOOM_MIN_STEP ? "centre" : "closer");
          } else {
            if (stableSinceRef.current === null) stableSinceRef.current = now;
            peakSharpRef.current = Math.max(peakSharpRef.current, sharpness);
            setCoach("hold");
            const stableFor = now - stableSinceRef.current;
            const sharpEnough = sharpness >= SHARPNESS_FLOOR && sharpness >= SHARPNESS_RATIO * peakSharpRef.current;
            const ready = (stableFor >= STABLE_MS && sharpEnough) || stableFor >= STABLE_TIMEOUT_MS;
            lockedRef.current = sharpEnough || stableFor >= STABLE_MS;
            if (ready && agrees && !torchPending && autoRef.current && armedRef.current && !reviewingRef.current && !capturedRef.current && statusRef.current === "live") {
              capturedRef.current = true;
              captureRef.current();
            }
          }
        } else if (!quadRef.current || ++missesRef.current > LOST_GRACE_TICKS) {
          quadRef.current = null;
          rawQuadRef.current = null;
          lockedRef.current = false;
          resetStable();
          setCoach("line");
          smallSinceRef.current = null;
          bigSinceRef.current = null;
          const now = performance.now();
          if (autoZoomRef.current && !userZoomedRef.current && !capturedRef.current && now >= zoomCooldownRef.current && zoomLevel() > 1) {
            if (lostSinceRef.current === null) lostSinceRef.current = now;
            else if (now - lostSinceRef.current >= AUTO_ZOOM_LOST_MS) {
              lostSinceRef.current = null;
              zoomToRef.current(1);
              zoomCooldownRef.current = now + AUTO_ZOOM_COOLDOWN_MS;
            }
          }
        }
      } catch (err) {
        // A bad frame must not stop the loop, but a repeating error is the
        // whole story when a phone shows "nothing to scan", so surface it.
        console.error("detection tick failed:", err);
        setCvError(String((err as Error)?.message ?? err).slice(0, 140));
        setCvStatus("failed");
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // retryKey is intentionally a dependency purely to let retry() force
    // this whole effect (and therefore start()) to run again. cvStatus
    // (the state) is deliberately not listed -- processFrame reads cvRef
    // instead precisely so OpenCV arriving mid-effect doesn't need to
    // restart the camera stream just to start detection.
  }, [stopStream, freeMats, retryKey, useNative]);

  // Two fingers on the camera zoom the camera, not the page: the browser's
  // own pinch and double-tap zoom are switched off here (touch-action, and
  // Safari's gesture events), and the pinch drives the lens zoom where the
  // phone offers one, otherwise the cropped zoom. Applied once per frame.
  const pinchRef = useRef<{ dist: number; level: number; ratio: number; frame: number } | null>(null);
  const pinchStepRef = useRef<(ratio: number, level: number) => void>(() => {});
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pinchStepRef.current = (ratio, level) => {
      if (capturedRef.current) return;
      const hw = hwZoomRef.current;
      if (hw) {
        const base = Math.max(hw.min, 1);
        const target = Math.min(hw.max, Math.max(hw.min, base * level * ratio));
        const value = hw.step > 0 ? Math.round(target / hw.step) * hw.step : target;
        if (value !== hwZoomValueRef.current) applyZoom(value);
        return;
      }
      const css = Math.min(PINCH_CSS_MAX, Math.max(1, level * ratio));
      if (Math.abs(css - cssZoomRef.current) < 0.01) return;
      forgetPage();
      userZoomedRef.current = true;
      cssZoomRef.current = css;
      setCssZoom(css);
    };
  });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const hw = hwZoomRef.current;
      const level = hw ? hwZoomValueRef.current / Math.max(hw.min, 1) : cssZoomRef.current;
      pinchRef.current = { dist: spread(e.touches) || 1, level, ratio: 1, frame: 0 };
      if (videoRef.current) videoRef.current.style.transition = "none";
    };
    const onMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      p.ratio = spread(e.touches) / p.dist;
      if (p.frame) return;
      p.frame = requestAnimationFrame(() => {
        p.frame = 0;
        pinchStepRef.current(p.ratio, p.level);
      });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2 || !pinchRef.current) return;
      pinchRef.current = null;
      if (videoRef.current) videoRef.current.style.transition = "";
    };
    const block = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    el.addEventListener("touchstart", onStart, opts);
    el.addEventListener("touchmove", onMove, opts);
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    for (const g of gestures) el.addEventListener(g, block, opts);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      for (const g of gestures) el.removeEventListener(g, block);
    };
  }, [useNative]);

  function applyZoom(value: number) {
    if (capturedRef.current) return;
    forgetPage();
    userZoomedRef.current = true;
    hwZoomValueRef.current = value;
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    constrain(track, { zoom: value }).catch(() => {});
  }

  function focusAt(e: React.MouseEvent<HTMLVideoElement>) {
    const video = videoRef.current;
    const area = liveAreaRef.current;
    if (!video || !area) return;
    const rect = area.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusPoint(null), FOCUS_RING_MS);

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || video.videoWidth === 0) return;
    const r = visibleRegion(video, cssZoom);
    const advanced: AdvancedConstraints = {
      focusMode: "single-shot",
      pointsOfInterest: [
        { x: (r.sx + (x / rect.width) * r.sw) / video.videoWidth, y: (r.sy + (y / rect.height) * r.sh) / video.videoHeight },
      ],
    };
    (async () => {
      try {
        await constrain(track, advanced);
      } catch {
        // focus constraints unsupported here -- the ring alone is the feedback
      }
    })();
  }

  // The camera's own still of what is on screen: upright, cropped to the
  // visible region, and at most PHOTO_MAX_SIDE. Null when the browser can't
  // take one, it has no more pixels than the video, or it doesn't clearly
  // show what the screen did (see PHOTO_MATCH).
  async function stillOfRegion(video: HTMLVideoElement, region: Region, frame: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
    const photo = photoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!photo || !track || photo.track !== track) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const caps = photo.caps;
    const widest = Math.max(caps?.imageWidth?.max ?? 0, caps?.imageHeight?.max ?? 0);
    if (widest && widest < PHOTO_MIN_GAIN * Math.max(vw, vh)) return null;
    let bitmap: ImageBitmap;
    try {
      const within = (want: number, r?: PhotoRange) => (r && r.max > 0 ? Math.max(r.min, Math.min(r.max, want)) : undefined);
      const imageWidth = within(PHOTO_ASK.imageWidth, caps?.imageWidth);
      const imageHeight = within(PHOTO_ASK.imageHeight, caps?.imageHeight);
      const blob = await withTimeout(photo.capture.takePhoto(imageWidth && imageHeight ? { imageWidth, imageHeight } : undefined), PHOTO_TIMEOUT_MS);
      bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      return null;
    }
    try {
      // The video shows the middle of what the sensor sees, so it is the
      // still cropped to the video's shape; the visible region is then the
      // same crop of that.
      const place = (turn: number) => {
        const tw = turn % 180 ? bitmap.height : bitmap.width;
        const th = turn % 180 ? bitmap.width : bitmap.height;
        const k = Math.min(tw / vw, th / vh);
        return { k, x: (tw - vw * k) / 2 + region.sx * k, y: (th - vh * k) / 2 + region.sy * k, w: region.sw * k, h: region.sh * k };
      };
      const long = Math.max(region.sw, region.sh);
      const thumbW = Math.max(1, Math.round((THUMB_SIDE * region.sw) / long));
      const thumbH = Math.max(1, Math.round((THUMB_SIDE * region.sh) / long));
      const target = greyThumb(frame, thumbW, thumbH);
      const score = (turn: number) => {
        const p = place(turn);
        const c = drawTurned(bitmap, turn, p.x, p.y, p.w, p.h, thumbW * 4, thumbH * 4);
        return c ? likeness(greyThumb(c, thumbW, thumbH), target) : 0;
      };
      // The decoder applies the camera's orientation, so a still the same
      // way round as the video is taken as it comes. One on its side is
      // turned whichever way clearly matches the screen better; a centred
      // page on a plain table can look much the same either way up, and
      // then the video frame is used instead of a guess.
      let turn = 0;
      if (bitmap.width > bitmap.height !== vw > vh) {
        const [a, b] = [score(90), score(270)];
        if (Math.abs(a - b) < TURN_MARGIN) return null;
        turn = a > b ? 90 : 270;
      }
      const p = place(turn);
      if (p.k < PHOTO_MIN_GAIN || score(turn) < PHOTO_MATCH) return null;
      const f = Math.min(1, PHOTO_MAX_SIDE / Math.max(p.w, p.h));
      return drawTurned(bitmap, turn, p.x, p.y, p.w, p.h, p.w * f, p.h * f);
    } finally {
      bitmap.close();
    }
  }

  // The page's corners in the still: the page found again there, near where
  // the video had it, and about as sharp. Null (use the video frame) when
  // it isn't there, has moved too far, or the still is blurred -- the phone
  // moved between the frame and the still.
  function cornersInStill(cv: CVModule, still: HTMLCanvasElement, frame: HTMLCanvasElement, quad: WorkQuad): Quad | null {
    const s = workGrey(cv, still);
    const f = workGrey(cv, frame);
    try {
      if (!s || !f) return null;
      const guess = scaleQuad(quad, s.w, s.h);
      const limit = REFINE_TOLERANCE * Math.hypot(s.w, s.h);
      let best: { pts: Quad; off: number } | null = null;
      for (const c of pageCandidates(cv, s)) {
        const { q: pts, off } = alignTo(orderPoints(c.pts), guess);
        if (off <= limit && (!best || off < best.off)) best = { pts, off };
      }
      if (!best) return null;
      const sharpStill = sharpnessIn(cv, s.gray, best.pts, s.w, s.h);
      const sharpFrame = sharpnessIn(cv, f.gray, scaleQuad(quad, f.w, f.h), f.w, f.h);
      if (sharpStill < STILL_SHARPNESS * sharpFrame) return null;
      return scaleQuad({ pts: best.pts, w: s.w, h: s.h }, still.width, still.height);
    } catch {
      return null;
    } finally {
      if (s) deleteMats(s);
      if (f) deleteMats(f);
    }
  }

  // The visible region of the current frame -- or of the camera's still of
  // it -- perspective-warped to the detected quad when there is one. Reads
  // refs only: the auto-capture path calls it from inside the long-lived
  // detection effect.
  async function renderCapture(): Promise<string | null> {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const region = visibleRegion(video, cssZoomRef.current);
    // Corners in screen order for the warp: the tick loop keeps them in the
    // order the page was first seen in, which would save a page that was
    // turned upright while tracked on its side.
    // A tap in the grace after the page was missed saves the whole frame
    // rather than crop to where it was; right after a move it crops to this
    // tick's reading, not the median still catching up.
    const smoothed = quadRef.current;
    const raw = rawQuadRef.current;
    const tracked =
      !smoothed || missesRef.current > 0
        ? null
        : raw && Math.max(...smoothed.pts.map((p, i) => dist(p, raw.pts[i]))) > MOVE_TOLERANCE * smoothed.w
          ? raw
          : smoothed;
    const quad = tracked && { ...tracked, pts: orderPoints(tracked.pts) };
    const frame = document.createElement("canvas");
    frame.width = Math.round(region.sw);
    frame.height = Math.round(region.sh);
    const fctx = frame.getContext("2d");
    if (!fctx) return null;
    fctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, frame.width, frame.height);

    const cv = cvRef.current;
    if (!quad || !cv) return frame.toDataURL("image/jpeg", 0.92);
    const still = await stillOfRegion(video, region, frame);
    const corners = still ? cornersInStill(cv, still, frame, quad) : null;
    const full = corners && still ? still : frame;

    try {
      const src = cv.imread(full);
      // The quad rescaled from the 480px work frame to the full-resolution
      // frame before the output size is measured, so a page captured from
      // further away still uses every native pixel available.
      const [tl, tr, br, bl] = corners ?? scaleQuad(quad, full.width, full.height);
      const outW = Math.round(Math.max(dist(br, bl), dist(tr, tl)));
      const outH = Math.round(Math.max(dist(tr, br), dist(tl, bl)));

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      cv.imshow(out, dst);

      src.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();
      dst.delete();

      return out.toDataURL("image/jpeg", 0.92);
    } catch {
      return full.toDataURL("image/jpeg", 0.92);
    }
  }

  // Straight to the parent with no review step; the pages strip there
  // offers a retake.
  async function capture() {
    // The flash comes once the photo is actually taken: the camera's still
    // can take a moment, and the hint asks the person to hold still till
    // then. Anything that stops the stream meanwhile (Back, a retry) drops
    // the capture.
    const stream = streamRef.current;
    setSaving(true);
    if (multi) {
      armedRef.current = false;
      seenClearRef.current = false;
      rearmAtRef.current = Infinity;
      takenRef.current = quadRef.current ? { pts: quadRef.current.pts, coverage: lastCoverageRef.current } : null;
    }
    let dataUrl: string;
    try {
      const image = await renderCapture();
      if (streamRef.current !== stream) return;
      if (!image) throw new Error("Could not read this image.");
      setFlash(true);
      const [scaled] = await Promise.all([downscaleImageDataUrl(image), new Promise((r) => setTimeout(r, FLASH_MS))]);
      if (streamRef.current !== stream) return;
      dataUrl = scaled;
    } catch (err) {
      if (streamRef.current !== stream) return;
      setFlash(false);
      setSaving(false);
      capturedRef.current = false;
      if (multi) {
        armedRef.current = true;
        rearmAtRef.current = 0;
      }
      resetStable();
      showFailure(saveFailed(err, "Could not read this image."));
      return;
    }
    if (multi) {
      addShots([{ dataUrl, mediaType: "image/jpeg" }]);
      setFlash(false);
      setSaving(false);
      // Swapping pages while it saved counts as the page having left.
      rearmAtRef.current = performance.now() + REARM_MS;
      setWaitingNext(true);
      resetStable();
      capturedRef.current = false;
      return;
    }
    stopStream();
    onCaptureRef.current?.({ dataUrl, mediaType: "image/jpeg" });
  }

  useEffect(() => {
    captureRef.current = capture;
    zoomToRef.current = zoomTo;
  });

  function shutter() {
    if (capturedRef.current) return;
    capturedRef.current = true;
    capture();
  }

  function readFile(file: File): Promise<CapturedFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = await downscaleImageDataUrl(reader.result as string);
          resolve({ dataUrl, mediaType: file.type.startsWith("image/") ? "image/jpeg" : file.type });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Could not read this file."));
      reader.readAsDataURL(file);
    });
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Cleared so picking the same file again after a failure re-fires change.
    e.target.value = "";
    if (!files.length) return;
    try {
      if (multi) {
        const read = await Promise.allSettled(files.map(readFile));
        addShots(read.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
        const failed = read.filter((r) => r.status === "rejected").length;
        if (failed) showFailure(`${failed} of ${files.length} file${files.length === 1 ? "" : "s"} couldn't be read and ${failed === 1 ? "was" : "were"} left out.`);
        return;
      }
      const file = await readFile(files[0]);
      stopStream();
      onCapture?.(file);
    } catch (err) {
      showFailure(saveFailed(err, "Could not read this file."));
    }
  }

  function close() {
    if (shots.length && !window.confirm(`Discard ${shots.length} scan${shots.length === 1 ? "" : "s"}?`)) return;
    stopStream();
    onClose();
  }

  function acceptBatch() {
    const docs = groupShots(shots);
    if (!docs.length) return;
    stopStream();
    onBatch?.(docs);
  }

  const stack = multi && shots.length > 0 && (
    <button
      type="button"
      onClick={openReview}
      aria-label={`Review ${shots.length} scan${shots.length === 1 ? "" : "s"}`}
      className="relative h-14 w-11 rounded-md border-2 border-white bg-neutral-800 shadow-lg"
    >
      {shots.length > 1 && <span className="absolute -right-1.5 -top-1.5 -z-10 h-14 w-11 rotate-6 rounded-md border-2 border-white/70 bg-neutral-700" />}
      {shots[shots.length - 1].mediaType === "application/pdf" ? (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-medium text-ink-on-dark">PDF</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={shots[shots.length - 1].id} src={shots[shots.length - 1].dataUrl} alt="" className="shot-in h-full w-full rounded-[4px] object-cover" />
      )}
      <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4ADE80] px-1 text-[11px] font-bold text-neutral-900">
        {shots.length}
      </span>
    </button>
  );

  const review = reviewing && (
    <BatchReview
      shots={shots}
      onChange={setShots}
      onKeepScanning={() => {
        resetStable();
        setReviewing(false);
      }}
      onAccept={acceptBatch}
      purpose={purpose}
    />
  );

  const pageLabel = pageNumber && pageNumber > 1 ? `Page ${pageNumber}` : null;
  const hasQuad = coach !== "line";
  useEffect(() => {
    if (!debug) return;
    const id = setInterval(() => {
      const d = diagRef.current;
      setDebugText(
        `cv:${cvStatus} video:${d.videoW}x${d.videoH} ticks:${d.ticks} quads:${d.quads} cov:${d.coverage}% sharp:${d.sharpness} tick:${d.lastTickMs}ms coach:${coach} auto:${autoRef.current ? "on" : "off"}`
      );
    }, 500);
    return () => clearInterval(id);
  }, [debug, cvStatus, coach]);

  // Nothing to say until a page is found: the corners on screen show where
  // it goes (Atanas: everyone knows what to do), and first-timers get the
  // scanner-auto tip.
  const hint = saving
    ? "Hold still — taking the photo…"
    : multi && waitingNext
      ? `Got it — ${shots.length} scanned. Next document…`
      : dark
        ? "It's dark here — more light helps"
        : cvStatus === "failed" || !hasQuad
        ? null
        : coach === "zooming"
          ? "Hold still — zooming in"
          : coach === "centre"
            ? "Move the page to the middle"
            : coach === "closer"
              ? "Move closer"
              : !autoOn
                ? "Ready — tap to capture"
                : "Hold still…";
  const pill = [pageLabel, hint].filter(Boolean).join(" · ");
  // The first open downloads the page-finder (13 MB): until it is here the
  // camera shows and nothing is found, which read as "the scanner shows
  // nothing" (Atanas, 2026-09-22). Say so, in words, at a readable size.
  const cvLine =
    cvStatus === "loading" ? "Getting ready… the first time takes a moment" : cvStatus === "failed" ? `Edge detection unavailable: ${cvError}` : null;

  // iOS: the in-page live-detection camera fundamentally can't win here.
  // getUserMedia on iOS Safari returns a low-resolution, fixed-focus
  // stream with no way to request otherwise -- soft images no OCR does
  // well with. And the contour detector needs the whole document inside
  // the frame with margin to find a closed quadrilateral, which is
  // incompatible with holding the phone close enough to keep text
  // legible. The native camera app has neither problem: full sensor
  // resolution, real autofocus, and no quad requirement since there's no
  // live crop to compute. It's also faster to open, since it skips the
  // multi-MB OpenCV WASM download entirely. The in-app scanner is the
  // default since auto-capture landed; this stays one tap away.
  if (useNative) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div inert={reviewing} className={`relative flex flex-1 flex-col items-center justify-center gap-3 ${shownFailure ? "border-4 border-red-500" : ""}`}>
          <div className="absolute left-4 z-10" style={{ top: "calc(1rem + env(safe-area-inset-top))" }}>
            <BackButton onClick={close} />
          </div>
          {pageLabel && <p className="text-sm font-medium text-ink-on-dark">{pageLabel}</p>}
          {stack}
          <p className="px-8 text-center text-sm text-ink-on-dark/70">
            {multi && shots.length
              ? `${shots.length} scanned. Take the next one, or tap the stack to check them.`
              : "Take a clear, well-lit photo of the whole document."}
          </p>
          {shownFailure && <p role="alert" className="px-8 text-center text-sm text-red-400">{shownFailure}</p>}
        </div>
        <div inert={reviewing} className="space-y-2 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => nativeInputRef.current?.click()}
            className="w-full rounded-lg bg-white px-5 py-3 text-center text-sm font-medium text-neutral-900"
          >
            {multi && shots.length ? "Take the next photo" : "Take a photo"}
          </button>
          {multi && shots.length > 0 && (
            <button
              onClick={openReview}
              className="w-full rounded-lg bg-[#4ADE80] px-5 py-3 text-center text-sm font-medium text-neutral-900"
            >
              Check and read {shots.length} scan{shots.length === 1 ? "" : "s"}
            </button>
          )}
          {/* capture="environment" forces straight to the camera on iOS
              Safari, which is exactly what the button above wants -- but
              it also makes the photo library and PDFs unreachable. This
              is the same accept as the non-iOS upload input below, just
              without capture, so both are actually usable here: an
              existing photo, or a PDF invoice from email. */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border border-white/30 px-5 py-3 text-center text-sm font-medium text-ink-on-dark"
          >
            Upload instead
          </button>
          <button onClick={() => switchScannerMode("inapp")} className="w-full py-1 text-center text-xs text-ink-on-dark/70 underline">
            Use the in-app scanner instead
          </button>
          <input
            ref={nativeInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileChosen}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple={multi}
            onChange={onFileChosen}
            className="hidden"
          />
        </div>
        {review}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex touch-none flex-col bg-black">
      {/* While the review sheet is up nothing behind it can take focus: it
          covered the camera but left Capture, and a Back that discards the
          batch, one Tab away. */}
      <div ref={liveAreaRef} inert={reviewing} className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          onClick={focusAt}
          className="h-full w-full object-cover"
          style={{ transform: cssZoom !== 1 ? `scale(${cssZoom})` : undefined, transition: "transform 250ms ease-out" }}
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {(shownFailure || (hasQuad && status === "live")) && (
          <div className={`pointer-events-none absolute inset-0 border-4 ${shownFailure ? "border-red-500" : "border-[#4ADE80]"}`} />
        )}
        {flash && <div className="pointer-events-none absolute inset-0 z-10 bg-white" />}
        {focusPoint && (
          <div
            className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: focusPoint.x, top: focusPoint.y }}
          />
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-on-dark">Starting camera…</div>
        )}
        {status === "timeout" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-ink-on-dark">
            <p>The camera didn&apos;t respond. This usually means access is blocked somewhere your browser won&apos;t report directly (an OS-level camera privacy setting is the most common one) — check there, or upload a photo or PDF instead.</p>
            <button onClick={retry} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-ink-on-dark">
              Try again
            </button>
            {iOSMode && <NativeCameraEscape onSwitch={() => switchScannerMode("native")} />}
          </div>
        )}
        {status === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-ink-on-dark">
            <p>Camera access was denied. You can allow it from your browser&apos;s site settings, or upload a photo or PDF instead.</p>
            {iOSMode && <p className="text-neutral-400">{SAFARI_CAMERA_TIP}</p>}
            <button onClick={retry} className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-ink-on-dark">
              Try again
            </button>
            {iOSMode && <NativeCameraEscape onSwitch={() => switchScannerMode("native")} />}
          </div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-ink-on-dark">
            <p>This browser doesn&apos;t support camera capture here. Upload a photo or PDF instead.</p>
          </div>
        )}

        {/* One strip inside the safe area: back button and hint share a
            row so neither can sit on top of the other, the edge-detection
            status and any barcode banner stack below. The back button is
            always there -- the old bottom-bar "Cancel" text was easy to
            miss entirely while stuck on a black screen. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 px-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2">
            <BackButton onClick={close} />
            {shownFailure ? (
              <div className="min-w-0 flex-1 rounded-lg bg-red-600/90 p-2 text-center text-xs font-medium text-ink-on-dark line-clamp-2">{shownFailure}</div>
            ) : (
              status === "live" && (
                // With nothing to say it's an invisible strip, still there
                // to tap for the readout -- which matters most exactly when
                // no page is being found.
                <div
                  onClick={() => setDebug((d) => !d)}
                  className={`pointer-events-auto min-w-0 flex-1 ${pill ? "rounded-lg bg-black/50 p-2 text-center text-xs text-ink-on-dark line-clamp-2" : "h-10"}`}
                >
                  {pill}
                </div>
              )
            )}
            {status === "live" && torchAvailable && (
              <button
                onClick={toggleTorch}
                aria-label="Torch"
                aria-pressed={torchOn}
                className={`pointer-events-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${torchOn ? "bg-white text-neutral-900" : "bg-black/50 text-ink-on-dark"}`}
              >
                <TorchIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          {status === "live" && !shownFailure && cvLine && (
            <div className="rounded-lg bg-black/60 px-3 py-1.5 text-center text-sm text-ink-on-dark">{cvLine}</div>
          )}
          {status === "live" && debug && (
            <div className="rounded-lg bg-black/70 px-2 py-1 text-center font-mono text-[11px] text-neutral-200">
              {debugText}
            </div>
          )}
          {barcodeValue && !shownFailure && (
            <div className="pointer-events-auto rounded-lg bg-white/95 p-3 text-sm text-neutral-900 shadow">
              <div className="font-medium">Barcode detected: {barcodeValue}</div>
              <button onClick={() => setBarcodeValue(null)} className="mt-1 text-xs text-neutral-700 underline">Dismiss</button>
            </div>
          )}
        </div>

        {status === "live" && (
          <div className="absolute inset-x-8 bottom-3 flex flex-col items-center gap-2">
            {multi && shots.length > 0 ? (
              <Tip id="scanner-stack" dark className="w-full max-w-sm">
                Keep going for the next page or document. Tap the stack in the corner to check your scans and read them.
              </Tip>
            ) : (
              <Tip id="scanner-auto" dark className="w-full max-w-sm">
                {autoOn ? "Hold the phone over the page and keep still: it zooms in and takes the photo by itself." : "Line the page up inside the corners and tap the button to take the photo."}
              </Tip>
            )}
            {zoomRange ? (
              <input
                type="range"
                aria-label="Zoom"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="w-full max-w-xs accent-white"
              />
            ) : (
              <div className="flex overflow-hidden rounded-full bg-black/50 text-xs font-medium text-ink-on-dark">
                {[1, 2].map((z) => (
                  <button
                    key={z}
                    onClick={() => {
                      forgetPage();
                      userZoomedRef.current = true;
                      cssZoomRef.current = z;
                      setCssZoom(z);
                    }}
                    aria-pressed={cssZoom === z}
                    className={`px-3 py-1 ${cssZoom === z ? "bg-white text-neutral-900" : ""}`}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-4">
              <button onClick={toggleAuto} className="text-xs text-ink-on-dark/70 underline">
                Auto-capture: {autoOn ? "on" : "off"}
              </button>
              <button onClick={toggleAutoZoom} className="text-xs text-ink-on-dark/70 underline">
                Auto-zoom: {autoZoomOn ? "on" : "off"}
              </button>
            </div>
            {iOSMode && (
              <button onClick={() => switchScannerMode("native")} className="text-xs text-ink-on-dark/70 underline">
                Use the native camera instead
              </button>
            )}
            {cameraHint && (
              <Tip id="camera-allow" dark className="w-full max-w-sm">
                {SAFARI_CAMERA_TIP}
              </Tip>
            )}
          </div>
        )}
      </div>

      <div inert={reviewing} className="relative flex items-center justify-center bg-black p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        {status === "live" ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add a photo or PDF from your library"
              className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-ink-on-dark"
            >
              <PhotoIcon className="h-5 w-5" />
            </button>
            <button
              onClick={shutter}
              className={`h-16 w-16 rounded-full border-4 bg-white/20 ${hasQuad ? "border-[#4ADE80]" : "border-white"}`}
              aria-label="Capture"
            />
            {stack && <div className="absolute right-6 flex flex-col items-center gap-1">{stack}</div>}
          </>
        ) : (
          // Camera isn't usable right now (still starting, denied,
          // timed out, unsupported) -- Upload is the only thing that
          // actually works, so it gets the primary button, not the
          // smallest text on the page.
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs rounded-lg bg-white px-5 py-3 text-center text-sm font-medium text-neutral-900"
          >
            Upload a photo or PDF
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple={multi}
          onChange={onFileChosen}
          className="hidden"
        />
      </div>
      {review}
    </div>
  );
}
