// Stack Ball "Save the Kitty" playable. Unofficial concept.
// Flow: intro (kitty in a cage) -> hint -> play (hold to smash, spikes come down) -> win or fail -> end card.
import * as THREE from 'three';
import './style.css';
import { t, applyTexts } from './i18n.js';
import { sfx, unlockAudio, setMuted, isMuted, pauseAudio, resumeAudio } from './audio.js';
import { track, once } from './analytics.js';
import { openStore, whenReady, onVisibility } from './ad.js';

// ---------- Settings (balance lives here, see docs/SPEC.md) ----------
const SEG = 8, RI = 0.62, RO = 2.0, H = 0.26, GAP = 0.42;
const BALL_R = 0.27, BALL_Z = 1.3;
const G = -32, BOUNCE = 7.6, SMASH = -4.4;
const FIRE_AT = 12, FIRE_TIME = 1.5;
const RINGS_RESCUE = 30, RINGS_CLASSIC = 26, CLASSIC_LEVELS = 2;
const LID_START = 4.4, LID_SPEED = 0.8, LID_FOLLOW = 3.8, RETRY_EASIER = 0.8; // spikes never fall further behind than LID_FOLLOW
const INTRO_HOLD = 1.8, INTRO_FLY = 0.9;
const MAX_FAILS = 2, SAFETY_TIMEOUT = 40, IDLE_HINT = 4;
const LEVELS = [
  { ring: '#ffd400', ui: '#f2a900', bgTop: '#7a3cb8', bgBot: '#ff6a3d' },
  { ring: '#3ad16b', ui: '#2fb35a', bgTop: '#1fb5c9', bgBot: '#9be15d' },
  { ring: '#2a9df4', ui: '#2a8ee0', bgTop: '#ff8a65', bgBot: '#ffd36e' },
];
const BLACK = '#1d1d22';
const BALL_BLUE = '#2a7fff';
// Variant C: each ball looks different and has one perk
const BALLS = {
  blue: { color: BALL_BLUE, emissive: '#000000', rough: 0.25, metal: 0.1, trail: '#7fb6ff', smash: SMASH, fireAt: FIRE_AT, power: 1, shake: 0, scale: 1 },
  // Meteor: big and heavy, breaks two rings per hit, shock wave and camera shake
  meteor: { color: '#c8432b', emissive: '#3a0a00', rough: 0.85, metal: 0, trail: '#ff8a4c', smash: SMASH * 0.9, fireAt: FIRE_AT, power: 1.8, shake: 0.16, scale: 1.3, double: true },
  // Rocket: 1.7x faster, jet flame behind, stretches while flying
  rocket: { color: '#dfe6ee', emissive: '#000000', rough: 0.2, metal: 0.7, trail: '#9ad7ff', smash: SMASH * 1.7, fireAt: FIRE_AT, power: 1, shake: 0, scale: 1, flame: true },
  // Fireball: always glowing with embers, fire mode after only 6 rings
  fire: { color: '#ff8a00', emissive: '#a02800', rough: 0.3, metal: 0, trail: '#ffb000', smash: SMASH, fireAt: 6, power: 1.15, shake: 0, scale: 1.05, embers: true },
};
let ballCfg = BALLS.blue;
const DEMO_TIME = 3.0, DEMO_RINGS = 12;

const params = new URLSearchParams(location.search);
const VARIANTS = ['rescue', 'classic', 'pick'];
const variant = VARIANTS.includes(params.get('variant')) ? params.get('variant') : 'rescue';
const RESCUE = variant !== 'classic'; // "pick" keeps the kitty story and adds a ball choice
const PICK = variant === 'pick';
const DEMO = params.get('demo') === '1'; // "watch, then play": the game plays itself for 3 seconds first
document.body.classList.toggle('rescue', RESCUE);
applyTexts();

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  fill: $('fill'), score: $('score'), lvlA: $('lvlA'), lvlBnum: $('lvlBnum'),
  banner: $('banner'), danger: $('danger'), combo: $('combo'), fire: $('fire'), help: $('help'), hearts: $('hearts'),
  hint: $('hint'), result: $('result'), resTitle: $('resTitle'), resText: $('resText'), retry: $('retry'),
  end: $('endcard'), ecSub: $('ecSub'), ecBadge: $('ecBadge'), ecBadgeText: $('ecBadgeText'),
  play: $('play'), replay: $('replay'), mute: $('mute'), pick: $('pick'), ghost: $('ghost'),
  fireBar: $('firebar'), fireFill: $('firefill'), lost: $('lost'),
};

// ---------- Renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 8, 6);
scene.add(sun);

function gradientTex(top, bot) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
const checker = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#151515' : '#ffffff'; g.fillRect(x * 32, y * 32, 32, 32); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
})();

