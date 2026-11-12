/**
 * Drivers for real elements, no framework: morph an element's own silhouette
 * (`clip-path`) or an SVG `<path>`'s `d` from one shape to another, loop a
 * busy element through the loading run, settle a new one into its resting
 * shape.
 *
 * Every driver:
 *  - remembers the frame on screen, so a morph interrupted by another starts
 *    from where it is instead of snapping;
 *  - puts its first frame on synchronously (a hidden tab is served no
 *    animation frames, and the shape should be right before the first one);
 *  - has a timer backstop that lands the final shape if frames never come;
 *  - honours `prefers-reduced-motion` (this is rAF; no stylesheet reaches it);
 *  - gives the element back its own styles when asked to restore.
 */

import { DEFAULT_POINTS, isFlat, lerpPoints, rotatePoints, sample, toPath, type Points, type Shape } from './geometry.js';
import { easeInOutCubic, MORPH_MS, prefersReducedMotion, SETTLE_MS, SPIN_MS, spring, SPRINGS, type SpringConfig } from './motion.js';
import { LOADING, REST, shapes as library } from './shapes.js';

export type MorphTarget = 'clip' | 'path';

/**
 * Whether this browser can morph an SVG path with CSS alone (a transition on
 * the `d` property, as `shapes.css` sets up). Chromium and Firefox can;
 * Safari and WKWebView cannot (checked on macOS 26.2), so use `morph()` there.
 */
export const supportsCSSPathMorph = (): boolean =>
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('d', 'path("M0 0 L1 0 L1 1 Z")');
type Target = HTMLElement | SVGElement;

export interface DrawOptions {
    /**
     * 'clip' sets the element's `clip-path`; 'path' sets an SVG path's `d`.
     * Default: 'path' for a `<path>`, otherwise 'clip'.
     */
    target?: MorphTarget;
    /**
     * Box size the shape is fitted to. For 'clip', px (default: the element's
     * smaller side, measured). For 'path', user units (default 100, matching
     * `viewBox="0 0 100 100"`).
     */
    size?: number;
    /** Points per outline; every shape that morphs together needs the same count. Default 144. */
    points?: number;
}

export interface MorphOptions extends DrawOptions {
    /** 'spring' (default): interruptible, may overshoot a touch. 'tween': a timed in-out. */
    via?: 'spring' | 'tween';
    /** Spring for `via: 'spring'`. Default SPRINGS.fastSpatial. */
    spring?: SpringConfig;
    /** Duration for `via: 'tween'`, ms. Default 720. */
    duration?: number;
    /** Easing for `via: 'tween'`. */
    easing?: (u: number) => number;
    /** Jump straight there. Default: the reduced-motion preference. */
    instant?: boolean;
    /** Called on the frame the shape lands (not when stopped or replaced). */
    onDone?: () => void;
}

export interface Morph {
    /** Resolves when the shape has landed (or the morph was stopped or replaced). */
    finished: Promise<void>;
    /** Stop where it is. */
    stop(): void;
}

interface State {
    pts: Points;
    stop?: () => void;
    finish?: () => void;
    restoreClip?: string;
}
const states = new WeakMap<Target, State>();

const isPath = (el: Target) => el.namespaceURI === 'http://www.w3.org/2000/svg' && el.localName === 'path';

function geometry(el: Target, opts: DrawOptions) {
    const target: MorphTarget = opts.target ?? (isPath(el) ? 'path' : 'clip');
    let w: number, h: number;
    if (target === 'path') {
        w = h = opts.size ?? 100;
    } else {
        const box = el.getBoundingClientRect();
        w = box.width || (el as HTMLElement).offsetWidth || 0;
        h = box.height || (el as HTMLElement).offsetHeight || 0;
        if (opts.size) { if (!w) w = opts.size; if (!h) h = opts.size; }
    }
    const size = opts.size ?? Math.min(w, h);
    return { target, size, cx: w / 2, cy: h / 2, points: opts.points ?? DEFAULT_POINTS };
}

function draw(el: Target, pts: Points, g: ReturnType<typeof geometry>, flat = false) {
    const d = toPath(pts, { cx: g.cx, cy: g.cy, curve: flat ? 'flat' : 'smooth' });
    if (g.target === 'path') el.setAttribute('d', d);
    else el.style.clipPath = `path('${d}')`;
}

