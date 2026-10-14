setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, Number(process.env.SHOT_TIMEOUT ?? 20000));
// Dev helper: screenshot the running app through the DevTools protocol.
// Start the app with:  npx electron . --remote-debugging-port=9333
// Then:                node scripts/shot.mjs out.png [#view] [waitMs] [evalJs]
const [out = 'shot.png', hash, wait = '2500', evalJs] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9966/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
if (!page) { console.error('app page not found', targets.map((t) => t.url)); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
await new Promise((r) => (ws.onopen = r));
if (hash) await call('Runtime.evaluate', { expression: `location.hash = '${hash}'` });
if (evalJs) await call('Runtime.evaluate', { expression: evalJs });
await new Promise((r) => setTimeout(r, +wait));
const errs = await call('Runtime.evaluate', { expression: 'JSON.stringify(window.__errors || [])', returnByValue: true });
const { data } = await call('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log('saved', out, 'errors:', errs.result.value);
process.exit(0);