// Seeded random so every attempt gets a fair, repeatable tower
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Shared geometry and materials ----------
const segGeos = [];
for (let s = 0; s < SEG; s++) {
  const a0 = (s * Math.PI * 2) / SEG + 0.025, a1 = ((s + 1) * Math.PI * 2) / SEG - 0.025;
  const sh = new THREE.Shape();
  sh.absarc(0, 0, RO, a0, a1, false);
  sh.absarc(0, 0, RI, a1, a0, true);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  segGeos.push(g);
}
const matCache = new Map();
function mat(hex, opts = {}) {
  const key = hex + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0.05, ...opts }));
  return matCache.get(key);
}

// ---------- Particles: one instanced mesh of small cubes ----------
const MAXP = 1800;
const crumbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAXP);
crumbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
crumbs.frustumCulled = false;
scene.add(crumbs);
const P = Array.from({ length: MAXP }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: 1, g: 1 }));
let pHead = 0;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
for (let i = 0; i < MAXP; i++) crumbs.setColorAt(i, tmpC.set('#ffffff'));

function spawn(pos, vel, color, life, size = 1, gravity = 1) {
  const i = (pHead = (pHead + 1) % MAXP); const q = P[i];
  q.life = life; q.s = size; q.g = gravity; q.p.copy(pos); q.v.copy(vel);
  q.r.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  crumbs.setColorAt(i, tmpC.set(color));
  crumbs.instanceColor.needsUpdate = true;
}
const V = new THREE.Vector3();
function burst(pos, color, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const p = pos.clone().add(V.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.5));
    const out = new THREE.Vector3(p.x, 0, p.z).normalize();
    const vel = new THREE.Vector3(out.x * (2 + Math.random() * 4) * power, (1 + Math.random() * 4) * power, out.z * (2 + Math.random() * 4) * power);
    spawn(p, vel, color, 0.7 + Math.random() * 0.6, 0.6 + Math.random() * 0.9);
  }
}

// ---------- World ----------
let tower, base, lid, cage, cat, rings = [], flying = [];
let catEyes = [];
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), new THREE.MeshStandardMaterial({ color: BALL_BLUE, roughness: 0.25, metalness: 0.1, emissive: '#000000' }));
scene.add(ball);
function applyBallLook() {
  ball.material.color.set(ballCfg.color); ball.material.emissive.set(ballCfg.emissive);
  ball.material.roughness = ballCfg.rough; ball.material.metalness = ballCfg.metal;
}
const trail = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * (1 - i / 16), 16, 12), new THREE.MeshBasicMaterial({ color: '#7fb6ff', transparent: true, opacity: 0.35 * (1 - i / 14), depthWrite: false }));
  scene.add(m); trail.push(m);
}
const history = [];

// Rocket jet flame (cone pointing up behind the falling ball)
const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
const flame = new THREE.Mesh(new THREE.ConeGeometry(BALL_R * 1.25, 1.9, 18, 1, true), flameMat);
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(BALL_R * 0.5, 0.75, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
flame.visible = flameCore.visible = false;
flame.renderOrder = flameCore.renderOrder = 10;
scene.add(flame, flameCore);

// Meteor shock waves: flat rings that grow and fade
const waves = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); waves.push({ m, t: 0 });
}
const WAVE_TIME = 0.45;
function shockwave(y, color) {
  const w = waves.reduce((a, b) => (a.t <= b.t ? a : b));
  w.t = WAVE_TIME; w.m.position.set(0, y, 0); w.m.material.color.set(color); w.m.visible = true;
}
const ballTarget = new THREE.Vector3(1, 1, 1);
let lastFireFill = -1;

// ---------- Game state ----------
let level = 0, N = RINGS_RESCUE, k = 0, score = 0, attempt = 0, fails = 0;
let phase = 'boot'; // boot | intro | ready | play | result | end
let holding = false, vy = 0, chain = 0, fireT = 0, lidY = 0, introT = 0, camY = 0;
let idleT = 0, playT = 0, firstTouchDone = false, beepT = 0, hintOn = false, safetyTimer = null;
let picked = false, demoDone = false, demoT = 0, demoStop = false, shakeT = 0;
const ringTop = (i) => -i * GAP + H;
const baseY = () => -N * GAP - 0.05;
const lvl = () => LEVELS[level % LEVELS.length];

// Free GPU memory of objects built for the previous attempt (shared ring geometry and cached materials are kept)
const sharedGeos = new Set(segGeos);
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => { if (![...matCache.values()].includes(m)) m.dispose(); });
  });
}