function state(el: Target): State {
    let s = states.get(el);
    if (!s) { s = { pts: [], restoreClip: el.style.clipPath }; states.set(el, s); }
    return s;
}

/** Draw a shape at once, no animation. Later morphs start from it. */
export function setShape(el: Target, shape: Shape, opts: DrawOptions = {}): void {
    const s = state(el);
    s.stop?.();
    const g = geometry(el, opts);
    if (!(g.size > 0)) return;
    s.pts = sample(shape, { radius: g.size / 2, points: g.points });
    draw(el, s.pts, g, isFlat(shape));
}

/**
 * Morph to `shape` from whatever is on screen. If the element has no shape
 * yet it starts as a circle. Calling again mid-morph carries on from the
 * current frame instead of snapping.
 */
export function morph(el: Target, shape: Shape, opts: MorphOptions = {}): Morph {
    const s = state(el);
    const g = geometry(el, opts);
    if (!(g.size > 0)) return { finished: Promise.resolve(), stop() {} };
    const radius = g.size / 2;
    const to = sample(shape, { radius, points: g.points });
    const from = s.pts.length === to.length ? s.pts : sample(library.circle, { radius, points: g.points });
    s.stop?.();

    let resolve!: () => void;
    const finished = new Promise<void>((r) => { resolve = r; });
    let backstop: ReturnType<typeof setTimeout> | undefined;
    const land = () => {
        clearTimeout(backstop);
        s.pts = to; s.stop = undefined;
        draw(el, to, g, isFlat(shape));
        opts.onDone?.();
        resolve();
    };
    const frame = (u: number) => { s.pts = lerpPoints(from, to, u); draw(el, s.pts, g); };

    if (opts.instant ?? prefersReducedMotion()) { land(); return { finished, stop() {} }; }

    let cancel: () => void;
    if (opts.via === 'tween') {
        const duration = opts.duration ?? MORPH_MS, ease = opts.easing ?? easeInOutCubic;
        let start = -1, raf = 0;
        const tick = (now: number) => {
            if (start < 0) start = now;
            const u = Math.min(1, (now - start) / duration);
            if (u >= 1) return land();
            frame(ease(u));
            raf = requestAnimationFrame(tick);
        };
        frame(0);
        raf = requestAnimationFrame(tick);
        cancel = () => cancelAnimationFrame(raf);
        backstop = setTimeout(land, duration + 250);
    } else {
        frame(0);
        cancel = spring({ from: 0, to: 1, ...(opts.spring ?? SPRINGS.fastSpatial), precision: 0.002, instant: false, onUpdate: frame, onDone: land });
        backstop = setTimeout(land, 2000);
    }
    const stop = () => { cancel(); clearTimeout(backstop); s.stop = undefined; resolve(); };
    s.stop = stop;
    return { finished, stop };
}

/** Stop any animation and give the element its own clip-path (or leave a path's `d` as it is). */
export function restore(el: Target): void {
    const s = states.get(el);
    s?.stop?.();
    if (!isPath(el)) el.style.clipPath = s?.restoreClip ?? '';
    states.delete(el);
}

export interface LoopOptions extends DrawOptions {
    /** The run of shapes, in order. Default LOADING. */
    shapes?: ReadonlyArray<Shape>;
    /** ms per shape. Default 720. */
    morphMs?: number;
    /** ms per full turn; 0 for no spin. Default 3200. */
    spinMs?: number;
}

export interface Loop {
    /** Stop and restore the element (see `restore`). */
    stop(): void;
    /** Stop the loop and morph from the frame on screen to a resting shape. */
    rest(shape?: Shape, opts?: MorphOptions): Promise<void>;
}

/**
 * Morph continuously through a run of shapes while turning: the busy state.
 * Under reduced motion the element takes the resting shape and holds it.
 */
