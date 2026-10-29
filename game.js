'use strict';

/* ========================================================================
   Factory Builder MVP — a playable Factorio-like in ~1 file.
   Open index.html directly (file://) or serve with any static server.
   ======================================================================== */

// ---------------- World / tile constants ----------------
const TILE = 16;
const CHUNKS_W = 52;              // chunks per side (exactly 52)
const WORLD_T = CHUNKS_W * 16;    // 832 tiles per side
const WORLD_PX = WORLD_T * TILE;  // 13312 px
const TICK_MS = 50;               // simulation tick = 20 Hz

const RES_NONE = 0, RES_IRON = 1, RES_COPPER = 2, RES_COAL = 3, RES_STONE = 4;
const RES_ITEM = [null, 'iron-ore', 'copper-ore', 'coal', 'stone'];
const RES_COLOR = [null, '#8f9ea8', '#c07a3d', '#2b2b2b', '#aaaaaa'];
const DECO_NONE = 0, DECO_TREE = 1, DECO_ROCK = 2;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W

const ITEM_IDS = ['iron-ore', 'copper-ore', 'coal', 'stone',
                  'iron-plate', 'copper-plate', 'iron-gear', 'electronic-circuit'];
const ITEM = {
  'iron-ore': { name: 'Iron Ore', color: '#8f9ea8' },
  'copper-ore': { name: 'Copper Ore', color: '#c07a3d' },
  coal: { name: 'Coal', color: '#333333' },
  stone: { name: 'Stone', color: '#aaaaaa' },
  'iron-plate': { name: 'Iron Plate', color: '#e8e8e8' },
  'copper-plate': { name: 'Copper Plate', color: '#e09050' },
  'iron-gear': { name: 'Iron Gear Wheel', color: '#d0d0d0' },
  'electronic-circuit': { name: 'Electronic Circuit', color: '#5b8fd9' },
};
const STACK = 100;

const BELT_SUBTYPES = [
  { kind: 'straight', dirs: [0] }, // N
  { kind: 'straight', dirs: [1] }, // E
  { kind: 'corner',   dirs: [0, 1] },
  { kind: 'corner',   dirs: [1, 2] },
  { kind: 'corner',   dirs: [2, 3] },
  { kind: 'corner',   dirs: [3, 0] },
];

const BUILDING_INFO = {
  belt: { name: 'Conveyor Belt', solid: false, rotatable: true },
  drill: { name: 'Mining Drill', solid: true, rotatable: true },
  furnace: { name: 'Furnace', solid: true },
  assembler: { name: 'Assembler', solid: true },
  chest: { name: 'Chest', solid: true },
  pole: { name: 'Electric Pole', solid: false },
  inserter: { name: 'Inserter', solid: false, rotatable: true },
};

const BUILD_COSTS = {
  belt: [{ id: 'iron-plate', q: 1 }],
  drill: [{ id: 'iron-plate', q: 5 }, { id: 'iron-ore', q: 5 }],
  furnace: [{ id: 'stone', q: 15 }],
  assembler: [{ id: 'iron-plate', q: 10 }, { id: 'copper-plate', q: 5 }],
  chest: [{ id: 'stone', q: 10 }],
  pole: [{ id: 'copper-plate', q: 5 }],
  inserter: [{ id: 'iron-plate', q: 5 }, { id: 'iron-gear', q: 1 }],
};

const HOTBAR = ['belt', 'drill', 'furnace', 'assembler', 'chest', 'pole', 'inserter', null, null];

const RECIPES = {
  furnace: {
    'iron-plate': { in: { 'iron-ore': 1, coal: 1 }, out: 'iron-plate', time: 4.0 },
    'copper-plate': { in: { 'copper-ore': 1, coal: 1 }, out: 'copper-plate', time: 4.0 },
  },
  assembler: {
    'iron-gear': { in: { 'iron-plate': 2 }, out: 'iron-gear', time: 4.0 },
    'electronic-circuit': { in: { 'iron-plate': 1, 'copper-plate': 1 }, out: 'electronic-circuit', time: 6.0 },
  },
};