function buildLevel() {
  if (tower) { scene.remove(tower); disposeTree(tower); }
  [base, lid, cage, cat].forEach((o) => { if (o) { scene.remove(o); disposeTree(o); } });
  if (scene.background && scene.background.dispose) scene.background.dispose();
  flying.forEach((f) => f.m.parent && f.m.parent.remove(f.m)); flying = [];
  lid = cage = cat = null;
  const L = lvl();
  scene.background = gradientTex(L.bgTop, L.bgBot);
  N = RESCUE ? RINGS_RESCUE : RINGS_CLASSIC;
  const rand = rng(7 + attempt * 13 + level * 101);

  tower = new THREE.Group(); scene.add(tower);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, N * GAP + 10, 32), mat('#ffffff', { roughness: 0.3 }));
  pole.position.y = -N * GAP / 2 + 4; tower.add(pole);
  rings = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group(); g.position.y = -i * GAP; g.rotation.y = i * 0.14; // slight spiral, like the original
    const black = new Array(SEG).fill(false);
    if (i >= 5 && i < N - 1 && rand() < 0.62) {
      const start = Math.floor(rand() * SEG), len = 2 + (rand() < 0.35 ? 1 : 0);
      for (let j = 0; j < len; j++) black[(start + j) % SEG] = true;
    }
    const segs = [];
    for (let s = 0; s < SEG; s++) {
      const m = new THREE.Mesh(segGeos[s], mat(black[s] ? BLACK : L.ring, black[s] ? { roughness: 0.25 } : {}));
      m.userData = { s, black: black[s] }; g.add(m); segs.push(m);
    }
    tower.add(g); rings.push({ g, segs, black });
  }
  const baseR = RESCUE ? 3.4 : 2.3;
  base = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR, 0.3, 56), [mat('#ffffff'), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.5 }), mat('#ffffff')]);
  base.position.y = baseY() - 0.15; scene.add(base);
  if (RESCUE) buildRescue();

  k = 0; chain = 0; fireT = 0; vy = 0; holding = false; idleT = 0; playT = 0;
  if (level === 0) score = 0;
  ball.position.set(0, ringTop(0) + BALL_R + 0.9, BALL_Z);
  ball.visible = true; applyBallLook();
  ui.fire.classList.remove('on'); ui.danger.style.opacity = 0;
  document.documentElement.style.setProperty('--c', L.ui);
  ui.lvlA.textContent = 48 + level; ui.lvlBnum.textContent = 49 + level;
  updateHud();
}

function buildRescue() {
  cage = new THREE.Group(); cat = new THREE.Group();
  const cx = 0.2, cz = 2.75, y0 = baseY();
  const orange = mat('#ff9a3c'), cream = mat('#fff3e0'), dark = mat('#1e1e1e', { roughness: 0.2 }), pink = mat('#ff7a9a'), white = mat('#ffffff');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), orange); body.scale.set(1, 0.9, 1.05); body.position.y = 0.28;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), cream); belly.position.set(0, 0.26, 0.17); belly.scale.set(1, 1.1, 0.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), orange); head.position.set(0, 0.74, 0.08); head.scale.set(1.08, 0.95, 1);
  const earGeo = new THREE.ConeGeometry(0.1, 0.2, 12);
  const earL = new THREE.Mesh(earGeo, orange); earL.position.set(-0.17, 1.0, 0.04); earL.rotation.z = 0.35;
  const earR = new THREE.Mesh(earGeo, orange); earR.position.set(0.17, 1.0, 0.04); earR.rotation.z = -0.35;
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), cream); muzzle.position.set(0, 0.66, 0.33); muzzle.scale.set(1.35, 0.8, 0.7);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), pink); nose.position.set(0, 0.71, 0.41);
  const eyeGeo = new THREE.SphereGeometry(0.065, 14, 10);
  const eyeL = new THREE.Mesh(eyeGeo, dark); eyeL.position.set(-0.11, 0.8, 0.33);
  const eyeR = new THREE.Mesh(eyeGeo, dark); eyeR.position.set(0.11, 0.8, 0.33);
  const glintGeo = new THREE.SphereGeometry(0.02, 8, 6);
  const glL = new THREE.Mesh(glintGeo, white); glL.position.set(-0.09, 0.83, 0.39);
  const glR = new THREE.Mesh(glintGeo, white); glR.position.set(0.13, 0.83, 0.39);
  const whiskM = mat('#5a3a20');
  const whiskers = [];
  for (const side of [-1, 1]) for (const dy of [0, -0.035]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), whiskM);
    w.rotation.z = Math.PI / 2 + side * (0.15 + dy * 3); w.position.set(side * 0.2, 0.67 + dy, 0.36); whiskers.push(w);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16, Math.PI * 1.2), orange); tail.position.set(0.22, 0.32, -0.24); tail.rotation.set(0, 1.2, 0.3);
  cat.add(body, belly, head, earL, earR, muzzle, nose, eyeL, eyeR, glL, glR, tail, ...whiskers);
  catEyes = [eyeL, eyeR];
  cat.position.set(cx, y0, cz); scene.add(cat);

  const barM = mat('#8a8f98', { metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 6), barM);
    bar.position.set(Math.cos(a) * 0.58, 0.67, Math.sin(a) * 0.58); bar.userData.a = a; cage.add(bar);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 8, 32), barM); top.rotation.x = Math.PI / 2; top.position.y = 1.35; top.userData.top = true; cage.add(top);
  cage.position.set(cx, y0, cz); scene.add(cage);

  lid = new THREE.Group();
  lid.add(new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.35, 40), mat('#3a3f4a', { metalness: 0.5, roughness: 0.35 })));
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.27, 2.27, 0.1, 40), mat('#ff3b30', { emissive: '#661010' }));
  lid.add(stripe);
  const spikeM = mat('#d4d9e0', { metalness: 0.8, roughness: 0.2 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < (r ? 14 : 7); i++) {
    const a = (i / (r ? 14 : 7)) * Math.PI * 2 + r * 0.2, rad = r ? 1.7 : 1.05;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 10), spikeM);
    sp.rotation.x = Math.PI; sp.position.set(Math.cos(a) * rad, -0.45, Math.sin(a) * rad); lid.add(sp);
  }
  lidY = ringTop(0) + LID_START; lid.position.y = lidY; scene.add(lid);
}

