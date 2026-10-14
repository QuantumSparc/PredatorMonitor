// Dev helper: visit views and screenshot each one top-to-bottom through the DevTools protocol.
// Usage: node scripts/tour.mjs <outDir> [view,view,...] [waitMs] [scale]
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, Number(process.env.TOUR_TIMEOUT ?? 300000));
const [outDir = 'tour', only, wait = '2500', scale = '0.62'] = process.argv.slice(2);
const port = process.env.CDP_PORT ?? '9944';
const fs = await import('node:fs'); fs.mkdirSync(outDir, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
await new Promise((r) => (ws.onopen = r));
const ev = async (expression) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const views = only ? only.split(',') : await ev(`[...document.querySelectorAll('.nav-item')].map((n, i) => n.dataset.view || i)`);
const scroller = `(() => { const c = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)); return c.sort((a, b) => b.clientHeight - a.clientHeight)[0]; })()`;
for (const v of views) {
  if (typeof v === 'number') await ev(`document.querySelectorAll('.nav-item')[${v}].click()`); else await ev(`location.hash = '#${v}'`);
  await sleep(+wait);
  const name = await ev(`location.hash.slice(1) || 'overview'`);
  const total = await ev(`(() => { const s = ${scroller}; if (!s) return 0; s.scrollTop = 0; return Math.max(0, s.scrollHeight - s.clientHeight); })()`) ?? 0;
  const vh = await ev(`(${scroller})?.clientHeight ?? innerHeight`) ?? 800;
  let n = 0;
  for (let y = 0; ; y += Math.round(vh * 0.85)) {
    await ev(`(() => { const s = ${scroller}; if (s) s.scrollTop = ${Math.min(y, total)}; })()`);
    await sleep(450);
    const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: await ev('innerWidth'), height: await ev('innerHeight'), scale: +scale } });
    fs.writeFileSync(`${outDir}/${name}-${n++}.jpg`, Buffer.from(data, 'base64'));
    if (y >= total) break;
  }
  const errs = await ev(`JSON.stringify(window.__errors || [])`);
  console.log(name, 'shots', n, 'errors', errs);
}
process.exit(0);