const TECHS = [
  { id: 'mining-i', name: 'Mining Automation', desc: 'Drills 50% faster.', cost: { 'iron-plate': 10 }, effect: { drill: 1.5 } },
  { id: 'smelting-i', name: 'Improved Smelting', desc: 'Furnaces 50% faster.', cost: { 'iron-plate': 10, coal: 5 }, effect: { furnace: 1.5 } },
  { id: 'belt-i', name: 'Belt Overclock', desc: 'Belts 50% faster.', cost: { 'iron-plate': 20 }, effect: { belt: 1.5 } },
  { id: 'assembly-i', name: 'Advanced Assembly', desc: 'Assemblers 50% faster.', cost: { 'iron-gear': 5, 'electronic-circuit': 5 }, effect: { assembler: 1.5 } },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------------- Seeded RNG (xorshift32) + noise ----------------
function mulberry(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashCell(seed, cx, cy) {
  let h = seed ^ ((cx * 1949 + cy * 7919) | 0) ^ 0x85EBCA77;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE3D);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function noise2(seed, x, y, cell) {
  const x0 = Math.floor(x / cell), y0 = Math.floor(y / cell);
  const fx = (x / cell) - x0, fy = (y / cell) - y0;
  const a = hashCell(seed, x0, y0), b = hashCell(seed, x0 + 1, y0);
  const c = hashCell(seed, x0, y0 + 1), d = hashCell(seed, x0 + 1, y0 + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// ---------------- World tiles (52x52 chunks = 832x832 tiles) ----------------
const res = new Uint8Array(WORLD_T * WORLD_T);       // resource type per tile
const resAmt = new Uint16Array(WORLD_T * WORLD_T);   // amount left on resource tile
const deco = new Uint8Array(WORLD_T * WORLD_T);      // tree/rock decoration
const depositEdits = {};                             // idx -> overridden amount (mined/gathered)

function idx(x, y) { return y * WORLD_T + x; }
function inBounds(x, y) { return x >= 0 && x < WORLD_T && y >= 0 && y < WORLD_T; }
function getRes(x, y) { if (!inBounds(x, y)) return 0; return res[idx(x, y)]; }
function getResAmt(x, y) {
  if (!inBounds(x, y)) return 0;
  const i = idx(x, y);
  return depositEdits[i] !== undefined ? depositEdits[i] : resAmt[i];
}
function decResAmt(x, y, n) {
  const i = idx(x, y);
  let cur = getResAmt(x, y) - n;
  if (cur < 0) cur = 0;
  resAmt[i] = cur;
  depositEdits[i] = cur;
  return cur;
}

function generateWorld(seed) {
  const r = mulberry(seed);
  res.fill(0); resAmt.fill(0); deco.fill(0);
  Object.keys(depositEdits).forEach(k => delete depositEdits[k]);
  const sx = Math.floor(WORLD_T / 2), sy = Math.floor(WORLD_T / 2);

  function deposit(cx, cy, radius, type, baseAmt) {
    for (let dy = -radius; dy <= radius; dy++) {
      const y = cy + dy; if (y < 0 || y >= WORLD_T) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx; if (x < 0 || x >= WORLD_T) continue;
        const d = Math.hypot(dx, dy); if (d > radius) continue;
        const i = idx(x, y); if (res[i] !== 0) continue;
        res[i] = type;
        resAmt[i] = Math.max(1, Math.floor(baseAmt * (1 - d / radius)));
        depositEdits[i] = resAmt[i];
      }
    }
  }

  // Resource patches distributed across the world
  for (let k = 0; k < 22; k++) { const c = Math.floor(r() * WORLD_T); const d = Math.floor(r() * WORLD_T); deposit(c, d, 14 + r() * 14, RES_IRON, 300); }
  for (let k = 0; k < 18; k++) { const c = Math.floor(r() * WORLD_T); const d = Math.floor(r() * WORLD_T); deposit(c, d, 12 + r() * 12, RES_COPPER, 280); }
  for (let k = 0; k < 26; k++) { const c = Math.floor(r() * WORLD_T); const d = Math.floor(r() * WORLD_T); deposit(c, d, 10 + r() * 14, RES_COAL, 250); }
  for (let k = 0; k < 18; k++) { const c = Math.floor(r() * WORLD_T); const d = Math.floor(r() * WORLD_T); deposit(c, d, 12 + r() * 12, RES_STONE, 320); }

  // Clear starting area and place guaranteed deposits nearby
  for (let dy = -90; dy <= 90; dy++) { const y = sy + dy; if (y < 0 || y >= WORLD_T) continue;
    for (let dx = -90; dx <= 90; dx++) { const x = sx + dx; if (x < 0 || x >= WORLD_T) continue;
      const i = idx(x, y); res[i] = 0; resAmt[i] = 0; deco[i] = 0; delete depositEdits[i]; }
  }
  deposit(sx + 30, sy - 10, 14, RES_IRON, 500);
  deposit(sx - 25, sy + 18, 12, RES_COPPER, 400);
  deposit(sx + 5, sy + 35, 14, RES_COAL, 450);

  // Forests / rock bands from noise
  for (let y = 0; y < WORLD_T; y++) {
    for (let x = 0; x < WORLD_T; x++) {
      if (Math.hypot(x - sx, y - sy) < 95) continue;
      const i = idx(x, y); if (res[i] !== 0) continue;
      const n = noise2(seed, x, y, 44);
      if (n > 0.625) deco[i] = DECO_TREE;
      else if (n > 0.56 && n < 0.605) deco[i] = DECO_ROCK;
      else if (n > 0.495 && n < 0.535 && r() < 0.35) deco[i] = DECO_ROCK;
    }
  }
  for (let k = 0; k < 1400; k++) {
    const x = Math.floor(r() * WORLD_T), y = Math.floor(r() * WORLD_T);
    const i = idx(x, y);
    if (res[i] === 0 && deco[i] === 0 && Math.hypot(x - sx, y - sy) > 115) deco[i] = DECO_ROCK;
  }
}

// ---------------- Sprite cache (procedural graphics) ----------------
const sprites = {};
function sprite(key, w, h, draw) {
  if (sprites[key]) return sprites[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  sprites[key] = c;
  return c;
}

const GRASS_BASE = ['#78a64d', '#7fab55', '#6e9a4e', '#82b252'];
function drawGrass(ctx, v) {
  ctx.fillStyle = GRASS_BASE[v]; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#5b8639';
  const r = mulberry(987653 + v * 131);
  for (let i = 0; i < 30; i++) ctx.fillRect(r() * TILE | 0, r() * TILE | 0, 2, 2);
  ctx.fillStyle = '#a8c87a';
  const r2 = mulberry(44102 + v * 97);
  for (let i = 0; i < 10; i++) ctx.fillRect(r2() * TILE | 0, r2() * TILE | 0, 1, 1);
}
function getGrass(x, y) { return sprite('grass' + (((x & 1) | ((y & 1) << 1))), TILE, TILE, drawGrass); }

function drawResOverlay(ctx, type) {
  ctx.fillStyle = RES_COLOR[type] + '66'; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#00000044';
  const r = mulberry(5000 + type * 991);
  for (let i = 0; i < 26; i++) ctx.fillRect(r() * TILE | 0, r() * TILE | 0, 2, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
}
function getResSprite(type) { return sprite('res' + type, TILE, TILE, ctx => drawResOverlay(ctx, type)); }

function drawTree(ctx) {
  ctx.fillStyle = '#5d4a3a'; ctx.fillRect(10, 14, 6, 10);
  ctx.fillStyle = '#4a8a3a'; ctx.beginPath(); ctx.arc(9, 8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#447a34'; ctx.beginPath(); ctx.arc(19, 10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(14, 4, 6, 0, Math.PI * 2); ctx.fill();
}
function drawRock(ctx) {
  ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(8, 10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(14, 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(4, 6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(12, 14, 6, 0, Math.PI * 2); ctx.fill();
}

function drawBeltSprite(ctx, sub) {
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#525252';
  if (sub.kind === 'straight') {
    const d = sub.dirs[0];
    if (d === 0 || d === 2) ctx.fillRect(6, 0, 4, TILE); else ctx.fillRect(0, 6, TILE, 4);
    } else {
    const d0 = sub.dirs[0], d1 = sub.dirs[1];
    ctx.beginPath(); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#525252';
    // arc center is the inner corner between the two edges; draw clockwise
    let cx, cy, a0, a1;
    if (d0 === 0 && d1 === 1) { cx = 15; cy = 1; a0 = Math.PI; a1 = Math.PI / 2; }
    else if (d0 === 1 && d1 === 2) { cx = 15; cy = 15; a0 = -Math.PI / 2; a1 = -Math.PI; }
    else if (d0 === 2 && d1 === 3) { cx = 1; cy = 15; a0 = 0; a1 = -Math.PI / 2; }
    else { cx = 1; cy = 1; a0 = Math.PI / 2; a1 = 0; }
    ctx.arc(cx, cy, 7, a0, a1, false);
    ctx.stroke();
  }
  ctx.fillStyle = '#9ecbff'; ctx.globalAlpha = 0.85;
  if (sub.kind === 'straight') {
    const d = sub.dirs[0];
    if (d === 0) { ctx.fillRect(7, 4, 2, 4); ctx.fillRect(7, 10, 2, 2); }
    else if (d === 1) { ctx.fillRect(10, 7, 4, 2); ctx.fillRect(4, 7, 2, 2); }
    else if (d === 2) { ctx.fillRect(7, 10, 2, 4); ctx.fillRect(7, 4, 2, 2); }
    else { ctx.fillRect(4, 7, 4, 2); ctx.fillRect(10, 7, 2, 2); }
  } else {
    ctx.fillRect(7, 7, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawDrill(ctx, rot) {
  ctx.fillStyle = '#7a6254'; ctx.fillRect(1, 1, 14, 14);
  ctx.strokeStyle = '#5a483c'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 14, 14);
  ctx.fillStyle = '#9a7e6c';
  const h = [[6, 0, 4, 7], [9, 6, 7, 4], [6, 9, 4, 7], [0, 6, 7, 4]][rot];
  ctx.fillRect(h[0], h[1], h[2], h[3]);
  ctx.fillStyle = '#3d352f';
  const t = [[6, 0, 4, 2], [11, 6, 2, 4], [6, 11, 4, 2], [0, 6, 2, 4]][rot];
  ctx.fillRect(t[0], t[1], t[2], t[3]);
}

function drawFurnace(ctx) {
  ctx.fillStyle = '#8a7a6a'; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#b0a080'; ctx.fillRect(0, 0, TILE, 5);
  ctx.fillStyle = '#6a5a4c'; ctx.fillRect(2, 8, 12, 6);
  ctx.strokeStyle = '#5a483c'; ctx.lineWidth = 1; ctx.strokeRect(2, 8, 12, 6);
  ctx.fillStyle = '#7a6a5a'; ctx.fillRect(6, 0, 4, 3);
}

function drawAssembler(ctx) {
  ctx.fillStyle = '#4a6fa5'; ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#385580'; ctx.fillRect(0, 0, TILE, 5);
  ctx.fillStyle = '#5b8fd9'; ctx.fillRect(3, 3, 10, 3);
  ctx.strokeStyle = '#2a3d60'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, TILE, TILE);
  ctx.fillStyle = '#f0c420'; ctx.beginPath(); ctx.arc(8, 12, 3, 0, Math.PI * 2); ctx.fill();
}

function drawChest(ctx) {
  ctx.fillStyle = '#8d5a2c'; ctx.fillRect(2, 6, 12, 8);
  ctx.fillStyle = '#7a4a20'; ctx.fillRect(2, 2, 12, 6);
  ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 1; ctx.strokeRect(2, 6, 12, 8);
  ctx.fillStyle = '#d4a050'; ctx.fillRect(7, 6, 2, 2);
}

function drawPole(ctx) {
  ctx.strokeStyle = '#e7c860'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(8, 14); ctx.stroke();
  ctx.fillStyle = '#e7c860'; ctx.beginPath(); ctx.arc(8, 3, 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d4b450'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(14, 10); ctx.moveTo(8, 8); ctx.lineTo(8, 12); ctx.stroke();
}

function drawInserterBase(ctx) {
  ctx.fillStyle = '#666'; ctx.fillRect(6, 6, 4, 4);
  ctx.fillStyle = '#444'; ctx.fillRect(7, 7, 2, 2);
}

function drawItem(id) {
  return sprite('item-' + id, 12, 12, ctx => {
    const c = ITEM[id].color;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 12, 12);
    ctx.fillStyle = c; ctx.fillRect(2, 2, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(3, 3, 3, 2);
    ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(2, 2, 8, 8);
  });
}

sprite('grass0', TILE, TILE, ctx => drawGrass(ctx, 0));
sprite('grass1', TILE, TILE, ctx => drawGrass(ctx, 1));
sprite('grass2', TILE, TILE, ctx => drawGrass(ctx, 2));
sprite('grass3', TILE, TILE, ctx => drawGrass(ctx, 3));
for (let t = 1; t <= 4; t++) sprite('res' + t, TILE, TILE, ctx => drawResOverlay(ctx, t));
sprite('tree', 26, 26, drawTree);
sprite('rock', 22, 22, drawRock);
for (let rot = 0; rot < 6; rot++) sprite('belt-' + rot, TILE, TILE, ctx => drawBeltSprite(ctx, BELT_SUBTYPES[rot]));
for (let rot = 0; rot < 4; rot++) sprite('drill-' + rot, TILE, TILE, ctx => drawDrill(ctx, rot));
sprite('furnace', TILE, TILE, drawFurnace);
sprite('assembler', TILE, TILE, drawAssembler);
sprite('chest', TILE, TILE, drawChest);
sprite('pole', TILE, TILE, drawPole);
sprite('inserter-base', TILE, TILE, drawInserterBase);
ITEM_IDS.forEach(id => drawItem(id));

// ---------------- Game state ----------------
const player = { x: 0, y: 0, inv: {}, gatherCd: 0 };
const buildings = {};      // idx -> building
const beltItems = [];      // items riding belts
const floaters = [];       // floating text
let camera = { x: 0, y: 0 };
let cameraTarget = { x: 0, y: 0 };
let followTarget = true;
let zoom = 1;
let seed = 0;
let paused = false;
let beltTickCounter = 0;
let beltInterval = 4;
let techs = { unlocked: {}, drill: 1, furnace: 1, assembler: 1, belt: 1 };
let simSpeed = 1;

let selectedSlot = -1;     // hotbar index 0..8
let selectedBuild = null;  // idx of selected placed building
let placementMode = false;
let ghostRot = 0;

let lastTime = performance.now();
let acc = 0;
let frames = 0, fpsTime = 0, fps = 0;

// ---------------- Inventory helpers ----------------
function invAdd(id, q) {
  player.inv[id] = (player.inv[id] || 0) + q;
  renderHotbar();
  if (document.getElementById('panelInventory').classList.contains('open')) renderInventoryPanel();
}
function invHas(id, q) { return (player.inv[id] || 0) >= q; }
function invRemove(id, q) {
  const cur = player.inv[id] || 0;
  if (cur <= q) { delete player.inv[id]; } else player.inv[id] = cur - q;
  renderHotbar();
  if (document.getElementById('panelInventory').classList.contains('open')) renderInventoryPanel();
}
function invTotal() { let t = 0; for (const k in player.inv) t += player.inv[k]; return t; }
function canAfford(costs) { for (const c of costs) if (!invHas(c.id, c.q)) return false; return true; }
function pay(costs) { for (const c of costs) invRemove(c.id, c.q); }
function refund(costs) { for (const c of costs) invAdd(c.id, c.q); }

// ---------------- Buildings ----------------
function maxRot(type) {
  if (type === 'belt') return 6;
  if (type === 'drill' || type === 'inserter') return 4;
  return 0;
}
function addBuilding(type, x, y) {
  const i = idx(x, y);
  const b = { type, x, y, rot: 0 };
  if (type === 'drill') { b.output = { id: null, count: 0 }; b.progress = 0; b.status = 'idle'; }
  else if (type === 'furnace') { b.inputs = {}; b.output = { id: null, count: 0 }; b.progress = 0; b.recipe = null; b.status = 'idle'; }
  else if (type === 'assembler') { b.inputs = {}; b.output = { id: null, count: 0 }; b.progress = 0; b.recipe = null; b.status = 'idle'; }
  else if (type === 'chest') { b.inv = {}; }
  else if (type === 'belt') { b.rot = 0; }
  else if (type === 'inserter') { b.rot = 0; b.state = 'idle'; b.progress = 0; b.held = null; b.status = 'idle'; }
  buildings[i] = b;
  return b;
}
function buildingAt(x, y) { return inBounds(x, y) ? buildings[idx(x, y)] : null; }
function solidTile(x, y) {
  if (!inBounds(x, y)) return true;
  const i = idx(x, y);
  if (deco[i] !== 0) return true;
  const b = buildings[i];
  return b ? BUILDING_INFO[b.type].solid : false;
}
function canPlace(type, x, y) {
  if (!inBounds(x, y)) return false;
  const i = idx(x, y);
  if (deco[i] !== 0) return false;
  if (buildings[i]) return false;
  const r = getRes(x, y);
  if (type === 'drill') return r !== 0;
  return r === 0; // non-drill buildings cannot be placed on resource deposits
}
function tryPlace(type, x, y) {
  if (!canPlace(type, x, y)) { msg('Cannot place here', 'error'); return false; }
  const costs = BUILD_COSTS[type];
  if (!canAfford(costs)) { msg('Not enough resources', 'error'); return false; }
  pay(costs);
  addBuilding(type, x, y);
  msg('Placed ' + BUILDING_INFO[type].name, 'ok');
  return true;
}
function removeBuilding(idxKey) {
  const b = buildings[idxKey]; if (!b) return;
  const costs = BUILD_COSTS[b.type];
  refund(costs);
  msg('Removed ' + BUILDING_INFO[b.type].name, 'ok');
  delete buildings[idxKey];
  if (selectedBuild === idxKey) { selectedBuild = null; hideBuildPanel(); }
  if (document.getElementById('panelBuild').classList.contains('open') && selectedBuild === null) hideBuildPanel();
}

// ---------------- Simulation ----------------
function beltAddItem(x, y, id, dir) {
  const b = buildingAt(x, y);
  if (!b || b.type !== 'belt') return false;
  const i = idx(x, y);
  let n = 0; for (const it of beltItems) if (it.x === x && it.y === y) n++;
  if (n >= 4) return false;
  const now = performance.now();
  beltItems.push({ x, y, id, dir, fromX: x, fromY: y, moveStart: now, moveDuration: beltInterval * TICK_MS });
  return true;
}
function pickFromSource(b) {
  const sx = b.x + DIRS[(b.rot + 2) % 4][0], sy = b.y + DIRS[(b.rot + 2) % 4][1];
  // belt item on source tile
  for (let k = 0; k < beltItems.length; k++) {
    const it = beltItems[k];
    if (it.x === sx && it.y === sy && it.fromX === it.x && it.fromY === it.y) {
      const id = it.id; beltItems.splice(k, 1); return id;
    }
  }
  const tb = buildingAt(sx, sy);
  if (tb) {
    if (tb.type === 'drill' && tb.output && tb.output.count > 0) { const id = tb.output.id; tb.output.count--; return id; }
    if (tb.type === 'furnace' && tb.output && tb.output.count > 0) { const id = tb.output.id; tb.output.count--; return id; }
    if (tb.type === 'assembler' && tb.output && tb.output.count > 0) { const id = tb.output.id; tb.output.count--; return id; }
    if (tb.type === 'chest') { for (const id in tb.inv) { if (tb.inv[id] > 0) { tb.inv[id]--; if (tb.inv[id] <= 0) delete tb.inv[id]; return id; } } }
  }
  return null;
}
function putToSource(b, id) {
  const sx = b.x + DIRS[(b.rot + 2) % 4][0], sy = b.y + DIRS[(b.rot + 2) % 4][1];
  const tb = buildingAt(sx, sy);
  if (tb) {
    if (tb.type === 'drill' && tb.output && tb.output.id === id && tb.output.count < 50) { tb.output.count++; return true; }
    if (tb.type === 'furnace' && tb.output && tb.output.id === id && tb.output.count < 50) { tb.output.count++; return true; }
    if (tb.type === 'assembler' && tb.output && tb.output.id === id && tb.output.count < 50) { tb.output.count++; return true; }
    if (tb.type === 'chest') { let total = 0; for (const k in tb.inv) total += tb.inv[k]; if (total < 400) { tb.inv[id] = (tb.inv[id] || 0) + 1; return true; } }
  }
  return beltAddItem(sx, sy, id, (b.rot + 2) % 4);
}
function dropToTarget(b, id) {
  const tx = b.x + DIRS[b.rot][0], ty = b.y + DIRS[b.rot][1];
  const tb = buildingAt(tx, ty);
  if (!tb) return beltAddItem(tx, ty, id, b.rot);
  if (tb.type === 'belt') return beltAddItem(tx, ty, id, b.rot);
  if (tb.type === 'chest') { let total = 0; for (const k in tb.inv) total += tb.inv[k]; if (total < 400) { tb.inv[id] = (tb.inv[id] || 0) + 1; return true; } return false; }
  if (tb.type === 'furnace' || tb.type === 'assembler') {
    if (!tb.recipe) return false;
    const rec = (tb.type === 'furnace' ? RECIPES.furnace : RECIPES.assembler)[tb.recipe];
    if (!rec || !rec.in[id]) return false;
    if ((tb.inputs[id] || 0) >= rec.in[id]) return false;
    tb.inputs[id] = (tb.inputs[id] || 0) + 1;
    return true;
  }
  return false;
}
function machineProgressInc(type, baseTime) {
  const mult = type === 'drill' ? techs.drill : type === 'furnace' ? techs.furnace : techs.assembler;
  return mult / (baseTime * (1000 / TICK_MS));
}
function simTick() {
  if (paused) return;
  beltTickCounter++;
  const moveNow = (beltTickCounter % beltInterval === 0);

  // ---- belts ----
  const leaving = {}, incoming = {}, plans = [];
  if (moveNow) {
    for (const it of beltItems) {
      const b = buildingAt(it.x, it.y);
      if (!b || b.type !== 'belt') continue;
      const sub = BELT_SUBTYPES[b.rot];
      let exit;
      if (sub.kind === 'straight') exit = sub.dirs[0];
      else { const d = sub.dirs; exit = (it.dir === d[0]) ? d[1] : (it.dir === d[1] ? d[0] : null); }
      if (exit === null) continue;
      const tx = it.x + DIRS[exit][0], ty = it.y + DIRS[exit][1];
      const tb = buildingAt(tx, ty);
      if (!tb || tb.type !== 'belt') continue; // item rests at belt end
      const sIdx = idx(it.x, it.y), tIdx = idx(tx, ty);
      let cur = 0; for (const o of beltItems) if (o.x === tx && o.y === ty && o.fromX === o.x && o.fromY === o.y) cur++;
      if (cur - (leaving[tIdx] || 0) + (incoming[tIdx] || 0) < 4) {
        plans.push({ it, tx, ty, exit, tIdx });
        leaving[sIdx] = (leaving[sIdx] || 0) + 1;
        incoming[tIdx] = (incoming[tIdx] || 0) + 1;
      }
    }
    const now = performance.now();
    for (const p of plans) {
      p.it.fromX = p.it.x; p.it.fromY = p.it.y;
      p.it.x = p.tx; p.it.y = p.ty; p.it.dir = p.exit;
      p.it.moveStart = now; p.it.moveDuration = beltInterval * TICK_MS;
    }
  }

  // ---- drills ----
  for (const k in buildings) {
    const b = buildings[k];
    if (b.type !== 'drill') continue;
    const r = getRes(b.x, b.y);
    if (r && getResAmt(b.x, b.y) > 0 && b.output.count < 50) {
      b.progress += machineProgressInc('drill', 2.0);
      b.status = 'working';
      if (b.progress >= 1) { b.progress = 0; decResAmt(b.x, b.y, 1); b.output.id = RES_ITEM[r]; b.output.count++; }
    } else {
      b.status = (getRes(b.x, b.y) && getResAmt(b.x, b.y) === 0) ? 'idle' : 'idle';
      if (b.output.count > 0) {
        const tx = b.x + DIRS[b.rot][0], ty = b.y + DIRS[b.rot][1];
        if (buildingAt(tx, ty) && buildingAt(tx, ty).type === 'belt') {
          if (beltAddItem(tx, ty, b.output.id, b.rot)) b.output.count--;
        }
      }
    }
  }

  // ---- inserters ----
  for (const k in buildings) {
    const b = buildings[k];
    if (b.type !== 'inserter') continue;
    if (b.state === 'idle') {
      const id = pickFromSource(b);
      if (id) { b.held = id; b.state = 'pick'; b.progress = 0; b.status = 'working'; }
      else b.status = 'idle';
    } else if (b.state === 'pick') {
      b.progress += 0.1;
      if (b.progress >= 1) { b.state = 'drop'; b.progress = 0; }
    } else if (b.state === 'drop') {
      b.progress += 0.1;
      if (b.progress >= 1) {
        const ok = dropToTarget(b, b.held);
        if (!ok) putToSource(b, b.held);
        b.held = null; b.state = 'idle'; b.progress = 0; b.status = 'idle';
      }
    }
  }

  // ---- furnaces ----
  for (const k in buildings) {
    const b = buildings[k];
    if (b.type !== 'furnace') continue;
    if (!b.recipe) { b.status = 'idle'; continue; }
    const rec = RECIPES.furnace[b.recipe];
    let okIn = true; for (const id in rec.in) if ((b.inputs[id] || 0) < rec.in[id]) { okIn = false; break; }
    const outCap = (b.output.id === null || b.output.id === rec.out) && b.output.count < 50;
    if (okIn && outCap) {
      b.progress += machineProgressInc('furnace', rec.time);
      b.status = 'working';
      if (b.progress >= 1) {
        b.progress = 0;
        for (const id in rec.in) { b.inputs[id] -= rec.in[id]; if (b.inputs[id] <= 0) delete b.inputs[id]; }
        if (b.output.id === null) b.output.id = rec.out;
        b.output.count++;
      }
    } else {
      b.status = outCap ? 'idle' : 'blocked';
    }
  }

  // ---- assemblers ----
  for (const k in buildings) {
    const b = buildings[k];
    if (b.type !== 'assembler') continue;
    if (!b.recipe) { b.status = 'idle'; continue; }
    const rec = RECIPES.assembler[b.recipe];
    let okIn = true; for (const id in rec.in) if ((b.inputs[id] || 0) < rec.in[id]) { okIn = false; break; }
    const outCap = (b.output.id === null || b.output.id === rec.out) && b.output.count < 50;
    if (okIn && outCap) {
      b.progress += machineProgressInc('assembler', rec.time);
      b.status = 'working';
      if (b.progress >= 1) {
        b.progress = 0;
        for (const id in rec.in) { b.inputs[id] -= rec.in[id]; if (b.inputs[id] <= 0) delete b.inputs[id]; }
        if (b.output.id === null) b.output.id = rec.out;
        b.output.count++;
      }
    } else {
      b.status = outCap ? 'idle' : 'blocked';
    }
  }
}

// ---------------- Input ----------------
const keys = {};
const mouse = { sx: 0, sy: 0, wx: 0, wy: 0, tx: 0, ty: 0, down: false };
const canvas = document.getElementById('game');
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
window.addEventListener('resize', resize); resize();

function updateMouseCoord() {
  const sw = canvas.width, sh = canvas.height;
  mouse.wx = (mouse.sx - sw / 2) / zoom + camera.x;
  mouse.wy = (mouse.sy - sh / 2) / zoom + camera.y;
  mouse.tx = Math.floor(mouse.wx / TILE); mouse.ty = Math.floor(mouse.wy / TILE);
}
canvas.addEventListener('pointermove', e => { mouse.sx = e.clientX; mouse.sy = e.clientY; updateMouseCoord(); });
window.addEventListener('wheel', e => {
  e.preventDefault();
  const before = { x: mouse.wx, y: mouse.wy };
  const s = 1 - e.deltaY * 0.0015;
  zoom = clamp(zoom * s, 0.4, 3);
  const after = { x: mouse.wx, y: mouse.wy };
  camera.x += after.x - before.x; camera.y += after.y - before.y;
  clampCamera();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

let panStart = null;
canvas.addEventListener('pointerdown', e => {
  canvas.focus();
  if (e.button === 1) { panStart = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y }; followTarget = false; return; }
  if (e.button === 0 && !e.ctrlKey) handleLeftClick(e.clientX, e.clientY);
  else if (e.button === 2) handleRightClick(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => { if (e.button === 1) panStart = null; });
window.addEventListener('pointermove', e => {
  if (panStart) {
    camera.x = panStart.cx - (e.clientX - panStart.x) / zoom;
    camera.y = panStart.cy - (e.clientY - panStart.y) / zoom;
    clampCamera();
  }
});

function handleLeftClick(sx, sy) {
  const tx = mouse.tx, ty = mouse.ty;
  if (placementMode) {
    const type = HOTBAR[selectedSlot];
    if (type && tryPlace(type, tx, ty)) placementMode = false;
    return;
  }
  const b = buildingAt(tx, ty);
  if (b) { selectBuilding(idx(tx, ty)); return; }
  if (getRes(tx, ty) && getResAmt(tx, ty) > 0 && player.gatherCd <= 0) {
    const id = RES_ITEM[getRes(tx, ty)];
    invAdd(id, 1);
    decResAmt(tx, ty, 1);
    player.gatherCd = 10;
    addFloater(tx * TILE + 8, ty * TILE, '+' + ITEM[id].name, '#fff');
  }
}
function handleRightClick(sx, sy) {
  if (placementMode) { placementMode = false; selectedSlot = -1; renderHotbar(); return; }
  const b = buildingAt(mouse.tx, mouse.ty);
  if (b) { removeBuilding(idx(mouse.tx, mouse.ty)); return; }
  selectedBuild = null; hideBuildPanel();
}

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  keys[e.code] = true;
  const d = e.key;
  if (d === 'w' || d === 'W' || d === 'a' || d === 'A' || d === 's' || d === 'S' || d === 'd' || d === 'D') followTarget = true;
  if (d >= '1' && d <= '9') { selectSlot(d.charCodeAt(0) - 49); return; }
  if (d === 'e' || d === 'E') { toggleInventory(); return; }
  if (d === 'Escape' || d === 'Esc') { placementMode = false; selectedSlot = -1; selectedBuild = null; hideBuildPanel(); hideTech(); toggleInventoryOff(); renderHotbar(); return; }
  if (d === 'r' || d === 'R') { if (selectedBuild) rotateSelected(); else if (placementMode) rotateGhost(); return; }
  if (d === 'p' || d === 'P') { paused = !paused; document.getElementById('btnPause').textContent = paused ? 'Resume' : 'Pause'; return; }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function selectSlot(i) {
  selectedSlot = i;
  placementMode = HOTBAR[i] != null;
  ghostRot = 0;
  if (!placementMode) selectedBuild = null;
  renderHotbar();
  if (selectedBuild === null) hideBuildPanel();
}
function rotateGhost() {
  const type = HOTBAR[selectedSlot];
  if (!type || !BUILDING_INFO[type].rotatable) return;
  ghostRot = (ghostRot + 1) % maxRot(type);
}
function rotateSelected() {
  if (!selectedBuild) return;
  const b = buildings[selectedBuild]; if (!b) return;
  const m = maxRot(b.type); if (m === 0) return;
  b.rot = (b.rot + 1) % m;
  msg('Rotated', 'info');
  renderBuildPanel();
}

function selectBuilding(idxKey) {
  selectedBuild = idxKey; placementMode = false; selectedSlot = -1;
  renderHotbar(); renderBuildPanel();
}
function hideBuildPanel() { document.getElementById('panelBuild').classList.remove('open'); }
function toggleInventory() {
  const el = document.getElementById('panelInventory');
  const open = !el.classList.contains('open');
  if (open) { el.classList.add('open'); renderInventoryPanel(); } else el.classList.remove('open');
}
function toggleInventoryOff() { document.getElementById('panelInventory').classList.remove('open'); }
function toggleTech() {
  const el = document.getElementById('panelTech');
  const open = !el.classList.contains('open');
  if (open) { el.classList.add('open'); renderTechPanel(); } else el.classList.remove('open');
}
function hideTech() { document.getElementById('panelTech').classList.remove('open'); }

function clampCamera() {
  const sw = canvas.width, sh = canvas.height;
  const hw = sw / 2 / zoom, hh = sh / 2 / zoom;
  camera.x = clamp(camera.x, hw, WORLD_PX - hw);
  camera.y = clamp(camera.y, hh, WORLD_PX - hh);
}

function addFloater(wx, wy, text, color) {
  floaters.push({ x: wx, y: wy, text, color, life: 1.0 });
}

// ---------------- UI rendering ----------------
function costStr(costs) { return costs.map(c => ITEM[c.id].name + ' \u00d7' + c.q).join(', '); }
function renderHotbar() {
  const el = document.getElementById('hotbar'); el.innerHTML = '';
  HOTBAR.forEach((type, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selectedSlot ? ' selected' : '');
    const icon = document.createElement('canvas'); icon.width = 24; icon.height = 24;
    const ictx = icon.getContext('2d'); ictx.imageSmoothingEnabled = false;
    ictx.fillStyle = type ? '#2a3a2a' : '#2a2e38'; ictx.beginPath(); ictx.arc(12, 12, 10, 0, Math.PI * 2); ictx.fill();
    if (type) {
      const sp = sprite(type === 'belt' ? 'belt-0' : type === 'drill' ? 'drill-0' : type, TILE, TILE, () => {});
      ictx.drawImage(sp, 4, 4);
      slot.title = BUILDING_INFO[type].name + ' — ' + costStr(BUILD_COSTS[type]);
    }
    const key = document.createElement('div'); key.className = 'key'; key.textContent = i + 1;
    slot.appendChild(icon); slot.appendChild(key);
    slot.onclick = () => selectSlot(i);
    el.appendChild(slot);
  });
}
function statusColor(s) {
  if (s === 'working') return '#4ade80';
  if (s === 'blocked') return '#f87171';
  return '#fbbf24';
}

function renderBuildPanel() {
  const el = document.getElementById('panelBuild'); if (!selectedBuild) { el.classList.remove('open'); return; }
  const b = buildings[selectedBuild]; if (!b) { selectedBuild = null; el.classList.remove('open'); return; }
  const info = BUILDING_INFO[b.type];
  const c = document.getElementById('buildContent');
  let html = '<div class="status"><span class="dot" style="background:' + statusColor(b.status) + '"></span>' + b.status.toUpperCase() + '</div>';
  if (b.progress > 0) html += '<div class="progress"><div class="bar ' + (b.status === 'working' ? '' : 'idle') + '" style="width:' + (b.progress * 100) + '%"></div></div>';
  const showIO = (label, obj) => {
    let keys = Object.keys(obj);
    if (!keys.length) return '<div class="row"><span class="icon20" style="background:#333"></span><span>' + label + ': empty</span></div>';
    return keys.map(id => '<div class="row"><span class="icon20" style="background:' + ITEM[id].color + '"></span><span>' + label + ': ' + ITEM[id].name + ' \u00d7' + obj[id] + '</span></div>').join('');
  };
  if (b.type === 'drill') html += showIO('Output', b.output.count ? { [b.output.id]: b.output.count } : {});
  else if (b.type === 'furnace' || b.type === 'assembler') {
    html += showIO('Inputs', b.inputs);
    html += showIO('Output', b.output.count ? { [b.output.id]: b.output.count } : {});
    const recipes = RECIPES[b.type];
    const names = Object.keys(recipes);
    if (names.length) {
      html += '<div class="row"><div style="font-size:11.5px;color:#8a90a0;margin-bottom:4px">Recipe:</div><div class="btnrow recipes">';
      html += '<button onclick="setRecipe(\'' + b.type + '\', null)">None</button>';
      names.forEach(rn => { html += '<button onclick="setRecipe(\'' + b.type + '\', \'' + rn + '\')">' + rn + '</button>'; });
      html += '</div></div>';
      html += '<div style="font-size:11.5px;color:#8a90a0">Current: ' + (b.recipe || 'none') + '</div>';
    }
  } else if (b.type === 'chest') {
    html += '<div style="font-size:11.5px;color:#8a90a0;margin-bottom:6px">Contents (' + Object.keys(b.inv).length + ' items):</div>';
    for (const id in b.inv) {
      html += '<div class="chest-row"><span class="icon20" style="background:' + ITEM[id].color + '"></span><span style="flex:1">' + ITEM[id].name + ' \u00d7' + b.inv[id] + '</span><button onclick="takeChest(\'' + id + '\')">Take</button></div>';
    }
    if (!Object.keys(b.inv).length) html += '<div style="font-size:12px;color:#8a90a0">empty</div>';
  }
  if (maxRot(b.type)) html += '<div class="btnrow"><button onclick="rotateSelected()">Rotate (R)</button></div>';
  html += '<div class="btnrow"><button class="danger" onclick="removeBuilding(\'' + selectedBuild + '\')">Remove building</button></div>';
  c.innerHTML = html;
  document.getElementById('buildTitle').textContent = info.name;
  el.classList.add('open');
}
function updateBuildPanelLive() {
  if (!selectedBuild) return;
  const el = document.getElementById('panelBuild'); if (!el.classList.contains('open')) return;
  const b = buildings[selectedBuild]; if (!b) return;
  const dot = el.querySelector('.status .dot'); const prog = el.querySelector('.progress .bar');
  if (dot) dot.style.background = statusColor(b.status);
  if (prog) prog.style.width = (b.progress * 100) + '%';
}

window.setRecipe = function (type, recipe) {
  if (!selectedBuild) return;
  const b = buildings[selectedBuild];
  b.recipe = recipe;
  if (recipe) { b.inputs = {}; b.output = { id: null, count: 0 }; b.progress = 0; }
  renderBuildPanel();
  msg('Recipe set to ' + (recipe || 'none'), 'info');
};
window.takeChest = function (id) {
  if (!selectedBuild) return;
  const b = buildings[selectedBuild];
  const q = b.inv[id] || 0;
  if (!q) return;
  invAdd(id, q);
  delete b.inv[id];
  renderBuildPanel();
};

function renderInventoryPanel() {
  const c = document.getElementById('invContent');
  let html = '';
  ITEM_IDS.forEach(id => {
    const q = player.inv[id] || 0;
    html += '<div class="row"><span class="icon20" style="background:' + ITEM[id].color + '"></span><span style="flex:1">' + ITEM[id].name + '</span><span style="font-family:monospace">' + q + '</span></div>';
  });
  c.innerHTML = html;
}

function renderTechPanel() {
  const c = document.getElementById('techContent');
  let html = '';
  TECHS.forEach(t => {
    const unlocked = !!techs.unlocked[t.id];
    let affordable = true; for (const id in t.cost) if ((player.inv[id] || 0) < t.cost[id]) affordable = false;
    html += '<div class="tech"><h4>' + (unlocked ? '\u2713 ' : '') + t.name + '</h4><p>' + t.desc + '</p><div class="tech-cost">' + costStr(Object.entries(t.cost).map(([id, q]) => ({ id, q }))) + '</div>';
    if (unlocked) html += '<button disabled>Unlocked</button>';
    else html += '<button ' + (affordable ? '' : 'disabled') + ' onclick="buyTech(\'' + t.id + '\')">' + (affordable ? 'Research' : 'Too expensive') + '</button>';
    html += '</div>';
  });
  c.innerHTML = html;
}
window.buyTech = function (id) {
  const t = TECHS.find(x => x.id === id);
  if (!t || techs.unlocked[id]) return;
  for (const k in t.cost) if ((player.inv[k] || 0) < t.cost[k]) return;
  for (const k in t.cost) invRemove(k, t.cost[k]);
  techs.unlocked[id] = true;
  for (const k in t.effect) techs[k] = (techs[k] || 1) * t.effect[k];
  beltInterval = Math.max(1, Math.floor(4 / techs.belt));
  renderTechPanel(); renderHotbar();
  msg('Technology unlocked: ' + t.name, 'ok');
};

function msg(text, kind) {
  const el = document.getElementById('msg');
  el.textContent = text; el.className = kind ? kind : '';
  el.style.opacity = 1;
  clearTimeout(msg.timer);
  msg.timer = setTimeout(() => { el.style.opacity = 0; }, 2200);
}

// ---------------- Save / load ----------------
function serializeBuilding(b) {
  const s = { t: b.type, x: b.x, y: b.y, r: b.rot };
  if (b.output) { s.output = { id: b.output.id, count: b.output.count }; s.progress = b.progress; }
  if (b.inputs) s.inputs = { ...b.inputs };
  if (b.recipe !== undefined) s.recipe = b.recipe;
  if (b.inv) s.inv = { ...b.inv };
  if (b.state) s.state = b.state;
  if (b.held !== undefined) s.held = b.held;
  return s;
}
function restoreBuilding(s) {
  addBuilding(s.t, s.x, s.y);
  const b = buildings[idx(s.x, s.y)];
  b.rot = s.r;
  if (s.output) b.output = { id: s.output.id, count: s.output.count };
  if (s.progress !== undefined) b.progress = s.progress;
  if (s.inputs) b.inputs = { ...s.inputs };
  if (s.recipe !== undefined) b.recipe = s.recipe;
  if (s.inv) b.inv = { ...s.inv };
  if (s.state) b.state = s.state;
  if (s.held !== undefined) b.held = s.held;
}
function saveGame() {
  const data = {
    version: 1, seed,
    player: { x: player.x, y: player.y, inv: { ...player.inv } },
    techs: { unlocked: { ...techs.unlocked }, drill: techs.drill, furnace: techs.furnace, assembler: techs.assembler, belt: techs.belt },
    buildings: Object.values(buildings).map(serializeBuilding),
    beltItems: beltItems.map(it => ({ x: it.x, y: it.y, id: it.id, dir: it.dir })),
    deposits: { ...depositEdits },
  };
  try {
    localStorage.setItem('factory_builder_v1', JSON.stringify(data));
    msg('Game saved', 'ok');
  } catch (e) { msg('Save failed: ' + e.message, 'error'); }
}
function loadGame() {
  const raw = localStorage.getItem('factory_builder_v1');
  if (!raw) { msg('No saved game', 'error'); return; }
  try { applySave(JSON.parse(raw)); } catch (e) { msg('Load failed: ' + e.message, 'error'); }
}
function applySave(data) {
  seed = data.seed;
  generateWorld(seed);
  for (const k in data.deposits) { const p = k.split(','); const i = idx(+p[0], +p[1]); resAmt[i] = +data.deposits[k]; }
  Object.assign(depositEdits, data.deposits);
  player.x = data.player.x; player.y = data.player.y; player.inv = { ...data.player.inv };
  Object.keys(buildings).forEach(k => delete buildings[k]); beltItems.length = 0;
  for (const s of data.buildings) restoreBuilding(s);
  for (const it of data.beltItems) beltItems.push({ x: it.x, y: it.y, id: it.id, dir: it.dir, fromX: it.x, fromY: it.y, moveStart: 0, moveDuration: 0 });
  techs = { unlocked: data.techs.unlocked || {}, drill: data.techs.drill || 1, furnace: data.techs.furnace || 1, assembler: data.techs.assembler || 1, belt: data.techs.belt || 1 };
  beltInterval = Math.max(1, Math.floor(4 / techs.belt));
  cameraTarget = { x: player.x, y: player.y };
  msg('Game loaded', 'ok');
}
function newGame() {
  seed = (Date.now() * 1000003 + Math.random() * 1000000) | 0;
  generateWorld(seed);
  const sx = Math.floor(WORLD_T / 2) * TILE + TILE / 2, sy = Math.floor(WORLD_T / 2) * TILE + TILE / 2;
  player.x = sx; player.y = sy; player.inv = {}; player.gatherCd = 0;
  Object.keys(buildings).forEach(k => delete buildings[k]); beltItems.length = 0;
  invAdd('iron-plate', 16); invAdd('copper-plate', 4); invAdd('iron-ore', 8);
  invAdd('stone', 30); invAdd('coal', 10); invAdd('copper-ore', 4);
  techs = { unlocked: {}, drill: 1, furnace: 1, assembler: 1, belt: 1 };
  beltInterval = 4;
  cameraTarget = { x: sx, y: sy };
  camera = { x: sx, y: sy };
  msg('New game started', 'ok');
}

document.getElementById('btnPause').onclick = () => { paused = !paused; document.getElementById('btnPause').textContent = paused ? 'Resume' : 'Pause'; };
document.getElementById('btnTech').onclick = toggleTech;
document.getElementById('btnCloseTech').onclick = hideTech;
document.getElementById('btnCloseInv').onclick = () => document.getElementById('panelInventory').classList.remove('open');
document.getElementById('btnCloseBuild').onclick = () => { selectedBuild = null; hideBuildPanel(); };
document.getElementById('btnSave').onclick = saveGame;
document.getElementById('btnLoad').onclick = loadGame;
document.getElementById('btnNew').onclick = newGame;

// ---------------- Rendering ----------------
function worldToScreen(wx, wy) {
  return { sx: (wx - camera.x) * zoom + canvas.width / 2, sy: (wy - camera.y) * zoom + canvas.height / 2 };
}
function drawPlayer(ctx, now) {
  const sp = worldToScreen(player.x, player.y);
  const moving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'];
  const bob = moving ? Math.sin(now * 0.015) * 1.5 : 0;
  const ang = Math.atan2(mouse.wy - player.y, mouse.wx - player.x);
  ctx.save(); ctx.translate(sp.sx, sp.sy + bob);
  // body
  ctx.fillStyle = '#4a90d9'; ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a5a90'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.stroke();
  // head
  ctx.fillStyle = '#f0c420'; ctx.beginPath(); ctx.arc(0, -5, 3, 0, Math.PI * 2); ctx.fill();
  // arm toward mouse
  ctx.strokeStyle = '#4a90d9'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(Math.cos(ang) * 9, -5 + Math.sin(ang) * 9); ctx.stroke();
  ctx.fillStyle = '#f0c420'; ctx.beginPath(); ctx.arc(Math.cos(ang) * 9, -5 + Math.sin(ang) * 9, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawFloating(ctx, now) {
  for (let k = floaters.length - 1; k >= 0; k--) {
    const f = floaters[k]; f.life -= 0.02; if (f.life <= 0) { floaters.splice(k, 1); continue; }
    const sp = worldToScreen(f.x, f.y - (1 - f.life) * 24);
    ctx.save(); ctx.globalAlpha = f.life; ctx.fillStyle = f.color; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(f.text, sp.sx, sp.sy);
    ctx.fillText(f.text, sp.sx, sp.sy);
    ctx.restore();
  }
}
function render(now) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1a24'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // smooth camera follow
  if (followTarget) {
    camera.x += (player.x - camera.x) * 0.12;
    camera.y += (player.y - camera.y) * 0.12;
  } else {
    cameraTarget = { x: camera.x, y: camera.y };
  }
  clampCamera();

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  const sw = canvas.width, sh = canvas.height;
  const tx0 = Math.floor((camera.x - sw / 2 / zoom) / TILE) - 1;
  const ty0 = Math.floor((camera.y - sh / 2 / zoom) / TILE) - 1;
  const tx1 = Math.floor((camera.x + sw / 2 / zoom) / TILE) + 1;
  const ty1 = Math.floor((camera.y + sh / 2 / zoom) / TILE) + 1;

  // ground pass
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!inBounds(tx, ty)) continue;
      const i = idx(tx, ty);
      ctx.drawImage(getGrass(tx, ty), tx * TILE, ty * TILE);
      if (res[i] !== 0) ctx.drawImage(getResSprite(res[i]), tx * TILE, ty * TILE);
    }
  }
  // decorations
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!inBounds(tx, ty)) continue;
      const i = idx(tx, ty);
      if (deco[i] === DECO_TREE) ctx.drawImage(sprites.tree, tx * TILE - 5, ty * TILE - 10);
      else if (deco[i] === DECO_ROCK) ctx.drawImage(sprites.rock, tx * TILE - 3, ty * TILE - 3);
    }
  }
  // poles + wires
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const b = buildingAt(tx, ty);
      if (!b || b.type !== 'pole') continue;
      const cx = tx * TILE + 8, cy = ty * TILE + 8;
      ctx.strokeStyle = 'rgba(212, 180, 80, 0.5)'; ctx.lineWidth = 1;
      [[1, 0], [0, 1], [1, 1], [1, -1]].forEach(d => {
        const nb = buildingAt(tx + d[0], ty + d[1]);
        if (nb && nb.type === 'pole') { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo((tx + d[0]) * TILE + 8, (ty + d[1]) * TILE + 8); ctx.stroke(); }
      });
    }
  }
  // buildings
  const selectedB = buildings[selectedBuild];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const b = buildingAt(tx, ty); if (!b) continue;
      const spKey = b.type === 'belt' ? 'belt-' + b.rot : b.type === 'drill' ? 'drill-' + b.rot : b.type;
      ctx.drawImage(sprites[spKey], tx * TILE, ty * TILE);
      if (b.type === 'furnace' && b.status === 'working') {
        const flicker = 2 + Math.sin(now * 0.03) * 2;
        ctx.fillStyle = '#f97316'; ctx.fillRect(tx * TILE + 6, ty * TILE + 10 - flicker, 4, 4 + flicker);
      }
      if (b === selectedB) {
        ctx.strokeStyle = '#f0c420'; ctx.lineWidth = 2; ctx.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      }
      // status dot
      if (b.type === 'drill' || b.type === 'furnace' || b.type === 'assembler' || b.type === 'inserter') {
        ctx.fillStyle = statusColor(b.status); ctx.beginPath(); ctx.arc(tx * TILE + 12, ty * TILE - 4, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // belt items
  for (const it of beltItems) {
    let sx2 = it.x, sy2 = it.y;
    if (it.moveStart) {
      const p = clamp((now - it.moveStart) / it.moveDuration, 0, 1);
      sx2 = lerp(it.fromX, it.x, p); sy2 = lerp(it.fromY, it.y, p);
      if (p >= 1) { it.fromX = it.x; it.fromY = it.y; it.moveStart = 0; it.moveDuration = 0; }
    }
    const sp = worldToScreen(sx2 * TILE + 8, sy2 * TILE + 8);
    ctx.fillStyle = ITEM[it.id].color; ctx.fillRect(sp.sx - 3, sp.sy - 3 + Math.sin(now * 0.01 + it.x) * 1.5, 6, 6);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(sp.sx - 3, sp.sy - 3 + Math.sin(now * 0.01 + it.x) * 1.5, 6, 6);
  }
  // inserters + held items
  for (const k in buildings) {
    const b = buildings[k];
    if (b.type !== 'inserter') continue;
    const cx = b.x * TILE + 8, cy = b.y * TILE + 8;
    const sx = b.x + DIRS[(b.rot + 2) % 4][0], sy = b.y + DIRS[(b.rot + 2) % 4][1];
    const tx = b.x + DIRS[b.rot][0], ty = b.y + DIRS[b.rot][1];
    const sp = worldToScreen(cx, cy);
    ctx.strokeStyle = '#f0c420'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (b.state === 'pick' || b.state === 'drop') {
      const t = clamp(b.progress, 0, 1);
      const ax = lerp(sx * TILE + 8, tx * TILE + 8, t);
      const ay = lerp(sy * TILE + 8, ty * TILE + 8, t);
      const sp2 = worldToScreen(ax, ay);
      ctx.beginPath(); ctx.moveTo(sp.sx, sp.sy); ctx.lineTo(sp2.sx, sp2.sy); ctx.stroke();
      if (b.held) { ctx.drawImage(sprites['item-' + b.held], sp2.sx - 6, sp2.sy - 6); }
    } else {
      const ax = sx * TILE + 8, ay = sy * TILE + 8;
      const sp2 = worldToScreen(ax, ay);
      ctx.beginPath(); ctx.moveTo(sp.sx, sp.sy); ctx.lineTo(sp2.sx, sp2.sy); ctx.stroke();
    }
    ctx.drawImage(sprites['inserter-base'], b.x * TILE, b.y * TILE);
  }
  // player
  drawPlayer(ctx, now);

  // placement ghost
  if (placementMode && HOTBAR[selectedSlot]) {
    const type = HOTBAR[selectedSlot];
    const valid = canPlace(type, mouse.tx, mouse.ty);
    const spKey = type === 'belt' ? 'belt-' + ghostRot : type === 'drill' || type === 'inserter' ? type + '-' + ghostRot : type;
    ctx.save();
    ctx.globalAlpha = valid ? 0.55 : 0.3;
    ctx.drawImage(sprites[spKey], mouse.tx * TILE, mouse.ty * TILE);
    if (!valid) { ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.strokeRect(mouse.tx * TILE + 1, mouse.ty * TILE + 1, TILE - 2, TILE - 2); }
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawFloating(ctx, now);
  updateBuildPanelLive();
  if (document.getElementById('panelBuild').classList.contains('open') && selectedBuild) renderBuildPanel();

  // FPS
  frames++;
  if (now - fpsTime >= 1000) { fps = frames; frames = 0; fpsTime = now; document.getElementById('stats').textContent = 'Pos: (' + Math.floor(player.x / TILE) + ', ' + Math.floor(player.y / TILE) + ')  |  Mouse: (' + mouse.tx + ', ' + mouse.ty + ')  |  FPS: ' + fps; }
}

function loop(now) {
  const dt = Math.min(now - lastTime, 200);
  lastTime = now;
  acc += dt;
  while (acc >= TICK_MS) { simTick(); acc -= TICK_MS; if (player.gatherCd > 0) player.gatherCd--; }
  render(now);
  requestAnimationFrame(loop);
}

// ---------------- Start ----------------
function startGame() {
  newGame();
  lastTime = performance.now();
  fpsTime = lastTime;
  requestAnimationFrame(loop);
}
window.addEventListener('load', startGame);

// ---- Test / debug hook (exposed in browsers as window.__FB; harmless) ----
const __FB_TEST_API = {
  WORLD_T, WORLD_PX, TILE, TICK_MS,
  RES_NONE, RES_IRON, RES_COPPER, RES_COAL, RES_STONE,
  RES_ITEM, RES_COLOR, DECO_NONE, DECO_TREE, DECO_ROCK,
  DIRS, ITEM, ITEM_IDS, STACK, BELT_SUBTYPES, BUILDING_INFO,
  BUILD_COSTS, HOTBAR, RECIPES, TECHS,
  idx, inBounds, getRes, getResAmt, decResAmt, depositEdits,
  res, resAmt, deco,
  canPlace, tryPlace, addBuilding, removeBuilding, buildingAt, solidTile,
  invAdd, invRemove, invHas, player, buildings, beltItems, floaters,
  simTick, setRecipe, seed, paused, techs, beltInterval, beltTickCounter,
  camera, zoom, newGame, saveGame, loadGame, applySave, msg,
  simTick, tryPlace, canPlace, canAfford, invAdd, invRemove, invHas,
  beltAddItem, getRes, idx, setRecipe, renderHotbar, renderInventoryPanel,
  renderBuildPanel, renderTechPanel,
};
if (typeof window !== 'undefined') window.__FB = __FB_TEST_API;
else if (typeof globalThis !== 'undefined') globalThis.__FB = __FB_TEST_API;
