// Draws the README's pictures from the library itself, so they can't drift:
//   npm run build && node scripts/readme-images.mjs
// Writes docs/shapes.svg (the library), docs/morph.svg (frames of a morph)
// and docs/loader.svg (the loading run, animated with SMIL).
import { writeFileSync } from 'node:fs';
import { shapes, sample, toPath, lerpPoints, isFlat, easeInOutCubic, LOADING, REST } from '../dist/index.js';

const FILL = '#7c5cd6';          // reads on GitHub's light and dark themes
const LABEL = '#8b8b95';
const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${body}\n</svg>\n`;
const drawn = (shape, r, cx, cy) => toPath(sample(shape, { radius: r }), { cx, cy, curve: isFlat(shape) ? 'flat' : 'smooth' });

// 1. Every shape in the library, named.
{
    const names = Object.keys(shapes), cols = 9, cell = 96, r = 30;
    const rows = Math.ceil(names.length / cols);
    const body = names.map((name, i) => {
        const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * (cell + 8) + 44;
        return `<path d="${drawn(shapes[name], r, x, y)}" fill="${FILL}"/><text x="${x}" y="${y + r + 22}" text-anchor="middle" font-size="12" fill="${LABEL}" ${FONT}>${name}</text>`;
    }).join('\n');
    writeFileSync('docs/shapes.svg', svg(cols * cell, rows * (cell + 8) + 8, body));
}

// 2. One morph, frame by frame: cookie → gem, then gem → clover.
{
    const r = 34, gap = 92, steps = 6;
    const legs = [[shapes.cookie, shapes.gem], [shapes.gem, shapes.clover]];
    const frames = [];
    legs.forEach(([a, b], leg) => {
        const pa = sample(a, { radius: r }), pb = sample(b, { radius: r });
        for (let s = leg ? 1 : 0; s <= steps; s++) frames.push(lerpPoints(pa, pb, easeInOutCubic(s / steps)));
    });
    const body = frames.map((pts, i) => {
        const x = i * gap + gap / 2, key = i % steps === 0;
        return `<path d="${toPath(pts, { cx: x, cy: 46 })}" fill="${FILL}" opacity="${key ? 1 : 0.45}"/>`;
    }).join('\n');
    const labels = ['cookie', 'gem', 'clover'].map((t, k) => `<text x="${k * steps * gap + gap / 2}" y="104" text-anchor="middle" font-size="12" fill="${LABEL}" ${FONT}>${t}</text>`).join('\n');
    writeFileSync('docs/morph.svg', svg(frames.length * gap, 116, body + '\n' + labels));
}

// 3. The loading run, animated (SMIL plays in a README image), plus a few
//    shapes morphing in turn, so the page shows the motion, not just stills.
{
    const anim = (run, r, cx, cy, step, spin) => {
        const paths = run.map((s) => toPath(sample(s, { radius: r }), { cx, cy }));
        const n = paths.length;
        const keyTimes = Array.from({ length: n + 1 }, (_, i) => (i / n).toFixed(4)).join(';');
        const splines = Array(n).fill('0.65 0 0.35 1').join(';');
        const turn = spin ? `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${spin}s" repeatCount="indefinite"/>` : '';
        return `<g>${turn}<path fill="${FILL}" d="${paths[0]}"><animate attributeName="d" dur="${(n * step).toFixed(2)}s" repeatCount="indefinite" calcMode="spline" keyTimes="${keyTimes}" keySplines="${splines}" values="${[...paths, paths[0]].join(';')}"/></path></g>`;
    };
    const tour = [shapes.squircle, shapes.cookie, shapes.pentagon, shapes.flower, shapes.arch, shapes.heart, shapes.sunny, shapes.gem];
    const body = [
        anim(LOADING, 40, 70, 64, 0.72, 3.2),
        anim(tour, 48, 230, 64, 1.1, 0),
        anim([...tour.slice(3), ...tour.slice(0, 3)], 48, 360, 64, 1.1, 0),
        anim([REST, shapes.clover, REST, shapes.puffyDiamond], 48, 490, 64, 0.9, 0),
    ].join('\n');
    writeFileSync('docs/loader.svg', svg(560, 128, body));
}
console.log('wrote docs/shapes.svg, docs/morph.svg, docs/loader.svg');
