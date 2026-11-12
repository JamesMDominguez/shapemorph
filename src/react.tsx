/**
 * React bindings: thin hooks over `shapemorph/dom`, and two small components.
 * Writes go straight to the element, never through React state, so a morph
 * is not a re-render per frame.
 */

import * as React from 'react';
import type { Shape } from './geometry.js';
import { loop, morph, restore, setShape, settle, type LoopOptions, type MorphOptions, type SettleOptions } from './dom.js';
import { shapes as library, REST, type ShapeName } from './shapes.js';

type Ref<T> = React.RefObject<T | null>;
const resolve = (shape: Shape | ShapeName): Shape => (typeof shape === 'string' ? library[shape] : shape);

/**
 * Keep an element in `shape`: drawn at once on mount, morphed whenever it
 * changes. Pass a stable `shape` (a library name, or a memoised object).
 */
export function useMorph<T extends HTMLElement | SVGElement>(ref: Ref<T>, shape: Shape | ShapeName, options: MorphOptions = {}): void {
    const first = React.useRef(true);
    const opts = React.useRef(options);
    opts.current = options;
    const key = typeof shape === 'string' ? shape : JSON.stringify(shape);
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (first.current) { first.current = false; setShape(el, resolve(shape), opts.current); return; }
        const m = morph(el, resolve(shape), opts.current);
        return () => m.stop();
    }, [ref, key]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => () => { if (ref.current) restore(ref.current); }, [ref]);
}

/**
 * While `active`, the element's own silhouette loops through the loading run
 * (a button becomes the loading shape while it sends). When it stops, the
 * element gets its own clip-path back.
 */
export function useShapeMorph<T extends HTMLElement | SVGElement>(active: boolean, ref: Ref<T>, size?: number, options: LoopOptions = {}): void {
    const opts = React.useRef(options);
    opts.current = options;
    React.useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        if (!active) { restore(el); return undefined; }
        const l = loop(el, { size, ...opts.current });
        return () => l.stop();
    }, [active, ref, size]);
}

/** On mount (and whenever `enabled` turns on), the element arrives as a lobed shape and settles into its resting one. */
export function useShapeSettle<T extends HTMLElement | SVGElement>(ref: Ref<T>, enabled = true, options: SettleOptions = {}): void {
    const opts = React.useRef(options);
    opts.current = options;
    React.useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return undefined;
        void settle(el, opts.current);
        return () => restore(el);
    }, [ref, enabled]);
}

export interface ShapeBadgeProps {
    /** The shape the badge wears. Default 'cookie'. */
    shape?: Shape | ShapeName;
    /** Morph to this under the pointer. */
    hoverShape?: Shape | ShapeName;
    fill: string;
    /** px. Default 32. */
    size?: number;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

/** A glyph sitting on a shape. */
export function ShapeBadge({ shape = 'cookie', hoverShape, fill, size = 32, children, className, style }: ShapeBadgeProps) {
    const path = React.useRef<SVGPathElement | null>(null);
    const [hover, setHover] = React.useState(false);
    useMorph(path, hover && hoverShape ? hoverShape : shape, { target: 'path', size: 100 });
    return (
        <div
            className={className}
            style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'grid', placeItems: 'center', ...style }}
            onPointerEnter={hoverShape ? () => setHover(true) : undefined}
            onPointerLeave={hoverShape ? () => setHover(false) : undefined}
        >
            <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
                <path ref={path} fill={fill} />
            </svg>
            <div style={{ position: 'relative', display: 'grid', placeItems: 'center', lineHeight: 0 }}>{children}</div>
        </div>
    );
}

export interface LoadingShapeProps {
    /** px. Default 48. */
    size?: number;
    fill?: string;
    /** 'loading' morphs and spins; 'rest' settles into the resting shape from the frame on screen. */
    state?: 'loading' | 'rest';
    /** Shape to rest in. Default REST. */
    restShape?: Shape | ShapeName;
    label?: string;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

/** The loading indicator, drawn as SVG. */
export function LoadingShape({ size = 48, fill = 'currentColor', state = 'loading', restShape = REST, label = 'Loading', children, className, style }: LoadingShapeProps) {
    const path = React.useRef<SVGPathElement | null>(null);
    const restKey = typeof restShape === 'string' ? restShape : JSON.stringify(restShape);
    React.useEffect(() => {
        const el = path.current;
        if (!el) return undefined;
        // The shape sits inside the box with room to turn.
        if (state === 'rest') {
            const m = morph(el, resolve(restShape), { target: 'path', size: 86 });
            return () => m.stop();
        }
        const l = loop(el, { target: 'path', size: 86 });
        return () => l.stop();
    }, [state, restKey]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <span
            role={state === 'loading' ? 'progressbar' : undefined}
            aria-label={state === 'loading' ? label : undefined}
            className={className}
            style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: size, height: size, lineHeight: 0, ...style }}
        >
            <svg viewBox="-7 -7 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
                <path ref={path} fill={fill} />
            </svg>
            {children ? <span style={{ position: 'relative', lineHeight: 0 }}>{children}</span> : null}
        </span>
    );
}
