/**
 * Shapes as pure geometry: no DOM, no framework.
 *
 * Every shape is sampled at the same number of points (144 by default), which
 * is what lets any two be interpolated point-for-point without tearing.
 * Most shapes are a polar radius function; the rest (rounded polygons, the
 * heart) are outlines walked densely and resampled by arc length, so they
 * morph with everything else.
 */

export type Point = [number, number];
export type Points = Point[];

/**
 * A shape description. Plain data, so it can be stored, hashed or sent
 * anywhere; `sample` turns it into points.
 */
export type Shape =
    | { kind: 'circle' }
    /**
     * k lobes of depth a. The profile flattens the peaks and sharpens the
     * valleys, so the lobes read as wide rounded petals with narrow clefts
     * rather than a star or a wobbly circle.
     */
    | { kind: 'lobed'; k: number; a: number }
    /** A stadium; `aspect` is its height relative to its half-length (1.1 ≈ 1.8:1). */
    | { kind: 'pill'; aspect: number }
    /** A superellipse |x|^n + |y|^n = 1; n defaults to 4, the soft rounded square. */
    | { kind: 'squircle'; n?: number }
    /**
     * A rounded polygon: either `n` regular sides with a vertex at `rotation`
     * (radians, SVG orientation: y down, so −π/2 is the top), or explicit
     * `vertices`. `round` is the corner rounding, one value or one per
     * vertex: 1 rounds a corner as far as it can go with an equally rounded
     * neighbour (tangent points meet mid-side), 2 as far as it can with
     * square neighbours. Concave corners are filleted the same way.
     * `stretch` scales x and y afterwards, `skew` shears x by y.
     * `flat` keeps every corner exactly (pixel shapes) and wants straight
     * lines between points: see `isFlat`.
     */
    | { kind: 'polygon'; n?: number; vertices?: Point[]; round: number | number[]; rotation?: number; stretch?: [number, number]; skew?: number; flat?: boolean }
    /** An ellipse, `ratio` = height over width, turned by `rotation`. */
    | { kind: 'ellipse'; ratio: number; rotation?: number }
    /** A sharp star: k points, valleys at `inner` of the radius. */
    | { kind: 'star'; k: number; inner: number }
    /** A sum of cosines on the radius, `terms` as [lobes, depth, phase?]. */
    | { kind: 'harmonic'; terms: Array<[number, number, number?]> }
    /**
     * A heart, point down: the classic parametric heart with its dip and its
     * point rounded. `round` is how much, as a share of the outline's length
     * (0 keeps both sharp; default 0.035).
     */
    | { kind: 'heart'; round?: number };

/** 144 divides evenly by 2, 3, 4, 6, 8, 9, 12 and 16, so lobes that many sample alike, and leaves 9+ points per lobe even at 16. */
export const DEFAULT_POINTS = 144;

/** Whether a shape wants straight lines between its points (pixel shapes). */
export const isFlat = (shape: Shape): boolean => shape.kind === 'polygon' && Boolean(shape.flat);

// Wide petals, narrow clefts, smooth all the way round. u runs 0 (the bottom
// of a cleft) to 1 (the top of a petal); a concave power of it holds the
// petal up for most of the way and drops into the cleft late. The small
// offset E keeps the power's slope finite at u = 0, so the cleft is a tight
// round notch rather than a pinched point. (The profile this replaced,
// f^0.55 above zero and −|f|^1.6 below, met at f = 0 with a vertical tangent
// on one side and a flat one on the other: a visible corner at every
// shoulder once a shape is drawn larger than an icon.)
const PETAL = 0.6, E = 0.04;
const E0 = Math.pow(E, PETAL), E1 = Math.pow(1 + E, PETAL) - E0;
function lobedRadius(k: number, a: number, t: number): number {
    const u = (1 + Math.cos(k * t)) / 2;
    return 1 + a * (2 * (Math.pow(u + E, PETAL) - E0) / E1 - 1);
}

// Distance along the ray at angle t to the edge of a stadium of half-length
// L and cap radius h. Monotone in s, so a short bisection finds it.
function pillRadius(aspect: number, t: number): number {
    const h = aspect / 2, L = 1 - h;
    const dx = Math.cos(t), dy = Math.sin(t);
    const dist = (s: number) => { const x = s * dx, y = s * dy; const cx = Math.max(-L, Math.min(L, x)); return Math.hypot(x - cx, y); };
    let lo = 0, hi = 1.5;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (dist(mid) < h) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}

function starRadius(k: number, inner: number, t: number): number {
    const phase = ((t * k) / (Math.PI * 2)) % 1;
    const tri = 1 - Math.abs(phase * 2 - 1);
    return inner + (1 - inner) * tri;
}

