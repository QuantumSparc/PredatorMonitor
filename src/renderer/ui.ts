// UI kit: DOM helper, icons, cards, animated numbers, gauges, meters, live charts, tables.

// ── DOM helper ──────────────────────────────────────────────────
type Child = Node | string | number | null | undefined | false | Child[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sv != null) { if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else (el.style as any)[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const svgNS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(c);
  return el;
}
export const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ── icons (24×24 stroke icons) ──────────────────────────────────
const P: Record<string, string> = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z',
  cpu: 'M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 9h6v6H9z',
  gpu: 'M2 7h18a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H2zM2 5v14M7 17v3M11 17v3M15 17v3M9 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 10h2M16 14h2',
  memory: 'M3 8h18v9H3zM6 17v3M10 17v3M14 17v3M18 17v3M7 11v3M11 11v3M15 11v3',
  storage: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  network: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0M12 20h.01',
  power: 'M13 2 4 14h7l-1 8 9-12h-7z',
  thermal: 'M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0zM12 10v7',
  display: 'M3 4h18v12H3zM8 20h8M12 16v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sparkles: 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6z',
  gamepad: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.2 6A3 3 0 0 0 4.5 18c1 0 1.9-.5 2.4-1.3L8 15h8l1.1 1.7a3 3 0 0 0 5.3-2.5l-1.2-6A4 4 0 0 0 17.3 5z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  fan: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 10c0-4 1-7 4-7 2 0 3 2 1 4-1.3 1.3-3 2.5-5 3M14 12c4 0 7 1 7 4 0 2-2 3-4 1-1.3-1.3-2.5-3-3-5M12 14c0 4-1 7-4 7-2 0-3-2-1-4 1.3-1.3 3-2.5 5-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-1 1.3 1.3 2.5 3 3 5',
  battery: 'M3 7h15a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM23 11v2M11 9l-2 3h4l-2 3',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  chevron: 'M15 18l-6-6 6-6',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01',
  gauge: 'M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0M12 20h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};
export function icon(name: string, size = 18, cls = ''): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `icon ${cls}` });
  el.appendChild(s('path', { d: P[name] ?? P.info }));
  return el;
}

