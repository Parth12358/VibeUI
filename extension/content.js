/* Content script: injects the trip overlays into any page and reacts to audio frames. */

let on = false;
let intensity = 7;
let raf = 0;
let hue = 0;
let beatPeriodMs = 500;

const state = {
  energy: 0.25,
  bass: 0,
  bands: new Array(16).fill(0),
  wave: new Array(32).fill(0),
  lastFrame: 0,
  strobeUntil: 0,
};

const els = {};
let canvas;
let ctx;
let shockwaves = [];
let particles = [];
let bursts = [];

const CHROME_URL = /^(https?|file):/i;

const JUMP_SELECTORS = "a, button, h1, h2, h3, h4, img, div, section, article, li, [role='button'], .btn";
let pool = []; // { el, base }
let kick = 0;
let lastKickAt = 0;

const TEXT_SELECTORS = "h1, h2, h3, h4, h5, h6, p, span, a, li, button, label, td, th, blockquote, strong, em";
let textPool = [];
const textAnims = new Map(); // element -> Animation

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "VIBE_START") start(msg.intensity ?? 7);
  if (msg.type === "VIBE_STOP") stop();
  if (msg.type === "VIBE_FRAME") onFrame(msg.data);
  if (msg.type === "VIBE_ERROR") console.error("[vibe] audio error:", msg.error);
});

function start(int) {
  if (on) return;
  on = true;
  intensity = clamp(int, 1, 10);
  kick = 0;
  lastKickAt = 0;
  if (!CHROME_URL.test(location.protocol)) return;
  console.log("[vibe] start");
  inject();
  loop();
  chrome.runtime.sendMessage({ type: "REGISTER" }).catch(() => {});
}

function stop() {
  on = false;
  cancelAnimationFrame(raf);
  cancelBobs();
  removeInjected();
  chrome.runtime.sendMessage({ type: "UNREGISTER" }).catch(() => {});
  console.log("[vibe] stop");
}

function cancelBobs() {
  for (const p of pool) p.el.style.transform = p.base;
  pool = [];
  pool._ts = 0;
  for (const a of textAnims.values()) a.cancel();
  textAnims.clear();
  textPool = [];
  textPool._ts = 0;
}

function inject() {
  if (document.getElementById("vibe-tint")) return;

  const defs = [
    ["vibe-vignette", "vibe-vignette"],
    ["vibe-glow", "vibe-glow"],
    ["vibe-scan", "vibe-scan"],
    ["vibe-ca-c", "vibe-ca-c"],
    ["vibe-ca-r", "vibe-ca-r"],
    ["vibe-rainbow", "vibe-rainbow"],
    ["vibe-tint", "vibe-tint"],
    ["vibe-sat", "vibe-sat"],
  ];
  const root = document.documentElement;
  for (const [id, cls] of defs) {
    els[cls] = mk("div", cls, { id });
    root.appendChild(els[cls]);
  }

  els.strobe = mk("div", "vibe-strobe", { id: "vibe-strobe" });
  root.appendChild(els.strobe);

  els.border = mk("div", "vibe-border", { id: "vibe-border" });
  root.appendChild(els.border);

  canvas = mk("canvas", "vibe-viz", { id: "vibe-viz" });
  root.appendChild(canvas);

  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}

function removeInjected() {
  [
    "vibe-vignette",
    "vibe-glow",
    "vibe-scan",
    "vibe-ca-c",
    "vibe-ca-r",
    "vibe-rainbow",
    "vibe-tint",
    "vibe-sat",
    "vibe-strobe",
    "vibe-border",
    "vibe-viz",
  ].forEach((id) => document.getElementById(id)?.remove());
  window.removeEventListener("resize", resize);
  shockwaves = [];
  particles = [];
  bursts = [];
}

function mk(tag, cls, attrs = {}) {
  const el = document.createElement(tag);
  el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}

function onFrame(data) {
  if (!data) return;
  state.lastFrame = performance.now();
  state.energy = data.energy ?? state.energy;
  state.bass = data.bass ?? state.bass;
  if (data.bands) state.bands = data.bands;
  if (data.wave) state.wave = data.wave;
  if (data.bpm) beatPeriodMs = 60000 / data.bpm;
  if (data.beat) {
    const impulse = data.impulse ?? 0.6;
    state.strobeUntil = performance.now() + 130;
    shockwaves.push({ t0: performance.now(), impulse });
    spawnBurst(impulse);
    kick = Math.max(kick, impulse);
    lastKickAt = performance.now();
  }
}