function harmonicRadius(terms: Array<[number, number, number?]>, t: number): number {
    return terms.reduce((r, [k, a, phase]) => r + a * Math.cos(k * t + (phase || 0)), 1);
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const len = (a: Point) => Math.hypot(a[0], a[1]);
const norm = (a: Point): Point => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

/** A closed outline walked densely, resampled to `count` points at equal arc length. */
function resampleClosed(dense: Points, count: number): Points {
    const m = dense.length;
    const seg = dense.map((p, i) => len(sub(dense[(i + 1) % m], p)));
    const perimeter = seg.reduce((a, b) => a + b, 0);
    const out: Points = [];
    let i = 0, walked = 0;
    for (let j = 0; j < count; j++) {
        const target = (j / count) * perimeter;
        while (walked + seg[i] < target && i < m - 1) { walked += seg[i]; i++; }
        const u = seg[i] > 0 ? (target - walked) / seg[i] : 0;
        const a = dense[i], b = dense[(i + 1) % m];
        out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
}

/**
 * Round a closed outline's sharp points by averaging each point with its
 * neighbours along the outline (a Gaussian `sigma` wide, as a share of the
 * outline's length). The points must be evenly spaced. Smooth runs, like a
 * heart's lobes, barely move; a cusp becomes a curve about `sigma` across.
 */
function smoothClosed(pts: Points, sigma: number): Points {
    const n = pts.length, s = sigma * n;
    if (!(s > 0.5)) return pts;
    const reach = Math.ceil(s * 3);
    const w = Array.from({ length: reach * 2 + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * s * s)));
    const total = w.reduce((a, b) => a + b, 0);
    return pts.map((_, i) => {
        let x = 0, y = 0;
        for (let j = -reach; j <= reach; j++) { const p = pts[(i + j + n) % n], k = w[j + reach]; x += p[0] * k; y += p[1] * k; }
        return [x / total, y / total] as Point;
    });
}

/** Shear, stretch, then centre on the bounding box and fit to the unit. */
function finish(out: Points, shape: { skew?: number; stretch?: [number, number] }): Points {
    const sk = shape.skew || 0, [sx, sy] = shape.stretch || [1, 1];
    const shaped: Points = out.map(([x, y]) => [(x + sk * y) * sx, y * sy]);
    const xs = shaped.map((p) => p[0]), ys = shaped.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const centred: Points = shaped.map(([x, y]) => [x - cx, y - cy]);
    const maxR = Math.max(...centred.map(([x, y]) => Math.hypot(x, y))) || 1;
    return centred.map(([x, y]) => [x / maxR, y / maxR]);
}

/**
 * The rounded polygon's outline. Corner k: interior angle α, rounding radius
 * r, tangent length ℓ = r / tan(α/2) along each edge; the arc's centre lies on
 * the bisector at r / sin(α/2). Two corners sharing an edge are scaled back
 * together when their tangent lengths would add to more than the edge.
 */
function polygonPoints(shape: Extract<Shape, { kind: 'polygon' }>, count: number): Points {
    const n = shape.vertices ? shape.vertices.length : Math.max(3, shape.n || 4);
    const rot = shape.rotation || 0;
    const V: Points = shape.vertices
        ? shape.vertices.map(([x, y]) => [x, y])
        : Array.from({ length: n }, (_, k) => { const t = rot + (k / n) * Math.PI * 2; return [Math.cos(t), Math.sin(t)] as Point; });
    const rounds = Array.from({ length: n }, (_, k) => Array.isArray(shape.round) ? (shape.round[k] ?? 0) : shape.round);
    const at = (k: number) => V[((k % n) + n) % n];
    const alpha = V.map((_, k) => {
        const a = norm(sub(at(k - 1), at(k))), b = norm(sub(at(k + 1), at(k)));
        return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    });
    const side = V.map((_, k) => len(sub(at(k + 1), at(k))));
    const ell = V.map((_, k) => rounds[k] * Math.min(side[k], side[(k - 1 + n) % n]) / 2);
    for (let k = 0; k < n; k++) {
        const j = (k + 1) % n, total = ell[k] + ell[j];
        if (total > side[k] && total > 0) { const f = side[k] / total; ell[k] *= f; ell[j] *= f; }
    }
    const dense: Points = [];
    for (let k = 0; k < n; k++) {
        const P = at(k), inDir = norm(sub(at(k - 1), P)), outDir = norm(sub(at(k + 1), P));
        const l = ell[k];
        if (l <= 1e-6) { dense.push([P[0], P[1]]); continue; }
        const r = l * Math.tan(alpha[k] / 2);
        const bis = norm([inDir[0] + outDir[0], inDir[1] + outDir[1]]);
        const C: Point = [P[0] + bis[0] * r / Math.sin(alpha[k] / 2), P[1] + bis[1] * r / Math.sin(alpha[k] / 2)];
        const T1: Point = [P[0] + inDir[0] * l, P[1] + inDir[1] * l];
        const T2: Point = [P[0] + outDir[0] * l, P[1] + outDir[1] * l];
        const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
        let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 24)));
        for (let i = 0; i <= steps; i++) { const a = a1 + d * (i / steps); dense.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); }
    }
    if (shape.flat) {
        // Keep every corner; spread the remaining points along the edges by length.
        const corners = dense, cn = corners.length;
        const segL = corners.map((p, i) => len(sub(corners[(i + 1) % cn], p)));
        const per = segL.reduce((a, b) => a + b, 0) || 1;
        const extra = Math.max(0, count - cn);
        const perEdge = segL.map((l) => Math.floor((l / per) * extra));
        let placed = perEdge.reduce((a, b) => a + b, 0);
        for (let i = 0; placed < extra; i = (i + 1) % cn) { perEdge[i]++; placed++; }
        const flatPts: Points = [];
        corners.forEach((p, i) => {
            flatPts.push([p[0], p[1]]);
            const q = corners[(i + 1) % cn];
            for (let j = 1; j <= perEdge[i]; j++) { const u = j / (perEdge[i] + 1); flatPts.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
        });
        return finish(flatPts.slice(0, count), shape);
    }
    return finish(resampleClosed(dense, count), shape);
}

