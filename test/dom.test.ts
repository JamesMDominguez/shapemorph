// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loaderSVG, loop, morph, restore, setShape, settle } from '../src/dom';
import { pathFor, shapes, REST } from '../src/index';
import { fakeFrames } from './frames';

const reducedMotion = (on: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: on && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as any;
};
const box = (size: number) => {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => ({ width: size, height: size, x: 0, y: 0, top: 0, left: 0, right: size, bottom: size, toJSON() {} });
    document.body.append(el);
    return el;
};
// jsdom re-serialises clip-path numbers (32.00 → 32), so compare the numbers.
const nums = (s: string) => (s.match(/-?\d+(\.\d+)?/g) || []).map((n) => Number(n) || 0); // −0 and 0 alike
const clipOf = (el: HTMLElement) => nums(el.style.clipPath);
const want = (shape: Parameters<typeof pathFor>[0], size: number) => nums(pathFor(shape, size));
const svgPath = () => document.createElementNS('http://www.w3.org/2000/svg', 'path');

let frames: ReturnType<typeof fakeFrames>;
beforeEach(() => { reducedMotion(false); frames = fakeFrames(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { frames.uninstall(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('morph', () => {
    it('puts the first frame on synchronously and lands exactly on the target', async () => {
        const el = box(44);
        const m = morph(el, shapes.clover);
        expect(el.style.clipPath).toMatch(/^path\(/);
        frames.run(200);
        await m.finished;
        expect(clipOf(el)).toEqual(want(shapes.clover, 44));
        expect(frames.pending()).toBe(0);
    });

    it('a second morph starts from the frame on screen', () => {
        const el = box(44);
        setShape(el, shapes.circle);
        morph(el, shapes.clover, { via: 'tween', duration: 400 });
        frames.run(10);
        const mid = el.style.clipPath;
        morph(el, shapes.gem, { via: 'tween', duration: 400 });
        // the new morph's frame 0 is where the old one was
        expect(el.style.clipPath).toBe(mid);
    });

    it('drives an SVG path’s d in a 100-unit box', async () => {
        const p = svgPath();
        const m = morph(p, shapes.gem, { via: 'tween' });
        frames.run(100);
        await m.finished;
        expect(p.getAttribute('d')).toBe(pathFor(shapes.gem, 100));
    });

    it('lands by timer if no frames ever come (hidden tab)', async () => {
        const el = box(44);
        const m = morph(el, shapes.sunny, { via: 'tween', duration: 300 });
        vi.advanceTimersByTime(600);
        await m.finished;
        expect(clipOf(el)).toEqual(want(shapes.sunny, 44));
    });

    it('under reduced motion jumps straight there, no frames', () => {
        reducedMotion(true);
        const el = box(44);
        morph(el, shapes.sunny);
        expect(clipOf(el)).toEqual(want(shapes.sunny, 44));
        expect(frames.pending()).toBe(0);
    });

    it('does nothing to an element it cannot measure', () => {
        const el = box(0);
        morph(el, shapes.sunny);
        expect(el.style.clipPath).toBe('');
    });

    it('restore() stops and gives back the element’s own clip-path', () => {
        const el = box(44);
        el.style.clipPath = 'inset(0 round 8px)';
        const own = el.style.clipPath;
        morph(el, shapes.clover);
        frames.step();
        restore(el);
        expect(el.style.clipPath).toBe(own);
        expect(frames.pending()).toBe(0);
    });
});

describe('loop', () => {
    it('keeps morphing until stopped, then restores and leaves no frame loop', () => {
        const el = box(44);
        const l = loop(el);
        const seen = new Set<string>();
        for (let i = 0; i < 60; i++) { frames.step(); seen.add(el.style.clipPath); }
        expect(seen.size).toBeGreaterThan(50);
        l.stop();
        expect(el.style.clipPath).toBe('');
        expect(frames.pending()).toBe(0);
    });

    it('rest() morphs from the frame on screen to the resting shape', async () => {
        const el = box(44);
        const l = loop(el);
        frames.run(20);
        const p = l.rest();
        frames.run(200);
        await p;
        expect(clipOf(el)).toEqual(want(REST, 44));
    });

    it('holds the resting shape under reduced motion', () => {
        reducedMotion(true);
        const el = box(44);
        loop(el);
        expect(clipOf(el)).toEqual(want(REST, 44));
        expect(frames.pending()).toBe(0);
    });
});

describe('settle', () => {
    it('arrives lobed, settles, then hands the element back', async () => {
        const el = box(32);
        const p = settle(el);
        expect(clipOf(el)).toEqual(want(shapes.cookie4, 32));
        frames.run(100);
        await p;
        expect(el.style.clipPath).toBe('');
    });
    it('keep: true leaves the final shape on', async () => {
        const el = box(32);
        const p = settle(el, { keep: true });
        frames.run(100); await p;
        expect(clipOf(el)).toEqual(want(REST, 32));
    });
});

describe('loaderSVG', () => {
    it('is a labelled progressbar animated by SMIL', () => {
        const html = loaderSVG({ label: 'Saving "x"' });
        expect(html).toContain('role="progressbar"');
        expect(html).toContain('aria-label="Saving &quot;x&quot;"');
        expect(html).toContain('<animate attributeName="d"');
        expect(html).toContain('<animateTransform');
    });
    it('is still under reduced motion', () => {
        reducedMotion(true);
        expect(loaderSVG()).not.toContain('<animate');
    });
});