// ---------- UI helpers ----------
function updateHud() { ui.fill.style.width = ((k / N) * 100).toFixed(1) + '%'; ui.score.textContent = score; }
function setHint(on) { hintOn = on; ui.hint.classList.toggle('on', on); }
let comboTimer = 0;
function showCombo(txt) { ui.combo.textContent = txt; ui.combo.style.opacity = 1; comboTimer = 0.5; }
let userTapped = false;
function vibrate(ms) { if (!userTapped) return; try { navigator.vibrate && navigator.vibrate(ms); } catch { /* not supported */ } }
function screenPos(v3) {
  const p = v3.clone().project(camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, visible: p.z < 1 && p.y > -1 && p.y < 1 };
}
function heartSvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 4.2 2.4h2c.6-1.2 2.1-2.4 4.2-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z');
  path.setAttribute('fill', '#ff4d6d'); path.setAttribute('stroke', '#fff'); path.setAttribute('stroke-width', '1.5');
  svg.appendChild(path);
  return svg;
}
function hearts(at, n = 8) {
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.appendChild(heartSvg());
    h.style.left = at.x + (Math.random() - 0.5) * 60 + 'px';
    h.style.top = at.y + 'px';
    h.style.setProperty('--dx', (Math.random() - 0.5) * 140 + 'px');
    h.style.animationDelay = i * 0.08 + 's';
    ui.hearts.appendChild(h);
    setTimeout(() => h.remove(), 2200);
  }
}

function segmentUnderBall(ring) {
  const wy = ring.g.getWorldPosition(new THREE.Vector3()).y;
  const v = ring.g.worldToLocal(new THREE.Vector3(0, wy, BALL_Z));
  let a = Math.atan2(-v.z, v.x); if (a < 0) a += Math.PI * 2;
  return Math.floor(a / ((Math.PI * 2) / SEG)) % SEG;
}

function breakRing(i) {
  const r = rings[i]; const L = lvl();
  r.g.updateMatrixWorld(true);
  r.segs.forEach((m) => {
    const ang = ((m.userData.s + 0.5) * Math.PI * 2) / SEG;
    const world = new THREE.Vector3(Math.cos(ang) * 1.3, 0.1, -Math.sin(ang) * 1.3).applyMatrix4(r.g.matrixWorld);
    scene.attach(m);
    const out = new THREE.Vector3(world.x, 0, world.z).normalize();
    flying.push({ m, v: new THREE.Vector3(out.x * (7 + Math.random() * 3), 2 + Math.random() * 3, out.z * (7 + Math.random() * 3)), w: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), t: 0.5 });
    burst(world, m.userData.black ? BLACK : L.ring, Math.round(8 * ballCfg.power), ballCfg.power);
  });
  tower.remove(r.g);
}

// ---------- Phases ----------
function startIntro() {
  phase = RESCUE ? 'intro' : 'ready';
  introT = 0;
  camY = RESCUE ? baseY() + 1.6 : ball.position.y;
  if (RESCUE) { setHint(false); ui.banner.classList.add('on'); }
  else afterIntro();
}

// After the intro: ball choice (variant C), then the self-playing demo (?demo=1), then the hint
function afterIntro() {
  if (PICK && !picked) { phase = 'pick'; setHint(false); ui.pick.classList.add('on'); return; }
  if (DEMO && !demoDone) { startDemo(); return; }
  phase = 'ready'; setHint(true);
}

function pickBall(type) {
  if (phase !== 'pick') return;
  ballCfg = BALLS[type] || BALLS.blue; picked = true; applyBallLook();
  unlockAudio(); userTapped = true; sfx.click();
  ui.pick.classList.remove('on');
  track('ball_pick', { ball: type });
  if (!firstTouchDone) { firstTouchDone = true; track('first_touch', { sinceLoad: Math.round(performance.now()), via: 'pick' }); }
  if (!safetyTimer) safetyTimer = setTimeout(() => { safetyTimer = null; if (phase !== 'end') showEnd('timeout'); }, SAFETY_TIMEOUT * 1000);
  ball.scale.set(1.6, 1.6, 1.6);
  burst(ball.position.clone(), ballCfg.trail, 30, 0.6);
  // Big caption that says what this ball does
  ui.banner.textContent = t(type + 'Toast'); ui.banner.classList.add('on');
  setTimeout(() => { ui.banner.classList.remove('on'); setTimeout(() => { if (phase !== 'result' && phase !== 'end' && phase !== 'demo') ui.banner.textContent = t('save'); }, 400); }, 1500);
  if (DEMO && !demoDone) startDemo(); else { phase = 'ready'; setHint(true); }
}

