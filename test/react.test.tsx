// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { LoadingShape, ShapeBadge, useShapeMorph } from '../src/react';
import { pathFor, shapes } from '../src/index';
import { fakeFrames } from './frames';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let frames: ReturnType<typeof fakeFrames>, root: Root, host: HTMLDivElement;
beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as any;
    frames = fakeFrames();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); frames.uninstall(); document.body.innerHTML = ''; });

function Button({ busy }: { busy: boolean }) {
    const ref = React.useRef<HTMLButtonElement | null>(null);
    useShapeMorph(busy, ref, 44);
    return <button ref={ref}>Approve</button>;
}

describe('useShapeMorph', () => {
    it('morphs while active and gives the button back after', () => {
        act(() => root.render(<Button busy />));
        const b = host.querySelector('button')!;
        expect(b.style.clipPath).toMatch(/^path\(/);
        frames.run(5);
        act(() => root.render(<Button busy={false} />));
        expect(b.style.clipPath).toBe('');
        expect(frames.pending()).toBe(0);
    });
    it('leaves no frame loop after unmount', () => {
        act(() => root.render(<Button busy />));
        act(() => root.unmount());
        expect(frames.pending()).toBe(0);
        root = createRoot(host);
    });
});

describe('components', () => {
    it('ShapeBadge draws its shape at once', () => {
        act(() => root.render(<ShapeBadge shape="gem" fill="red">G</ShapeBadge>));
        expect(host.querySelector('path')!.getAttribute('d')).toBe(pathFor(shapes.gem, 100));
    });
    it('LoadingShape is a progressbar that moves', () => {
        act(() => root.render(<LoadingShape />));
        expect(host.querySelector('[role=progressbar]')).not.toBeNull();
        const p = host.querySelector('path')!;
        const a = p.getAttribute('d'); frames.run(3);
        expect(p.getAttribute('d')).not.toBe(a);
    });
});
