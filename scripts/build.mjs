// After tsc has written dist/*.js (ESM) and the .d.ts files: the CommonJS
// builds, the single-file bundle, and the prebuilt shapes.css.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const external = ['react', 'react/jsx-runtime'];
for (const entry of ['index', 'dom', 'react']) {
    await build({
        entryPoints: [`src/${entry}.${entry === 'react' ? 'tsx' : 'ts'}`],
        outfile: `dist/cjs/${entry}.cjs`,
        bundle: true, format: 'cjs', platform: 'neutral', target: 'es2020', jsx: 'automatic', external,
    });
}
await build({
    entryPoints: ['src/bundle.ts'], outfile: 'dist/shapemorph.min.js',
    bundle: true, format: 'esm', target: 'es2020', minify: true, legalComments: 'none',
    banner: { js: `/*! shapemorph ${process.env.npm_package_version ?? ''} | MIT License | github.com/JamesMDominguez/shapemorph */` },
});
const { shapeTokensCSS } = await import('../dist/index.js');
writeFileSync('dist/shapes.css', `/* shapemorph: every library shape as a path in a 100-unit box (viewBox="0 0 100 100"). */\n${shapeTokensCSS()}`);
console.log('built dist/');