function startDemo() { phase = 'demo'; demoT = 0; demoStop = false; setHint(false); ui.ghost.classList.add('on'); }
function endDemo(skipped) {
  demoDone = true; holding = false;
  ui.ghost.classList.remove('on', 'press');
  track('demo_done', { skipped, rings: k });
  if (skipped) { beginPlay(); holding = true; return; }
  phase = 'ready'; vy = 0;
  ui.banner.textContent = t('yourTurn'); ui.banner.classList.add('on');
  setTimeout(() => { ui.banner.classList.remove('on'); setTimeout(() => { if (phase !== 'result' && phase !== 'end') ui.banner.textContent = t('save'); }, 400); }, 1100);
  setHint(true);
}

function beginPlay() {
  phase = 'play';
  setHint(false);
  if (!firstTouchDone) {
    firstTouchDone = true;
    track('first_touch', { sinceLoad: Math.round(performance.now()) });
  }
  if (!safetyTimer) safetyTimer = setTimeout(() => { safetyTimer = null; if (phase !== 'end') showEnd('timeout'); }, SAFETY_TIMEOUT * 1000);
}

function fail(reason) {
  if (phase !== 'play') return;
  phase = 'result'; holding = false; setHint(false);
  ball.visible = false; ui.fire.classList.remove('on'); fireT = 0;
  burst(ball.position.clone(), ballCfg.color, 70, 1.2);
  sfx.fail(); vibrate(60);
  fails++;
  const progress = Math.round((k / N) * 100);
  track('fail', { reason, progress, attempt: attempt + 1 });
  setTimeout(() => {
    ui.danger.style.opacity = 0;
    if (fails >= MAX_FAILS) { showEnd('fails'); return; }
    ui.resTitle.textContent = t('soClose');
    const why = reason === 'spikes' ? t('spikes') : t('black');
    ui.resText.textContent = why + (/[.!?]$/.test(why) ? ' ' : '. ') + t('progress', { p: progress });
    ui.result.classList.add('on');
  }, 700);
}

function retry() {
  track('retry');
  sfx.click();
  ui.result.classList.remove('on');
  attempt++;
  buildLevel();
  phase = 'ready'; camY = ball.position.y; setHint(true);
}

function win() {
  phase = 'result'; holding = false; setHint(false);
  ui.fire.classList.remove('on'); ui.danger.style.opacity = 0;
  sfx.win(); vibrate(30);
  for (let i = 0; i < 6; i++) setTimeout(() => burst(new THREE.Vector3((Math.random() - 0.5) * 3, baseY() + 1, (Math.random() - 0.5) * 2 + 1), LEVELS[(level + i) % LEVELS.length].ring, 40, 1.3), i * 110);
  if (RESCUE) {
    track('win', { attempt: attempt + 1 });
    cage.children.forEach((b) => {
      const a = b.userData.a ?? Math.random() * 6;
      flying.push({ m: b, v: new THREE.Vector3(Math.cos(a) * 4, 3 + Math.random() * 2, Math.sin(a) * 4), w: new THREE.Vector3(3, 1, 2), t: 1.2 });
    });
    sfx.meow(0.25);
    ui.banner.textContent = t('saved'); ui.banner.classList.add('on');
    setTimeout(() => hearts(screenPos(cat.position.clone().add(new THREE.Vector3(0, 1.1, 0)))), 250);
    setTimeout(() => showEnd('win'), 2000);
  } else {
    track('level_complete', { level: level + 1 });
    ui.banner.textContent = t('levelDone', { n: 48 + level }); ui.banner.classList.add('on');
    setTimeout(() => {
      ui.banner.classList.remove('on');
      if (level + 1 < CLASSIC_LEVELS) { level++; buildLevel(); phase = 'ready'; camY = ball.position.y; setHint(true); }
      else { track('win'); showEnd('win'); }
    }, 1500);
  }
}

function showEnd(reason) {
  if (phase === 'end') return;
  phase = 'end'; holding = false;
  clearTimeout(safetyTimer); safetyTimer = null;
  setHint(false); ui.result.classList.remove('on'); ui.banner.classList.remove('on'); ui.help.style.display = 'none';
  ui.ecBadge.classList.toggle('on', RESCUE && reason === 'win');
  ui.ecBadgeText.textContent = t('badge');
  ui.ecSub.textContent = RESCUE ? (reason === 'win' ? t('winSub') : t('failSub')) : t('classicSub');
  ui.end.classList.add('on');
  track('endcard_shown', { reason });
}

function replay() {
  track('replay');
  clearTimeout(safetyTimer); safetyTimer = null;
  ui.end.classList.remove('on');
  fails = 0; attempt++; level = 0; score = 0;
  ui.banner.textContent = t('save');
  buildLevel();
  phase = 'ready'; camY = ball.position.y; setHint(true);
}

