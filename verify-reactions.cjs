'use strict';
// Optional regression baseline: node verify-reactions.cjs /path/to/cat-before-actions.js
// Pure geometry/drawing-contract checks; this script opens no browser and creates no images.
const assert = require('node:assert/strict');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const Cat = require('./cat.js');
const F = require('./timeline.js');
const Before = process.argv[2] ? require(path.resolve(process.argv[2])) : null;
const recipe = F.recipes.find(item => item.kind === 'xiaokui');
assert.ok(recipe, '小葵配方须存在');
const baseline = { x: 0, walkDistance: 0, index: 6, walking: 0, tailLift: 1, coat: 1, baseCoat: 1, recipe };
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message);

// Only the small curve sampler is shared in approach with verify-geometry.cjs.
function flatten(commands) {
  const points = [];
  let current, start;
  for (const [op, ...a] of commands) {
    if (op === 'M' || op === 'L') { current = a; if (op === 'M') start = a; points.push(a); }
    else if (op === 'Z') { current = start; points.push(start); }
    else if (op === 'Q' || op === 'C') {
      const origin = current;
      for (let step = 1; step <= 24; step++) {
        const t = step / 24, u = 1 - t;
        points.push([0, 1].map(i => op === 'Q'
          ? u * u * origin[i] + 2 * u * t * a[i] + t * t * a[i + 2]
          : u ** 3 * origin[i] + 3 * u * u * t * a[i] + 3 * u * t * t * a[i + 2] + t ** 3 * a[i + 4]));
      }
      current = a.slice(-2);
    } else assert.fail(`未知路径类型 ${op}`);
  }
  return points;
}
const bounds = points => ({ left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) });
function winding(points, x, y) {
  let value = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1];
    const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y && by > y && cross > 0) value++;
    if (ay > y && by <= y && cross < 0) value--;
  }
  return value;
}
function overlap(a, b, center, label) {
  for (const [dx, dy] of [[0, 0], [-.5, 0], [.5, 0], [0, -.5], [0, .5]]) {
    assert.ok(winding(a, center[0] + dx, center[1] + dy) > 0 && winding(b, center[0] + dx, center[1] + dy) > 0, `${label}必须有实心连接面积`);
  }
}
function withinCanvas(box, label) {
  assert.ok(Object.values(box).every(Number.isFinite), `${label}须为有限坐标`);
  assert.ok(box.left >= -150 && box.right <= 150 && box.top >= -190 && box.bottom <= 30, `${label}超出中间画布：${JSON.stringify(box)}`);
}