/**
 * The shape as `count` points around the origin, fitted to the square box
 * [−radius, radius]² (radius is half the box: a circle touches all four
 * sides, a squircle's flat sides do too).
 * Raw: in the order the shape's own construction produces. Use `sample` for
 * points aligned to morph with any other shape.
 */
export function samplePoints(shape: Shape, radius = 1, count = DEFAULT_POINTS): Points {
    if (shape.kind === 'polygon') {
        return polygonPoints(shape, count).map(([x, y]) => [x * radius, y * radius]);
    }
    if (shape.kind === 'heart') {
        const dense: Points = Array.from({ length: 360 }, (_, i) => {
            const t = (i / 360) * Math.PI * 2;
            return [16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] as Point;
        });
        const even = smoothClosed(resampleClosed(dense, 1440), shape.round ?? 0.035);
        return finish(resampleClosed(even, count), {}).map(([x, y]) => [x * radius, y * radius]);
    }
    if (shape.kind === 'star' || shape.kind === 'harmonic') {
        const unit = Array.from({ length: count }, (_, i) => {
            const t = (i / count) * Math.PI * 2;
            return shape.kind === 'star' ? starRadius(shape.k, shape.inner, t) : harmonicRadius(shape.terms, t);
        });
        const fit = 1 / (Math.max(...unit) || 1);
        return unit.map((u, i) => { const t = (i / count) * Math.PI * 2; const r = radius * u * fit; return [Math.cos(t) * r, Math.sin(t) * r] as Point; });
    }
    if (shape.kind === 'ellipse') {
        const rot = shape.rotation || 0, ratio = shape.ratio;
        const fit = 1 / Math.max(1, ratio);
        return Array.from({ length: count }, (_, i) => {
            const t = (i / count) * Math.PI * 2;
            const x = Math.cos(t) * fit, y = Math.sin(t) * ratio * fit;
            return [(x * Math.cos(rot) - y * Math.sin(rot)) * radius, (x * Math.sin(rot) + y * Math.cos(rot)) * radius] as Point;
        });
    }
    const pts: Points = [];
    for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        let unit: number;
        if (shape.kind === 'circle') unit = 1;
        else if (shape.kind === 'lobed') unit = lobedRadius(shape.k, shape.a, t) / (1 + shape.a);
        else if (shape.kind === 'pill') unit = pillRadius(shape.aspect, t);
        else {
            const e = shape.n ?? 4;
            unit = Math.pow(Math.pow(Math.abs(Math.cos(t)), e) + Math.pow(Math.abs(Math.sin(t)), e), -1 / e);
        }
        pts.push([Math.cos(t) * radius * unit, Math.sin(t) * radius * unit]);
    }
    return pts;
}

/**
 * Points set up to morph with any other outline: running the same way round,
 * starting nearest due east. Outlines sampled from different starts or in
 * opposite directions send points across the middle mid-morph, so a shape
 * crumples or winds into a spiral on its way.
 */
