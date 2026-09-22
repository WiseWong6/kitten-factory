'use strict';
// Inspect the paths actually sent to Canvas. No browser, images or audio output.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('./timeline.js');
const Cat = require('./cat.js');
const Sound = require('./sound.js');
const ordinary = F.recipes.map((recipe, index) => ({ recipe, index })).filter(({ recipe }) => recipe.kind !== 'xiaokui');
assert.equal(ordinary.length, 14);

class SamplePath {
  constructor(source = '') {
    this.points = [];
    const tokens = source.match(/[MLCQZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    let point, start;
    for (let i = 0; i < tokens.length;) {
      const op = tokens[i++], count = { M: 2, L: 2, Q: 4, C: 6, Z: 0 }[op];
      assert.notEqual(count, undefined);
      const a = tokens.slice(i, i + count).map(Number); i += count;
      if (op === 'M' || op === 'L') { point = a; if (op === 'M') start = a; this.points.push(a); }
      else if (op === 'Z') { point = start; this.points.push(start); }
      else {
        const origin = point;
        for (let step = 1; step <= 24; step++) {
          const t = step / 24, u = 1 - t;
          this.points.push([0, 1].map(n => op === 'Q'
            ? u * u * origin[n] + 2 * u * t * a[n] + t * t * a[n + 2]
            : u ** 3 * origin[n] + 3 * u * u * t * a[n] + 3 * u * t * t * a[n + 2] + t ** 3 * a[n + 4]));
        }
        point = a.slice(-2);
      }
    }
  }
  addPath(other) { this.points.push(...other.points); }
}
global.Path2D = SamplePath;
function draw(state, time = 0, options = {}) {
  const stack = [], records = [];
  let transform = [1, 1, 0, 0], clips = [], current;
  const project = source => source.points.map(([x, y]) => [x * transform[0] + transform[2], y * transform[1] + transform[3]]);
  const ctx = {
    globalAlpha: 1, lineWidth: 1,
    save() { stack.push({ transform: [...transform], clips: [...clips], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth }); },
    restore() { const saved = stack.pop(); assert.ok(saved); ({ transform, clips } = saved); Object.assign(this, { fillStyle: saved.fillStyle, strokeStyle: saved.strokeStyle, globalAlpha: saved.globalAlpha, lineWidth: saved.lineWidth }); },
    translate(x, y) { transform[2] += x * transform[0]; transform[3] += y * transform[1]; },
    scale(x, y) { transform[0] *= x; transform[1] *= y; },
    clip(source = current) { clips.push(project(source)); },
    fill(source = current) { records.push({ points: project(source), clips: [...clips], color: this.fillStyle, alpha: this.globalAlpha, stroke: false }); },
    stroke(source = current) { records.push({ points: project(source), clips: [...clips], color: this.strokeStyle, alpha: this.globalAlpha, stroke: true }); },
    fillRect(x, y, w, h) { this.fill(new SamplePath(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`)); },
    beginPath() { current = new SamplePath(); },
    ellipse(x, y, rx, ry) { current.points.push(...Array.from({ length: 48 }, (_, i) => [x + rx * Math.cos(i / 48 * Math.PI * 2), y + ry * Math.sin(i / 48 * Math.PI * 2)])); }
  };
  Cat.draw(ctx, state, time, { x: 0, y: 0, scale: 1, noBlink: true, ...options });
  assert.equal(stack.length, 0, '绘制保存与恢复配对');
  return records;
}
const mouth = records => records.filter(record => !record.stroke && record.color === '#352639');
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, label);
let timingChecks = 0, drawingChecks = 0;
for (const { recipe, index } of ordinary) {
  const voice = F.voiceFor(recipe), shape = voice.mouth;
  assert.ok(Object.isFrozen(voice) && Object.isFrozen(shape), '每种猫的声音和口型配置固定');
  assert.equal(F.voiceFor({ ...recipe }), voice, '同种猫每次使用相同录音与音高');
  assert.ok(voice.start + voice.duration < 5.8, '整段叫声在猫咪离场前播放完');
  let previous = 0, openings = 0;
  for (let step = 0; step <= 800; step++) {
    const age = step / 100, time = index * 8 + age, state = F.catState(time, index);
    const opening = state.reaction.meow;
    assert.ok(Number.isFinite(opening) && opening >= 0 && opening <= 1);
    assert.equal(state.reaction.hiss, 0); assert.equal(state.reaction.puff, 0);
    const sampleTime = (age - voice.start) * voice.pitch;
    if (sampleTime <= shape[0][0] + 1e-9 || sampleTime >= shape.at(-1)[0] - 1e-9) assert.equal(opening, 0, `${recipe.name}必须在叫声前后闭嘴`);
    if (opening > 0) assert.ok(Sound.cuesAt(time, F).some(cue => cue.type === 'meow'), '张嘴必须发生在猫叫声片段内');
    if (opening > 0 && previous === 0) openings++;
    assert.ok(Math.abs(opening - previous) < .35, '口型用少量平滑节点衔接，不能突然跳开或抖动');
    previous = opening; timingChecks++;
  }
  assert.equal(openings, 1, '每次叫声只完成一次连续张嘴到闭嘴');
  for (const [sampleTime, amount] of shape) {
    near(F.catState(index * 8 + voice.start + sampleTime / voice.pitch, index).reaction.meow, amount, '嘴部强弱跟随本录音节点，并补偿本猫音高');
  }
  const ages = [voice.start - .01, voice.start, voice.start + voice.duration, 5.8,
    ...shape.map(([t]) => voice.start + t / voice.pitch),
    ...shape.slice(1).map(([t], i) => voice.start + (t + shape[i][0]) / (2 * voice.pitch))];
  for (const age of ages) {
    const state = F.catState(index * 8 + age, index), closed = { ...state, reaction: { puff: 0, hiss: 0, meow: 0 } };
    const rendered = draw(state, age), resting = draw(closed, age), openings = mouth(rendered);
    assert.deepEqual(Cat.model(state, age).contours, Cat.model(closed, age).contours, '叫声不得改动头部比例、身体或行走');
    if (!state.reaction.meow) assert.deepEqual(rendered, resting, `${recipe.name}闭嘴时还原原有绘制`);
    else {
      assert.equal(openings.length, 1, `${recipe.name}须实际绘制一个口腔`);
      assert.deepEqual(rendered.slice(0, resting.length - 1), resting.slice(0, -1), '张嘴之外的眼睛、鼻子和花纹绘制必须完全一致');
      const ys = openings[0].points.map(point => point[1]), height = Math.max(...ys) - Math.min(...ys);
      assert.ok(height > .1, '口腔必须有实际高度，不能只是替换一条嘴线');
      if (state.reaction.meow > .99) assert.ok(height > 10 && height < 15, '充分张开时口腔大小保持自然');
      const tongue = rendered.find(record => !record.stroke && record.color === '#D9979C');
      assert.ok(tongue && tongue.clips.length > openings[0].clips.length, '舌头须裁在口腔里面');
    }
    near(F.catState(index * 8 + age, index).reaction.meow, state.reaction.meow, '暂停和相同时刻重复绘制须一致');
    near(F.catState((index + F.recipes.length) * 8 + age, index + F.recipes.length).reaction.meow, state.reaction.meow, '下一轮同种猫动作须一致');
    drawingChecks++;
  }
  // Review poses and collected face tokens deliberately omit timeline reactions.
  const portrait = { recipe, index: 0, x: 0, walking: 0, walkDistance: 0, coat: 1, baseCoat: 1 };
  assert.equal(mouth(draw(portrait, 5.42, { headOnly: true })).length, 0, '成品猫脸粉饼保持闭嘴');
  assert.equal(mouth(draw({ ...portrait, age: 5.4 }, 5.42)).length, 0, '日常审核页不能依据 age 误触叫声');
  assert.equal(mouth(draw({ ...portrait, reaction: { puff: 0, hiss: 0 } }, 5.42)).length, 0, '日常走路动作不误触叫声');
}

const xiaokuiIndex = F.recipes.findIndex(recipe => recipe.kind === 'xiaokui');
assert.equal(F.voiceFor(F.recipes[xiaokuiIndex]), null, '小葵不分配普通猫叫录音');
assert.equal(new Set(ordinary.map(({ recipe }) => F.voiceFor(recipe).clip)).size, 5, '普通猫使用五种不同实录');
const whiteVoice = F.voiceFor(F.recipes.find(recipe => recipe.kind === 'white'));
assert.equal(Math.max(...whiteVoice.mouth.map(point => point[1])), .65, '白猫的轻叫只小幅张嘴');
for (const age of [0, 5.24, 5.36, 5.4, 5.45, 5.59, 5.72, 5.76, 5.8, 6.1, 6.44]) {
  const state = F.catState(xiaokuiIndex * 8 + age, xiaokuiIndex);
  assert.equal(state.reaction.puff, 0); assert.ok(!state.reaction.meow);
  const rendered = draw(state, age);
  assert.equal(mouth(rendered).length, 0, '小葵不能使用普通猫叫声口型');
  assert.deepEqual(draw({ ...state, reaction: { ...state.reaction, meow: 1 } }, age), rendered, '普通叫声不能覆盖小葵的怒叫嘴部');
  if (age === 5.45) assert.ok(rendered.some(record => !record.stroke && record.color === '#D9979C'), '小葵的怒叫嘴部正常绘制');
}

// Run the real portrait and review-state constructors, without a browser.
const sceneSandbox = { CatArt: Cat, F, Map, Math, Path2D: SamplePath };
const sceneSource = fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8');
const portraitSource = sceneSource.slice(sceneSource.indexOf('const PUCK_PORTRAITS ='), sceneSource.indexOf('\nfunction ', sceneSource.indexOf('function puckPortrait(') + 1));
assert.ok(portraitSource.includes('function puckPortrait('));
vm.createContext(sceneSandbox);
vm.runInContext(portraitSource, sceneSandbox);
for (const { recipe } of ordinary) {
  sceneSandbox.recipe = recipe;
  const portrait = vm.runInContext('puckPortrait(recipe)', sceneSandbox);
  assert.ok(!portrait.state.reaction?.meow, '真实粉饼状态必须保持闭嘴');
}
const reviewSource = fs.readFileSync(path.join(__dirname, 'cat-review.js'), 'utf8');
assert.ok(!/catState\s*\(|meow\s*:/.test(reviewSource), '审核页日常姿态不接入出厂叫声时间线');
console.log(`通过：14 种普通猫，${timingChecks} 个时间点、${drawingChecks} 组实际绘制与闭嘴回归。`);
console.log('通过：猫叫时段、白猫轻叫口型、平滑张合、嘴部以外绘制不变、小葵怒叫隔离、粉饼及审核页闭嘴。');
console.log('未操作浏览器或截图；本检查验证绘制数据和声音时段，不代替实际观感与听感。');