// ── animation helpers ───────────────────────────────────────────
let speed = 1; let motion: 'full' | 'reduced' | 'off' = 'full';
export function setMotion(m: typeof motion, sp: number) { motion = m; speed = sp; document.documentElement.dataset.motion = m; document.documentElement.style.setProperty('--speed', String(sp)); }
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that tweens to each new value. */
export class AnimNum {
  el: HTMLSpanElement; private cur = NaN; private target = NaN; private from = 0; private start = 0; private raf = 0;
  constructor(private fmt: (v: number) => string, cls = 'num') { this.el = h('span', { class: cls }, '–'); }
  set(v: number | null | undefined) {
    if (v == null || !Number.isFinite(v)) { this.el.textContent = '–'; this.cur = NaN; return; }
    if (Number.isNaN(this.cur) || motion === 'off') { this.cur = this.target = v; this.el.textContent = this.fmt(v); return; }
    this.from = this.cur; this.target = v; this.start = performance.now();
    cancelAnimationFrame(this.raf);
    const dur = (motion === 'reduced' ? 150 : 520) / speed;
    const step = (now: number) => {
      const t = Math.min(1, (now - this.start) / dur);
      this.cur = this.from + (this.target - this.from) * easeOut(t);
      this.el.textContent = this.fmt(this.cur);
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

// ── card ────────────────────────────────────────────────────────
export function card(opts: { title?: string; sub?: string; icon?: string; cls?: string; actions?: Child; span?: number; rows?: number; to?: string; toLabel?: string }, ...body: Child[]) {
  const open = opts.to ? h('span', { class: 'card-open' }, h('span', { class: 'card-open-label' }, opts.toLabel ?? 'Details'), icon('chevron', 14, 'flip')) : null;
  const el = h('section', { class: `card ${opts.cls ?? ''}${opts.to ? ' card-link' : ''}`, style: { gridColumn: opts.span ? `span ${opts.span}` : undefined, gridRow: opts.rows ? `span ${opts.rows}` : undefined } },
    opts.title ? h('header', { class: 'card-head' },
      opts.icon ? h('span', { class: 'card-icon' }, icon(opts.icon, 16)) : null,
      h('div', { class: 'card-titles' }, h('h3', null, opts.title), opts.sub ? h('p', { class: 'card-sub' }, opts.sub) : null),
      opts.actions || open ? h('div', { class: 'card-actions' }, opts.actions ?? null, open) : null) : null,
    h('div', { class: 'card-body' }, body));
  if (opts.to) {
    const to = opts.to;
    el.tabIndex = 0; el.setAttribute('role', 'link'); el.setAttribute('aria-label', `${opts.title ?? ''} — open details`);
    const go = () => { if (location.hash !== `#${to}`) location.hash = `#${to}`; };
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
      if (getSelection()?.toString()) return; // let people select text without navigating
      el.classList.add('card-press'); setTimeout(go, 90);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  return el;
}

// ── radial gauge ────────────────────────────────────────────────
let gaugeId = 0;
export class Gauge {
  el: HTMLDivElement; private arc: SVGPathElement; private num: AnimNum; private len = 0; private subEl: HTMLDivElement;
  constructor(opts: { label: string; unit?: string; max: number; fmt?: (v: number) => string; size?: number; warn?: number; crit?: number; marks?: { at: number; label: string }[] }) {
    this.opts = opts;
    const size = opts.size ?? 150; const r = 58; const cx = 70; const cy = 70;
    const a0 = (135 * Math.PI) / 180; const a1 = (405 * Math.PI) / 180;
    const pt = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = pt(a0); const [x1, y1] = pt(a1);
    const d = `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
    const id = `g${gaugeId++}`;
    const svg = s('svg', { viewBox: '0 0 140 140', width: size, height: size, class: 'gauge-svg' },
      s('defs', {}, (() => { const g = s('linearGradient', { id, x1: '0', y1: '1', x2: '1', y2: '0' }); g.append(s('stop', { offset: '0%', 'stop-color': 'var(--accent-2)' }), s('stop', { offset: '100%', 'stop-color': 'var(--accent)' })); return g; })()),
      s('path', { d, class: 'gauge-track' }));
    this.arc = s('path', { d, class: 'gauge-arc', stroke: `url(#${id})` });
    svg.appendChild(this.arc);
    for (const m of opts.marks ?? []) {
      const a = a0 + (a1 - a0) * Math.min(1, m.at / opts.max);
      const [mx, my] = [cx + (r + 9) * Math.cos(a), cy + (r + 9) * Math.sin(a)];
      const [ix, iy] = [cx + (r - 9) * Math.cos(a), cy + (r - 9) * Math.sin(a)];
      svg.appendChild(s('line', { x1: ix, y1: iy, x2: mx, y2: my, class: 'gauge-mark' }));
    }
    this.num = new AnimNum(opts.fmt ?? ((v) => v.toFixed(0)), 'gauge-num');
    this.subEl = h('div', { class: 'gauge-sub' });
    this.el = h('div', { class: 'gauge', style: { width: `${size}px`, height: `${size}px` } }, svg,
      h('div', { class: 'gauge-center' }, this.num.el, h('div', { class: 'gauge-unit' }, opts.unit ?? ''), h('div', { class: 'gauge-label' }, opts.label), this.subEl));
    requestAnimationFrame(() => { this.len = this.arc.getTotalLength(); this.arc.style.strokeDasharray = `${this.len}`; this.arc.style.strokeDashoffset = `${this.len}`; });
  }
  private opts: { max: number; warn?: number; crit?: number };
  set(v: number | null | undefined, sub?: string) {
    this.num.set(v);
    if (sub !== undefined) this.subEl.textContent = sub;
    if (!this.len) this.len = this.arc.getTotalLength();
    const f = v == null ? 0 : Math.max(0, Math.min(1, v / this.opts.max));
    this.arc.style.strokeDasharray = `${this.len}`;
    this.arc.style.strokeDashoffset = `${this.len * (1 - f)}`;
    const lvl = v == null ? '' : this.opts.crit != null && v >= this.opts.crit ? 'crit' : this.opts.warn != null && v >= this.opts.warn ? 'warn' : '';
    this.el.dataset.level = lvl;
  }
}

// ── animated fan ────────────────────────────────────────────────
// A rotor that spins at a speed proportional to the real RPM (scaled down so the eye can follow it),
// easing toward each new reading, with motion blur at speed, an airflow ring and an RPM arc.
const fans = new Set<FanWidget>();
let fanId = 0;
export class FanWidget {
  el: HTMLDivElement; private rotor: SVGGElement; private arc: SVGPathElement; private arcLen = 0; private num: AnimNum; private pctEl: HTMLDivElement; private modeEl: HTMLDivElement;
  private angle = 0; private omega = 0; private target = 0; private rpm: number | null = null; private last = 0;
  constructor(private opts: { label: string; maxRpm: number; blades: number; size?: number; style?: 'polymer' | 'metal' }) {
    const size = opts.size ?? 230; const c = 120; const id = `fan${fanId++}`;
    const svg = s('svg', { viewBox: '0 0 240 240', width: size, height: size, class: 'fan-svg' });
    const defs = s('defs');
    const grad = s('linearGradient', { id: `${id}g`, x1: '0', y1: '1', x2: '1', y2: '0' }); grad.append(s('stop', { offset: '0%', 'stop-color': 'var(--accent-2)' }), s('stop', { offset: '100%', 'stop-color': 'var(--accent)' }));
    const hubGrad = s('radialGradient', { id: `${id}h` }); hubGrad.append(s('stop', { offset: '0%', 'stop-color': 'var(--mantle)' }), s('stop', { offset: '100%', 'stop-color': 'var(--crust)' }));
    defs.append(grad, hubGrad); svg.appendChild(defs);
    // RPM arc (outermost, subtle)
    const a0 = (135 * Math.PI) / 180; const a1 = (405 * Math.PI) / 180; const R = 114;
    const d = `M ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 1 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)}`;
    svg.appendChild(s('path', { d, class: 'fan-arc-track' }));
    this.arc = s('path', { d, class: 'fan-arc', stroke: `url(#${id}g)` }); svg.appendChild(this.arc);
    // rotor: a ring of curved blades around the hub — the part that spins (PredatorSense style)
    this.rotor = s('g', { class: 'fan-rotor' });
    const n = opts.blades; const metal = opts.style === 'metal';
    const r1 = 50; const r2 = 101; const sweep = metal ? 0.62 : 0.72;
    const p = (r: number, ang: number) => `${(c + r * Math.cos(ang)).toFixed(2)} ${(c + r * Math.sin(ang)).toFixed(2)}`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // tapered blade: two curves from root to tip, filled
      const w = metal ? 0.035 : 0.06;
      const path = `M ${p(r1, a - w)} Q ${p((r1 + r2) / 2 + 4, a + sweep * 0.32 - w)} ${p(r2, a + sweep)} Q ${p((r1 + r2) / 2 - 4, a + sweep * 0.32 + w)} ${p(r1, a + w)} Z`;
      this.rotor.appendChild(s('path', { d: path, class: metal ? 'fan-blade metal' : 'fan-blade' }));
    }
    svg.appendChild(this.rotor);
    // static hub: dark disc with an accent rim (the RPM sits on top of it)
    svg.appendChild(s('circle', { cx: c, cy: c, r: 47, fill: `url(#${id}h)`, class: 'fan-hub' }));
    svg.appendChild(s('circle', { cx: c, cy: c, r: 47, class: 'fan-hub-rim' }));
    this.num = new AnimNum((v) => String(Math.round(v)), 'fan-rpm');
    this.pctEl = h('div', { class: 'fan-pct' }, '');
    this.modeEl = h('div', { class: 'fan-mode' });
    this.el = h('div', { class: 'fan', style: { width: `${size}px` } },
      h('div', { class: 'fan-dial', style: { width: `${size}px`, height: `${size}px` } }, svg, h('div', { class: 'fan-center' }, this.num.el, h('div', { class: 'fan-unit' }, 'RPM'))),
      h('div', { class: 'fan-label' }, opts.label), this.pctEl, this.modeEl);
    requestAnimationFrame(() => { this.arcLen = this.arc.getTotalLength(); this.arc.style.strokeDasharray = `${this.arcLen}`; this.arc.style.strokeDashoffset = `${this.arcLen}`; });
    fans.add(this);
  }
  set(rpm: number | null | undefined, mode?: string | null) {
    this.rpm = rpm ?? null;
    this.num.set(rpm ?? null);
    const f = rpm == null ? 0 : Math.max(0, Math.min(1, rpm / this.opts.maxRpm));
    // visual speed: 0.12°/s per RPM → 3,000 RPM ≈ one turn per second (the real speed would just look like a blur)
    this.target = rpm ? rpm * 0.12 : 0;
    if (!this.arcLen) this.arcLen = this.arc.getTotalLength();
    this.arc.style.strokeDasharray = `${this.arcLen}`; this.arc.style.strokeDashoffset = `${this.arcLen * (1 - f)}`;
    this.el.dataset.level = f >= 0.9 ? 'crit' : f >= 0.75 ? 'warn' : '';
    this.el.style.setProperty('--fan-speed', String(f));
    this.pctEl.textContent = rpm == null ? 'no reading' : `${Math.round(f * 100)}% of ${this.opts.maxRpm.toLocaleString()} max`;
    if (mode !== undefined) this.modeEl.textContent = mode ?? '';
  }
  spin(now: number) {
    if (!this.el.isConnected) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now;
    const m = document.documentElement.dataset.motion;
    if (m === 'off') { this.omega = 0; return; }
    this.omega += (this.target - this.omega) * Math.min(1, dt * 1.6);   // smooth spin-up / spin-down
    this.angle = (this.angle + this.omega * dt) % 360;
    this.rotor.setAttribute('transform', `rotate(${this.angle} 120 120)`);
    const blur = Math.min(2.2, this.omega / 260);
    this.rotor.style.filter = blur > 0.25 && m !== 'reduced' ? `blur(${blur.toFixed(2)}px)` : '';
  }
  destroy() { fans.delete(this); }
}
export function spinAllFans(now: number) { for (const f of fans) { if (!f.el.isConnected) { fans.delete(f); continue; } f.spin(now); } }

// ── min / avg / max strip ───────────────────────────────────────
export class MinMax {
  el: HTMLDivElement; private cells: Record<'min' | 'avg' | 'max' | 'peak', HTMLElement>; private extra: HTMLElement;
  constructor(private fmt: (v: number) => string, label = '60 s') {
    const cell = (k: string, cls = '') => { const b = h('b', { class: cls }, '–'); return [h('span', { class: 'mm-k' }, k), b] as const; };
    const [k1, min] = cell('min'); const [k2, avg] = cell('avg'); const [k3, max] = cell('max', 'mm-max'); const [k4, peak] = cell('peak', 'mm-peak');
    this.cells = { min, avg, max, peak };
    this.extra = h('div', { class: 'mm-extra' });
    this.el = h('div', { class: 'minmax' },
      h('div', { class: 'mm-row' }, h('span', { class: 'mm-win' }, label), k1, min, k2, avg, k3, max, h('span', { class: 'mm-sep' }), k4, peak),
      this.extra);
  }
  set(st: { min: number; avg: number; max: number } | null, peak?: { v: number; t: number } | null) {
    const set = (el: HTMLElement, v: number | undefined) => { const t = v == null ? '–' : this.fmt(v); if (el.textContent !== t) el.textContent = t; };
    set(this.cells.min, st?.min); set(this.cells.avg, st?.avg); set(this.cells.max, st?.max); set(this.cells.peak, peak?.v);
    if (peak) this.cells.peak.title = `peak at ${new Date(peak.t).toLocaleTimeString()}`;
  }
  setExtra(html: string) { if (this.extra.innerHTML !== html) this.extra.innerHTML = html; }
}

// ── linear meter ────────────────────────────────────────────────
export class Meter {
  el: HTMLDivElement; private fill: HTMLDivElement; private label: HTMLSpanElement; private val: HTMLSpanElement;
  constructor(label: string, private max = 100, private warn?: number, private crit?: number) {
    this.fill = h('div', { class: 'meter-fill' });
    this.label = h('span', { class: 'meter-label' }, label);
    this.val = h('span', { class: 'meter-val' }, '–');
    this.el = h('div', { class: 'meter' }, h('div', { class: 'meter-top' }, this.label, this.val), h('div', { class: 'meter-track' }, this.fill));
  }
  set(v: number | null | undefined, text?: string, max?: number) {
    if (max) this.max = max;
    const f = v == null ? 0 : Math.max(0, Math.min(1, v / this.max));
    this.fill.style.transform = `scaleX(${f})`;
    this.val.textContent = text ?? (v == null ? '–' : v.toFixed(0));
    this.el.dataset.level = v == null ? '' : this.crit != null && v >= this.crit ? 'crit' : this.warn != null && v >= this.warn ? 'warn' : '';
  }
  setLabel(t: string) { this.label.textContent = t; }
}

// ── key/value list ──────────────────────────────────────────────
export function kv(rows: [string, Child][]) {
  return h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
}
export class KV {
  el: HTMLDListElement; private cells = new Map<string, HTMLElement>();
  constructor(keys: string[]) {
    this.el = h('dl', { class: 'kv' });
    for (const k of keys) { const dd = h('dd', null, '–'); this.cells.set(k, dd); this.el.append(h('dt', null, k), dd); }
  }
  set(k: string, v: Child) { const c = this.cells.get(k); if (!c) return; c.replaceChildren(); append(c, [v ?? '–']); }
}

export function badge(text: string, level: string = 'info') { return h('span', { class: `badge ${level}` }, text); }
export function pill(text: string, level = '') { return h('span', { class: `pill ${level}` }, text); }

// ── series store (live ring buffers shared by all charts) ───────
export class SeriesStore {
  private data = new Map<string, { t: number[]; v: number[] }>();
  constructor(public windowMs: number) {}
  push(key: string, t: number, v: number | null | undefined) {
    if (v == null || !Number.isFinite(v)) return;
    this.trackPeak(key, t, v);
    let d = this.data.get(key);
    if (!d) { d = { t: [], v: [] }; this.data.set(key, d); }
    d.t.push(t); d.v.push(v);
    const cutoff = t - Math.max(this.windowMs, 600000) - 5000;
    let drop = 0; while (drop < d.t.length && d.t[drop] < cutoff) drop++;
    if (drop) { d.t.splice(0, drop); d.v.splice(0, drop); }
  }
  get(key: string) { return this.data.get(key); }
  last(key: string) { const d = this.data.get(key); return d && d.v.length ? d.v[d.v.length - 1] : null; }
  /** min / avg / max over the last `windowMs` (default: the sparkline's 60 s). */
  stats(key: string, windowMs = 60000): { min: number; avg: number; max: number } | null {
    const d = this.data.get(key); if (!d || !d.v.length) return null;
    const from = d.t[d.t.length - 1] - windowMs;
    let min = Infinity, max = -Infinity, sum = 0, n = 0;
    for (let i = d.t.length - 1; i >= 0 && d.t[i] >= from; i--) { const v = d.v[i]; if (v < min) min = v; if (v > max) max = v; sum += v; n++; }
    return n ? { min, avg: sum / n, max } : null;
  }
  private peaks = new Map<string, { v: number; t: number }>();
  /** Highest value since the app started (survives the rolling buffer). */
  peak(key: string) { return this.peaks.get(key) ?? null; }
  trackPeak(key: string, t: number, v: number | null | undefined) { if (v == null || !Number.isFinite(v)) return; const p = this.peaks.get(key); if (!p || v > p.v) this.peaks.set(key, { v, t }); }
}

// ── live chart (canvas, 60 fps, scrolling, smooth curves) ───────
export interface SeriesDef { key: string; label: string; color: string; fill?: boolean; fmt?: (v: number) => string; dashed?: boolean }
const liveCharts = new Set<LiveChart>();
export class LiveChart {
  el: HTMLDivElement; canvas: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private w = 0; private hgt = 0; private dpr = 1;
  private yMax = 1; private hoverX: number | null = null; private legend: HTMLDivElement; private tip: HTMLDivElement;
  constructor(private store: SeriesStore, private series: SeriesDef[], private opts: { height?: number; min?: number; max?: number; windowMs?: () => number; lagMs?: number; yFmt?: (v: number) => string; refLines?: { v: number; label: string; color?: string }[]; mini?: boolean } = {}) {
    this.canvas = h('canvas', { class: 'chart-canvas' });
    this.ctx = this.canvas.getContext('2d')!;
    this.legend = h('div', { class: 'chart-legend' }, series.map((sd) => h('span', { class: 'legend-item' }, h('i', { style: { background: resolveColor(sd.color) } }), sd.label, h('b', { 'data-key': sd.key }, ''))));
    this.tip = h('div', { class: 'chart-tip' });
    this.el = h('div', { class: `chart${opts.mini ? ' mini' : ''}`, style: { height: `${opts.height ?? 180}px` } }, this.canvas, this.tip, opts.mini ? null : this.legend);
    new ResizeObserver(() => this.resize()).observe(this.el);
    this.canvas.addEventListener('mousemove', (e) => { const r = this.canvas.getBoundingClientRect(); this.hoverX = e.clientX - r.left; });
    this.canvas.addEventListener('mouseleave', () => { this.hoverX = null; this.tip.style.opacity = '0'; });
    liveCharts.add(this);
  }
  destroy() { liveCharts.delete(this); }
  private resize() {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.hgt = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr)); this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }
  draw(now: number) {
    if (!this.w || !this.el.isConnected) return;
    const ctx = this.ctx; const W = this.w; const H = this.hgt; const mini = !!this.opts.mini; const pad = mini ? { l: 0, r: 0, t: 3, b: 2 } : { l: 6, r: 62, t: 8, b: 18 };
    const win = this.opts.windowMs?.() ?? this.store.windowMs; const lag = this.opts.lagMs ?? 1000;
    const tEnd = now - lag; const tStart = tEnd - win;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hasData = this.series.some((sd) => (this.store.get(sd.key)?.t.length ?? 0) > 1);
    if (!hasData) {
      if (!this.opts.mini) { ctx.fillStyle = css('--text-3'); ctx.font = '12.5px var(--font-ui)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('No data yet', W / 2, H / 2); }
      return;
    }
    // y scale: smooth toward the visible max
    let vmax = this.opts.max ?? 0;
    if (this.opts.max == null) {
      for (const sd of this.series) { const d = this.store.get(sd.key); if (!d) continue; for (let i = 0; i < d.t.length; i++) if (d.t[i] >= tStart - 2000 && d.v[i] > vmax) vmax = d.v[i]; }
      for (const rl of this.opts.refLines ?? []) vmax = Math.max(vmax, rl.v);
      vmax = niceMax(vmax * 1.1 || 1);
      this.yMax += (vmax - this.yMax) * 0.12; if (Math.abs(vmax - this.yMax) < vmax * 0.004) this.yMax = vmax;
    } else this.yMax = vmax;
    const ymin = this.opts.min ?? 0; const ymax = this.yMax;
    const X = (t: number) => pad.l + ((t - tStart) / win) * (W - pad.l - pad.r);
    const Y = (v: number) => pad.t + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - pad.t - pad.b);
    // grid
    ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1; ctx.fillStyle = css('--text-3'); ctx.font = '10.5px var(--font-ui)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // axis labels: if the formatter collapses ticks into duplicates (e.g. 0.25 → "0"), fall back to
    // enough decimals to tell them apart
    const yf = this.opts.yFmt ?? this.series[0]?.fmt ?? ((x: number) => x.toFixed(0));
    const ticks = [0, 1, 2, 3, 4].map((i) => ymin + ((ymax - ymin) * i) / 4);
    let labels = ticks.map(yf);
    if (new Set(labels).size < labels.length) {
      const dec = Math.min(3, Math.max(0, -Math.floor(Math.log10((ymax - ymin) / 4 || 1))));
      labels = ticks.map((v) => v.toFixed(dec));
    }
    for (let i = 0; i <= 4 && !mini; i++) {
      const y = Y(ticks[i]);
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillText(labels[i], W - pad.r + 6, y);
    }
    for (const rl of this.opts.refLines ?? []) {
      if (rl.v > ymax) continue;
      const y = Y(rl.v); ctx.strokeStyle = resolveColor(rl.color ?? 'var(--red)'); ctx.globalAlpha = 0.55; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 0.85;
      ctx.fillStyle = resolveColor(rl.color ?? 'var(--red)'); ctx.textAlign = 'right'; ctx.fillText(rl.label, W - pad.r - 4, y - 7); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // series
    const hoverT = this.hoverX != null ? tStart + ((this.hoverX - pad.l) / (W - pad.l - pad.r)) * win : null;
    const tipRows: string[] = [];
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, 0, W - pad.l - pad.r, H); ctx.clip();
    for (const sd of this.series) {
      const d = this.store.get(sd.key); if (!d || d.t.length < 2) continue;
      const col = resolveColor(sd.color);
      let i0 = 0; while (i0 < d.t.length - 1 && d.t[i0 + 1] < tStart) i0++;
      const pts: [number, number][] = [];
      for (let i = i0; i < d.t.length; i++) pts.push([X(d.t[i]), Y(d.v[i])]);
      if (pts.length < 2) continue;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) { const xc = (pts[i][0] + pts[i + 1][0]) / 2; const yc = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc); }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.setLineDash(sd.dashed ? [4, 4] : []);
      ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
      if (sd.fill !== false) {
        ctx.lineTo(pts[pts.length - 1][0], Y(ymin)); ctx.lineTo(pts[0][0], Y(ymin)); ctx.closePath();
        const g = ctx.createLinearGradient(0, pad.t, 0, H - pad.b); g.addColorStop(0, withAlpha(col, 0.32)); g.addColorStop(1, withAlpha(col, 0)); ctx.fillStyle = g; ctx.fill();
      }
      const lastV = d.v[d.v.length - 1];
      const lg = this.legend.querySelector(`b[data-key="${sd.key}"]`); if (lg) lg.textContent = (sd.fmt ?? ((x: number) => x.toFixed(1)))(lastV);
      if (hoverT != null) {
        let j = 0; let best = Infinity; for (let i = i0; i < d.t.length; i++) { const dd = Math.abs(d.t[i] - hoverT); if (dd < best) { best = dd; j = i; } }
        const hx = X(d.t[j]); const hy = Y(d.v[j]);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
        tipRows.push(`<span><i style="background:${col}"></i>${sd.label}</span><b>${(sd.fmt ?? ((x: number) => x.toFixed(1)))(d.v[j])}</b>`);
      }
    }
    ctx.restore();
    if (this.hoverX != null && hoverT != null) {
      ctx.strokeStyle = css('--text-3'); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(this.hoverX, pad.t); ctx.lineTo(this.hoverX, H - pad.b); ctx.stroke(); ctx.globalAlpha = 1;
      this.tip.innerHTML = `<div class="tip-time">${Math.max(0, Math.round((tEnd - hoverT) / 1000))} s ago</div>${tipRows.join('')}`;
      this.tip.style.opacity = '1';
      this.tip.style.transform = `translate(${Math.min(this.hoverX + 14, W - 180)}px, 8px)`;
    }
    // time labels
    ctx.fillStyle = css('--text-3'); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (!mini) for (let i = 1; i <= 4; i++) { const t = tEnd - (win * i) / 4; ctx.fillText(`-${Math.round((tEnd - t) / 1000)}s`, X(t), H - 4); }
  }
}
export function drawAllCharts(now: number) { for (const c of liveCharts) c.draw(now); }

