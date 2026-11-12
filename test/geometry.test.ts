import { describe, expect, it } from 'vitest';
import { alignOutline, clipPath, isFlat, lerpPoints, pathFor, sample, samplePoints, shapes, shapeForKey, IDENTITY, LOADING, REST, toPath } from '../src/index';

const entries = Object.entries(shapes);
const area = (p: Array<[number, number]>) => p.reduce((s, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return s + x * ny - nx * y; }, 0) / 2;

describe('every library shape', () => {
    it.each(entries)('%s: 144 finite points inside the box', (_, shape) => {
        const pts = sample(shape, { radius: 50 });
        expect(pts).toHaveLength(144);
        for (const [x, y] of pts) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(Math.abs(x)).toBeLessThanOrEqual(50.01);
            expect(Math.abs(y)).toBeLessThanOrEqual(50.01);
        }
    });

    it.each(entries)('%s: fills its box (touches the edge somewhere)', (_, shape) => {
        const pts = sample(shape, { radius: 1 });
        const reach = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y), Math.hypot(x, y))));
        expect(reach).toBeGreaterThan(0.9);
    });

    it.each(entries)('%s: aligned — positive winding, starting nearest due east', (_, shape) => {
        const pts = sample(shape);
        expect(area(pts)).toBeGreaterThan(0);
        const off = (p: [number, number]) => Math.abs(Math.atan2(p[1], p[0]));
        expect(pts.every((p) => off(pts[0]) <= off(p))).toBe(true);
    });

    it.each(entries)('%s: path is closed, with one command per point', (_, shape) => {
        const d = pathFor(shape, 100);
        expect(d.startsWith('M ')).toBe(true);
        expect(d.endsWith(' Z')).toBe(true);
        const cmds = d.match(/[CL]/g)!;
        expect(cmds.length).toBe(isFlat(shape) ? 143 : 144);
    });

    it('library paths are stable (snapshot)', () => {
        expect(Object.fromEntries(entries.map(([n, s]) => [n, pathFor(s, 100)]))).toMatchSnapshot();
    });
});

describe('geometry', () => {
    it('a circle is a circle', () => {
        for (const [x, y] of samplePoints(shapes.circle, 10)) expect(Math.hypot(x, y)).toBeCloseTo(10, 6);
    });

    it('the squircle touches the box at the sides and stays inside the corners', () => {
        const pts = samplePoints(REST, 1);
        expect(pts[0][0]).toBeCloseTo(1, 6);
        const diag = pts[18]; // 45°
        expect(diag[0]).toBeGreaterThan(Math.SQRT1_2);
        expect(diag[0]).toBeLessThan(1);
    });

    it('a rounded polygon keeps straight runs between its fillets', () => {
        const pts = samplePoints({ kind: 'polygon', n: 4, rotation: Math.PI / 4, round: 0.2 }, 1, 400);
        const right = pts.filter(([x]) => x > 0.7);
        const xs = right.map(([x]) => x);
        const max = Math.max(...xs);
        expect(xs.filter((x) => Math.abs(x - max) < 1e-6).length).toBeGreaterThan(40);
    });

    it('alignOutline reverses clockwise outlines and rotates to the east', () => {
        const pts = sample(shapes.gem, { align: false });
        const rev = [...pts].reverse();
        expect(alignOutline(rev)).toEqual(alignOutline(pts));
    });

    it('lerp goes end to end and can overshoot', () => {
        const a = sample(shapes.circle), b = sample(shapes.clover);
        expect(lerpPoints(a, b, 0)).toEqual(a);
        expect(lerpPoints(a, b, 1)).toEqual(b);
        const over = lerpPoints(a, b, 1.1)[0][0];
        expect(over - b[0][0]).toBeCloseTo((b[0][0] - a[0][0]) * 0.1, 6);
    });

    it('custom point counts', () => {
        expect(sample(shapes.gem, { points: 48 })).toHaveLength(48);
        expect(toPath(sample(shapes.pixelCircle, { points: 48 }), { curve: 'flat' }).match(/L/g)).toHaveLength(47);
    });

    it('clipPath is a cached path() value in the element box', () => {
        const v = clipPath(REST, 44);
        expect(v).toMatch(/^path\('M 44\.00 22\.00 /);
        expect(clipPath(REST, 44)).toBe(v);
    });

    it('the loading run is six smooth shapes', () => {
        expect(LOADING).toHaveLength(6);
        expect(LOADING.some(isFlat)).toBe(false);
    });
});

describe('shapeForKey', () => {
    it('is deterministic and walks on with an offset', () => {
        expect(shapeForKey('Timesheet')).toBe(shapeForKey('Timesheet'));
        const i = IDENTITY.indexOf(shapeForKey('Timesheet'));
        expect(shapeForKey('Timesheet', 1)).toBe(IDENTITY[(i + 1) % IDENTITY.length]);
        expect(shapeForKey('a', 0, ['x', 'y'] as const)).toMatch(/^[xy]$/);
    });
});

describe('smooth outlines (regression: corners at the lobes’ shoulders)', () => {
    // Change in the radius's slope between neighbouring samples, relative to
    // the samples' own spacing: a smooth curve changes slope a little at a
    // time; a corner changes it all at once.
    const kink = (k: number, a: number, n = 4000) => {
        const r = sample({ kind: 'lobed', k, a }, { points: n, align: false }).map(([x, y]) => Math.hypot(x, y));
        const slope = r.map((v, i) => (r[(i + 1) % n] - v) * n);
        return Math.max(...slope.map((s, i) => Math.abs(slope[(i + 1) % n] - s)));
    };
    const lobedShapes = entries.filter(([, s]) => s.kind === 'lobed') as Array<[string, { kind: 'lobed'; k: number; a: number }]>;
    it.each(lobedShapes)('%s has no corners', (_, s) => {
        // Halving the spacing should not leave a jump behind: with a corner the
        // slope change stays the same size however finely you sample.
        expect(kink(s.k, s.a, 8000)).toBeLessThan(kink(s.k, s.a, 4000) * 0.75);
    });
    it.each(lobedShapes)('%s: every lobe comes out the same size', (_, s) => {
        const radii = sample(s).map(([x, y]) => Math.hypot(x, y));
        const peaks = radii.filter((r, i) => r >= radii[(i + 1) % radii.length] && r >= radii[(i - 1 + radii.length) % radii.length]);
        expect(Math.max(...peaks) - Math.min(...peaks)).toBeLessThan(0.01);
    });
});