// --- continuous trip loop (never idle) ---
function loop() {
  raf = requestAnimationFrame(loop);
  if (!on || !ctx) return;

  const t = performance.now();
  const intensity01 = intensity / 10;
  const energy = state.energy;
  const speed = (0.05 + energy * 0.6) * (0.4 + intensity01);

  hue = (hue + speed * 20) % 360;

  const alive = t - state.lastFrame < 600;
  const e = alive ? energy : 0.25 + 0.05 * Math.sin(t / 3000);
  if (!alive) {
    for (let i = 0; i < state.bands.length; i++) {
      state.bands[i] = Math.max(0, 0.3 + 0.3 * Math.sin(t / 260 + i * 0.6));
    }
    for (let i = 0; i < state.wave.length; i++) {
      state.wave[i] = Math.sin(t / 180 + i * 0.5) * 0.4;
    }
    state.bass = 0.3 + 0.2 * Math.sin(t / 400);
  }

  els["vibe-tint"].style.backgroundColor = `hsl(${hue} 90% 55%)`;
  els["vibe-tint"].style.opacity = (0.22 + e * 0.45).toFixed(3);

  els["vibe-sat"].style.backgroundColor = `hsl(${(hue + 60) % 360} 100% 55%)`;
  els["vibe-sat"].style.opacity = (0.1 + e * 0.5 * intensity01).toFixed(3);

  els["vibe-glow"].style.opacity = (0.12 + e * 0.35).toFixed(3);

  els["vibe-rainbow"].style.opacity = (0.1 + e * 0.2).toFixed(3);

  const strobeOn = t < state.strobeUntil;
  els.strobe.style.backgroundColor = `hsl(${hue} 100% 70%)`;
  els.strobe.style.opacity = strobeOn ? "0.55" : "0";

  els.border.style.borderColor = `hsl(${hue} 100% 60%)`;
  els.border.style.boxShadow = `inset 0 0 ${(40 + state.bass * 120).toFixed(0)}px hsla(${hue} 100% 60% / ${(0.25 + state.bass * 0.5).toFixed(2)})`;

  // Continuous beat-synced bob + decaying kick, applied as direct inline transforms (same
  // technique as the vibe-ui demo — guaranteed to move divs, buttons, and headings).
  kick *= Math.exp(-(t - lastKickAt) / 180);
  const bob = Math.sin((2 * Math.PI * t) / beatPeriodMs) * (0.45 + 0.3 * e);
  applyJump(bob + kick);

  updateTextHue(0.4 + e * 3);

  drawViz(t, e);
}

