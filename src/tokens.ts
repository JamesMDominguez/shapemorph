/**
 * Shapes as CSS custom properties, for morphs the browser does on its own:
 * every smooth shape's path has the same run of commands (M, 144 × C, Z), so
 * CSS can interpolate `d` (or `clip-path`) between any two of them.
 */

import { isFlat, sample, toPath, type Shape } from './geometry.js';
import { shapes as library } from './shapes.js';

export interface TokenOptions {
    /** Which shapes; default the whole library. */
    shapes?: Record<string, Shape>;
    /** The box the paths are drawn in. Default 100. */
    box?: number;
    /** 'corner': paths fill 0…box (viewBox="0 0 100 100"); 'center': −box/2…box/2. Default corner. */
    origin?: 'corner' | 'center';
    /** Custom property prefix. Default `--sm-shape-`. */
    prefix?: string;
    /** Selector the properties are declared on. Default `:root`. */
    selector?: string;
}

/** `path("…")` for one shape in the token box. */
export function shapeToken(shape: Shape, { box = 100, origin = 'corner' }: Pick<TokenOptions, 'box' | 'origin'> = {}): string {
    const r = box / 2, c = origin === 'corner' ? r : 0;
    return `path("${toPath(sample(shape, { radius: r }), { cx: c, cy: c, curve: isFlat(shape) ? 'flat' : 'smooth' })}")`;
}

/**
 * A stylesheet declaring one custom property per shape, plus
 * `[data-sm-shape="name"] { d: var(--sm-shape-name) }` so an SVG path can
 * pick its shape with an attribute and morph with a CSS transition on `d`.
 */
export function shapeTokensCSS({ shapes = library, box = 100, origin = 'corner', prefix = '--sm-shape-', selector = ':root' }: TokenOptions = {}): string {
    const names = Object.keys(shapes);
    const vars = names.map((n) => `  ${prefix}${n}: ${shapeToken(shapes[n], { box, origin })};`);
    const attrs = names.map((n) => `[data-sm-shape="${n}"] { d: var(${prefix}${n}); }`);
    return `${selector} {\n${vars.join('\n')}\n}\n${attrs.join('\n')}\n`;
}