// ---------- Input ----------
function onDown(e) {
  if (e.target.closest && e.target.closest('button, #endcard, #result, #pick')) return;
  unlockAudio(); userTapped = true;
  if (phase === 'demo') { idleT = 0; endDemo(true); return; } // a tap during the demo starts the game right away
  if (phase === 'ready') beginPlay();
  if (phase !== 'play') return;
  holding = true; idleT = 0; setHint(false);
}
function onUp() { holding = false; if (fireT <= 0) chain = 0; }
addEventListener('pointerdown', onDown);
addEventListener('pointerup', onUp);
addEventListener('pointercancel', onUp);
addEventListener('blur', onUp);

ui.retry.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); retry(); });
ui.play.addEventListener('click', (e) => { e.stopPropagation(); track('cta_click', { where: 'button' }); openStore(); });
ui.replay.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); replay(); });
ui.end.addEventListener('click', () => { track('cta_click', { where: 'card' }); openStore(); });
ui.pick.querySelectorAll('button[data-ball]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pickBall(b.dataset.ball); }));
ui.mute.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); setMuted(!isMuted()); ui.mute.classList.toggle('off', isMuted()); });

// Hidden page: the browser stops animation frames by itself. Here we only handle sound and the finger.
// (Earlier a "paused" flag waited for a "visible again" signal; on some phones that signal never came
// and the game stayed frozen. Now pausing is decided every frame from document.hidden.)
onVisibility((visible) => { if (visible) { resumeAudio(); clock.getDelta(); } else { pauseAudio(); onUp(); } });

// If the phone drops the 3D context (low memory), show a restart button instead of a frozen picture
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ui.lost.classList.add('on'); track('error', { kind: 'webgl_lost' }); });
ui.lost.addEventListener('click', () => location.reload());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h > 1 ? 44 : 56;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- Update loop ----------
const clock = new THREE.Clock();
const ONE = new THREE.Vector3(1, 1, 1);
const camLook = new THREE.Vector3();
let zoom = RESCUE ? 1 : 0;

