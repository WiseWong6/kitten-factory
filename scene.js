/* p5 owns the canvas and frame loop; Canvas paths keep the silhouettes and coat masks identical. */
'use strict';
const F = FactoryTimeline;
const sound = window.FactorySound?.create(F);
const BLUE = '#0E3CF1';
const NAVY = '#172356';
const WHITE = '#FFFFFF';
const ACCENT = '#3D66E2';
let ctx;
let coffeeBeanArt;
let running = true;
const initialTime = Math.max(0, F.recipeIndexFromSearch(window.location ? window.location.search : '')) * 8;
let elapsed = initialTime;
let previousTime = 0;
let hidden = false;
const playbackCycle = F.recipes.length * 8;
let playbackRate = 1, draggingProgress = false, resumeAfterDrag = false;
let playButton, progressInput, speedButton, timeOutput;
let seekCycleBase = 0, heldCycleEnd = false;
const TAU = Math.PI * 2;

function setup() {
  const canvas = createCanvas(900, 1200);
  canvas.parent('stage');
  canvas.elt.setAttribute('role', 'img');
  canvas.elt.setAttribute('aria-label', `纯蓝背景的小猫加工厂，小葵第一个出场，咖啡机为排队的白猫染出 ${F.recipes.length} 种花色；猫脸粉饼逐只落在下方，三行各五只。空格暂停，R 从所选猫咪重新播放。`);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  frameRate(60);
  ctx = drawingContext;
  // Native <img> loading keeps local file:// delivery free of fetch/CORS requests.
  coffeeBeanArt = document.getElementById('coffee-bean-art');
  fitCanvasToWindow();
  setupPlaybackControls();
  previousTime = performance.now();
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    sound?.reset();
    previousTime = performance.now();
  });
}
function fitCanvasToWindow() {
  const stage = document.getElementById('stage');
  const controlsSpace = parseFloat(window.getComputedStyle(document.body).paddingBottom) || 84;
  const availableHeight = Math.max(1, window.innerHeight - controlsSpace);
  const scale = Math.min(window.innerWidth / 900, availableHeight / 1200);
  stage.style.width = `${900 * scale}px`;
  stage.style.height = `${1200 * scale}px`;
}
function windowResized() { fitCanvasToWindow(); }
function draw() {
  const now = performance.now();
  if (running && !hidden && !draggingProgress) {
    const advance = Math.max(0, now - previousTime) / 1000 * playbackRate;
    elapsed += advance;
    if (advance > 0) heldCycleEnd = false;
  }
  previousTime = now;
  renderScene(elapsed);
  updatePlaybackControls();
}
function keyPressed(event) {
  // Native buttons and the slider keep their own keyboard behavior.
  if (event?.target?.closest?.('button, input, select, textarea, a, [contenteditable="true"]')) return;
  if (event && event.code === 'Space') { running = !running; previousTime = performance.now(); updatePlaybackControls(); return false; }
  if (key === 'r' || key === 'R') {
    sound?.reset();
    elapsed = initialTime; heldCycleEnd = false; previousTime = performance.now(); updatePlaybackControls(); return false;
  }
}
function setupPlaybackControls() {
  const controls = document.getElementById('play-controls');
  playButton = document.getElementById('play-toggle');
  progressInput = document.getElementById('play-progress');
  speedButton = document.getElementById('play-speed');
  timeOutput = document.getElementById('play-time');
  const soundButton = document.getElementById('play-sound');
  soundButton.disabled = !sound;
  soundButton.addEventListener('click', async () => {
    soundButton.disabled = true;
    const enabled = await sound.setEnabled(!sound.enabled);
    soundButton.textContent = enabled ? '音效开' : '音效关';
    soundButton.setAttribute('aria-pressed', String(enabled));
    soundButton.setAttribute('aria-label', enabled ? '关闭音效' : '开启音效');
    soundButton.title = enabled ? '猫叫与机器音效' : '点击开启音效';
    soundButton.disabled = false;
    updatePlaybackControls();
  });
  for (const element of [playButton, progressInput, speedButton]) element.disabled = false;
  progressInput.max = playbackCycle;
  playButton.addEventListener('click', () => {
    running = !running; previousTime = performance.now(); updatePlaybackControls();
  });
  speedButton.addEventListener('click', () => {
    const rates = [.5, 1, 1.5, 2, 3];
    playbackRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    previousTime = performance.now(); updatePlaybackControls();
  });
  progressInput.addEventListener('pointerdown', event => {
    if (event.button != null && event.button !== 0) return;
    if (draggingProgress) return;
    seekCycleBase = Math.floor((elapsed - (heldCycleEnd ? .000001 : 0)) / playbackCycle) * playbackCycle;
    draggingProgress = true; resumeAfterDrag = running; running = false;
    previousTime = performance.now(); updatePlaybackControls();
  });
  progressInput.addEventListener('input', () => {
    const value = Number(progressInput.value);
    if (!Number.isFinite(value)) return;
    if (!draggingProgress) seekCycleBase = Math.floor((elapsed - (heldCycleEnd ? .000001 : 0)) / playbackCycle) * playbackCycle;
    const position = F.clamp(value, 0, playbackCycle);
    sound?.reset();
    elapsed = seekCycleBase + position; heldCycleEnd = position === playbackCycle;
    previousTime = performance.now(); renderScene(elapsed); updatePlaybackControls();
  });
  const finishDrag = () => {
    if (!draggingProgress) return;
    draggingProgress = false; running = resumeAfterDrag;
    previousTime = performance.now(); updatePlaybackControls();
  };
  for (const name of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(name, finishDrag);
  const reveal = () => controls.classList.remove('is-hidden');
  controls.addEventListener('focusin', reveal);
  window.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') reveal(); }, { passive: true });
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const bounds = controls.getBoundingClientRect();
    const near = event.clientX >= bounds.left - 16 && event.clientX <= bounds.right + 16 && event.clientY >= bounds.top - 16;
    if (near || draggingProgress || controls.contains(document.activeElement)) reveal();
    else controls.classList.add('is-hidden');
  }, { passive: true });
  updatePlaybackControls();
}
function updatePlaybackControls() {
  sound?.sync(elapsed, running && !hidden && !draggingProgress, playbackRate);
  if (!playButton) return;
  const position = heldCycleEnd ? playbackCycle : F.mod(elapsed, playbackCycle);
  const clockText = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  playButton.textContent = running ? '暂停' : '播放';
  playButton.setAttribute('aria-label', running ? '暂停动画' : '播放动画');
  speedButton.textContent = `${playbackRate}×`;
  speedButton.setAttribute('aria-label', `播放速度 ${playbackRate} 倍，点击切换`);
  if (!draggingProgress) progressInput.value = position;
  progressInput.style.setProperty('--progress', `${position / playbackCycle * 100}%`);
  progressInput.setAttribute('aria-valuetext', `${clockText(position)}，本轮共 ${clockText(playbackCycle)}`);
  timeOutput.textContent = `${clockText(position)} / ${clockText(playbackCycle)}`;
}
function shape(d, color) {
  ctx.fillStyle = color;
  ctx.fill(typeof d === 'string' ? new Path2D(d) : d);
}
function roundBox(x, y, w, h, r, color) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = color; ctx.fill();
}
function oval(x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = color; ctx.fill();
}
function drawLine(points, color, width = 2) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.stroke();
}
function strokePath(d, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(d));
}
// Flat illustration palette shared with the cats; depth comes from separate planes.
const BODY_SIDE = '#344A80';
const BODY_SHADOW = '#111B42';
const PALE = '#CFDAF7';
function renderScene(time) {
  const s = F.stateAt(time, initialTime);
  ctx.save();
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, 900, 1200);
  machine(s);
  conveyor(s);
  steamWand(s);
  coffeeFlow(s);
  for (const cat of s.cats) {
    if (cat.x > -120 && cat.x < 1050) drawCat(cat, time);
  }
  puckCollection(s);
  spentPuck(s);
  groundCoffee(s);
  portafilter(s.handle);
  secondaryMist(s);
  ctx.restore();
}
const beanArtCache = new Map();
function coloredBeanArt(color) {
  if (beanArtCache.has(color)) return beanArtCache.get(color);
  if (!document.createElement) return null;
  const art = document.createElement('canvas');
  art.width = 104; art.height = 144;
  const paint = art.getContext('2d');
  // Color the existing cutout at runtime; keep its silhouette, groove and alpha.
  // No pixel readback, so the original local PNG also works under file://.
  paint.filter = 'grayscale(1) brightness(1.55)';
  paint.drawImage(coffeeBeanArt, 216, 59, 824, 1140, 0, 0, art.width, art.height);
  paint.filter = 'none';
  paint.globalCompositeOperation = 'source-atop';
  paint.globalAlpha = .72;
  paint.fillStyle = color; paint.fillRect(0, 0, art.width, art.height);
  paint.globalAlpha = 1;
  paint.globalCompositeOperation = 'source-over';
  beanArtCache.set(color, art);
  return art;
}
function bean(x, y, angle, scale = 1, color = '#FFFFFF') {
  if (!coffeeBeanArt || !coffeeBeanArt.complete || !coffeeBeanArt.naturalWidth) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Smaller beans retain the cutout's proportions instead of shrinking its gap.
  const length = 24, width = length * 824 / 1140;
  const art = coloredBeanArt(color);
  if (art) ctx.drawImage(art, 0, 0, art.width, art.height, -width / 2, -length / 2, width, length);
  else ctx.drawImage(coffeeBeanArt, 216, 59, 824, 1140, -width / 2, -length / 2, width, length);
  ctx.restore();
}
function hopper(s) {
  // Front elevation: a shallow opening, upright chamber and short funnel.
  // The broad mounting base sits on the roof instead of a narrow pedestal.
  roundBox(271, 327, 70, 30, 5, NAVY);
  roundBox(262, 348, 88, 10, 4, BODY_SIDE);
  const chamber = 'M 221 252 H 391 V 294 Q 391 302 385 308 L 353 332 Q 350 335 343 335 H 269 Q 262 335 259 332 L 227 308 Q 221 302 221 294 Z';
  shape(chamber, NAVY);
  ctx.save(); ctx.clip(new Path2D(chamber));
  const colors = F.beanColors(s.hopperRecipe);
  for (const b of s.hopper) bean(b.x, b.y, b.angle, b.scale, colors[b.id % colors.length]);
  shape(chamber, 'rgba(23,35,86,.12)');
  // A short, straight-sided taper, not a rounded bowl or long cone.
  shape('M 222 299 Q 306 307 390 299 L 385 308 L 353 332 Q 350 335 343 335 H 269 Q 262 335 259 332 L 227 308 Z', BODY_SIDE);
  shape('M 222 299 L 239 302 L 272 335 H 269 Q 262 335 259 332 L 227 308 Z', NAVY);
  shape('M 374 302 L 390 299 L 385 308 L 353 332 Q 350 335 343 335 H 339 Z', NAVY);
  ctx.restore();
  // Narrow ellipses match the near-front view of the machine and filter basket.
  oval(306, 251, 89, 8, BODY_SIDE);
  oval(306, 250, 81, 4, BODY_SHADOW);
  ctx.save();
  ctx.clip(new Path2D('M 225 0 H 387 V 250 Q 306 260 225 250 Z'));
  for (const b of s.hopper) bean(b.x, b.y, b.angle, b.scale, colors[b.id % colors.length]);
  ctx.restore();
  shape('M 217 251 Q 306 264 395 251 V 258 Q 306 271 217 258 Z', BODY_SIDE);
}
function machine(s) {
  // Continuous, opaque rear wall in the same navy as the body.
  roundBox(222, 369, 456, 507, 30, NAVY);
  roundBox(250, 590, 400, 231, 8, NAVY);
  // Solid color planes define the recess; the panel stays exactly #172356.
  shape('M 250 590 H 650 V 625 H 267 L 250 642 Z', BODY_SHADOW);
  shape('M 250 604 H 267 V 802 L 250 824 Z', BODY_SHADOW);
  shape('M 633 604 H 650 V 824 L 633 802 Z', BODY_SHADOW);
  // Simplified side posts use the same flat shading as the cats.
  shape('M 222 568 H 249 V 794 Q 249 815 233 829 L 222 840 Z', BODY_SIDE);
  shape('M 650 568 H 678 V 840 L 663 829 Q 650 815 650 794 Z', BODY_SHADOW);
  // The rounded roof and fascia are separate planes, not a single flat arch.
  shape('M 244 352 H 652 Q 670 352 678 374 L 671 394 H 229 L 222 374 Q 228 352 244 352 Z', BODY_SIDE);
  roundBox(222, 368, 456, 229, [28, 28, 23, 23], NAVY);
  // A beveled underside gives the group heads a surface to attach to.
  shape('M 238 591 H 662 L 648 608 H 252 Z', BODY_SIDE);
  ctx.save(); ctx.beginPath(); ctx.roundRect(227, 375, 446, 210, 23); ctx.clip();
  drawLine([[224, 469], [678, 469]], WHITE, 3);
  drawLine([[224, 479], [678, 479]], PALE, 2);
  ctx.restore();
  // Simple concentric shapes echo the clean, rounded cat illustration.
  oval(435, 475, 77, 77, NAVY);
  oval(435, 475, 67, 67, BODY_SIDE);
  oval(435, 475, 59, 59, WHITE);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (.78 + i * 1.44 / 8);
    drawLine([[435 + Math.cos(a) * 45, 475 + Math.sin(a) * 45], [435 + Math.cos(a) * 51, 475 + Math.sin(a) * 51]], NAVY, i % 2 ? 2 : 3);
  }
  // Xiaokui repeatedly presses against the final tick; the needle's pivot stays fixed.
  const a = Math.PI * (.8 + (s.recipe.kind === 'xiaokui' ? 1.42 : 1.1) * s.pressure) + s.pressureKick;
  drawLine([[435, 475], [435 + 41 * Math.cos(a), 475 + 41 * Math.sin(a)]], BLUE, 5);
  oval(435, 475, 8, 8, NAVY); oval(435, 475, 4, 4, BLUE);
  oval(533, 475, 11, 11, WHITE); oval(533, 475, 7, 7, '#0A1330');
  oval(533, 475, 5, 5, s.malfunction ? (s.faultLight ? '#F9CD77' : BODY_SHADOW) : F.primary(s.recipe));
  if (s.overload > 0) {
    ctx.save();
    ctx.globalAlpha = s.overload;
    oval(533, 475, 6, 6, '#FF514F');
    ctx.globalAlpha = s.overload * .22;
    oval(533, 475, 9, 9, '#FF514F');
    ctx.restore();
  }
  oval(625, 475, 28, 28, BODY_SIDE);
  oval(625, 475, 22, 22, WHITE);
  const knob = -.85 + s.wand.active * .8;
  drawLine([[625 - Math.cos(knob) * 12, 475 - Math.sin(knob) * 12], [625 + Math.cos(knob) * 12, 475 + Math.sin(knob) * 12]], NAVY, 4);
  roundBox(276, 550, 58, 48, 12, NAVY);
  roundBox(284, 559, 42, 36, 8, BODY_SIDE);
  roundBox(288, 590, 34, 12, 3, WHITE);
  roundBox(294, 600, 22, 7, 2, PALE);
  roundBox(389, 569, 92, 17, 4, WHITE);
  roundBox(404, 586, 62, 12, 3, WHITE);
  // Seen from the front, the locking seat is a straight horizontal interface.
  roundBox(404, 596, 62, 2, 0, BODY_SHADOW);
  hopper(s);
  dripTray();
}
function dripTray() {
  // Receding top, inset grate and a thick rounded front: three distinct faces.
  roundBox(246, 867, 49, 29, 9, NAVY);
  roundBox(607, 867, 49, 29, 9, NAVY);
  shape('M 254 797 H 646 L 679 833 H 221 Z', PALE);
  shape('M 266 802 H 634 L 654 825 H 246 Z', BODY_SIDE);
  shape('M 269 804 H 631 L 648 822 H 252 Z', WHITE);
  for (let i = 0; i < 19; i++) {
    const back = 276 + i * 19.3;
    const front = 261 + i * 21;
    strokePath(`M ${back} 808 L ${front} 818`, NAVY, 3.3);
  }
  shape('M 221 830 Q 450 838 679 830 L 676 861 Q 675 879 657 879 H 243 Q 225 879 224 861 Z', BODY_SIDE);
}
function conveyor(s) {
  // The cat lane stays in front of the entire machine, including its tray lip.
  roundBox(-27, 845, 954, 27, 13, WHITE);
  roundBox(-27, 849, 954, 19, 9, NAVY);
  const offset = F.beltPosition(s.time) % 50;
  for (let x = -50; x < 960; x += 50) oval(x + offset, 858, 6, 6, ACCENT);
}
function steamWand(s) {
  const w = s.wand;
  // A joint at the machine and a rigid lower tube aimed toward the cat.
  oval(625, 563, 10, 10, WHITE);
  const elbowX = F.lerp(638, 620, w.active);
  const elbowY = F.lerp(611, 607, w.active);
  strokePath(`M 625 563 V 583 Q 625 599 ${elbowX} ${elbowY} L ${w.x} ${w.y}`, WHITE, 9);
  const d = Math.hypot(w.targetX - w.x, w.targetY - w.y);
  const dx = (w.targetX - w.x) / d, dy = (w.targetY - w.y) / d;
  drawLine([[w.x - dx * 7, w.y - dy * 7], [w.x + dx * 6, w.y + dy * 6]], '#BFCDF6', 12);
  oval(w.x + dx * 7, w.y + dy * 7, 3.5, 3.5, NAVY);
}
function handleRing(distance, radius, angle) {
  // One camera projects every circular cross-section, including the end face.
  const elevation = .16, upright = Math.sqrt(1 - elevation * elevation);
  return Array.from({ length: 32 }, (_, i) => {
    const phi = i * TAU / 32;
    const across = radius * Math.cos(phi), vertical = radius * Math.sin(phi);
    return [distance * Math.sin(angle) + across * Math.cos(angle),
      12 + (distance * Math.cos(angle) - across * Math.sin(angle)) * elevation - vertical * upright];
  });
}
function handleOutline(points) {
  // The hull joins the two projected end rings with their actual tangent edges.
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = list => {
    const result = [];
    for (const p of list) {
      while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
      result.push(p);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.slice().reverse()).slice(0, -1)];
}
function handlePolygon(points, color) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function portafilterGrip(yaw) {
  const angle = yaw + .35;
  const collar = handleRing(31, 7, angle);
  const neck = handleOutline([...handleRing(31, 5.5, angle), ...handleRing(49, 5.5, angle)]);
  const tip = handleRing(128, 11.5, angle);
  const body = handleOutline([...handleRing(46, 9, angle), ...tip]);
  return { angle, collar, neck, body, tip, facing: Math.cos(angle) > 0 };
}
function drawPortafilterGrip(grip) {
  handlePolygon(grip.collar, PALE);
  handlePolygon(grip.neck, PALE);
  handlePolygon(grip.body, '#F4D3A2');
  if (grip.facing) handlePolygon(grip.tip, '#DFB989');
}
function portafilter(p) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.roll);
  const grip = portafilterGrip(p.yaw);
  if (!grip.facing) drawPortafilterGrip(grip);
  shape('M -32 0 H 32 L 31 19 Q 30 27 24 27 H -24 Q -30 27 -31 19 Z', WHITE);
  // Front elevation keeps the locking seat horizontal and the contents hidden.
  roundBox(-34, -2, 68, 5, 1, PALE);
  roundBox(-25, 25, 50, 3, 1, PALE);
  // The near-side collar attaches to the basket wall rather than disappearing behind it.
  if (grip.facing) drawPortafilterGrip(grip);
  ctx.restore();
}
const PUCK_PORTRAITS = new Map();
function paintPuckFace(target, portrait) {
  target.save();
  target.scale(portrait.scale, portrait.scale);
  target.translate(-portrait.centerX, -portrait.centerY);
  CatArt.draw(target, portrait.state, 0, { x: 0, y: 0, scale: 1, noBlink: true, headOnly: true });
  target.restore();
}
function puckPortrait(recipe) {
  if (PUCK_PORTRAITS.has(recipe)) return PUCK_PORTRAITS.get(recipe);
  const state = { recipe, index: 0, x: 0, walking: 0, walkDistance: 0, coat: 1, baseCoat: 1 };
  const head = CatArt.model(state, 0).head;
  const xs = [], ys = [];
  for (const [, ...points] of head) {
    for (let i = 0; i < points.length; i += 2) { xs.push(points[i]); ys.push(points[i + 1]); }
  }
  // Include the ear tips and curve handles, preserving each approved head's proportions.
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const scale = F.puckLayout.faceWidth / (right - left);
  const portrait = { state, scale, centerX: (left + right) / 2, centerY: (top + bottom) / 2,
    outline: new Path2D(head.map(command => command.join(' ')).join(' ')), image: null };
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = (F.puckLayout.faceWidth + 4) * 3;
    canvas.height = Math.ceil(((bottom - top) * scale + 4) * 3);
    const paint = canvas.getContext('2d');
    paint.scale(3, 3); paint.translate(canvas.width / 6, canvas.height / 6);
    paintPuckFace(paint, portrait);
    portrait.image = canvas;
  }
  PUCK_PORTRAITS.set(recipe, portrait);
  return portrait;
}
function drawCatPuck(recipe) {
  const portrait = puckPortrait(recipe);
  // A thin lower edge uses the same ear-and-cheek silhouette as the face.
  ctx.save(); ctx.translate(0, 3); ctx.scale(portrait.scale, portrait.scale);
  ctx.translate(-portrait.centerX, -portrait.centerY);
  shape(portrait.outline, recipe.ink); ctx.restore();
  if (portrait.image) {
    const w = portrait.image.width / 3, h = portrait.image.height / 3;
    ctx.drawImage(portrait.image, -w / 2, -h / 2, w, h);
  } else paintPuckFace(ctx, portrait);
}
function placedPuck(puck) {
  ctx.save();
  ctx.globalAlpha = puck.alpha;
  ctx.translate(puck.x, puck.y); ctx.rotate(puck.angle);
  drawCatPuck(puck.recipe);
  ctx.restore();
}
function puckCollection(s) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, F.puckLayout.top, 900, F.puckLayout.bottom - F.puckLayout.top); ctx.clip();
  for (const puck of s.pucks) if (!puck.falling && puck.alpha > 0) placedPuck(puck);
  ctx.restore();
}
function spentPuck(s) {
  // Flying faces stay visible until they join the persistent collection below.
  for (const puck of s.pucks) if (puck.falling) placedPuck(puck);
}
// Fixed grains make pause, replay and arbitrary time jumps show the same pour.
const GROUND_GRAINS = Array.from({ length: 156 }, (_, i) => {
  const seed = n => F.mod(Math.sin((i + 1) * n) * 43758.5453, 1);
  const birth = 1.56 + i / 155 * .68;
  const density = F.ease((birth - 1.56) / .07) * F.ease((2.24 - birth) / .12);
  return {
    birth, flight: .125 + seed(4.39) * .015, visible: seed(7.13) < density,
    sourceX: 305 + (seed(9.31) - .5) * 9,
    drift: (seed(3.71) - .5) * 13,
    rx: .7 + seed(5.29) * .85, ry: .7 + seed(2.17) * .75,
    tone: i % 5 < 2 ? 0 : i % 5 < 4 ? 1 : 2
  };
});
const GROUND_PALETTES = new Map(F.recipes.map(recipe => {
  const color = F.primary(recipe);
  const rgb = [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16));
  // Warm, same-color lighter flecks keep dark grounds visible on the navy wall.
  const tint = amount => '#' + rgb.map((value, i) => Math.round(F.lerp(value, [245, 213, 173][i], amount)).toString(16).padStart(2, '0')).join('');
  return [recipe.kind, [color, tint(.38), tint(.68)]];
}));
function groundCoffee(s) {
  if (s.phase < 1.56 || s.phase >= 2.38) return;
  const colors = GROUND_PALETTES.get(s.recipe.kind);
  for (const grain of GROUND_GRAINS) {
    const u = (s.phase - grain.birth) / grain.flight;
    if (!grain.visible || u < 0 || u >= 1) continue;
    const fall = .24 * u + .76 * u * u;
    // Fall below the basket lip; the opaque front is painted afterward. Never
    // expose an interior heap or spray over the rim in this front-on view.
    oval(grain.sourceX + grain.drift * u, 607 + 36 * fall,
      grain.rx, grain.ry, colors[grain.tone]);
  }
}
function mistParticle(x, y, dx, dy, color, alpha, width) {
  ctx.save(); ctx.globalAlpha = alpha;
  drawLine([[x - dx * 2, y - dy * 2], [x + dx * 2, y + dy * 2]], color, width);
  ctx.restore();
}
function coffeeFlow(s) {
  const flow = s.flow;
  if (!flow) return;
  const x = s.handle.x, y = s.handle.y + 28;
  const width = 3.1 + .15 * Math.sin(s.time * 17);
  // The exposed basket drains into a single stream; no lower hardware is attached.
  // The front-facing grip and cat are drawn afterward, preserving their occlusion.
  drawLine([[x, y + flow.top], [x, y + flow.bottom]], '#C49A72', width + .8);
  drawLine([[x, y + flow.top], [x, y + flow.bottom]], F.primary(s.recipe), width);
  if (flow.top === 0) {
    const length = Math.min(10, flow.bottom);
    shape(`M ${x - 7} ${y} H ${x + 7} Q ${x + 2} ${y + length * .5} ${x + width / 2} ${y + length} H ${x - width / 2} Q ${x - 2} ${y + length * .5} ${x - 7} ${y} Z`, F.primary(s.recipe));
  }
}
function secondaryMist(s) {
  if (s.malfunction) return;
  // Directional spray visibly travels from the wand to the changing coat.
  for (let i = 0; i < 72; i++) {
    const birth = 4.2 + i * 0.0108;
    const u = (s.phase - birth) / 0.19;
    if (u < 0 || u > 1) continue;
    const origin = F.wandPose(birth);
    const ex = origin.targetX + Math.sin(i * 7.93) * 25;
    const ey = origin.targetY + Math.cos(i * 3.97) * 30;
    const x = F.lerp(origin.x, ex, u), y = F.lerp(origin.y, ey, u);
    mistParticle(x, y, -1, 0.35, F.secondary(s.recipe), Math.sin(Math.PI * u) * 0.95, 2.3);
  }
}

function drawCat(state, time) {
  CatArt.draw(ctx, state, time, { scale: 0.93 * (state.recipe.kind === 'xiaokui' ? 1.1 : 1) });
}
