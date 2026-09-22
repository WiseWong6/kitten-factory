'use strict';
const assert = require('node:assert/strict');
const Cat = require('../cat.js');
const F = require('../timeline.js');

// Evaluate the actual curves, not mock drawing calls. Nonzero fill uses the sum
// of contour windings: the original opposing leg contours produced zero here.
function flatten(commands) {
  const out = [];
  let current, start;
  for (const [op, ...a] of commands) {
    if (op === 'M') { current = a; start = a; out.push(a); }
    if (op === 'L') { current = a; out.push(a); }
    if (op === 'Z') { out.push(start); current = start; }
    if (op === 'Q' || op === 'C') {
      const origin = current;
      for (let n = 1; n <= 16; n++) {
        const t = n / 16, u = 1 - t;
        if (op === 'Q') out.push([0, 1].map(i => u * u * origin[i] + 2 * u * t * a[i] + t * t * a[i + 2]));
        else out.push([0, 1].map(i => u ** 3 * origin[i] + 3 * u * u * t * a[i] + 3 * u * t * t * a[i + 2] + t ** 3 * a[i + 4]));
      }
      current = a.slice(-2);
    }
  }
  return out;
}
function area(points) {
  return points.slice(1).reduce((sum, q, i) => sum + points[i][0] * q[1] - q[0] * points[i][1], 0) / 2;
}
function winding(points, x, y) {
  let w = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1];
    const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
    if (ay <= y && by > y && side > 0) w++;
    if (ay > y && by <= y && side < 0) w--;
  }
  return w;
}
function bounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
function assertSolidInterior(contour, allContours, label) {
  const box = bounds(contour);
  for (let y = Math.ceil(box.top) + 1; y < box.bottom; y += 3) {
    for (let x = Math.ceil(box.left) + 1; x < box.right; x += 3) {
      if (winding(contour, x, y) > 0) {
        assert.ok(allContours.reduce((n, p) => n + winding(p, x, y), 0) > 0, `${label}不得出现透明孔`);
      }
    }
  }
}
const MODEL_SCALE = 0.93;
let poses = 0, roots = 0, sharedShapes = 0, plantedFeet = 0;
const xiaokui = F.recipes.find(recipe => recipe.kind === 'xiaokui');
assert.ok(xiaokui, '小葵必须加入工厂配方');
const standardRecipes = F.recipes.filter(recipe => recipe.kind !== 'xiaokui');
for (const kind of ['ginger', 'calico', 'gray']) assert.ok(standardRecipes.some(recipe => recipe.kind === kind), `${kind} 必须加入标准猫轮廓的几何与染色检查`);
for (const shapeRecipe of [standardRecipes[0], xiaokui]) {
const LOCAL_STEP = Cat.model({ x: 0, walkDistance: 0, walking: 0, index: 0, recipe: shapeRecipe }, 0).stride;
assert.ok(Number.isFinite(LOCAL_STEP) && LOCAL_STEP > 0, '必须按模型的完整步长采样步态');
for (const tailLift of [0, 1]) for (const walking of [0, 0.15, 0.5, 1]) {
  for (let frame = 0; frame < 96; frame++) {
    const distance = frame / 96 * LOCAL_STEP * MODEL_SCALE;
    const state = { x: distance, walkDistance: distance, walking, tailLift, index: 0, age: 0.5, coat: 0, recipe: shapeRecipe };
    const time = frame / 24;
    const m = Cat.model(state, time);
    assert.ok(m.head && m.headMetrics, '头部必须有独立轮廓及参考脸部尺寸');
    assert.equal(m.legs.length, 4, '四条腿必须保留独立轮廓');
    assert.equal(m.contours.length, 7, '实心轮廓包含尾巴、四条腿、身体和头部');
    const polys = m.contours.map(flatten);
    for (const poly of polys) {
      assert.ok(poly.flat().every(Number.isFinite), '轮廓坐标必须为有限数值');
      assert.ok(area(poly) > 0, '所有实心部件方向必须相同，不能抵消');
    }
    const body = flatten(m.body), head = flatten(m.head), tail = flatten(m.tail);
    const faceRatio = m.headMetrics.width / m.headMetrics.height;
    assert.ok(Number.isFinite(faceRatio) && faceRatio > 1, '脸部应保留宽脸颊比例');
    if (shapeRecipe !== xiaokui) assert.ok(Math.abs(faceRatio - 109 / 92) <= 0.04, '标准猫应保留既有脸部比例');
    const headBox = bounds(head);
    assert.ok(Math.abs((headBox.right - headBox.left) / m.headMetrics.width - 1) < 0.06, '实际头部宽度需符合参考脸部尺寸');
    assert.ok(headBox.bottom - headBox.top >= m.headMetrics.height, '实际头部高度需容纳完整圆脸和耳朵');
    const bodyBox = bounds(body);
    let neckOverlap = 0;
    for (let y = Math.max(headBox.top, bodyBox.top); y < Math.min(headBox.bottom, bodyBox.bottom); y += 3)
      for (let x = Math.max(headBox.left, bodyBox.left); x < Math.min(headBox.right, bodyBox.right); x += 3)
        if (winding(body, x, y) > 0 && winding(head, x, y) > 0) neckOverlap++;
    assert.ok(neckOverlap >= 3, '圆头与肩颈必须有稳定的重叠面积，不能仅靠一点相接');
    for (let i = 0; i < m.legs.length; i++) {
      const leg = m.legs[i];
      const points = flatten(leg.commands);
      const x = leg.x, y = leg.rootY;
      assert.ok(Number.isFinite(y), '每条腿必须给出实际腿根高度');
      assert.ok(winding(body, x, y) > 0, '腿根必须埋入身体');
      assert.ok(winding(points, x, y) > 0, '腿根不能断开');
      assert.ok(polys.reduce((n, poly) => n + winding(poly, x, y), 0) >= 2, '重叠腿根必须实心叠加');
      assert.ok(Math.max(...points.map(p => p[1])) <= 1, '脚掌不能穿过传送带');
      roots++;
    }
    assert.ok(Array.isArray(m.tailRoot) && m.tailRoot.length === 2, '尾巴必须给出实际连接中心');
    const tailRoot = m.tailTransform(...m.tailRoot);
    assert.ok(winding(body, ...tailRoot) > 0 && winding(tail, ...tailRoot) > 0, '尾巴必须连着臀部');
    assertSolidInterior(body, polys, '身体');
    assertSolidInterior(head, polys, '头部');
    if (frame % 24 === 0) {
      const recipesWithSameShape = shapeRecipe === xiaokui ? [xiaokui] : standardRecipes;
      for (const recipe of recipesWithSameShape) for (const coat of [0, 0.4, 1]) {
        const variant = Cat.model({ ...state, recipe, coat }, time);
        assert.deepEqual(variant.contours, m.contours, `${recipe.name}的染色进度不能改变该配方的猫咪外形`);
        sharedShapes++;
      }
    }
    poses++;
  }
}

// walkDistance is displacement relative to the belt. During a planted step,
// advancing the torso must be cancelled by the foot's movement in model space.
for (let frame = 0; frame < 192; frame++) {
  const distance = frame / 192 * LOCAL_STEP * MODEL_SCALE;
  const step = 0.0001;
  const state = { x: distance, walkDistance: distance, walking: 1, index: 0, age: 0.5, recipe: shapeRecipe };
  const a = Cat.model(state, 0);
  const b = Cat.model({ ...state, x: distance + step, walkDistance: distance + step }, 0);
  for (let i = 0; i < a.legs.length; i++) {
    // The reference's four feet have slightly different resting heights.
    // Use the contact phase, rather than assuming every foot's baseline is zero.
    if (!a.legs[i].planted || !b.legs[i].planted) continue;
    assert.ok(Math.abs(a.legs[i].footY - b.legs[i].footY) < 1e-8, '落地脚掌不能随身体起伏');
    const before = distance + a.legs[i].footX * MODEL_SCALE;
    const after = distance + step + b.legs[i].footX * MODEL_SCALE;
    assert.ok(Math.abs(after - before) < 1e-7, '落地脚掌相对传送带应保持位置，不能随身体滑行');
    plantedFeet++;
  }
}
}
assert.ok(plantedFeet > 800, '两套造型均须覆盖四脚在完整步态周期中的落地阶段');
console.log(`通过：${poses} 个姿态（含成品抬尾）、${roots} 处腿根、圆头与肩颈连接、身体与头部无透明孔。`);
console.log(`通过：${sharedShapes} 组同配方染色进度共用轮廓，${plantedFeet} 次落地脚掌位移抵消；${standardRecipes.length} 种标准花色共用原轮廓，小葵保留独立造型。`);
console.log('这些检查验证几何和步态；花纹遮挡、色彩和美术一致性仍需浏览器视觉比对。');