function update(dt) {
  introT += dt;
  tower.rotation.y += dt * 1.55;

  // Intro: look at the kitty, then fly up to the ball
  if (phase === 'intro') {
    if (introT > INTRO_HOLD) ui.banner.classList.remove('on');
    if (introT > INTRO_HOLD + INTRO_FLY) { track('intro_done'); afterIntro(); }
  }

  // Demo: the game holds and releases by itself, avoiding black sectors, then hands over
  if (phase === 'demo') {
    demoT += dt;
    if (demoT > DEMO_TIME || k >= DEMO_RINGS) demoStop = true;
    // rhythm: hold half a second, let go half a second, so both smash and bounce are visible
    holding = !demoStop && demoT % 1.0 < 0.5 && !(k < N && rings[k].black[segmentUnderBall(rings[k])]);
    ui.ghost.classList.toggle('press', holding);
  }

  if (phase === 'play' || phase === 'demo') {
    if (phase === 'play') playT += dt;
    if (holding) vy = ballCfg.smash; else vy = Math.max(vy + G * dt, -12); // capped fall speed
    ball.position.y += vy * dt;
    while (k < N && ball.position.y - BALL_R <= ringTop(k)) {
      const r = rings[k];
      if (holding) { // fire mode makes black safe, but you still smash only while holding
        const s = segmentUnderBall(r);
        if (r.black[s] && fireT <= 0) {
          ball.position.y = ringTop(k) + BALL_R;
          if (phase === 'demo') { vy = BOUNCE; break; } // the demo never loses
          fail('black'); break;
        }
        breakRing(k); k++; chain++;
        if (ballCfg.double) {
          // Meteor: the next ring breaks too, unless its sector under the ball is black
          if (k < N && (!rings[k].black[segmentUnderBall(rings[k])] || fireT > 0)) { breakRing(k); k++; chain++; score += 10; }
          shockwave(ball.position.y - BALL_R, ballCfg.trail); sfx.thud();
        }
        if (ballCfg.shake) shakeT = 0.15;
        score += fireT > 0 ? 20 : 10;
        sfx.smash(chain); if (chain % 3 === 0) vibrate(8);
        if (k === 10) once('rings_10');
        if (chain > 2 && chain % 3 === 0 && fireT <= 0) showCombo('x' + chain);
        if (phase === 'play' && chain >= ballCfg.fireAt && fireT <= 0) { fireT = FIRE_TIME; ui.fire.classList.add('on'); sfx.fire(); once('fire_mode'); }
        updateHud();
      } else {
        ball.position.y = ringTop(k) + BALL_R; vy = BOUNCE;
        ball.scale.set(1.18 * ballCfg.scale, 0.82 * ballCfg.scale, 1.18 * ballCfg.scale);
        burst(new THREE.Vector3(0, ringTop(k) + 0.02, BALL_Z), '#7fb6ff', 3, 0.35);
        sfx.bounce();
        if (phase === 'demo' && demoStop) endDemo(false);
        break;
      }
    }
    if (phase === 'play' && k >= N && ball.position.y - BALL_R <= baseY()) { ball.position.y = baseY() + BALL_R; vy = 0; win(); }

    // Spikes: steady speed, but they catch up if the player is far ahead, so they always stay in view
    if (RESCUE && lid && phase === 'play') {
      const gap = lidY - 0.7 - (ball.position.y + BALL_R);
      const speed = LID_SPEED * (attempt > 0 ? RETRY_EASIER : 1);
      lidY -= dt * (speed + Math.max(0, gap - LID_FOLLOW) * 1.5);
      lid.position.y = lidY;
      const d = Math.max(0, Math.min(1, (2.2 - gap) / 2.2));
      ui.danger.style.opacity = d.toFixed(2);
      beepT -= dt;
      if (gap < 1.4 && beepT <= 0) { sfx.beep(); beepT = 0.35; }
      if (gap <= 0) fail('spikes');
    }

    if (phase === 'play' && !holding) { idleT += dt; if (idleT > IDLE_HINT && !hintOn) setHint(true); }
  }
  // Ball size: meteor is bigger, rocket stretches while flying down
  const bs = ballCfg.scale, stretch = ballCfg.flame && holding;
  ballTarget.set(bs * (stretch ? 0.82 : 1), bs * (stretch ? 1.35 : 1), bs * (stretch ? 0.82 : 1));
  ball.scale.lerp(ballTarget, 0.2);

  // Rocket flame and sparks
  const flameOn = !!ballCfg.flame && ball.visible && holding && (phase === 'play' || phase === 'demo');
  flame.visible = flameCore.visible = flameOn;
  if (flameOn) {
    const f = 0.8 + Math.random() * 0.4;
    flame.scale.set(1, f, 1); flame.position.set(0, ball.position.y + 0.95 * f + 0.05, BALL_Z);
    flameCore.scale.set(1, f, 1); flameCore.position.set(0, ball.position.y + 0.42 * f + 0.05, BALL_Z);
    flameMat.color.set(Math.random() < 0.5 ? '#ff9a3c' : '#ffb000');
    if (Math.random() < 0.7) spawn(ball.position.clone().add(V.set((Math.random() - 0.5) * 0.3, 0.5, 0)), new THREE.Vector3((Math.random() - 0.5) * 1.5, 3 + Math.random() * 2, 0.5), '#ffd36e', 0.35, 0.4, -0.2);
  }
  // Fireball embers, always
  if (ballCfg.embers && ball.visible && Math.random() < 0.55) {
    spawn(ball.position.clone().add(V.set((Math.random() - 0.5) * 0.35, 0.1, (Math.random() - 0.5) * 0.35)), new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random(), 0), Math.random() < 0.5 ? '#ffb000' : '#ff4d00', 0.5, 0.45, -0.25);
  }
  // Shock waves
  waves.forEach((w) => {
    if (w.t <= 0) return;
    w.t -= dt; const k01 = 1 - Math.max(0, w.t) / WAVE_TIME;
    const sc = 1 + k01 * 5; w.m.scale.set(sc, sc, sc); w.m.material.opacity = (1 - k01) * 0.85;
    if (w.t <= 0) w.m.visible = false;
  });
  // Fire meter: fills with the chain, shows the fire time while burning
  const ff = fireT > 0 ? fireT / FIRE_TIME : Math.min(1, chain / ballCfg.fireAt);
  const ffr = Math.round(ff * 50) / 50;
  if (ffr !== lastFireFill) { lastFireFill = ffr; ui.fireFill.style.width = (ffr * 100).toFixed(0) + '%'; }
  ui.fireBar.classList.toggle('hot', fireT > 0);
  ui.fireBar.classList.toggle('on', phase === 'play' || phase === 'demo' || phase === 'ready');

  // Fire mode
  if (fireT > 0) {
    fireT -= dt; ball.material.color.set('#ff7a00'); ball.material.emissive.set('#ff3d00');
    if (Math.random() < 0.6) burst(ball.position.clone().add(V.set(0, 0.2, 0)), Math.random() < 0.5 ? '#ffb000' : '#ff4d00', 2, 0.4);
    if (fireT <= 0) { ui.fire.classList.remove('on'); chain = 0; applyBallLook(); }
  }

  // Trail
  history.unshift(ball.position.clone()); if (history.length > 40) history.pop();
  const trailColor = fireT > 0 ? '#ff9a3c' : ballCfg.trail;
  trail.forEach((m, i) => {
    m.position.copy(history[Math.min(i * 2, history.length - 1)]);
    m.visible = ball.visible && (holding || fireT > 0) && i > 0;
    m.material.color.set(trailColor);
  });

  // Flying ring pieces and cage bars
  flying = flying.filter((f) => {
    f.t -= dt; f.v.y += G * 0.35 * dt; f.m.position.addScaledVector(f.v, dt);
    f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
    if (f.t < 0.35) f.m.scale.multiplyScalar(0.84);
    if (f.t <= 0) { f.m.parent && f.m.parent.remove(f.m); return false; }
    return true;
  });

  // Particles
  for (let i = 0; i < MAXP; i++) {
    const q = P[i];
    if (q.life > 0) {
      q.life -= dt; q.v.y += G * 0.45 * q.g * dt; q.p.addScaledVector(q.v, dt); q.r.x += dt * 5; q.r.y += dt * 4;
      tmpQ.setFromEuler(q.r); const s = Math.max(0, Math.min(1, q.life * 2)) * q.s; tmpS.set(s, s, s);
      tmpM.compose(q.p, tmpQ, tmpS);
    } else tmpM.makeScale(0, 0, 0);
    crumbs.setMatrixAt(i, tmpM);
  }
  crumbs.instanceMatrix.needsUpdate = true;

  // Kitty: cries while waiting, jumps after the rescue
  if (RESCUE && cat) {
    const saved = phase === 'end' || (phase === 'result' && k >= N);
    cat.position.y = baseY() + (saved ? Math.abs(Math.sin(introT * 8)) * 0.45 : Math.abs(Math.sin(introT * 3)) * 0.04);
    cat.rotation.y = saved ? Math.sin(introT * 10) * 0.3 : Math.sin(introT * 2) * 0.25;
    if (!saved && Math.random() < dt * 6) {
      const eye = catEyes[Math.random() < 0.5 ? 0 : 1].getWorldPosition(new THREE.Vector3());
      spawn(eye.add(V.set(0, -0.05, 0.05)), new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6, 0.5), '#7fd3ff', 0.6, 0.45, 0.5);
    }
    const sp = screenPos(cage.position.clone().add(V.set(0, 1.75, 0)));
    const show = sp.visible && sp.y > 60 && !saved && phase !== 'end';
    ui.help.style.display = show ? 'block' : 'none';
    if (show) { ui.help.style.left = sp.x + 'px'; ui.help.style.top = sp.y + 'px'; }
  }

  // Camera
  const targetY = phase === 'intro' && introT < INTRO_HOLD ? baseY() + 1.6 : (phase === 'result' || phase === 'end') && k >= N ? baseY() + (RESCUE ? 1.6 : 0.6) : ball.position.y;
  const follow = phase === 'intro' ? 0.06 : 0.15;
  camY += (targetY - camY) * follow;
  // Close-up on the kitty during the intro and after the rescue, normal view while playing
  const wantClose = RESCUE && ((phase === 'intro' && introT < INTRO_HOLD) || ((phase === 'result' || phase === 'end') && k >= N));
  zoom += ((wantClose ? 1 : 0) - zoom) * 0.08;
  shakeT = Math.max(0, shakeT - dt);
  const sh = shakeT > 0 ? ballCfg.shake : 0;
  camera.position.set((Math.random() - 0.5) * sh, camY + 6.2 - zoom * 3.6 + (Math.random() - 0.5) * sh, 8.6 - zoom * 2.0);
  camLook.set(zoom * 0.2, camY - 1.6 + zoom * 0.45, zoom * 2.4);
  camera.lookAt(camLook);

  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) ui.combo.style.opacity = 0; }
}

