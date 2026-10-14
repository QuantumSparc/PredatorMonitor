// Dev helper: capture the README screenshots at a fixed size through the DevTools protocol.
// Start the app with --remote-debugging-port=<port>, then:  node scripts/readme-shots.mjs [outDir]
// Pages with personal data (Processes: window titles, Network: IPs, System: computer name) are not captured.
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000);
const outDir = process.argv[2] ?? 'docs/screenshots';
const port = process.env.CDP_PORT ?? '9966';
const W = 1600, H = 1000;
const fs = await import('node:fs'); fs.mkdirSync(outDir, { recursive: true });
const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
await new Promise((r) => (ws.onopen = r));
const ev = async (expression) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrollTo = (y) => ev(`(() => { const s = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (s) s.scrollTop = ${y}; })()`);
const shot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(data, 'base64')); console.log('saved', name);
};
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// [file, view, scrollTop, extra JS before the shot]
const shots = [
  ['overview', 'overview', 0], ['overview-tiles', 'overview', 470], ['insights', 'insights', 0],
  ['processor', 'cpu', 0], ['graphics', 'gpu', 0], ['power', 'power', 0], ['power-components', 'power', 560],
  ['thermals-fans', 'thermal', 0], ['sensors', 'thermal', 99999], ['displays', 'display', 0],
  ['history', 'history', 0], ['events', 'events', 0], ['settings', 'settings', 0],
];
for (const [file, view, y] of shots) {
  await ev(`location.hash = '#${view}'`); await sleep(3500); await scrollTo(y); await sleep(900); await shot(file);
}
// command palette
await ev(`location.hash = '#overview'`); await sleep(2500); await scrollTo(0);
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })); setTimeout(() => { const i = document.querySelector('.palette input'); i.value = 'theme'; i.dispatchEvent(new Event('input')); }, 200)`);
await sleep(900); await shot('palette');
await ev(`document.querySelector('.palette-back')?.remove()`);
// theme variants of the overview, then restore the user's theme
const before = await ev(`(() => { location.hash = '#settings'; return null; })()`); await sleep(2000);
const active = await ev(`[...document.querySelectorAll('.theme-card')].findIndex(c => c.classList.contains('on'))`);
for (const [i, name] of [[3, 'theme-latte'], [5, 'theme-predator'], [4, 'theme-midnight']]) {
  await ev(`location.hash = '#settings'`); await sleep(1500); await ev(`document.querySelectorAll('.theme-card')[${i}].click()`); await sleep(800);
  await ev(`location.hash = '#overview'`); await sleep(3000); await scrollTo(0); await shot(name);
}
await ev(`location.hash = '#settings'`); await sleep(1500); await ev(`document.querySelectorAll('.theme-card')[${Math.max(0, active)}].click()`); await sleep(800);
await ev(`location.hash = '#overview'`);
await call('Emulation.clearDeviceMetricsOverride');
void before;
process.exit(0);
