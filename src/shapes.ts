/**
 * The named shape library, modelled on Material 3 Expressive's shapes, plus
 * constructors for making your own. All plain data.
 */

import { pixelRows, type Point, type Shape } from './geometry.js';

const TOP = -Math.PI / 2;

/** k lobes of depth a (0.1–0.35 reads well). */
export const lobed = (k: number, a: number): Shape => ({ kind: 'lobed', k, a });
/** A rounded polygon; see the `polygon` kind of `Shape`. */
export const polygon = (options: Omit<Extract<Shape, { kind: 'polygon' }>, 'kind'>): Shape => ({ kind: 'polygon', ...options });
/** A regular n-gon, point up, corners rounded by `round` (0–1). */
export const regular = (n: number, round = 0.45, rotation = TOP): Shape => ({ kind: 'polygon', n, rotation, round });
/** A stadium; `aspect` is height over half-length. */
export const pill = (aspect = 1.1): Shape => ({ kind: 'pill', aspect });
/** A superellipse |x|^n + |y|^n = 1. */
export const squircle = (n = 4): Shape => ({ kind: 'squircle', n });
export const ellipse = (ratio: number, rotation = 0): Shape => ({ kind: 'ellipse', ratio, rotation });
export const star = (k: number, inner: number): Shape => ({ kind: 'star', k, inner });
export const harmonic = (...terms: Array<[number, number, number?]>): Shape => ({ kind: 'harmonic', terms });
/** A heart; `round` rounds its dip and point (0 keeps them sharp). */
export const heart = (round?: number): Shape => (round === undefined ? { kind: 'heart' } : { kind: 'heart', round });
/** A pixel shape from rows of [left, right] cells, top row first. Drawn with straight lines; it can't morph smoothly. */
export const pixel = (rows: Array<[number, number]>): Shape => ({ kind: 'polygon', flat: true, round: 0, vertices: pixelRows(rows) });
/** A polygon from explicit vertices (any box; it is centred and fitted). */
export const outline = (vertices: Point[], round: number | number[]): Shape => ({ kind: 'polygon', vertices, round });

export const shapes = {
    circle: { kind: 'circle' } as Shape,
    /** The soft rounded square: the resting shape. */
    squircle: squircle(4),
    softSquare: squircle(4.5),
    square: { kind: 'polygon', n: 4, rotation: Math.PI / 4, round: 0.6 } as Shape,
    slanted: { kind: 'polygon', n: 4, rotation: Math.PI / 4, round: 0.55, skew: -0.16 } as Shape,
    arch: { kind: 'polygon', n: 4, rotation: Math.PI / 4, round: [0.3, 0.3, 1, 1] } as Shape,
    semicircle: outline([[1, 0.5], [-1, 0.5], [-1, -0.5], [1, -0.5]], [0.2, 0.2, 1, 1]),
    oval: ellipse(1.35, -Math.PI / 5),
    pill: pill(1.1),
    triangle: regular(3, 0.4),
    fan: { kind: 'polygon', n: 4, rotation: Math.PI / 4, round: [0.15, 0.15, 2, 0.15] } as Shape,
    diamond: { kind: 'polygon', n: 4, rotation: 0, round: 0.4 } as Shape,
    clamshell: { kind: 'polygon', n: 6, rotation: 0, round: 0.55, stretch: [1.15, 0.82] } as Shape,
    pentagon: regular(5, 0.45),
    gem: regular(7, 0.5),
    arrow: outline([[0, -1], [1, 0.85], [0, 0.68], [-1, 0.85]], [0.5, 0.35, 1.4, 0.35]),
    ghost: outline([[1, -1], [1, 1], [0, 0.62], [-1, 1], [-1, -1]], [1, 0.35, 0.8, 0.35, 1]),
    bun: outline([[-0.85, -1], [0.85, -1], [0.42, 0], [0.85, 1], [-0.85, 1], [-0.42, 0]], [1, 1, 1, 1, 1, 1]),
    heart: heart(),
    boom: star(15, 0.56),
    softBoom: lobed(16, 0.34),
    puffyDiamond: harmonic([4, 0.17], [8, 0.11]),
    pixelCircle: pixel([[-2, 2], [-4, 4], [-5, 5], [-5, 5], [-6, 6], [-6, 6], [-6, 6], [-6, 6], [-5, 5], [-5, 5], [-4, 4], [-2, 2]]),
    pixelTriangle: pixel([[-6, -4], [-6, -2], [-6, 0], [-6, 2], [-6, 4], [-6, 6], [-6, 6], [-6, 4], [-6, 2], [-6, 0], [-6, -2], [-6, -4]]),
    cookie: lobed(8, 0.18),
    cookie4: lobed(4, 0.14),
    cookie6: lobed(6, 0.16),
    cookie7: lobed(7, 0.17),
    cookie9: lobed(9, 0.16),
    cookie12: lobed(12, 0.12),
    scallops: lobed(9, 0.1),
    sunny: lobed(9, 0.2),
    verySunny: lobed(8, 0.34),
    sunburst: lobed(8, 0.24),
    clover: lobed(4, 0.3),
    clover8: lobed(8, 0.26),
    flower: lobed(8, 0.32),
    puffy: lobed(10, 0.22),
    fivePoint: lobed(5, 0.28),
    softBurst: lobed(10, 0.28),
    burst: lobed(7, 0.26),
} satisfies Record<string, Shape>;

export type ShapeName = keyof typeof shapes;

/** Where a settled shape rests. */
export const REST: Shape = shapes.squircle;

/** The loading run: the shapes a busy indicator morphs through, in order. */
export const LOADING: ReadonlyArray<Shape> = [
    shapes.circle,
    shapes.burst,
    shapes.clover,
    shapes.pill,
    shapes.fivePoint,
    shapes.sunny,
];

/**
 * Shapes an icon reads well inside, for identity badges: no spikes (a spike
 * behind a small icon reads as a warning), nothing without a centre.
 */
export const IDENTITY: ReadonlyArray<ShapeName> = [
    'cookie', 'pentagon', 'clover', 'square', 'sunny', 'gem', 'cookie6', 'diamond', 'flower', 'clamshell',
    'puffy', 'arch', 'cookie4', 'oval', 'softBurst', 'slanted', 'cookie12', 'fan', 'clover8', 'verySunny', 'cookie7', 'cookie9',
    'puffyDiamond', 'softBoom', 'pixelCircle',
];

const hashKey = (key: string | null | undefined): number => {
    const str = String(key || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
};

/**
 * A stable shape for a key (a name, an id): the same key always lands on the
 * same shape. `offset` walks on from there, so a group of rows that share a
 * key read as siblings rather than copies.
 */
export function shapeForKey<N extends string = ShapeName>(key: string | null | undefined, offset = 0, list: ReadonlyArray<N> = IDENTITY as unknown as ReadonlyArray<N>): N {
    const n = list.length;
    return list[((hashKey(key) + Math.max(0, Math.floor(offset))) % n + n) % n];
}
