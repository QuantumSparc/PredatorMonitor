// Bundles main, preload and renderer with esbuild and copies static files to dist/.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/renderer', { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
const builds = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', platform: 'node', format: 'cjs', external: ['electron'] },
  { ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.js', platform: 'node', format: 'cjs', external: ['electron'] },
  { ...common, entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', platform: 'browser', format: 'iife', loader: { '.css': 'css' } },
];

const copyStatic = () => {
  cpSync('src/renderer/index.html', 'dist/renderer/index.html');
  cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
  cpSync('node_modules/uplot/dist/uPlot.min.css', 'dist/renderer/uPlot.min.css');
};

if (watch) {
  for (const b of builds) (await esbuild.context(b)).watch();
  copyStatic();
  console.log('watching…');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  copyStatic();
}