let loopErrors = 0;
function loop() {
  requestAnimationFrame(loop); // schedule first, so one bad frame can never stop the game
  const dt = Math.min(clock.getDelta(), 0.033);
  try {
    if (!document.hidden && !window.__pause && phase !== 'boot') update(dt);
    renderer.render(scene, camera);
  } catch (err) {
    if (loopErrors++ < 3) { console.error(err); track('error', { kind: 'frame', message: String(err && err.message).slice(0, 80) }); }
  }
}

// Debug helpers for automated checks (no effect on normal play)
window.__sim = (secs, hold) => {
  if (hold !== undefined) {
    if (hold && phase === 'ready') beginPlay();
    holding = hold && phase === 'play';
    if (holding) idleT = 0;
    if (!hold && fireT <= 0) chain = 0;
  }
  for (let i = 0; i < secs * 60; i++) update(1 / 60);
  renderer.render(scene, camera);
  return { phase, k, N, score, fails, fire: fireT > 0, lidGap: lid ? +(lidY - 0.7 - ball.position.y - BALL_R).toFixed(2) : null };
};
window.__intro = () => { ui.end.classList.remove('on'); ui.result.classList.remove('on'); ui.pick.classList.remove('on'); ui.ghost.classList.remove('on', 'press'); ui.banner.textContent = t('save'); fails = 0; attempt = 0; level = 0; firstTouchDone = false; picked = false; demoDone = false; ballCfg = BALLS.blue; zoom = RESCUE ? 1 : 0; clearTimeout(safetyTimer); safetyTimer = null; buildLevel(); startIntro(); };
window.__pick = (type) => pickBall(type);
window.__danger = () => phase === 'play' && k < N && rings[k].black[segmentUnderBall(rings[k])] && fireT <= 0;

// ---------- Start ----------
buildLevel();
loop();
whenReady(() => { track('loaded', { variant }); startIntro(); });