function drawViz(t, e) {
  if (!canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cx = w / 2;
  const cy = h / 2;
  const now = performance.now();

  // Ambient drifting particles (never idle).
  while (particles.length < 45) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.5 + 0.5,
      ph: Math.random() * 360,
    });
  }
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = window.innerWidth;
    if (p.x > window.innerWidth) p.x = 0;
    if (p.y < 0) p.y = window.innerHeight;
    if (p.y > window.innerHeight) p.y = 0;
    ctx.fillStyle = `hsla(${(p.ph + hue) % 360} 100% 65% / 0.55)`;
    ctx.beginPath();
    ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kick confetti bursts (with gravity).
  bursts = bursts.filter((b) => b.life > 0);
  for (const b of bursts) {
    b.vy += 0.16;
    b.x += b.vx;
    b.y += b.vy;
    b.life -= 0.018;
    ctx.fillStyle = `hsla(${(b.ph + hue) % 360} 100% 62% / ${b.life.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(b.x * dpr, b.y * dpr, b.r * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rotating rave light beams.
  const rot = (t / 1000) * 0.5;
  const beamCount = 3;
  const beamR = Math.min(w, h) * (0.42 + state.bass * 0.35);
  for (let i = 0; i < beamCount; i++) {
    const a = rot + (i * Math.PI * 2) / beamCount;
    const spread = 0.3;
    const gx = cx + Math.cos(a) * beamR;
    const gy = cy + Math.sin(a) * beamR;
    const grad = ctx.createLinearGradient(cx, cy, gx, gy);
    grad.addColorStop(0, `hsla(${hue} 100% 60% / ${(0.2 + state.bass * 0.35).toFixed(2)})`);
    grad.addColorStop(1, "hsla(0 100% 60% / 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, beamR, a - spread / 2, a + spread / 2);
    ctx.closePath();
    ctx.fill();
  }

  // Radial bass pulse (dark under-ring + neon ring).
  const ringR = (0.16 + state.bass * 0.5) * Math.min(w, h);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 16 * dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `hsl(${hue} 100% 60%)`;
  ctx.lineWidth = 7 * dpr;
  ctx.shadowColor = `hsl(${hue} 100% 60%)`;
  ctx.shadowBlur = 28 * dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Shockwave rings on kicks.
  shockwaves = shockwaves.filter((s) => now - s.t0 < 600);
  for (const s of shockwaves) {
    const age = (now - s.t0) / 600;
    const r = (0.12 + age * 0.9) * Math.min(w, h);
    ctx.strokeStyle = `hsla(${(hue + age * 160) % 360} 100% 60% / ${(1 - age).toFixed(2)})`;
    ctx.lineWidth = (1 - age) * 14 * dpr + 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Waveform thread across the middle.
  const nw = state.wave.length;
  if (nw > 1) {
    ctx.strokeStyle = `hsla(${(hue + 180) % 360} 100% 70% / 0.8)`;
    ctx.lineWidth = 3 * dpr;
    ctx.shadowColor = `hsl(${(hue + 180) % 360} 100% 60%)`;
    ctx.shadowBlur = 12 * dpr;
    ctx.beginPath();
    for (let i = 0; i < nw; i++) {
      const x = (i / (nw - 1)) * w;
      const y = cy + state.wave[i] * h * 0.22;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Rainbow frequency bars along the bottom.
  const n = state.bands.length || 16;
  const gap = w / n;
  const barW = gap * 0.78;
  for (let i = 0; i < n; i++) {
    const v = state.bands[i] ?? 0;
    const bh = Math.max(6 * dpr, v * v * h * 0.85);
    const x = i * gap;
    const y = h - bh;
    const huei = (i / n) * 360 + hue;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(x - 2 * dpr, y - 2 * dpr, barW + 4 * dpr, bh + 4 * dpr);
    ctx.fillStyle = `hsl(${huei} 100% 55%)`;
    ctx.shadowColor = `hsl(${huei} 100% 60%)`;
    ctx.shadowBlur = 14 * dpr;
    ctx.fillRect(x, y, barW, bh);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(x, y, barW, Math.min(bh, 6 * dpr));
  }
  ctx.shadowBlur = 0;
}

// --- element jumping: continuous beat-synced bob + decaying kick, applied as inline transforms ---

function ensurePool() {
  const now = performance.now();
  if (pool.length && now - pool._ts < 5000) return;
  pool = [];
  const all = document.querySelectorAll(JUMP_SELECTORS);
  for (const el of all) {
    if (pool.length >= 128) break;
    const oh = el.offsetHeight;
    if (!oh || oh < 10 || oh > 500) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.top > window.innerHeight || r.bottom < 0) continue;
    pool.push({ el, base: el.style.transform || "" });
  }
  pool._ts = now;
}

function applyJump(pulse) {
  ensurePool();
  const ampPx = (6 + intensity) * 0.75;
  const y = -pulse * ampPx;
  const s = 1 + Math.abs(pulse) * 0.12;
  const t = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
  for (const p of pool) {
    p.el.style.transform = p.base ? `${p.base} ${t}` : t;
  }
}

function spawnBurst(impulse) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const count = Math.floor(24 + impulse * 40);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 7) * (1 + impulse);
    bursts.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 2,
      r: Math.random() * 4 + 1.5,
      ph: Math.random() * 360,
      life: 1,
    });
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// --- text hue cycling: rainbow color animation on text elements, rate driven by energy ---
function ensureTextPool() {
  const now = performance.now();
  if (textPool.length && now - textPool._ts < 5000) return;
  for (const a of textAnims.values()) a.cancel();
  textAnims.clear();
  textPool = Array.from(document.querySelectorAll(TEXT_SELECTORS))
    .filter((el) => {
      const txt = el.textContent;
      if (!txt || !txt.trim()) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.height < 200 && r.top < window.innerHeight && r.bottom > 0;
    })
    .slice(0, 80);
  textPool._ts = now;
}

function updateTextHue(rate) {
  ensureTextPool();
  for (const el of textPool) {
    let a = textAnims.get(el);
    if (!a) {
      a = el.animate(
        [
          { color: "hsl(0 100% 65%)" },
          { color: "hsl(120 100% 65%)" },
          { color: "hsl(240 100% 65%)" },
          { color: "hsl(360 100% 65%)" },
        ],
        { duration: 4000, iterations: Infinity },
      );
      textAnims.set(el, a);
    }
    a.playbackRate = rate;
  }
}

// Auto-start if the trip was already enabled — covers navigation to new pages and new tabs.
chrome.storage.local.get({ enabled: false, intensity: 7 }, (s) => {
  if (s.enabled) start(s.intensity);
});
