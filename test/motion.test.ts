import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spring, springCurve, SPRINGS } from '../src/motion';
import { shapeTokensCSS, shapeToken } from '../src/tokens';
import { shapes } from '../src/shapes';
import { fakeFrames } from './frames';

describe('spring', () => {
    let frames: ReturnType<typeof fakeFrames>;
    beforeEach(() => { frames = fakeFrames(); });
    afterEach(() => frames.uninstall());

    it('settles on the target and calls onDone once', () => {
        const values: number[] = []; const done = vi.fn();
        spring({ from: 0, to: 100, ...SPRINGS.defaultSpatial, onUpdate: (v) => values.push(v), onDone: done });
        frames.run(120);
        expect(values[values.length - 1]).toBe(100);
        expect(done).toHaveBeenCalledTimes(1);
        expect(frames.pending()).toBe(0);
    });

    it('a bouncy spring overshoots; a critically damped one does not', () => {
        const peak = (cfg: { stiffness: number; damping: number }) => {
            let max = 0; spring({ from: 0, to: 100, ...cfg, onUpdate: (v) => { max = Math.max(max, v); } }); frames.run(120); return max;
        };
        expect(peak(SPRINGS.fastSpatial)).toBeGreaterThan(105);
        expect(peak(SPRINGS.slowEffects)).toBeLessThanOrEqual(100.0001);
    });

    it('starts with the given velocity', () => {
        const first: number[] = [];
        spring({ from: 0, to: 0, velocity: 2000, precision: 0.01, onUpdate: (v) => first.push(v) });
        frames.step();
        expect(first[0]).toBeGreaterThan(10);
    });

    it('stop() cancels', () => {
        const done = vi.fn();
        const stop = spring({ from: 0, to: 100, onUpdate: () => {}, onDone: done });
        frames.step(); stop(); frames.run(100);
        expect(done).not.toHaveBeenCalled();
    });

    it('instant jumps to the end', () => {
        const values: number[] = [];
        spring({ from: 0, to: 5, instant: true, onUpdate: (v) => values.push(v) });
        expect(values).toEqual([5]);
    });
});

describe('springCurve', () => {
    it('is a linear() easing from 0 to 1 with a duration', () => {
        const c = springCurve(SPRINGS.fastSpatial);
        expect(c.easing).toMatch(/^linear\(0, .*, 1\)$/);
        expect(c.duration).toBeGreaterThan(250);
        expect(c.duration).toBeLessThan(500);
        const peak = Math.max(...c.easing.slice(7, -1).split(', ').map(Number));
        expect(peak).toBeCloseTo(1.095, 2); // ζ = 0.6 overshoots by e^(−ζπ/√(1−ζ²))
    });
    it('effects springs do not overshoot', () => {
        const vals = springCurve(SPRINGS.defaultEffects).easing.slice(7, -1).split(', ').map(Number);
        expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    });
});

describe('CSS tokens', () => {
    it('declares one property per shape and an attribute selector', () => {
        const css = shapeTokensCSS();
        for (const name of Object.keys(shapes)) {
            expect(css).toContain(`--sm-shape-${name}: path("M `);
            expect(css).toContain(`[data-sm-shape="${name}"] { d: var(--sm-shape-${name}); }`);
        }
    });
    it('smooth tokens share one run of commands, so CSS can interpolate them', () => {
        const run = (t: string) => t.replace(/[-\d.]+/g, '');
        expect(run(shapeToken(shapes.gem))).toBe(run(shapeToken(shapes.cookie)));
    });
});
