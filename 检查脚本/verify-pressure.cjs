'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../timeline.js');

// Exercise the actual gauge drawing with a small canvas substitute, without a browser.
const source = fs.readFileSync(path.join(require('node:path').resolve(__dirname, '..'), 'scene.js'), 'utf8');
const machineSource = source.slice(source.indexOf('function machine(s) {'), source.indexOf('function dripTray() {'));
const lines = [], ovals = [], alphaStack = [];
const ctx = {
  globalAlpha: 1,
  save() { alphaStack.push(this.globalAlpha); },
  restore() { this.globalAlpha = alphaStack.pop(); },
  beginPath() {}, roundRect() {}, clip() {}
};
const app = vm.createContext({ F, Math, ctx,
  BLUE: '#0E3CF1', NAVY: '#172356', WHITE: '#FFFFFF',
  BODY_SIDE: '#344A80', BODY_SHADOW: '#111B42', PALE: '#CFDAF7',
  roundBox() {}, shape() {}, hopper() {}, dripTray() {},
  drawLine(points, color, width) { lines.push({ points, color, width }); },
  oval(x, y, rx, ry, color) { ovals.push({ x, y, rx, ry, color, alpha: ctx.globalAlpha }); }
});
vm.runInContext(machineSource, app);
function draw(state) {
  lines.length = ovals.length = 0;
  app.machine(state);
  const needle = lines.find(line => line.width === 5 && line.points[0][0] === 435 && line.points[0][1] === 475);
  assert.ok(needle, '压力针仍绕固定针心绘制');
  const dx = needle.points[1][0] - 435, dy = needle.points[1][1] - 475;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 41) < 1e-9, '指针长度不能随顶冲伸缩');
  return { needle, red: ovals.filter(oval => oval.color === '#FF514F') };
}
const needleAngle = state => Math.PI * (.8 + (state.recipe.kind === 'xiaokui' ? 1.42 : 1.1) * state.pressure) + state.pressureKick;
const at = (kind, phase) => F.stateAt(F.recipes.findIndex(recipe => recipe.kind === kind) * 8 + phase);
const expectedPressure = phase => F.ease((phase - 3.35) / .35) * (1 - F.ease((phase - 5.2) / .45));

for (const [index, recipe] of F.recipes.entries()) {
  for (let frame = 0; frame < 8 * 60; frame++) {
    const phase = frame / 60, state = F.stateAt(index * 8 + phase), rendered = draw(state);
    assert.ok(Number.isFinite(state.pressureKick));
    assert.ok(state.overload >= 0 && state.overload <= 1);
    assert.ok(Math.abs(state.pressure - (recipe.malfunction ? 0 : expectedPressure(phase))) < 1e-12, '原升压、降压时间不变');
    assert.ok(needleAngle(state) <= 2.22 * Math.PI + 1e-12, '指针不能穿过最大刻度限位');
    assert.ok(needleAngle(state) >= .8 * Math.PI - 1e-12, '降压后不得越过归零位置');
    assert.equal(rendered.red.length > 0, state.overload > 0, '红灯只随过载亮起');
    assert.ok(ovals.some(oval => oval.x === 435 && oval.y === 475 && oval.rx === 59 && oval.ry === 59), '表盘位置固定');
    if (recipe.kind !== 'xiaokui') {
      assert.equal(state.overload, 0, '其他猫不触发过载');
      assert.equal(state.pressureKick, 0, '其他猫指针无顶冲');
      const a = Math.PI * (.8 + 1.1 * state.pressure);
      assert.ok(Math.abs(rendered.needle.points[1][0] - (435 + 41 * Math.cos(a))) < 1e-9);
      assert.ok(Math.abs(rendered.needle.points[1][1] - (475 + 41 * Math.sin(a))) < 1e-9);
    }
    if (recipe.malfunction) {
      const light = ovals.find(oval => oval.x === 533 && oval.y === 475 && oval.rx === 5);
      assert.equal(light.color, state.faultLight ? '#F9CD77' : '#111B42', '白猫仍使用原黄色故障灯');
    }
  }
}

let hits = 0, rebounds = 0, lastDirection = 0;
const sampled = [];
for (let frame = 0; frame <= 240; frame++) {
  const state = at('xiaokui', 4 + frame / 240), angle = needleAngle(state);
  sampled.push(angle);
  if (frame) {
    const delta = angle - sampled[frame - 1];
    const direction = Math.abs(delta) < 1e-9 ? 0 : Math.sign(delta);
    if (direction > 0 && lastDirection <= 0) hits++;
    if (direction < 0 && lastDirection >= 0) rebounds++;
    if (direction) lastDirection = direction;
  }
}
assert.ok(hits >= 4 && rebounds >= 4, '满压期间持续多次顶冲和回弹');
assert.ok(Math.max(...sampled) - Math.min(...sampled) > .11, '顶冲有足够幅度，不是不可见的微小变化');
assert.ok(Math.max(...sampled) - Math.min(...sampled) <= .12 + 1e-12, '回弹控制在约七度内');
assert.ok(Math.abs(Math.max(...sampled) - 2.22 * Math.PI) < 1e-12, '向外顶冲确实碰到最大刻度');

const edges = [3.7, 3.86, 5.2, 5.38];
for (let i = 0; i < 9; i++) for (const portion of [0, .3, .56, 1]) edges.push(3.7 + (i + portion) * .19);
for (const phase of edges) {
  const before = at('xiaokui', phase - 1e-6), after = at('xiaokui', phase + 1e-6);
  assert.ok(Math.abs(needleAngle(before) - needleAngle(after)) < .0001, '顶冲、回弹及进出边界连续');
  assert.ok(Math.abs(before.overload - after.overload) < .0001, '红灯亮灭连续');
}
for (const phase of [0, 3.7, 5.38, 5.65, 7.9]) {
  const state = at('xiaokui', phase);
  assert.equal(state.overload, 0);
  assert.equal(state.pressureKick, 0);
}
for (const phase of [0, 5.65, 7.9]) {
  assert.ok(Math.abs(needleAngle(at('xiaokui', phase)) - .8 * Math.PI) < 1e-12, '过载结束归零位置不变');
}
assert.equal(F.xiaokuiReaction(5.47).puff, 0, '小葵不恢复炸毛');
assert.ok(F.xiaokuiReaction(5.47).hiss > 0, '小葵保留怒叫表情');
console.log('小葵过载检查通过：持续顶冲、固定针心、刻度限位、红灯与黄灯隔离、连续进出及原猫咪动作。');
