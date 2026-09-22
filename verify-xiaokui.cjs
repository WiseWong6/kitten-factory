'use strict';
const assert = require('node:assert/strict');
const Cat = require('./cat.js');
const F = require('./timeline.js');
const recipe = F.recipes.find(r => r.kind === 'xiaokui');

// Sample the paths actually sent to Canvas, including clipping and animation.
// This checks markings numerically without opening a browser or making images.
class SamplePath {
  constructor(source = '') {
    this.polygons = [];
    const tokens = source.match(/[MLCQZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    let point, start, polygon;
    for (let i = 0; i < tokens.length;) {
      const op = tokens[i++];
      const count = { M: 2, L: 2, Q: 4, C: 6, Z: 0 }[op];
      assert.notEqual(count, undefined);
      const args = tokens.slice(i, i + count).map(Number); i += count;
      if (op === 'M') { point = start = args; polygon = [point]; this.polygons.push(polygon); }
      if (op === 'L') { point = args; polygon.push(point); }
      if (op === 'Z') { polygon.push(start); point = start; }
      if (op === 'Q' || op === 'C') {
        const origin = point;
        for (let step = 1; step <= 40; step++) {
          const t = step / 40, u = 1 - t;
          polygon.push([0, 1].map(n => op === 'Q'
            ? u * u * origin[n] + 2 * u * t * args[n] + t * t * args[n + 2]
            : u ** 3 * origin[n] + 3 * u * u * t * args[n] + 3 * u * t * t * args[n + 2] + t ** 3 * args[n + 4]));
        }
        point = args.slice(-2);
      }
    }
  }
  addPath(other) { this.polygons.push(...other.polygons); }
}
global.Path2D = SamplePath;
function inside(polygons, [x, y]) {
  let winding = 0;
  for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[(i + 1) % polygon.length];
    const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y && by > y && side > 0) winding++;
    if (ay > y && by <= y && side < 0) winding--;
  }
  return winding !== 0;
}
function sampleDrawing(state, time) {
  const fills = [], stack = [];
  let transform = [1, 1, 0, 0], clips = [], current;
  const project = path => path.polygons.map(poly => poly.map(([x, y]) =>
    [x * transform[0] + transform[2], y * transform[1] + transform[3]]));
  const ctx = {
    save() { stack.push({ transform: [...transform], clips: [...clips], color: this.fillStyle }); },
    restore() { const saved = stack.pop(); transform = saved.transform; clips = saved.clips; this.fillStyle = saved.color; },
    translate(x, y) { transform[2] += x * transform[0]; transform[3] += y * transform[1]; },
    scale(x, y) { transform[0] *= x; transform[1] *= y; },
    clip(path = current) { clips.push(project(path)); },
    fill(path = current) { fills.push({ polygons: project(path), clips: [...clips], color: this.fillStyle }); },
    fillRect(x, y, w, h) { this.fill(new SamplePath(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`)); },
    beginPath() { current = new SamplePath(); },
    ellipse(x, y, rx, ry) {
      current.polygons.push(Array.from({ length: 96 }, (_, i) => [x + rx * Math.cos(i / 96 * Math.PI * 2), y + ry * Math.sin(i / 96 * Math.PI * 2)]));
    },
    stroke() {} // Paw and mouth strokes do not alter fur-region checks.
  };
  Cat.draw(ctx, state, time, { x: 0, y: 0, scale: 1, noBlink: true });
  assert.equal(stack.length, 0);
  return {
    fills,
    colorAt(point) {
      let color;
      for (const fill of fills) if (inside(fill.polygons, point) && fill.clips.every(clip => inside(clip, point))) color = fill.color;
      return color;
    }
  };
}
const point = (x, y) => [(x - 500) * .22, (y - 880) * .22];
const standing = { x: 0, walkDistance: 0, index: 6, walking: 0, tailLift: 1, coat: 1, baseCoat: 1, recipe };
const art = sampleDrawing(standing, 6);
for (const [x, y, rx, ry] of [[790, 404, 26, 27], [925, 376, 20, 24]]) {
  for (let step = 0; step < 48; step++) {
    const angle = step / 48 * Math.PI * 2;
    assert.equal(art.colorAt(point(x + (rx + 3) * Math.cos(angle), y + (ry + 3) * Math.sin(angle))), recipe.ink, '两只眼睛完整处于灰毛内');
  }
  assert.equal(art.colorAt(point(x, y + ry + 12)), recipe.ink, '眼睛下缘与白嘴之间保留灰毛');
}
assert.equal(art.colorAt(point(807, 251)), recipe.ink, '额头顶部灰色连通，白纹不能变成中分');
assert.equal(art.colorAt(point(808, 323)), '#FFFFFF', '保留窄而不对称的额头白纹');
for (const [x, y] of [[884, 432], [886, 435], [888, 438], [890, 441]]) {
  assert.ok(['#172356', recipe.ink].includes(art.colorAt(point(x, y))), '鼻子到右下灰斑之间不能出现白色间隙');
}
assert.equal(art.colorAt(point(918, 444)), '#FFFFFF', '灰斑右边不能继续向外扩大');
for (const [x, y, color] of [[290, 650, recipe.ink], [575, 565, recipe.ink], [475, 535, '#FFFFFF'], [430, 553, recipe.ink], [410, 554, '#FFFFFF'], [785, 596, '#FFFFFF']]) {
  assert.equal(art.colorAt(point(x, y)), color, `侧背花纹锚点 ${x},${y}`);
}
let movingChecks = 0;
for (let frame = 0; frame < 48; frame++) {
  const state = { ...standing, walking: 1, walkDistance: frame / 48 * Cat.model(standing, 0).stride * .93 };
  const time = frame / 24, m = Cat.model(state, time), drawing = sampleDrawing(state, time);
  for (const [x, y, color] of [[662, 743, recipe.ink], [662, 807, '#FFFFFF']]) {
    assert.equal(drawing.colorAt(m.legs[2].deform(...point(x, y))), color, '前腿灰袖口与白袜随同一条腿移动');
    movingChecks++;
  }
  assert.equal(drawing.colorAt(m.tailTransform(...point(107, 370))), recipe.ink, '尾巴从尾根到尾尖保持灰色');
}
const initial = sampleDrawing({ ...standing, coat: 0, baseCoat: 0 }, 0);
const grayBase = sampleDrawing({ ...standing, coat: 0, baseCoat: 1 }, 4.2);
assert.equal(initial.colorAt(point(575, 565)), '#FFFFFF', '入场仍为白猫');
assert.equal(grayBase.colorAt(point(575, 565)), recipe.ink, '主色阶段先染灰，再喷白色花纹');
let reactionChecks = 0;
for (const puff of [0, .25, .5, .75, 1]) for (const hiss of [0, .5, 1]) {
  const state = { ...standing, reaction: { puff, hiss } };
  const m = Cat.model(state, 1), drawing = sampleDrawing(state, 1);
  for (const [x, y] of [[884, 432], [886, 435], [888, 438], [890, 441]]) {
    assert.ok(['#172356', recipe.ink].includes(drawing.colorAt(point(x, y))), '哈气时鼻斑仍贴鼻，不能露白缝');
  }
  for (const [x, y, color] of [[808, 323, '#FFFFFF'], [918, 444, '#FFFFFF'], [790, 443, recipe.ink], [925, 412, recipe.ink]]) {
    assert.equal(drawing.colorAt(point(x, y)), color, '压耳时白纹、鼻斑宽度和双眼灰毛保持原样');
  }
  for (const [x, y, color] of [[290, 650, recipe.ink], [575, 565, recipe.ink], [475, 535, '#FFFFFF'], [430, 553, recipe.ink], [410, 554, '#FFFFFF']]) {
    assert.equal(drawing.colorAt(m.bodyTransform(...point(x, y))), color, '炸毛时侧背花纹随背部弯曲，保留白带和灰岛');
  }
  assert.equal(drawing.colorAt(m.legs[2].deform(...point(662, 743))), recipe.ink, '炸毛时前腿灰袖口保持完整');
  assert.equal(drawing.colorAt(m.legs[2].deform(...point(662, 807))), '#FFFFFF', '炸毛时白袜不染灰');
  reactionChecks++;
}
console.log(`通过：双眼灰毛、额头白纹、鼻旁灰斑无间隙、侧背花纹、${movingChecks} 次前腿袖口与白袜随动、全灰尾巴及染色顺序。`);
console.log(`通过：${reactionChecks} 组炸毛与哈气状态保留白纹、双眼灰毛、贴鼻灰斑、侧背花纹和灰袖口。`);
console.log('这些检查验证实际绘制路径的位置和颜色，不代替人工确认美术效果。');
