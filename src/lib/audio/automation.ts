export type CurveType = "linear" | "smooth" | "bezier" | "step";

export interface AutoPoint {
  id: string;
  /** Seconds. */
  t: number;
  /** Normalized 0..1, unless a lane uses another range. */
  v: number;
  /** Shape of the segment that starts at this point. */
  curve: CurveType;
  /** Outgoing bezier handle, seconds ahead of t. */
  hx: number;
  /** Outgoing bezier handle, value offset from v. */
  hy: number;
}

export interface AutomationLane {
  id: string;
  /** Parameter key, e.g. "gain" or "fx:0:drive". */
  param: string;
  points: AutoPoint[];
}

export function sortPoints(points: AutoPoint[]): AutoPoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}

function bezier(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const m = 1 - u;
  return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3;
}

function bezierT(c1: number, c2: number, target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) * 0.5;
    const x = bezier(0, c1, c2, 1, mid);
    if (x < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Value of a lane at time t. Empty lanes return `fallback`. */
export function valueAt(points: AutoPoint[], t: number, fallback = 1): number {
  if (!points.length) return fallback;
  const sorted = sortPoints(points);
  if (t <= sorted[0].t) return sorted[0].v;
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return last.v;
  let index = 0;
  while (index < sorted.length - 2 && sorted[index + 1].t <= t) index += 1;
  const a = sorted[index];
  const b = sorted[index + 1];
  const span = Math.max(1e-6, b.t - a.t);
  const u = (t - a.t) / span;
  if (a.curve === "step") return a.v;
  if (a.curve === "linear") return a.v + (b.v - a.v) * u;
  if (a.curve === "smooth") {
    const s = u * u * (3 - 2 * u);
    return a.v + (b.v - a.v) * s;
  }
  const c1 = Math.min(0.95, Math.max(0.05, a.hx / span));
  const c2 = Math.min(0.98, Math.max(c1 + 0.02, 1 - Math.max(0.05, (b.hx || span * 0.3) / span)));
  const param = bezierT(c1, c2, u);
  const y0 = a.v;
  const y1 = a.v + a.hy;
  const y2 = b.v - (b.hy || 0);
  const y3 = b.v;
  return bezier(y0, y1, y2, y3, param);
}

export function addPoint(points: AutoPoint[], point: AutoPoint): AutoPoint[] {
  return sortPoints([...points.filter((item) => item.id !== point.id), point]);
}

export function movePoint(points: AutoPoint[], id: string, t: number, v: number): AutoPoint[] {
  return sortPoints(points.map((point) => (point.id === id ? { ...point, t, v } : point)));
}

export function deletePoint(points: AutoPoint[], id: string): AutoPoint[] {
  return points.filter((point) => point.id !== id);
}