let poses = 0, roots = 0;
for (const puff of [0, .01, .25, .5, .75, 1]) for (const hiss of [0, .01, .25, .5, .75, 1]) {
  for (const walking of [0, .5, 1]) for (const tailLift of [0, 1]) for (let frame = 0; frame < 24; frame++) {
    const state = { ...baseline, walkDistance: frame / 24 * 40 * .93, walking, tailLift, reaction: { puff, hiss } };
    const time = frame / 12, model = Cat.model(state, time), normal = Cat.model({ ...state, reaction: undefined }, time);
    const body = flatten(model.body), tail = flatten(model.tail), head = flatten(model.head);
    for (const [contourIndex, contour] of model.contours.entries()) {
      const points = flatten(contour);
      assert.ok(points.flat().every(Number.isFinite), '动作不能产生无效坐标');
      withinCanvas(bounds(points), '身体、头、毛尖、尾巴和四肢');
      const area = points.slice(1).reduce((sum, p, i) => sum + points[i][0] * p[1] - p[0] * points[i][1], 0) / 2;
      assert.ok(area > 0, `轮廓方向不可抵消而产生透明孔：puff=${puff}, hiss=${hiss}, walking=${walking}, tailLift=${tailLift}, frame=${frame}, contour=${contourIndex}, area=${area}`);
    }
    model.legs.forEach((leg, i) => {
      const points = flatten(leg.commands);
      overlap(body, points, [leg.x, leg.rootY], `第 ${i + 1} 条腿根`);
      near(leg.footX, normal.legs[i].footX, '炸毛不能让脚掌在地面滑动');
      near(leg.footY, normal.legs[i].footY, '炸毛不能让脚掌突然离地');
      assert.ok(bounds(points).bottom <= 1, '脚掌不能穿过地面');
      roots++;
    });
    overlap(body, tail, model.tailTransform(...model.tailRoot), '尾根');
    // Sample real head/body overlap instead of assuming a single reference point.
    const boxA = bounds(body), boxB = bounds(head);
    let neck = 0;
    for (let y = Math.max(boxA.top, boxB.top); y < Math.min(boxA.bottom, boxB.bottom); y += 4)
      for (let x = Math.max(boxA.left, boxB.left); x < Math.min(boxA.right, boxB.right); x += 4)
        if (winding(body, x, y) > 0 && winding(head, x, y) > 0) neck++;
    assert.ok(neck >= 3, '动作期间头与肩颈不能断开');
    for (const tuft of model.fur) assert.ok(flatten(tuft.commands).filter(p => winding(body, ...p) > 0 || winding(tail, ...p) > 0).length >= 3, '每撮炸毛都须接在背部或尾巴');
    if (!puff && !hiss) {
      assert.deepEqual(model.contours, normal.contours, '归零须回到日常形状');
      if (Before) assert.deepEqual(model.contours, Before.model(state, time).contours, '归零须与动作开发前的形状完全一致');
    }
    poses++;
  }
}
for (const stateReaction of [{ puff: -1, hiss: -4 }, { puff: 2, hiss: 7 }, { puff: NaN, hiss: undefined }]) {
  const m = Cat.model({ ...baseline, reaction: stateReaction }, 0);
  for (const value of Object.values(m.reaction)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, '动作输入须限制在安全范围');
}
for (const other of F.recipes.filter(item => item.kind !== 'xiaokui')) {
  for (const walking of [0, 1]) {
    const state = { ...baseline, recipe: other, walking, walkDistance: 9 };
    assert.deepEqual(Cat.model({ ...state, reaction: { puff: 1, hiss: 1 } }, .6).contours, Cat.model(state, .6).contours, `${other.name}不能使用小葵的动作`);
  }
}
const still = Cat.model(baseline, 0), puffed = Cat.model({ ...baseline, reaction: { puff: 1, hiss: 0 } }, 0);
assert.ok(bounds(flatten(puffed.body)).top < bounds(flatten(still.body)).top - 10, '满幅炸毛须有可见拱背');
assert.ok(bounds(flatten(puffed.head)).top > bounds(flatten(still.head)).top + 5, '满幅炸毛须有可见压耳');
assert.ok(bounds(flatten(puffed.tail)).left < bounds(flatten(still.tail)).left - 5, '满幅炸毛须有可见尾巴膨胀');