export function alignOutline(points: Points): Points {
    const area = points.reduce((sum, [x, y], i) => {
        const [nx, ny] = points[(i + 1) % points.length];
        return sum + x * ny - nx * y;
    }, 0);
    const ordered = area < 0 ? [...points].reverse() : points;
    const off = (p: Point) => Math.abs(Math.atan2(p[1], p[0]));
    const start = ordered.reduce((best, p, i) => (off(p) < off(ordered[best]) ? i : best), 0);
    return [...ordered.slice(start), ...ordered.slice(0, start)];
}

export interface SampleOptions {
    /** Half the box the shape is fitted to. Default 1. */
    radius?: number;
    /** How many points. Every shape that morphs together needs the same count. Default 144. */
    points?: number;
    /** Align winding and start point (see `alignOutline`). Default true. */
    align?: boolean;
}

/** The shape as points around the origin, ready to morph. */
export function sample(shape: Shape, { radius = 1, points = DEFAULT_POINTS, align = true }: SampleOptions = {}): Points {
    const pts = samplePoints(shape, radius, points);
    return align ? alignOutline(pts) : pts;
}

const f2 = (n: number) => n.toFixed(2);

/** Closed Catmull-Rom → cubic Bézier path through every point, so the outline stays smooth and true to size. */
export function pathFrom(pts: Points, cx = 0, cy = 0): string {
    const n = pts.length;
    const P = cx || cy ? pts.map(([x, y]) => [x + cx, y + cy] as Point) : pts;
    let d = `M ${f2(P[0][0])} ${f2(P[0][1])}`;
    for (let i = 0; i < n; i++) {
        const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${f2(c1x)} ${f2(c1y)} ${f2(c2x)} ${f2(c2y)} ${f2(p2[0])} ${f2(p2[1])}`;
    }
    return d + ' Z';
}

/** Straight lines between the points: for flat (pixel) shapes. */
export function pathFromFlat(pts: Points, cx = 0, cy = 0): string {
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${f2(x + cx)} ${f2(y + cy)}`).join(' ') + ' Z';
}

export interface PathOptions {
    /** Offset of the centre. */
    cx?: number;
    cy?: number;
    /** 'smooth' (Catmull-Rom curves) or 'flat' (straight lines). Default smooth. */
    curve?: 'smooth' | 'flat';
}

/** An SVG path string for some points. */
export function toPath(pts: Points, { cx = 0, cy = 0, curve = 'smooth' }: PathOptions = {}): string {
    return curve === 'flat' ? pathFromFlat(pts, cx, cy) : pathFrom(pts, cx, cy);
}

/**
 * The path for a shape held still, centred in a `size`×`size` box with its
 * top-left at the origin (so it fits `viewBox="0 0 size size"` or an element of that size).
 */
export function pathFor(shape: Shape, size: number, options: { points?: number } = {}): string {
    const r = size / 2;
    const pts = sample(shape, { radius: r, points: options.points });
    return toPath(pts, { cx: r, cy: r, curve: isFlat(shape) ? 'flat' : 'smooth' });
}

/** Point-for-point interpolation between two sampled shapes. u may overshoot [0, 1] (springs do). */
export const lerpPoints = (a: Points, b: Points, u: number): Points =>
    a.map((p, j) => [p[0] + (b[j][0] - p[0]) * u, p[1] + (b[j][1] - p[1]) * u]);

/** Rotate points about the origin by `angle` radians. */
export const rotatePoints = (pts: Points, angle: number): Points => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};

const clipCache = new Map<string, string>();

/**
 * A shape as a CSS `clip-path` value for an element `size` px square,
 * e.g. `el.style.clipPath = clipPath(shapes.squircle, 44)`. Cached.
 */
export function clipPath(shape: Shape, size: number): string {
    const key = `${JSON.stringify(shape)}@${size}`;
    const hit = clipCache.get(key);
    if (hit) return hit;
    const value = `path('${pathFor(shape, size)}')`;
    if (clipCache.size > 500) clipCache.clear();
    clipCache.set(key, value);
    return value;
}

/**
 * The staircase outline of a pixel shape from its rows: each row is
 * [left, right] in cell units, top row first.
 */
export function pixelRows(rows: Array<[number, number]>): Points {
    const v: Points = [];
    rows.forEach(([, r], i) => { v.push([r, i], [r, i + 1]); });
    for (let i = rows.length - 1; i >= 0; i--) { const l = rows[i][0]; v.push([l, i + 1], [l, i]); }
    return v.filter((p, i) => i === 0 || p[0] !== v[i - 1][0] || p[1] !== v[i - 1][1]);
}
