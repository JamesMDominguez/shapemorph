/**
 * Motion: springs that keep the hand's momentum, the M3 Expressive spring
 * tokens, and those springs as CSS `linear()` easings.
 */

export interface SpringConfig {
    /** Stiffness k (mass 1). Higher is faster. */
    stiffness: number;
    /** Damping ratio ζ: 1 never overshoots, lower bounces. */
    damping: number;
}

/**
 * M3 Expressive's motion scheme. Spatial springs bounce a little and are for
 * things that move or change shape; effects springs don't, for fades and colour.
 */
export const SPRINGS = {
    fastSpatial: { stiffness: 800, damping: 0.6 },
    defaultSpatial: { stiffness: 380, damping: 0.8 },
    slowSpatial: { stiffness: 200, damping: 0.8 },
    fastEffects: { stiffness: 3800, damping: 1 },
    defaultEffects: { stiffness: 1600, damping: 1 },
    slowEffects: { stiffness: 800, damping: 1 },
} as const satisfies Record<string, SpringConfig>;

export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface SpringOptions extends Partial<SpringConfig> {
    from: number;
    to: number;
    /** Starting velocity in units per second, e.g. a flick's speed. */
    velocity?: number;
    /** Settled once within this distance of `to` (and moving slower than 10× it per second). Default 0.5. */
    precision?: number;
    onUpdate: (value: number, velocity: number) => void;
    onDone?: () => void;
    /** Jump straight to `to`. Defaults to the reduced-motion preference. */
    instant?: boolean;
}

/**
 * Run a spring from `from` to `to` on animation frames. Unlike a timed curve
 * it starts from the current velocity, so a flick keeps its momentum.
 * Returns a function that stops it.
 */
export function spring({ from, to, velocity = 0, stiffness = 380, damping = 0.8, precision = 0.5, onUpdate, onDone, instant }: SpringOptions): () => void {
    if (instant ?? prefersReducedMotion()) { onUpdate(to, 0); onDone?.(); return () => {}; }
    let x = from - to, v = velocity, last = -1, id = 0, stopped = false;
    const c = 2 * damping * Math.sqrt(stiffness);
    const step = (now: number) => {
        if (stopped) return;
        if (last < 0) last = now - 1000 / 60;
        // Four substeps of semi-implicit Euler; a long frame is capped so a
        // stalled tab doesn't fling the value.
        const dt = Math.min(0.05, (now - last) / 1000) / 4; last = now;
        for (let k = 0; k < 4; k++) { v += (-stiffness * x - c * v) * dt; x += v * dt; }
        if (Math.abs(x) < precision && Math.abs(v) < precision * 10) { onUpdate(to, 0); onDone?.(); return; }
        onUpdate(to + x, v);
        id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(id); };
}

/**
 * A spring from 0 to 1 at rest, as a CSS easing and the duration it needs:
 * `transition: transform ${duration}ms ${easing}`.
 */
export function springCurve({ stiffness, damping }: SpringConfig, { samples = 33, precision = 0.005 } = {}): { easing: string; duration: number } {
    const c = 2 * damping * Math.sqrt(stiffness), dt = 1 / 2000;
    let x = -1, v = 0, t = 0, settledAt = 0;
    const trace: number[] = [];
    // Simulate until it stays within `precision` for a while; that is its duration.
    while (t < 10) {
        v += (-stiffness * x - c * v) * dt; x += v * dt; t += dt;
        trace.push(1 + x);
        if (Math.abs(x) > precision || Math.abs(v) > precision * 10) settledAt = t;
        else if (t - settledAt > 0.1) break;
    }
    const duration = Math.max(dt, settledAt);
    const at = (s: number) => trace[Math.min(trace.length - 1, Math.round((s * duration) / dt) - 1)] ?? 0;
    const pts = Array.from({ length: samples }, (_, i) => (i === 0 ? 0 : i === samples - 1 ? 1 : +at(i / (samples - 1)).toFixed(3)));
    return { easing: `linear(${pts.join(', ')})`, duration: Math.round(duration * 1000) };
}

/** The timed morph's easing: a symmetric cubic in-out. */
export const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** How long one shape takes to become the next in a timed morph, and one full turn of a spinning loader. */
export const MORPH_MS = 720;
export const SPIN_MS = 3200;
export const SETTLE_MS = 620;