// Trace visible fills/strokes and their clip intersections, including the mouth
// outside the model contours. No Canvas package or pixel renderer is required.
class TracePath {
  constructor(source = '') {
    const tokens = source.match(/[MLCQZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    this.commands = [];
    for (let i = 0; i < tokens.length;) {
      const op = tokens[i++], count = { M: 2, L: 2, Q: 4, C: 6, Z: 0 }[op];
      assert.notEqual(count, undefined);
      this.commands.push([op, ...tokens.slice(i, i + count).map(Number)]); i += count;
    }
  }
  addPath(other) { this.commands.push(...other.commands); }
}
global.Path2D = TracePath;
function traceDraw(art, state, time = .5) {
  let current, transform = [1, 1, 0, 0], clips = [];
  const stack = [], output = [];
  const project = source => flatten(source.commands).map(([x, y]) => [x * transform[0] + transform[2], y * transform[1] + transform[3]]);
  function record(ctx, source, stroke) {
    const points = project(source), box = bounds(points);
    if (stroke) {
      const pad = ctx.lineWidth / 2 * Math.max(Math.abs(transform[0]), Math.abs(transform[1]));
      box.left -= pad; box.right += pad; box.top -= pad; box.bottom += pad;
    }
    for (const clip of clips) { box.left = Math.max(box.left, clip.left); box.right = Math.min(box.right, clip.right); box.top = Math.max(box.top, clip.top); box.bottom = Math.min(box.bottom, clip.bottom); }
    if (box.left <= box.right && box.top <= box.bottom && ctx.globalAlpha > 0) {
      withinCanvas(box, '实际可见填色及哈气线条');
      output.push({ points, box, color: stroke ? ctx.strokeStyle : ctx.fillStyle, alpha: ctx.globalAlpha, stroke: !!stroke });
    }
  }
  const ctx = {
    globalAlpha: 1, lineWidth: 1,
    save() { stack.push({ transform: [...transform], clips: [...clips], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth }); },
    restore() { const saved = stack.pop(); assert.ok(saved, '绘图保存与恢复必须配对'); ({ transform, clips } = saved); Object.assign(this, { fillStyle: saved.fillStyle, strokeStyle: saved.strokeStyle, globalAlpha: saved.globalAlpha, lineWidth: saved.lineWidth }); },
    translate(x, y) { transform[2] += x * transform[0]; transform[3] += y * transform[1]; },
    scale(x, y) { transform[0] *= x; transform[1] *= y; },
    clip(source = current) { clips.push(bounds(project(source))); },
    fill(source = current) { record(this, source, false); },
    stroke(source = current) { record(this, source, true); },
    fillRect(x, y, w, h) { this.fill(new TracePath(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`)); },
    beginPath() { current = new TracePath(); },
    ellipse(x, y, rx, ry) { for (let n = 0; n < 48; n++) current.commands.push([n ? 'L' : 'M', x + rx * Math.cos(n / 48 * Math.PI * 2), y + ry * Math.sin(n / 48 * Math.PI * 2)]); current.commands.push(['Z']); }
  };
  art.draw(ctx, state, time, { x: 0, y: 0, scale: 1, noBlink: true });
  assert.equal(stack.length, 0);
  return output;
}
for (const puff of [0, .01, .5, 1]) for (const hiss of [0, .01, .5, 1]) {
  const trace = traceDraw(Cat, { ...baseline, reaction: { puff, hiss } });
  if (hiss === 1) {
    assert.ok(trace.some(item => item.color === '#D9979C' && item.box.bottom - item.box.top > 1), '哈气时必须露出有高度的口腔');
    const teeth = trace.filter(item => item.color === '#FFFFFF' && !item.stroke && item.box.right - item.box.left < 3 && item.box.top < -90 && item.box.bottom > -90);
    assert.equal(teeth.length, 2, '哈气时须有两颗小牙');
  }
}
if (Before) for (const walking of [0, 1]) for (const distance of [0, 9, 23, 34]) {
  const state = { ...baseline, walking, walkDistance: distance, reaction: { puff: 0, hiss: 0 } };
  const normalized = trace => JSON.parse(JSON.stringify(trace, (_key, value) => typeof value === 'number' ? Math.round(value * 1e7) / 1e7 : value)).map(item => ({
    ...item, points: item.points.filter((point, i, points) => !i || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1])
  }));
  assert.ok(isDeepStrictEqual(normalized(traceDraw(Cat, state)), normalized(traceDraw(Before, state))), `动作归零时填色、眼睛、鼻斑与嘴线必须与旧版一致：walking=${walking}, distance=${distance}`);
}
console.log(`通过：${poses} 个动作与步态组合、${roots} 处腿根、尾根/肩颈/毛尖连接、脚掌落地、中间画布边界及哈气口牙。`);
console.log(`通过：动作安全范围、其他猫不受影响、日常归零${Before ? '及开发前形状和填色逐项回归' : '；未提供开发前文件，跳过历史回归'}。`);
console.log('这些是几何与绘制数据检查，不代替动作的视觉验收。');