export function loop(el: Target, opts: LoopOptions = {}): Loop {
    const s = state(el);
    s.stop?.();
    const g = geometry(el, opts);
    const run = opts.shapes ?? LOADING, morphMs = opts.morphMs ?? MORPH_MS, spinMs = opts.spinMs ?? SPIN_MS;
    const radius = g.size / 2;
    const frames = run.map((sh) => sample(sh, { radius, points: g.points }));
    const api: Loop = {
        stop: () => restore(el),
        rest: (shape = REST, mopts = {}) => morph(el, shape, { ...opts, ...mopts }).finished,
    };
    if (!(g.size > 0) || !frames.length) return api;
    if (prefersReducedMotion()) { setShape(el, REST, opts); return api; }

    let raf = 0, t0 = -1, stopped = false;
    const at = (elapsed: number) => {
        const seg = Math.floor(elapsed / morphMs), u = (elapsed - seg * morphMs) / morphMs;
        const a = frames[seg % frames.length], b = frames[(seg + 1) % frames.length];
        const angle = spinMs ? (elapsed / spinMs) * Math.PI * 2 : 0;
        s.pts = rotatePoints(lerpPoints(a, b, easeInOutCubic(u)), angle);
        draw(el, s.pts, g);
    };
    const tick = (now: number) => {
        if (stopped) return;
        if (t0 < 0) t0 = now;
        at(now - t0);
        raf = requestAnimationFrame(tick);
    };
    at(0);
    raf = requestAnimationFrame(tick);
    s.stop = () => { stopped = true; cancelAnimationFrame(raf); s.stop = undefined; };
    return api;
}

export interface SettleOptions extends MorphOptions {
    /** Arrive as this shape. Default four wide lobes, which still read at 32px. */
    from?: Shape;
    /** Settle into this one. Default REST. */
    to?: Shape;
    /** Keep the final clip-path instead of handing the element back. Default false. */
    keep?: boolean;
}

/**
 * A one-shot arrival: the element appears as `from` and settles into `to`,
 * then (unless `keep`) its inline clip-path is cleared so its own stylesheet
 * shape takes over. Skipped under reduced motion and for unmeasurable elements.
 */
export function settle(el: Target, { from = library.cookie4, to = REST, keep = false, ...opts }: SettleOptions = {}): Promise<void> {
    if (prefersReducedMotion()) return Promise.resolve();
    const g = geometry(el, opts);
    if (!(g.size > 1)) return Promise.resolve();
    setShape(el, from, opts);
    // Hand the element back on the frame the shape lands, not a microtask
    // later, so nothing can paint (or test) the inline clip in between.
    const done = opts.onDone;
    const m = morph(el, to, { via: 'tween', duration: SETTLE_MS, ...opts, instant: false, onDone: () => { if (!keep) restore(el); done?.(); } });
    return m.finished;
}

export interface LoaderOptions {
    /** px. Default 48. */
    size?: number;
    shapes?: ReadonlyArray<Shape>;
    /** Seconds per shape. Default 0.72. */
    step?: number;
    /** Seconds per turn; 0 for none. Default 3.2. */
    spin?: number;
    /** Accessible label. Default "Loading". */
    label?: string;
    className?: string;
    /** Fill; default currentColor. */
    fill?: string;
}

/**
 * A loading indicator as an HTML string, animated by SVG itself (SMIL), so it
 * costs no JavaScript per frame. Under reduced motion it is the resting shape, still.
 */
export function loaderSVG({ size = 48, shapes = LOADING, step = 0.72, spin = 3.2, label = 'Loading', className = '', fill = 'currentColor' }: LoaderOptions = {}): string {
    const r = 21; // in a 48-unit box, leaving room for the spin
    const paths = shapes.map((sh) => toPath(sample(sh, { radius: r })));
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const still = prefersReducedMotion();
    const n = paths.length;
    const morphAnim = still || n < 2 ? '' : `<animate attributeName="d" dur="${(n * step).toFixed(2)}s" repeatCount="indefinite" calcMode="spline" keyTimes="${Array.from({ length: n + 1 }, (_, i) => (i / n).toFixed(4)).join(';')}" keySplines="${Array(n).fill('0.65 0 0.35 1').join(';')}" values="${[...paths, paths[0]].join(';')}"/>`;
    const spinAnim = still || !spin ? '' : `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${spin}s" repeatCount="indefinite"/>`;
    const d = still ? toPath(sample(REST, { radius: r })) : paths[0];
    return `<span class="${esc(`sm-loader ${className}`.trim())}" role="progressbar" aria-label="${esc(label)}" style="display:inline-block;width:${size}px;height:${size}px;line-height:0"><svg viewBox="-24 -24 48 48" width="${size}" height="${size}" aria-hidden="true"><g>${spinAnim}<path fill="${esc(fill)}" d="${d}">${morphAnim}</path></g></svg></span>`;
}