const colorCache = new Map<string, string>();
export function resolveColor(c: string): string {
  if (!c.startsWith('var(')) return c;
  const name = c.slice(4, -1);
  let v = colorCache.get(name);
  if (!v) { v = css(name) || '#888'; colorCache.set(name, v); }
  return v;
}
export const clearColorCache = () => colorCache.clear();
function withAlpha(col: string, a: number): string {
  if (col.startsWith('#') && col.length === 7) { const n = parseInt(col.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  return col;
}
function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((x) => n <= x) ?? 10) * p;
}

// ── sparkline (tiny live chart) ─────────────────────────────────
export function spark(store: SeriesStore, key: string, color = 'var(--accent)', height = 46, max?: number) {
  return new LiveChart(store, [{ key, label: '', color }], { height, max, lagMs: 1000, mini: true, windowMs: () => 60000 });
}

// ── sortable table ──────────────────────────────────────────────
export interface Col<T> { key: string; label: string; get: (r: T) => number | string; fmt?: (r: T) => Child; align?: 'right' | 'left'; width?: string; bar?: (r: T) => number }
export class Table<T> {
  el: HTMLDivElement; private tbody: HTMLTableSectionElement; private sortKey: string; private dir = -1; private rows: T[] = [];
  constructor(private cols: Col<T>[], private rowKey: (r: T) => string | number, sortKey: string, private filter?: () => string) {
    this.sortKey = sortKey;
    const thead = h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.align === 'right' ? 'r' : '', style: { width: c.width }, onclick: () => { if (this.sortKey === c.key) this.dir *= -1; else { this.sortKey = c.key; this.dir = -1; } this.render(); } }, c.label, h('span', { class: 'sort' })))));
    this.tbody = h('tbody');
    this.el = h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, thead, this.tbody));
  }
  set(rows: T[]) { this.rows = rows; this.render(); }
  render() {
    const col = this.cols.find((c) => c.key === this.sortKey) ?? this.cols[0];
    const f = this.filter?.().toLowerCase() ?? '';
    const rows = this.rows.filter((r) => !f || this.cols.some((c) => String(c.get(r)).toLowerCase().includes(f)))
      .sort((a, b) => { const x = col.get(a); const y = col.get(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * this.dir; });
    this.el.querySelectorAll('th').forEach((th, i) => th.dataset.sorted = this.cols[i].key === this.sortKey ? (this.dir < 0 ? 'desc' : 'asc') : '');
    const existing = new Map<string, HTMLTableRowElement>();
    for (const tr of Array.from(this.tbody.children) as HTMLTableRowElement[]) existing.set(tr.dataset.key!, tr);
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const key = String(this.rowKey(r));
      let tr = existing.get(key);
      if (!tr) { tr = h('tr', { 'data-key': key, class: 'row-in' }); }
      existing.delete(key);
      tr.replaceChildren(...this.cols.map((c) => {
        const td = h('td', { class: c.align === 'right' ? 'r' : '' });
        if (c.bar) td.appendChild(h('div', { class: 'cell-bar', style: { transform: `scaleX(${Math.max(0, Math.min(1, c.bar(r)))})` } }));
        append(td, [c.fmt ? c.fmt(r) : String(c.get(r))]);
        return td;
      }));
      frag.appendChild(tr);
    }
    this.tbody.replaceChildren(frag);
  }
}

// ── toasts ──────────────────────────────────────────────────────
export function toast(title: string, body = '', level = 'info', ms = 4500) {
  let host = document.getElementById('toasts');
  if (!host) { host = h('div', { id: 'toasts' }); document.body.appendChild(host); }
  const el = h('div', { class: `toast ${level}` }, h('span', { class: 'toast-icon' }, icon(level === 'ok' ? 'check' : level === 'info' ? 'info' : 'alert', 16)), h('div', null, h('b', null, title), body ? h('p', null, body) : null));
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}
