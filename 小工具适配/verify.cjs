'use strict';
// Run with node --expose-internals; reuse Node's bundled parser without installing dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '交付文件/小工具动效预览');
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g), m => m[1]);
const forbidden = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection', 'Worker', 'SharedWorker', 'WebAssembly', 'eval', 'Function', 'requestFullscreen', 'webkitRequestFullscreen', 'serviceWorker', 'geolocation', 'clipboard', 'getBattery', 'getDisplayMedia', 'enumerateDevices', 'Accelerometer', 'Gyroscope', 'Magnetometer', 'DeviceMotionEvent', 'DeviceOrientationEvent', 'PaymentRequest']);
for (const name of scripts) {
  const text = fs.readFileSync(path.join(out, name), 'utf8');
  const ast = acorn.parse(text, { ecmaVersion: 2017, sourceType: 'script' });
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier') assert.ok(!forbidden.has(node.name), `${name}: 禁用能力 ${node.name}`);
    if (node.type === 'MemberExpression' && node.object.name === 'window') {
      assert.ok(!['open', 'prompt'].includes(node.property.name));
    }
    for (const key of Object.keys(node)) if (key !== 'start' && key !== 'end') {
      if (Array.isArray(node[key])) node[key].forEach(walk); else walk(node[key]);
    }
  };
  walk(ast);
}
assert.ok(!/<script(?![^>]*src=)|\son\w+\s*=|<iframe|<object|<base|type="module"|\bdownload\b|javascript:/i.test(html));
for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert.ok(!/^(?:[a-z]+:|\/|\.\.\/)/i.test(ref));
  assert.ok(fs.existsSync(path.join(out, ref)), ref);
}
console.log('通过：全部脚本 ES2017 语法、禁用能力扫描、单页与本地引用。');
const sourceF = require(path.join(root, 'timeline.js'));
const builtF = require(path.join(out, 'timeline.js'));
const sourceCat = require(path.join(root, 'cat.js'));
const builtCat = require(path.join(out, 'cat.js'));
for (let i = 0; i <= 4800; i++) {
  const t = i / 20;
  assert.deepEqual(builtF.stateAt(t), sourceF.stateAt(t), `时序 ${t}`);
}
let models = 0;
for (let i = 0; i < 15; i++) for (const phase of [0, .8, 1.6, 3.2, 4.5, 5.3, 6.4, 7.8]) {
  const t = i * 8 + phase;
  for (const cat of builtF.stateAt(t).cats) {
    assert.equal(JSON.stringify(builtCat.model(cat, t)), JSON.stringify(sourceCat.model(cat, t)));
    models++;
  }
}
console.log(`通过：两轮 4801 个时刻状态一致，${models} 个猫模型一致。`);
let clock = 0, frameId = 0, paintCalls = 0, createdCanvases = 0;
const frames = new Map(), contexts = [];
function target(extra = {}) {
  const handlers = {};
  return Object.assign({
    addEventListener(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    fire(name, event = {}) { for (const fn of handlers[name] || []) fn(Object.assign({ target: this, preventDefault() {} }, event)); },
    style: { setProperty() {} }, classList: { add() {}, remove() {} },
    setAttribute() {}, contains() { return false; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, right: 375, top: 620 }; }
  }, extra);
}
class FakePath { constructor(d = '') { assert.ok(!/NaN|Infinity/.test(d)); } }
function canvas() {
  createdCanvases++;
  const c = target({ width: 300, height: 150 });
  let depth = 0;
  const context = new Proxy({ canvas: c }, { get(obj, prop) {
    if (prop in obj) return obj[prop];
    if (prop === 'save') return () => { depth++; };
    if (prop === 'restore') return () => { assert.ok(depth > 0); depth--; };
    if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (prop === 'depth') return depth;
    return (...args) => { paintCalls++; for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), prop); };
  } });
  c.getContext = () => context; contexts.push(context); return c;
}
const elements = {};
for (const id of ['stage', 'play-controls', 'play-toggle', 'play-progress', 'play-replay', 'play-speed', 'play-sound', 'play-time']) elements[id] = target();
elements.stage.appendChild = c => { elements[c.id] = c; };
elements['coffee-bean-art'] = { complete: true, naturalWidth: 1254 };
const document = target({ readyState: 'loading', hidden: false, body: {}, activeElement: null,
  createElement(tag) { assert.equal(tag, 'canvas'); return canvas(); },
  getElementById(id) { return elements[id] || null; } });
const host = target({ document, Path2D: FakePath, URLSearchParams,
  innerWidth: 375, innerHeight: 812, devicePixelRatio: 3, location: { search: '' },
  getComputedStyle() { return { paddingBottom: '146px', paddingTop: '0px' }; },
  matchMedia() { return { matches: false }; },
  performance: { now: () => clock }, atob: s => Buffer.from(s, 'base64').toString('binary'),
  requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); }
});
host.window = host;
vm.createContext(host);
for (const name of scripts) vm.runInContext(fs.readFileSync(path.join(out, name), 'utf8'), host, { filename: name });
host.fire('load');
assert.equal(frames.size, 1);
const read = code => vm.runInContext(code, host);
assert.equal(elements['factory-canvas'].width, 750);
assert.equal(elements['factory-canvas'].height, 1000);
for (let i = 0; i < 15; i++) for (const p of [.1, 1.6, 3.2, 4.5, 5.3, 6.4, 7.3]) host.renderScene(i * 8 + p);
for (const c of contexts) assert.equal(c.depth, 0);
assert.ok(paintCalls > 1000);
elements['play-toggle'].fire('click'); assert.equal(read('running'), false);
elements['play-progress'].fire('pointerdown', { button: 0 });
elements['play-progress'].value = '29'; elements['play-progress'].fire('input');
host.fire('pointerup'); assert.equal(read('elapsed'), 29); assert.equal(read('running'), false);
elements['play-replay'].fire('click'); assert.equal(read('elapsed'), 0); assert.equal(read('running'), true);
elements['play-speed'].fire('click'); assert.equal(read('playbackRate'), 1.5);
assert.equal(elements['play-time'].textContent, '00:00 / 01:20');
// Test the old touch fallback branch (PointerEvent deliberately absent).
elements['play-progress'].fire('touchstart'); assert.equal(read('draggingProgress'), true);
host.fire('touchcancel'); assert.equal(read('draggingProgress'), false);
document.hidden = true; document.fire('visibilitychange'); assert.equal(frames.size, 0);
clock = 100000; document.hidden = false; document.fire('visibilitychange');
assert.equal(frames.size, 1); assert.equal(read('previousTime'), 100000);
const fn = frames.values().next().value; frames.clear(); clock += 100; fn();
assert.ok(Math.abs(read('elapsed') - .15) < 1e-9);
host.fire('pagehide'); assert.equal(frames.size, 0);
let biggest = 0;
for (const clip of Object.values(host.FactoryAudioClips)) {
  const bytes = Buffer.from(clip.data, 'base64').length;
  assert.equal(bytes, clip.frames * 2); assert.ok(bytes <= 1024 * 1024); biggest = Math.max(biggest, bytes);
}
console.log(`通过：105 个整场绘制时刻、画布与触屏控件、重播、倍速、后台停止；创建 ${createdCanvases} 个缓存画布。`);
console.log(`通过：音效数据完整，单条最大 ${biggest} 字节。以上为代码检查，未作真实浏览器或小红书真机验收。`);
