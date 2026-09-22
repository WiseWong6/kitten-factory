'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('./timeline.js');
const cycleSeconds = F.recipes.length * 8;
const newCoatKinds = ['ginger', 'calico', 'gray'];
let checks = 0;
function check(label, fn) { fn(); checks++; console.log('通过：' + label); }
check('十五种花色顺序、小葵配色与 120 秒下一轮复位', () => {
  assert.deepEqual(F.recipes.map(recipe => recipe.name), ['小葵', '银渐层（条纹版）', '银渐层（无虎纹）', '金渐层', '金渐虎纹', '黑猫', '橘猫', '橘白', '蓝白', '狸花猫', '暹罗猫', '三花', '纯灰', '豹猫', '纯白']);
  for (const kind of newCoatKinds) assert.equal(F.recipes.filter(recipe => recipe.kind === kind).length, 1);
  assert.equal(new Set(F.recipes.map(recipe => recipe.kind)).size, F.recipes.length, '各花色须有独立且唯一的标识');
  assert.equal(cycleSeconds, 120);
  assert.deepEqual(Array.from({ length: F.recipes.length + 1 }, (_, i) => F.stateAt(i * 8).recipe.name), [...F.recipes.map(recipe => recipe.name), '小葵']);
  const xiaokui = F.recipes.find(r => r.kind === 'xiaokui');
  assert.equal(F.primary(xiaokui), '#666560');
  assert.equal(F.secondary(xiaokui), '#FFFFFF');
  for (let i = -1; i <= F.recipes.length * 2; i++) {
    assert.equal(F.catState(i * 8, i).recipe, F.recipes[F.mod(i, F.recipes.length)]);
  }
});
check('猫咪链接参数可选中全部十五种花色，缺省和未知值保持默认', () => {
  assert.equal(F.recipeIndexFromSearch('?cat=xiaokui'), 0);
  assert.equal(F.recipeIndexFromSearch('?cat=%E5%B0%8F%E8%91%B5'), 0);
  F.recipes.forEach((recipe, index) => {
    assert.equal(F.recipeIndexFromSearch(`?cat=${recipe.kind}`), index);
    assert.equal(F.recipeIndexFromSearch(`?cat=${encodeURIComponent(recipe.name)}`), index);
  });
  for (const search of ['', '?cat=', '?cat=unknown', '?other=xiaokui']) assert.equal(F.recipeIndexFromSearch(search), -1);
});
check('首批豆子各自落稳后研磨，后续已备好的豆保持同一排空节奏', () => {
  assert.ok(F.hopperBeans(0).every(bean => bean.y <= -12 * bean.scale), '开场豆仓为空，第一颗豆仍在画外');
  let largestBatch = 0;
  for (const prefilled of [false, true]) {
    for (let frame = 0; frame < 8 * 120; frame++) {
      const phase = frame / 120;
      const beans = F.hopperBeans(phase, prefilled);
      largestBatch = Math.max(largestBatch, beans.length);
      assert.equal(new Set(beans.map(bean => bean.id)).size, beans.length, '同一批豆子不能重复');
      for (const bean of beans) {
        for (const key of ['id', 'x', 'y', 'angle', 'scale']) assert.ok(Number.isFinite(bean[key]), `豆子的 ${key} 必须有效`);
        assert.ok(bean.scale > 0);
      }
      if (phase >= 1.44) assert.deepEqual(beans, [], '当前批豆子磨完后不可继续留在仓内');
    }
  }
  assert.equal(largestBatch, 12, '每轮使用同一批 12 颗豆子');
  const resting = F.hopperBeans(1.1, false, true);
  assert.equal(resting.length, 12, '较慢的落豆完成后应有完整一批豆子');
  for (const bean of resting) {
    const land = bean.id * .032 + .68 + bean.id % 3 * .012;
    const drain = .98 + bean.id * .012;
    assert.ok(land < drain, '每颗豆都必须先落稳，再进入磨豆口');
    assert.deepEqual(F.hopperBeans((land + drain) / 2).find(item => item.id === bean.id), bean, '落稳和研磨之间保持原位');
  }
  assert.deepEqual(F.hopperBeans(0, true), resting, '后续轮次沿用上一轮补好的豆子，不重新从空中入场');
  assert.deepEqual(F.hopperBeans(.97, true), resting, '预先补好的豆子也等到研磨动作才排空');
  for (const prefilled of [false, true]) {
    for (let frame = 1; frame < 1.5 * 120; frame++) {
      const phase = frame / 120;
      const previous = new Map(F.hopperBeans(phase - 1e-6, prefilled).map(bean => [bean.id, bean]));
      const next = F.hopperBeans(phase + 1e-6, prefilled);
      for (const bean of next) {
        const before = previous.get(bean.id);
        if (!before) continue;
        for (const key of ['x', 'y', 'angle', 'scale']) assert.ok(Math.abs(bean[key] - before[key]) < .01, '同一颗豆子不能在落下、停留或下沉时跳位置');
      }
      const before = new Map(F.hopperBeans((frame - 1) / 120, prefilled).map(bean => [bean.id, bean]));
      const after = new Map(F.hopperBeans(frame / 120, prefilled).map(bean => [bean.id, bean]));
      for (const [id, bean] of after) if (!before.has(id)) assert.ok(bean.y < 0, '新豆子必须从画外进入');
      for (const [id, bean] of before) if (!after.has(id)) assert.ok(bean.y >= 350, '豆子到达磨豆口下方才移除，不能在仓内凭空消失');
    }
  }
  const afterGrinding = new Map(F.hopperBeans(1.15).map(bean => [bean.id, bean]));
  assert.ok(afterGrinding.size > 0, '研磨时应看到豆子向下进入磨豆口');
  assert.ok(resting.some(bean => afterGrinding.get(bean.id)?.y > bean.y + 1), '研磨时豆子需要实际向下移动');
  for (const phase of [1.08, 1.15, 1.3, 1.44]) assert.deepEqual(F.hopperBeans(phase, true), F.hopperBeans(phase), '备豆方式不改变原排空动作');
});
check('喷色结束后慢速补豆，出生间隔不变且下一轮前补完', () => {
  const compareBeans = (actual, expected) => {
    assert.deepEqual(actual.map(bean => bean.id), expected.map(bean => bean.id));
    expected.forEach((bean, index) => {
      for (const key of ['x', 'y', 'angle', 'scale']) assert.ok(Math.abs(actual[index][key] - bean[key]) < 1e-8, '补豆出生间隔、下落速度与首批落豆保持一致');
    });
  };
  assert.deepEqual(F.refillBeans(5.199), [], '蒸汽棒喷色结束前不能补下一批豆');
  assert.ok(F.refillBeans(5.2).length > 0, '喷色结束后开始补豆，不等到下一轮才补');
  assert.deepEqual(F.refillBeans(5.2 + .031).map(bean => bean.id), [0], '保留每隔 0.032 秒出生一颗豆的节奏');
  assert.deepEqual(F.refillBeans(5.2 + .033).map(bean => bean.id), [0, 1]);
  const halfFall = F.refillBeans(5.2 + .34).find(bean => bean.id === 0);
  assert.ok(Math.abs(halfFall.y - 55.25) < 1e-8, '第一颗豆改为 0.68 秒落稳，下落速度确实放慢');
  // Sample between frame boundaries to avoid floating-point equality at bean births.
  for (let frame = 0; frame < .94 * 120; frame++) {
    const phase = (frame + .25) / 120;
    compareBeans(F.refillBeans(5.2 + phase), F.hopperBeans(phase));
  }
  const ready = F.hopperBeans(0, true);
  assert.ok(F.refillBeans(5.2 + .46).find(bean => bean.id === 0).y < ready[0].y, '原来已落稳的时刻，现在豆子仍在下落');
  assert.ok(F.refillBeans(5.2 + .94).find(bean => bean.id === 11).y < ready[11].y, '最后几颗豆继续自然下落，不在原停稳时刻被截停');
  for (let frame = 1; frame < 1.1 * 120; frame++) {
    const phase = 5.2 + frame / 120;
    const before = new Map(F.refillBeans(phase - 1e-6).map(bean => [bean.id, bean]));
    for (const bean of F.refillBeans(phase + 1e-6)) {
      if (!before.has(bean.id)) continue;
      for (const key of ['x', 'y', 'angle', 'scale']) assert.ok(Math.abs(bean[key] - before.get(bean.id)[key]) < .01, '较慢的补豆在旧结束时刻和新落稳时刻均连续');
    }
  }
  for (const phase of [6.256, 6.26, 7, 7.999999]) {
    compareBeans(F.refillBeans(phase), ready);
  }
  for (let round = 0; round <= F.recipes.length * 2; round++) {
    for (const phase of [0, .7, .97, 1.15, 1.439, 1.44, 1.8, 2.38, 2.4, 2.45, 3.08, 3.35, 3.4, 4.2, 4.6, 5.1568, 5.199, 5.2, 5.201, 5.8, 6.256, 7.9]) {
      const state = F.stateAt(round * 8 + phase);
      const refilling = state.phase >= 5.2;
      assert.deepEqual(state.hopper, refilling ? F.refillBeans(state.phase) : F.hopperBeans(state.phase, round > 0));
      assert.equal(state.hopperRecipe, F.recipes[(round + Number(refilling)) % F.recipes.length], '豆仓颜色属于实际正在存放的一批');
      assert.equal(state.recipe, F.recipes[round % F.recipes.length], '提前备豆不能改变正在加工的猫或其咖啡粉颜色');
      if (refilling) {
        assert.equal(state.wand.spraying, false, '补豆开始时蒸汽棒必须已停止喷色');
        assert.equal(state.handle.loading, false, '补豆不能与接粉重叠');
        if (state.phase < 5.8) {
          assert.equal(state.handle.locked, true, '补豆开始且猫咪未离场时，手柄仍已旋紧');
          assert.equal(state.handle.powder, 1, '离场清理前当前粉篮仍然接满');
        }
      }
      if (state.phase >= 1.44 && state.phase < 5.2) assert.deepEqual(state.hopper, [], '磨豆、接粉、装回手柄和喷色期间保持空仓');
      if (state.wand.spraying) {
        assert.deepEqual(state.hopper, [], '蒸汽棒喷色期间不能补豆');
        assert.equal(state.hopperRecipe, state.recipe, '喷色未结束不能切换下一批豆色');
      }
      if (state.handle.loading) {
        assert.deepEqual(state.hopper, [], '正在接粉时不能提前补下一批豆');
        assert.equal(state.hopperRecipe, state.recipe);
      }
    }
    if (round) {
      const before = F.stateAt(round * 8 - 1e-6), after = F.stateAt(round * 8 + 1e-6);
      compareBeans(after.hopper, before.hopper);
      assert.equal(before.hopperRecipe, after.hopperRecipe, '换轮时不能让仓内豆子突然变色');
    }
  }
});
check('十五种猫分别使用对应毛色的豆子，纯色猫不混入眼睛颜色', () => {
  const palettes = F.recipes.map(recipe => {
    const colors = F.beanColors(recipe);
    assert.ok(Array.isArray(colors) && colors.length > 0, `${recipe.name}需要豆子颜色`);
    assert.equal(new Set(colors).size, colors.length, '每种豆色只列一次');
    const coatColors = [recipe.base, recipe.ink, recipe.accent, recipe.cream].filter(Boolean);
    for (const color of colors) {
      assert.match(color, /^#[0-9A-F]{6}$/i);
      assert.ok(coatColors.includes(color), `${recipe.name}的豆子应使用自己的毛色`);
    }
    assert.ok(colors.includes(F.primary(recipe)), `${recipe.name}的豆子必须包含主色`);
    return colors;
  });
  assert.equal(new Set(palettes.map(colors => colors.join(','))).size, F.recipes.length, '不同配方须有各自的豆色组合');
  const colorsOf = kind => F.beanColors(F.recipes.find(recipe => recipe.kind === kind));
  assert.deepEqual(colorsOf('solid'), [F.recipes.find(recipe => recipe.kind === 'solid').base]);
  assert.deepEqual(colorsOf('gray'), [F.recipes.find(recipe => recipe.kind === 'gray').base]);
  const blue = F.recipes.find(recipe => recipe.kind === 'bicolor');
  for (const color of [blue.base, blue.ink]) assert.ok(colorsOf('bicolor').includes(color));
  const calico = F.recipes.find(recipe => recipe.kind === 'calico');
  for (const color of [calico.base, calico.ink, calico.accent]) assert.ok(colorsOf('calico').includes(color));
});
check('白猫停稳后上主色，再喷辅色，完成后离开', () => {
  for (let n = 0; n < F.recipes.length; n++) {
    for (const p of [0, 1.2, 2.4, 3.35, 3.5]) {
      const cat = F.catState(n * 8 + p, n);
      assert.equal(cat.baseCoat, 0);
      assert.equal(cat.coat, 0);
    }
    for (const p of [1.2, 2.4, 3.35, 4.2, 5.2, 5.8]) assert.equal(F.catState(n * 8 + p, n).x, 435);
    if (F.recipes[n].malfunction) continue;
    assert.ok(F.catState(n * 8 + 3.9, n).baseCoat > 0);
    assert.equal(F.catState(n * 8 + 3.59, n).baseCoat, 0, '咖啡液到达猫身前保持纯白');
    assert.equal(F.catState(n * 8 + 4.3, n).baseCoat, 1);
    assert.ok(F.catState(n * 8 + 4.3, n).coat < 1e-12);
    assert.equal(F.catState(n * 8 + 4.38, n).coat, 0, '辅色细雾到达猫身前不展开花纹');
    assert.ok(Math.abs(F.catState(n * 8 + 5.2, n).coat - 1) < 1e-12);
    assert.ok(F.catState(n * 8 + 7, n).x > 435);
  }
  assert.equal(F.stateAt(2).handle.loading, true);
  assert.equal(F.stateAt(3.34).brewing, false);
  assert.equal(F.stateAt(3.35).handle.locked, true);
  assert.equal(F.stateAt(3.35).brewing, true);
  assert.equal(F.stateAt(4.3).brewing, false);
  assert.equal(F.stateAt(4.19).wand.spraying, false);
  assert.equal(F.stateAt(4.2).wand.spraying, true);
  assert.equal(F.stateAt(5.2).wand.spraying, false);
  assert.equal(F.coffeeFlow(3.34), null);
  assert.equal(F.coffeeFlow(4.56), null);
});
check('小葵染色后怒叫，身体和尾巴不膨胀，离场不等待声音结束', () => {
  const CatArt = require('./cat.js');
  const xiaokuiIndex = F.recipes.findIndex(recipe => recipe.kind === 'xiaokui');
  const voice = F.xiaokuiVoice, end = voice.start + voice.duration;
  for (let index = 0; index < F.recipes.length * 2; index++) {
    for (let frame = -60; frame <= 9 * 120; frame++) {
      const age = frame / 120, cat = F.catState(index * 8 + age, index);
      for (const value of Object.values(cat.reaction)) assert.ok(value >= 0 && value <= 1);
      assert.equal(cat.reaction.puff, 0, '所有猫在任何阶段都不触发炸毛');
      if (cat.recipe.kind !== 'xiaokui' || age <= voice.start || age >= end) {
        assert.equal(cat.reaction.hiss, 0, '普通猫及怒叫时段外不出现怒叫表情');
      } else if (cat.reaction.hiss) {
        assert.ok(cat.coat > 1 - 1e-12, '染色未完成不能触发反应');
        if (age <= 5.8) assert.equal(cat.x, 435, '展示阶段留在出厂位置');
        else assert.ok(cat.x > 435, '离场时不等待怒叫结束');
      }
      if (index === xiaokuiIndex && age >= voice.start && age <= end) {
        const reacting = CatArt.model(cat, age);
        const resting = CatArt.model({ ...cat, reaction: { puff: 0, hiss: 0 } }, age);
        assert.deepEqual(reacting.body, resting.body, '怒叫期间身体轮廓保持原样，不拱起或膨胀');
        assert.deepEqual(reacting.tail, resting.tail, '怒叫期间尾巴轮廓保持原样，不膨胀');
        assert.deepEqual(reacting.fur, [], '怒叫不生成炸毛尖簇');
      }
    }
  }
  const at = age => F.catState(xiaokuiIndex * 8 + age, xiaokuiIndex).reaction;
  assert.deepEqual(at(5.24), { puff: 0, hiss: 0 }, '怒叫开始前保持日常状态');
  assert.ok(at(5.28).hiss > 0 && at(5.28).hiss < .55, '开口平滑渐入');
  assert.ok(Math.abs(at(5.74).hiss - 1) < 1e-9, '主叫声时张开嘴');
  assert.equal(at(6.44).hiss, 0, '叫声结束时收回表情');
  assert.ok(F.catX(5.81) > 435, '小葵离場不因声音延长而等待');
  for (const [offset, amount] of voice.mouth) {
    assert.ok(Math.abs(at(voice.start + offset / voice.pitch).hiss - amount) < 1e-9, '表情跟随怒叫强弱');
  }
  for (const age of [5.2, 5.8, ...voice.mouth.map(([offset]) => voice.start + offset / voice.pitch)]) {
    const before = F.xiaokuiReaction(age - 1e-6), after = F.xiaokuiReaction(age + 1e-6);
    for (const key of ['puff', 'hiss']) assert.ok(Math.abs(before[key] - after[key]) < .0001, `${age} 秒的 ${key} 应连续`);
  }
});
check('无底滤篮单股咖啡液先延伸，停泵后尾段向下离开', () => {
  const early = F.coffeeFlow(3.45), later = F.coffeeFlow(3.55);
  assert.equal(early.top, 0); assert.equal(later.top, 0);
  assert.ok(later.bottom > early.bottom);
  assert.equal(F.coffeeFlow(3.6).bottom, 138);
  for (const p of [3.7, 3.9, 4.1, 4.29]) {
    assert.deepEqual(F.coffeeFlow(p), { top: 0, bottom: 138 });
    assert.equal(F.stateAt(p).handle.locked, true);
  }
  assert.ok(F.coffeeFlow(4.45).top > F.coffeeFlow(4.35).top);
  assert.equal(F.coffeeFlow(4.45).bottom, 138);
  for (let i = 0; i <= 800; i++) {
    const flow = F.coffeeFlow(i / 100);
    if (!flow) continue;
    assert.ok(flow.top >= 0 && flow.bottom <= 138 && flow.bottom > flow.top);
    assert.equal(F.stateAt(i / 100).handle.locked, true, '拆卸和接粉时不得漏液');
  }
});
check('每只猫离场时连着卸柄敲掉本色粉饼，空柄等候下一轮接粉', () => {
  for (let n = 0; n <= F.recipes.length + 1; n++) {
    const at = p => F.stateAt(n * 8 + p);
    for (const p of [0, .5, 1.01, 1.03, 1.5, 3.35, 5.79]) {
      assert.equal(at(p).puck, null, '本轮开始不再敲上一轮粉饼');
      assert.equal(at(p).handle.used, false);
      assert.equal(at(p).handle.roll, 0, '前半轮不翻篮敲饼');
    }
    if (n > 0) for (const p of [0, .5, 1.49]) {
      const h = at(p).handle;
      assert.equal(h.x, 305); assert.equal(h.y, 638);
      assert.equal(h.yaw, -1); assert.equal(h.roll, 0);
      assert.equal(h.powder, 0); assert.equal(h.used, false);
      assert.equal(h.loading, false); assert.equal(h.locked, false);
    }
    assert.equal(at(1.55).handle.loading, false);
    assert.equal(at(1.57).handle.loading, true);
    assert.equal(at(1.57).handle.x, 305);
    assert.equal(at(1.57).handle.y, 638, '接粉位置保持不变');
    assert.ok(at(2).handle.powder > 0);
    assert.equal(at(2.4).handle.powder, 1);
    assert.equal(at(2.4).handle.loading, false);
    assert.equal(at(5.79).handle.locked, true);
    assert.ok(at(5.81).handle.yaw < 0, '猫离场后手柄立即开始旋转解锁');
    assert.equal(at(5.81).handle.locked, false);
    assert.ok(F.catState(n * 8 + 5.81, n).x > 435, '卸柄与猫离场同时发生');
    assert.equal(at(6.819).puck, null);
    assert.equal(at(6.819).handle.used, true);
    assert.equal(at(6.819).handle.powder, 1);
    assert.ok(at(6.821).puck > 0);
    assert.equal(at(6.821).handle.used, false);
    assert.equal(at(6.821).handle.powder, 0);
    assert.ok(at(7.26).puck > at(6.83).puck, '本轮猫脸粉饼落向下方排列位置时持续前进');
    assert.equal(at(7.271).puck, null);
    const drop = F.puckDrop(n);
    assert.equal(at(6.82).handle.x, drop.x, '手柄在本轮粉饼最终位置的正上方释放');
    assert.ok(Math.abs(at(6.82).handle.y - drop.y) < 1e-8, '手柄敲下位置与粉饼释放位置对齐');
    let returnX = drop.x, returnY = drop.y - 19, returnRoll = Math.PI;
    const maxReturnStepX = Math.abs(drop.x - 305) * 1.5 / 120 + 1e-8;
    const maxReturnStepY = Math.abs(drop.y - 19 - 638) * 1.5 / 120 + 1e-8;
    for (let frame = 0; frame <= 120; frame++) {
      const handle = at(6.94 + frame / 120).handle;
      assert.ok(handle.x >= Math.min(305, drop.x) - 1e-8 && handle.x <= Math.max(305, drop.x) + 1e-8, '返程手柄从粉饼释放位置回到磨豆口，不能越过画面');
      assert.ok(handle.y >= 638 - 1e-8 && handle.y <= drop.y - 19 + 1e-8, '返程高度位于释放位置和接粉位置之间');
      assert.ok(Math.abs(handle.x - 305) <= Math.abs(returnX - 305) + 1e-8 && handle.y <= returnY + 1e-8, '返程朝接粉位置连续移动');
      assert.ok(Math.abs(handle.x - returnX) <= maxReturnStepX && Math.abs(handle.y - returnY) <= maxReturnStepY, '返程每帧位移不能超过该格实际返程距离推导的平滑速度上界');
      assert.ok(handle.roll >= -1e-8 && handle.roll <= returnRoll + 1e-8, '返程篮筐逐渐转回朝上');
      returnX = handle.x; returnY = handle.y; returnRoll = handle.roll;
    }
    for (const p of [7.941, 7.99]) {
      const h = at(p).handle;
      assert.equal(h.x, 305); assert.equal(h.y, 638);
      assert.equal(h.yaw, -1); assert.equal(h.roll, 0);
      assert.equal(h.powder, 0); assert.equal(h.used, false);
      assert.equal(h.loading, false, '空柄回到磨豆口等待时不能提前再次接粉');
    }
    let puckFalls = 0, wasFalling = false;
    for (let frame = 0; frame < 8 * 120; frame++) {
      const s = at(frame / 120), falling = s.puck !== null;
      if (falling && !wasFalling) puckFalls++;
      wasFalling = falling;
      if (falling) assert.ok(s.phase >= 6.82 - 1e-12 && s.phase < 7.27 + 1e-12, '粉饼只在离场清理阶段掉落');
      if (s.phase >= 5.8) assert.equal(s.handle.loading, false, '离场清理期间不能触发接粉');
      if (s.handle.loading) {
        assert.equal(s.handle.used, false, '新一轮接粉必须使用空篮');
        assert.equal(s.handle.roll, 0);
      }
      if (s.brewing) {
        assert.equal(s.handle.locked, true);
        assert.equal(s.handle.powder, 1);
        assert.equal(s.handle.used, false);
      }
    }
    assert.equal(puckFalls, 1, '包括第一只猫在内，每轮只敲掉一次当前粉饼');
  }
});
check('小葵先出场，十五种猫脸均匀排列成三行各五只，垂直落下并原位更新', () => {
  const at = time => F.collectedPucks(time);
  const layout = F.puckLayout;
  assert.equal(layout.columns, 5); assert.equal(layout.rows, 3);
  assert.equal(F.recipes.length, 15);
  function expectedSlot(index) {
    const slot = F.mod(index, F.recipes.length);
    const row = Math.floor(slot / layout.columns);
    const count = 5;
    return { x: 450 - (count - 1) * 44 + slot % layout.columns * 88,
      y: layout.startY + row * layout.rowGap };
  }
  assert.deepEqual(F.puckSlot(0), { x: 274, y: 956 });
  assert.deepEqual(F.puckSlot(4), { x: 626, y: 956 }, '第五只填满首排');
  assert.deepEqual(F.puckSlot(5), { x: 274, y: 1044 }, '第六只从第二排左侧开始');
  assert.deepEqual(F.puckSlot(14), { x: 626, y: 1132 }, '第十五只填满第三排');
  for (let row = 0; row < layout.rows; row++) {
    const slots = Array.from({ length: Math.min(layout.columns, F.recipes.length - row * layout.columns) }, (_, column) => F.puckSlot(row * layout.columns + column));
    assert.equal(new Set(slots.map(slot => slot.y)).size, 1, '每排猫脸保持同一水平线');
    assert.equal((slots[0].x + slots.at(-1).x) / 2, 450, '三排均居中放置');
    for (let i = 1; i < slots.length; i++) assert.equal(slots[i].x - slots[i - 1].x, layout.columnGap, '同排猫脸等距排列');
    if (row) assert.equal(slots[0].y - F.puckSlot((row - 1) * layout.columns).y, layout.rowGap, '三排保持固定间距');
  }
  assert.equal(F.stateAt(0).recipe.kind, 'xiaokui', '默认第一只加工小葵');
  assert.deepEqual(at(6.819), [], '首只猫敲饼前排列区没有成品');
  const falling = at(6.83);
  assert.equal(falling.length, 1); assert.equal(falling[0].index, 0);
  assert.equal(falling[0].falling, true);
  const first = at(8);
  assert.equal(first.length, 1); assert.equal(first[0].falling, false);
  assert.equal(first[0].recipe.kind, 'xiaokui', '第一枚猫脸粉饼也是小葵');
  assert.equal(first[0].x, expectedSlot(0).x); assert.equal(first[0].y, expectedSlot(0).y);
  const count = F.recipes.length;
  const ten = at(cycleSeconds), eleven = at(cycleSeconds + 8), twenty = at(cycleSeconds * 2), twentyOne = at(cycleSeconds * 2 + 8);
  for (const pucks of [ten, eleven, twenty, twentyOne]) {
    assert.equal(pucks.length, count, '三排填满后持续保留十五张猫脸，不新增位置或整组清空');
    assert.equal(new Set(pucks.map(puck => `${puck.x},${puck.y}`)).size, count, '十五只猫各占一格');
    assert.equal(new Set(pucks.map(puck => puck.y)).size, 3, '落稳后只占三排');
    for (const puck of pucks) {
      assert.ok(puck.x - 29 >= 0 && puck.x + 29 <= 900, '猫脸左右边缘完整留在画幅内');
      assert.ok(puck.y - 30 >= layout.top && puck.y + 30 <= layout.bottom, '三排猫脸均完整留在下方展示区域内');
      assert.deepEqual({ x: puck.x, y: puck.y }, expectedSlot(puck.index), '每种猫按出场顺序固定在对应格');
    }
    for (let i = 0; i < pucks.length; i++) for (let j = i + 1; j < pucks.length; j++) {
      const dx = Math.abs(pucks[i].x - pucks[j].x), dy = Math.abs(pucks[i].y - pucks[j].y);
      assert.ok(dx >= 58 || dy >= 60, '相邻猫脸之间保留空隙，不互相重叠');
    }
  }
  assert.ok(!eleven.some(puck => puck.index === 0), '下一轮首枚落稳后只替换第一枚');
  assert.equal(eleven.find(puck => puck.index === count).x, expectedSlot(0).x);
  assert.ok(twenty.every(puck => puck.index >= count && puck.index < count * 2));
  assert.ok(!twentyOne.some(puck => puck.index === count));
  assert.equal(twentyOne.find(puck => puck.index === count * 2).x, expectedSlot(0).x);
  const oldBefore = at(cycleSeconds + 6.65).find(puck => puck.index === 0);
  const oldFading = at(cycleSeconds + 6.74).find(puck => puck.index === 0);
  assert.equal(oldBefore.alpha, 1, '下一枚即将释放前才开始更新旧猫脸');
  assert.ok(oldFading.alpha > 0 && oldFading.alpha < 1, '新粉饼释放前，同位置的旧猫脸逐渐淡出');
  assert.equal(oldFading.x, oldBefore.x); assert.equal(oldFading.y, oldBefore.y);
  assert.ok(!at(cycleSeconds + 6.82).some(puck => puck.index === 0), '新粉饼出现时旧猫脸必须已经消失，避免双脸重影');
  for (const puck of at(cycleSeconds + 6.74).filter(puck => puck.index > 0 && puck.index < count)) {
    assert.equal(puck.alpha, 1, '同格替换不能使其他十四张猫脸淡出');
    assert.equal(puck.x, expectedSlot(puck.index).x); assert.equal(puck.y, expectedSlot(puck.index).y);
  }
  for (let round = 0; round < F.recipes.length * 3; round++) {
    const slot = F.puckSlot(round), drop = F.puckDrop(round);
    assert.deepEqual(slot, expectedSlot(round));
    assert.equal(drop.x, slot.x, '各轮释放位置必须在对应格的最终落点正上方');
    assert.equal(drop.y, slot.y - F.puckLayout.dropLift);
    const release = F.stateAt(round * 8 + 6.82).handle;
    assert.equal(release.x, slot.x);
    assert.ok(Math.abs(release.y - drop.y) < 1e-8);
    let previousY = drop.y + 3;
    for (let frame = 1; frame < 120; frame++) {
      const puck = at(round * 8 + 6.82 + .45 * frame / 120).find(item => item.index === round);
      assert.ok(puck && puck.falling);
      assert.equal(puck.x, slot.x, '粉饼下落全程不可横滑到其他格');
      assert.ok(puck.y >= previousY - 1e-8 && puck.y <= slot.y + 1e-8, '粉饼从释放位置持续垂直落入所属格');
      previousY = puck.y;
    }
    assert.equal(at(round * 8 + 7.269).find(item => item.index === round).falling, true);
    assert.equal(at(round * 8 + 7.271).find(item => item.index === round).falling, false, '粉饼在释放后 0.45 秒落定');
  }
  for (let frame = 0; frame <= (cycleSeconds * 2 + 8) * 60; frame++) {
    const time = frame / 60, pucks = at(time);
    assert.ok(pucks.length <= count, '更新时不叠加旧脸和新脸，最多显示十五枚');
    assert.equal(new Set(pucks.map(puck => puck.recipe.kind)).size, pucks.length, '同一花色不能同时出现新旧两张猫脸');
    assert.equal(new Set(pucks.map(puck => puck.index)).size, pucks.length, '每次敲饼只产生一个粉饼');
    assert.ok(pucks.filter(puck => puck.falling).length <= 1);
    assert.deepEqual(F.stateAt(time).pucks, pucks, '工厂画面采用同一份粉饼集合');
    for (const puck of pucks) {
      assert.ok(puck.index * 8 + 6.82 <= time + 1e-10, '对应猫敲落后才可出现粉饼');
      assert.equal(puck.recipe, F.recipes[F.mod(puck.index, F.recipes.length)], '每个位置保留对应猫咪配方');
      for (const key of ['x', 'y', 'angle', 'alpha']) assert.ok(Number.isFinite(puck[key]));
      assert.ok(puck.alpha >= 0 && puck.alpha <= 1);
      assert.equal(puck.x, F.puckSlot(puck.index).x, '下落和存放均使用同一固定横坐标');
      if (time >= puck.index * 8 + 7.39) assert.equal(puck.y, F.puckSlot(puck.index).y, '旧猫脸落稳后不得移动或换格');
    }
  }
  for (const time of [6.82, 7.27, 7.39, ...[1, 2].flatMap(n => [0, 6.66, 6.82, 7.27, 7.39, 8].map(p => n * cycleSeconds + p))]) {
    const before = new Map(at(time - 1e-6).map(puck => [puck.index, puck]));
    const after = new Map(at(time + 1e-6).map(puck => [puck.index, puck]));
    for (const [index, puck] of before) {
      if (!after.has(index)) { assert.ok(puck.alpha < .001, '旧猫脸应淡出后替换，不可突然清空'); continue; }
      for (const key of ['x', 'y', 'angle', 'alpha']) assert.ok(Math.abs(puck[key] - after.get(index)[key]) < .01, `粉饼在 ${time} 秒的 ${key} 必须连续`);
    }
    if (time === cycleSeconds || time === cycleSeconds * 2) assert.deepEqual([...before.keys()], [...after.keys()], '120 秒花色循环交接不能清空已排列的粉饼');
  }
  for (const time of [1000, 8000, 16000]) {
    const pucks = at(time);
    assert.equal(pucks.length, count, '长期循环只保留十五个位置，各格不重复叠加新旧粉饼');
    assert.ok(Math.min(...pucks.map(puck => puck.index)) >= Math.floor(time / 8) - count - 1, '已经被替换的旧粉饼不能无限保留');
  }
  for (const start of ['xiaokui', 'silver', 'ginger', 'gray'].map(kind => F.recipes.findIndex(recipe => recipe.kind === kind) * 8)) {
    assert.deepEqual(F.collectedPucks(start, start), [], '指定花色入口从空集合开始');
    assert.deepEqual(F.collectedPucks(start - 1, start), [], '回拖到入口起点之前也没有历史粉饼');
    const selected = F.collectedPucks(start + 8, start), slot = F.puckSlot(start / 8, start);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].index, start / 8);
    assert.equal(selected[0].recipe, F.recipes[start / 8]);
    assert.deepEqual(slot, expectedSlot(start / 8), '专用入口保持花色固定格，不重新排到第一格');
    assert.equal(selected[0].x, slot.x); assert.equal(selected[0].y, slot.y);
    assert.equal(F.puckDrop(start / 8, start).x, slot.x);
    const release = F.stateAt(start + 6.82, start).handle;
    assert.equal(release.x, slot.x, '专用入口手柄对准该花色的固定位置');
    assert.deepEqual(F.stateAt(start + 8, start).pucks, selected, '指定入口传给场景的集合必须使用相同起点');
  }
});
check('手柄先左旋解锁、下移，再水平上插和右旋锁紧', () => {
  for (const used of [false, true]) {
    let previousYaw = 0;
    for (let i = 0; i <= 30; i++) {
      const h = F.handlePose(i / 100, used);
      assert.equal(h.x, 435); assert.equal(h.y, 598);
      assert.equal(h.roll, 0, '解锁时篮筐不在画面中翻转');
      assert.ok(h.yaw <= previousYaw);
      previousYaw = h.yaw;
    }
    for (const p of [0.3, 0.4, 0.5]) {
      const h = F.handlePose(p, used);
      assert.equal(h.x, 435); assert.equal(h.yaw, -1); assert.equal(h.roll, 0);
    }
    assert.equal(F.handlePose(0.5, used).y, 626);
    for (let i = 0; i <= 20; i++) {
      const h = F.handlePose(2.88 + i / 100, used);
      assert.equal(h.x, 435); assert.equal(h.yaw, -1); assert.equal(h.roll, 0);
      assert.ok(h.y >= 598 && h.y <= 622);
    }
    previousYaw = -1;
    for (let i = 0; i <= 27; i++) {
      const h = F.handlePose(3.08 + i / 100, used);
      assert.equal(h.x, 435); assert.equal(h.y, 598); assert.equal(h.roll, 0);
      assert.ok(h.yaw >= previousYaw);
      previousYaw = h.yaw;
    }
    assert.equal(F.handlePose(3.35, used).yaw, 0);
    assert.equal(F.handlePose(3.35, used).locked, true);
  }
});
check(`所有边界猫咪位置连续，${cycleSeconds} 秒之后仍连续`, () => {
  for (let n = -1; n <= F.recipes.length * 2 + 1; n++) {
    for (const age of [-16, -10.2, -8, -2.2, 0, 1.2, 5.8, 8]) {
      assert.ok(Math.abs(F.catX(age + 1e-6) - F.catX(age - 1e-6)) < 0.002);
    }
    if (n >= 1) {
      const before = F.stateAt(n * 8 - 1e-6);
      const after = F.stateAt(n * 8 + 1e-6);
      for (const a of before.cats) {
        const b = after.cats.find(c => c.index === a.index);
        if (b) assert.ok(Math.abs(a.x - b.x) < 0.002);
        else assert.ok(a.x > 1000 || a.x < -120, '移除的猫必须已离开画面');
      }
      for (const a of after.cats) {
        if (!before.cats.some(c => c.index === a.index)) assert.ok(a.x < -120, '新加入队列的猫必须在画外');
      }
    }
  }
});
check(`${cycleSeconds} 秒逐帧检查猫咪间隔和阶段数值`, () => {
  for (let frame = 0; frame <= cycleSeconds * 60; frame++) {
    const s = F.stateAt(frame / 60);
    const cats = s.cats.filter(c => c.x > -110 && c.x < 1010).sort((a, b) => a.x - b.x);
    for (let i = 1; i < cats.length; i++) assert.ok(cats[i].x - cats[i - 1].x >= 175, '猫咪不能重叠');
    assert.ok(cats.filter(c => Math.abs(c.x - 435) < 1).length <= 1);
    for (const c of cats) {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.speed));
      assert.ok(c.coat >= 0 && c.coat <= 1);
      assert.ok(c.baseCoat >= 0 && c.baseCoat <= 1);
      assert.ok(c.baseCoat >= c.coat, '主色进度不得落后于辅色');
    }
    for (const obj of [s.handle, s.wand]) {
      for (const value of Object.values(obj)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
    assert.ok(s.pressure >= 0 && s.pressure <= 1);
    assert.ok(s.puck === null || (s.puck >= 0 && s.puck < 1));
  }
});
check('手柄、压力与喷棒可见动作边界连续，循环前后复位', () => {
  const edges = [0.3, 0.5, 0.86, 1.02, 1.14, 1.2, 1.5, 1.56, 1.62, 2.14, 2.38, 2.4, 2.45, 2.88, 3.08, 3.35];
  for (const used of [false, true]) {
    for (const phase of edges) {
      const a = F.handlePose(phase - 1e-6, used), b = F.handlePose(phase + 1e-6, used);
      for (const key of ['x', 'y', 'yaw', 'roll', 'powder']) {
        if (used && phase === 1.02 && key === 'powder') continue; // Used puck leaves the basket at impact.
        assert.ok(Math.abs(a[key] - b[key]) < 0.002, `${phase} 秒的 ${key} 应连续`);
      }
    }
  }
  for (let round = 0; round <= F.recipes.length; round++) {
    for (const phase of [5.8, 6.1, 6.3, 6.66, 6.82, 6.94, 7.3, 7.94]) {
      const a = F.stateAt(round * 8 + phase - 1e-6), b = F.stateAt(round * 8 + phase + 1e-6);
      for (const key of ['x', 'y', 'yaw', 'roll', 'powder']) {
        if (phase === 6.82 && key === 'powder') continue; // The puck leaves the basket at the impact.
        assert.ok(Math.abs(a.handle[key] - b.handle[key]) < .002, `离场清理 ${phase} 秒的 ${key} 应连续`);
      }
    }
  }
  for (const phase of [3.35, 3.7, 3.9, 4.2, 4.25, 5.1, 5.2, 5.25, 5.65, 5.7]) {
    const a = F.stateAt(8 + phase - 1e-6), b = F.stateAt(8 + phase + 1e-6);
    assert.ok(Math.abs(a.pressure - b.pressure) < 0.002);
    for (const key of ['x', 'y', 'active', 'targetX', 'targetY']) assert.ok(Math.abs(a.wand[key] - b.wand[key]) < 0.002);
  }
  for (let n = 1; n <= F.recipes.length + 1; n++) {
    const a = F.stateAt(n * 8 - 1e-6), b = F.stateAt(n * 8 + 1e-6);
    for (const key of ['x', 'y', 'yaw', 'roll', 'powder']) assert.ok(Math.abs(a.handle[key] - b.handle[key]) < 0.002);
    for (const key of ['x', 'y', 'active']) assert.ok(Math.abs(a.wand[key] - b.wand[key]) < 0.002);
    assert.equal(a.handle.powder, 0); assert.equal(b.handle.powder, 0);
    assert.equal(a.handle.used, false); assert.equal(b.handle.used, false);
    assert.equal(a.puck, null); assert.equal(b.puck, null);
    assert.equal(a.handle.x, 305); assert.equal(b.handle.x, 305);
    assert.equal(a.handle.y, 638); assert.equal(b.handle.y, 638);
    assert.ok(Math.abs(F.beltPosition(n * 8 - 1e-6) - F.beltPosition(n * 8 + 1e-6)) < 0.002);
  }
});
check('离线入口资源齐全，没有联网加载或模块服务器依赖', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const file of refs) { assert.ok(!/^https?:/.test(file)); assert.ok(fs.existsSync(path.join(__dirname, file))); }
  for (const name of ['index.html', 'scene.js', 'timeline.js', 'cat.js']) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|type="module"/.test(fs.readFileSync(path.join(__dirname, name), 'utf8')));
  }
  assert.equal(fs.readFileSync(path.join(__dirname, 'vendor/p5.min.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../xiaokui-balloon-drive/vendor/p5.min.js'), 'utf8'));
});

// Non-browser rendering-contract smoke check. It does not inspect pixels or validate appearance.
let depth = 0, clipCount = 0, calls = 0, beanImageCalls = 0;
let recordedPaints = null;
const beanImage = { complete: true, naturalWidth: 1254, naturalHeight: 1254 };
const context = new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop === 'save') return () => { depth++; };
    if (prop === 'restore') return () => { assert.ok(depth > 0); depth--; };
    if (prop === 'clip') return () => { assert.ok(depth > 0); clipCount++; };
    if (prop === 'drawImage') return (source, sx, sy, sw, sh, dx, dy, dw, dh) => {
      assert.equal(source, beanImage); beanImageCalls++;
      assert.ok([sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite));
      assert.ok(sx >= 0 && sy >= 0 && sx + sw <= source.naturalWidth && sy + sh <= source.naturalHeight);
      assert.ok(Math.abs(sw / sh - dw / dh) < 1e-12, '咖啡豆图片必须等比缩放');
    };
    if (prop === 'createLinearGradient') return (...coordinates) => {
      assert.ok(coordinates.every(Number.isFinite));
      return { addColorStop(at, color) { assert.ok(at >= 0 && at <= 1); assert.equal(typeof color, 'string'); } };
    };
    return (...args) => {
      calls++;
      if (recordedPaints && ['fill', 'fillRect', 'stroke'].includes(prop)) {
        recordedPaints.add(target[prop === 'stroke' ? 'strokeStyle' : 'fillStyle']);
      }
      for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a));
    };
  }
});
class FakePath {
  constructor(d = '') { assert.ok(!/NaN|Infinity/.test(d)); }
  addPath() {}
}
class FakeMatrix { translate() { return this; } rotate() { return this; } }
let clock = 0, onVisibility;
function fakeEventTarget() {
  return {
    listeners: {},
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); },
    dispatch(name, properties = {}) {
      const event = { type: name, target: this, currentTarget: this, preventDefault() {}, ...properties };
      for (const listener of this.listeners[name] || []) listener(event);
    }
  };
}
function playbackElement(tagName, id) {
  return {
    ...fakeEventTarget(), id, tagName: tagName.toUpperCase(), attributes: {}, textContent: '', value: '',
    style: { setProperty(name, value) { this[name] = String(value); } },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    contains(element) { return element === this || (this.id === 'play-controls' && element?.id?.startsWith('play-')); },
    closest(selector) {
      return selector.split(',').some(part => {
        const candidate = part.trim();
        return candidate.toUpperCase() === this.tagName || candidate === `#${this.id}` ||
          (candidate === '[contenteditable="true"]' && this.isContentEditable);
      }) ? this : null;
    },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; }
  };
}
function factorySandbox(search = '', soundDriver = null) {
  const elements = Object.fromEntries([
    ['stage', 'div'], ['play-controls', 'div'], ['play-toggle', 'button'],
    ['play-progress', 'input'], ['play-sound', 'button'], ['play-speed', 'button'], ['play-time', 'span']
  ].map(([id, tag]) => [id, playbackElement(tag, id)]));
  elements['play-progress'].type = 'range';
  elements['play-progress'].min = '0';
  elements['play-progress'].max = String(cycleSeconds);
  elements['play-progress'].value = '0';
  elements['play-speed'].value = '1';
  const document = {
    ...fakeEventTarget(), getElementById: id => id === 'coffee-bean-art' ? beanImage : elements[id] || null,
    hidden: false, activeElement: null, body: playbackElement('body', 'body')
  };
  const addDocumentListener = document.addEventListener;
  document.addEventListener = function(name, listener) {
    addDocumentListener.call(this, name, listener);
    if (name === 'visibilitychange') onVisibility = listener;
  };
  const sandbox = {
  FactoryTimeline: F, Path2D: FakePath, DOMMatrix: FakeMatrix,
  drawingContext: context, window: { ...fakeEventTarget(), devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900,
    location: { search }, getComputedStyle() { return { paddingBottom: '84px' }; } },
  document, elements,
  performance: { now: () => clock }, key: '',
  createCanvas: (w, h) => { assert.equal(w / h, 3 / 4); return { parent() {}, elt: { setAttribute() {} } }; },
  pixelDensity() {}, frameRate() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'cat.js'), 'utf8'), sandbox);
  sandbox.CatArt = sandbox.window.CatArt;
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'sound.js'), 'utf8'), sandbox);
  if (soundDriver) sandbox.window.FactorySound = { create: () => soundDriver };
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'scene.js'), 'utf8'), sandbox);
  return sandbox;
}
function renderedPucks(app, time) {
  const original = app.puckCollection;
  let shown;
  try {
    app.puckCollection = state => { shown = state.pucks; return original(state); };
    app.renderScene(time);
    return shown;
  } finally { app.puckCollection = original; }
}
const sandbox = factorySandbox();
check('新增花色由纯白入场，并在完整成品实际绘制各自底色与花纹色', () => {
  for (const kind of newCoatKinds) {
    const index = F.recipes.findIndex(recipe => recipe.kind === kind);
    const recipe = F.recipes[index];
    for (const key of ['base', 'ink']) assert.match(recipe[key], /^#[0-9A-F]{6}$/i, `${recipe.name}的${key}必须有完整颜色配置`);
    function paintsAt(phase) {
      recordedPaints = new Set();
      sandbox.CatArt.draw(context, F.catState(index * 8 + phase, index), phase, { noBlink: true });
      const colors = recordedPaints;
      recordedPaints = null;
      assert.equal(depth, 0);
      return colors;
    }
    const initial = paintsAt(1.2);
    assert.ok(initial.has('#FFFFFF'), `${recipe.name}初始需绘制纯白身体`);
    assert.ok([...initial].every(color => ['#FFFFFF', '#172356'].includes(color)), `${recipe.name}初始不可提前出现成品色`);
    const complete = paintsAt(5.5);
    assert.ok(complete.has(recipe.base), `${recipe.name}成品必须使用底色`);
    if (['ginger', 'calico'].includes(kind)) assert.ok(complete.has(recipe.ink), `${recipe.name}成品必须实际画出花纹，不能退回单色猫`);
    if (kind === 'calico') {
      assert.match(recipe.accent, /^#[0-9A-F]{6}$/i);
      assert.equal(new Set([recipe.base, recipe.ink, recipe.accent]).size, 3, '三花的白底、深斑、橘斑需要三种独立颜色');
      assert.ok(complete.has(recipe.accent), '三花须同时画出橘斑，不能只呈现白底深斑');
    }
    if (kind === 'gray') {
      assert.match(recipe.eye, /^#[0-9A-F]{6}$/i);
      assert.ok(complete.has(recipe.eye), '纯灰成品需呈现审核稿中的浅琥珀眼睛');
    }
  }
});
check('握柄端面与柄身使用同一透视，连接颈保持接在篮侧', () => {
  const span = (points, axis) => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
  const front = sandbox.handleRing(128, 11.5, 0);
  const side = sandbox.handleRing(128, 11.5, Math.PI / 2);
  assert.ok(Math.abs(span(front, 0) - 23) < 1e-9, '正向圆形端面不能压成横扁椭圆');
  assert.ok(span(front, 1) / span(front, 0) > .98);
  assert.ok(span(side, 0) < 1e-9, '完全侧向时端面应收成细线');
  assert.ok(span(side, 1) > 22);
  let previous;
  for (let i = 0; i <= 100; i++) {
    const grip = sandbox.portafilterGrip(-1 + i / 100);
    assert.equal(grip.facing, true);
    for (const points of [grip.collar, grip.neck, grip.body, grip.tip]) {
      assert.ok(points.length >= 3);
      assert.ok(points.every(p => p.every(Number.isFinite)));
    }
    assert.ok(grip.collar.every(p => p[1] > 0 && p[1] < 27), '连接座必须位于篮侧高度内');
    if (previous) for (let j = 0; j < 32; j++) {
      assert.ok(Math.hypot(grip.tip[j][0] - previous[j][0], grip.tip[j][1] - previous[j][1]) < 1.5, '旋转时端面不可跳变');
    }
    previous = grip.tip;
  }
});
check(`${cycleSeconds} 秒绘图调用无异常、裁剪和保存层级配对`, () => {
  sandbox.setup();
  const layerNames = ['drawCat', 'puckCollection', 'spentPuck', 'portafilter'];
  const originalDrawers = Object.fromEntries(layerNames.map(name => [name, sandbox[name]]));
  const layers = [];
  try {
    for (const name of layerNames) sandbox[name] = (...args) => {
      layers.push(name); return originalDrawers[name](...args);
    };
    sandbox.renderScene(14.9);
    assert.ok(layers.includes('drawCat'), '检查猫与下方猫脸粉饼同时出现的画面');
    for (const name of ['puckCollection', 'spentPuck']) {
      assert.ok(layers.indexOf(name) > layers.lastIndexOf('drawCat'), '下落和排列的粉饼均在猫之后绘制');
      assert.ok(layers.indexOf(name) < layers.indexOf('portafilter'), '手柄位于粉饼前面，敲饼动作可见');
    }
  } finally {
    for (const name of layerNames) sandbox[name] = originalDrawers[name];
  }
  const originalPuck = sandbox.drawCatPuck;
  let seenPucks = [];
  try {
    sandbox.drawCatPuck = recipe => { seenPucks.push(recipe); return originalPuck(recipe); };
    const state = F.stateAt(14.9);
    sandbox.puckCollection(state);
    assert.deepEqual(seenPucks, state.pucks.filter(puck => !puck.falling).map(puck => puck.recipe), '已落地粉饼只在排列区绘制一次，并保留对应配方');
    seenPucks = [];
    sandbox.spentPuck(state);
    assert.deepEqual(seenPucks, state.pucks.filter(puck => puck.falling).map(puck => puck.recipe), '下落层只绘制本轮正在落下的猫脸');
  } finally { sandbox.drawCatPuck = originalPuck; }
  for (let i = 0; i <= cycleSeconds * 30; i++) {
    const time = i / 30, countBefore = beanImageCalls;
    sandbox.renderScene(time);
    assert.equal(depth, 0);
    const beans = F.stateAt(time).hopper.length, drawn = beanImageCalls - countBefore;
    assert.ok(drawn >= beans && drawn <= beans * 2, '按实际落豆数量绘图，仓内与空中各裁剪至多一次');
    if (!beans) assert.equal(drawn, 0, '空仓阶段不能绘制固定豆堆或循环落豆');
  }
  assert.ok(clipCount > 1000); assert.ok(calls > 100000);
  assert.ok(beanImageCalls > 0, '落豆使用本地透明图片');
});
check('豆仓、接粉与猫脸粉饼对应当前配方，喷色期间保持空仓', () => {
  const drawBean = sandbox.bean;
  let seen;
  sandbox.bean = (...args) => {
    assert.equal(args.length, 5, '落豆绘制必须传入实际所储豆色');
    seen.add(args[4]);
    return drawBean(...args);
  };
  try {
    for (let round = 0; round <= F.recipes.length; round++) {
      for (const phase of [.94, 6.3, 7, 7.9]) {
        const state = F.stateAt(round * 8 + phase);
        seen = new Set();
        sandbox.renderScene(state.time);
        assert.equal(depth, 0);
        assert.deepEqual([...seen].sort(), [...F.beanColors(state.hopperRecipe)].sort(), '豆仓实际显示所储配方的全部豆色');
      }
      const dosing = F.stateAt(round * 8 + 2);
      assert.equal(dosing.hopperRecipe, dosing.recipe, '当前接粉时尚未切换下一批豆色');
      seen = new Set();
      sandbox.renderScene(dosing.time);
      assert.equal(seen.size, 0, '实际接粉画面不能绘制下一批豆子');
      for (const phase of [2.4, 2.88, 3.08, 3.34, 3.4, 4.2, 4.6, 5.1568, 5.199]) {
        seen = new Set();
        sandbox.renderScene(round * 8 + phase);
        assert.equal(seen.size, 0, '手柄装回、旋紧及蒸汽棒喷色期间实际画面仍不能补豆');
      }
      recordedPaints = new Set();
      sandbox.groundCoffee(dosing);
      const expected = vm.runInContext(`GROUND_PALETTES.get('${dosing.recipe.kind}')`, sandbox);
      assert.ok(recordedPaints.has(F.primary(dosing.recipe)), '接粉仍使用当前猫咪主色');
      assert.ok([...recordedPaints].every(color => expected.includes(color)), '接粉颜色必须始终对应当前猫咪');
      recordedPaints = null;
      const cleanup = F.stateAt(round * 8 + 6.9);
      const originalCatArt = sandbox.CatArt, puckFaces = [];
      sandbox.CatArt = { ...originalCatArt, draw(context, state, time, options) {
        puckFaces.push({ state, time, options });
        return originalCatArt.draw(context, state, time, options);
      } };
      recordedPaints = new Set();
      try {
        sandbox.spentPuck(cleanup);
        assert.ok(puckFaces.length > 0, '离场粉饼必须复用猫咪脸部绘图');
        for (const face of puckFaces) {
          assert.equal(face.state.recipe, cleanup.recipe, '粉饼脸必须对应刚离场的猫，不能沿用前一只配方');
          assert.equal(face.state.coat, 1, '粉饼脸使用完整成品花色');
          assert.equal(face.state.walking, 0, '粉饼上的脸保持固定姿态');
          assert.equal(face.options.headOnly, true, '粉饼只绘制猫头，不带身体或腿');
          assert.equal(face.options.noBlink, true, '粉饼上的眼睛固定睁开，不受动画眨眼时刻影响');
        }
        if (cleanup.recipe.kind === 'solid') {
          assert.ok(recordedPaints.has(cleanup.recipe.base), '黑猫粉饼保留深色脸');
          assert.ok(recordedPaints.has('#F9CD77'), '黑猫粉饼保留金色眼睛');
        }
        if (cleanup.recipe.kind === 'points') assert.ok(recordedPaints.has('#96C2F2'), '暹罗粉饼保留蓝色眼睛');
        if (cleanup.recipe.kind === 'calico') {
          for (const color of [cleanup.recipe.base, cleanup.recipe.ink, cleanup.recipe.accent]) {
            assert.ok(recordedPaints.has(color), '三花粉饼须保留白底、深斑和橘斑');
          }
        }
        if (cleanup.recipe.kind === 'gray') assert.ok(recordedPaints.has(cleanup.recipe.eye), '纯灰粉饼保留琥珀色眼睛');
      } finally {
        sandbox.CatArt = originalCatArt;
        recordedPaints = null;
      }
      assert.equal(depth, 0);
    }
  } finally { sandbox.bean = drawBean; }
});
check('不同窗口为播放条与安全区域留白，画幅保持完整 3:4 且底排猫脸不被遮挡', () => {
  const originalComputedStyle = sandbox.window.getComputedStyle;
  try {
    for (const reserved of [84, 102]) {
      sandbox.window.getComputedStyle = target => {
        assert.equal(target, sandbox.document.body);
        return { paddingBottom: `${reserved}px` };
      };
      for (const [width, height] of [[1440, 900], [390, 844], [900, 1200], [320, 240], [1024, 768], [600, 1600]]) {
        sandbox.window.innerWidth = width; sandbox.window.innerHeight = height;
        sandbox.windowResized();
        const w = parseFloat(sandbox.elements.stage.style.width), h = parseFloat(sandbox.elements.stage.style.height);
        assert.ok(Math.abs(w / h - 0.75) < 1e-12);
        const expectedScale = Math.min(width / 900, (height - reserved) / 1200);
        assert.ok(Math.abs(w - expectedScale * 900) < 1e-8 && Math.abs(h - expectedScale * 1200) < 1e-8, '画布尺寸计算必须先扣除播放条预留高度');
        assert.ok(w <= width + 1e-9 && h <= height - reserved + 1e-9);
        const canvasTop = (height - reserved - h) / 2;
        const lowestFace = Math.max(...F.recipes.map((recipe, index) => F.puckSlot(index).y + 30));
        assert.ok(canvasTop + lowestFace / 1200 * h <= height - reserved + 1e-8, '最底排猫脸不能进入播放条区域');
      }
    }
  } finally { sandbox.window.getComputedStyle = originalComputedStyle; }
  const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  assert.match(css, /--playback-space:\s*max\(84px,\s*calc\(env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*68px\)\)/, '样式表应同时保留基本播放条空间和设备安全区域');
  assert.match(css, /body\s*\{[^}]*padding-bottom:\s*var\(--playback-space\)/, '预留空间必须实际应用到容器');
});
check('空格暂停继续、R 重播、后台切换不跳时', () => {
  clock = 1000; sandbox.draw(); assert.equal(vm.runInContext('elapsed', sandbox), 1);
  sandbox.keyPressed({ code: 'Space' }); clock = 2000; sandbox.draw(); assert.equal(vm.runInContext('elapsed', sandbox), 1);
  sandbox.keyPressed({ code: 'Space' }); clock = 3000; sandbox.draw(); assert.equal(vm.runInContext('elapsed', sandbox), 2);
  assert.ok(renderedPucks(sandbox, 16).length > 0, '重播之前可显示已收集的粉饼');
  sandbox.key = 'R'; sandbox.keyPressed({ code: 'KeyR' }); assert.equal(vm.runInContext('elapsed', sandbox), 0);
  assert.deepEqual(renderedPucks(sandbox, vm.runInContext('elapsed', sandbox)), [], 'R 重播后粉饼集合清空');
  assert.ok(F.stateAt(vm.runInContext('elapsed', sandbox)).hopper.every(bean => bean.y <= -12 * bean.scale), '重播必须清空豆仓，不沿用上一轮豆子');
  sandbox.document.hidden = true; onVisibility(); clock = 100000; sandbox.draw(); assert.equal(vm.runInContext('elapsed', sandbox), 0);
  sandbox.document.hidden = false; onVisibility(); clock += 500; sandbox.draw(); assert.equal(vm.runInContext('elapsed', sandbox), 0.5);
});
check('从小葵及新增花色开始播放，暂停与重置均保留所选起点', () => {
  const choices = [...['xiaokui', 'bicolor', ...newCoatKinds].map(kind => [`?cat=${kind}`, F.recipes.findIndex(recipe => recipe.kind === kind) * 8]), ['?cat=unknown', 0], ['', 0]];
  for (const [search, start] of choices) {
    const app = factorySandbox(search);
    clock = 0; app.setup();
    assert.equal(vm.runInContext('elapsed', app), start);
    assert.deepEqual(renderedPucks(app, start), [], '指定入口画面不可提前显示此前猫咪粉饼');
    assert.deepEqual(renderedPucks(app, start - 1), [], '回拖到入口之前仍显示空集合');
    assert.equal(renderedPucks(app, start + 8).length, 1, '指定入口第一只猫只留下自己的粉饼');
    assert.deepEqual(F.stateAt(start).hopper, F.hopperBeans(0, start > 0), '指定入口使用该轮已准备好的豆，只有整个动画的开场为空仓');
    clock = 1000; app.draw();
    assert.equal(vm.runInContext('elapsed', app), start + 1);
    if (F.recipeIndexFromSearch(search) >= 0) {
      assert.equal(F.stateAt(vm.runInContext('elapsed', app)).recipe.kind, search.slice('?cat='.length));
    }
    app.keyPressed({ code: 'Space' });
    clock = 2000; app.draw();
    assert.equal(vm.runInContext('elapsed', app), start + 1);
    app.key = 'R'; app.keyPressed({ code: 'KeyR' });
    assert.equal(vm.runInContext('elapsed', app), start);
    assert.deepEqual(renderedPucks(app, vm.runInContext('elapsed', app)), [], '指定入口 R 重播也清空粉饼集合');
    assert.deepEqual(F.stateAt(vm.runInContext('elapsed', app)).hopper, F.hopperBeans(0, start > 0), '重播回到所选轮次原有豆仓状态，后续轮次保持提前备好的豆');
    clock = 3000; app.draw();
    assert.equal(vm.runInContext('elapsed', app), start, '重置不应解除暂停');
    app.keyPressed({ code: 'Space' });
    clock = 3500; app.draw();
    assert.equal(vm.runInContext('elapsed', app), start + .5);
  }
});
check('底部进度显示所选起点和完整循环，跨轮及拖到末尾时正确复位', () => {
  const search = '?cat=silver', start = F.recipeIndexFromSearch(search) * 8;
  assert.ok(start > 0, '此项应覆盖非零入口');
  const app = factorySandbox(search);
  clock = 0; app.setup();
  const progress = app.elements['play-progress'];
  assert.equal(Number(progress.max), cycleSeconds);
  assert.equal(Number(progress.value), start);
  assert.ok(app.elements['play-time'].textContent.includes(`${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}`));
  assert.match(app.elements['play-time'].textContent, /2:00/);
  vm.runInContext(`elapsed = ${cycleSeconds - .5}; updatePlaybackControls()`, app);
  assert.equal(Number(progress.value), cycleSeconds - .5);
  clock = 1000; app.draw();
  assert.equal(vm.runInContext('elapsed', app), cycleSeconds + .5);
  assert.ok(Math.abs(Number(progress.value) - .5) < .001, '循环后滑块应从头继续');
  progress.dispatch('pointerdown', { pointerId: 1 });
  progress.value = String(cycleSeconds); progress.dispatch('input');
  assert.equal(vm.runInContext('elapsed', app), cycleSeconds * 2, '末尾值仍是完整循环终点');
  app.window.dispatch('pointerup', { pointerId: 1 });
  clock = 1250; app.draw();
  assert.ok(Math.abs(Number(progress.value) - .25) < .001);
});
check('拖动进度临时停播，松开、取消和离窗恢复原状态，暂停重播仍暂停', () => {
  const search = '?cat=silver', start = F.recipeIndexFromSearch(search) * 8;
  assert.ok(start > 0, '此项应覆盖非零入口');
  const app = factorySandbox(search);
  clock = 0; app.setup();
  const progress = app.elements['play-progress'], toggle = app.elements['play-toggle'];
  const state = () => vm.runInContext('({ elapsed, running, draggingProgress })', app);
  vm.runInContext(`elapsed = ${cycleSeconds + 37}; updatePlaybackControls()`, app);
  progress.dispatch('pointerdown', { pointerId: 1 });
  assert.equal(state().draggingProgress, true);
  assert.equal(state().running, false);
  progress.value = String(cycleSeconds); progress.dispatch('input');
  assert.equal(state().elapsed, cycleSeconds * 2);
  progress.value = '12'; progress.dispatch('input');
  assert.equal(state().elapsed, cycleSeconds + 12, '同次拖动先到末尾再往回时，仍应定位当前循环');
  clock = 1000; app.draw();
  assert.equal(state().elapsed, cycleSeconds + 12, '拖动期间时间不可继续流动');
  app.window.dispatch('pointerup', { pointerId: 1 });
  assert.equal(state().draggingProgress, false);
  assert.equal(state().running, true);
  clock = 1250; app.draw();
  assert.equal(state().elapsed, cycleSeconds + 12.25);
  toggle.dispatch('click');
  assert.equal(state().running, false);
  progress.dispatch('pointerdown', { pointerId: 2 });
  progress.value = '30'; progress.dispatch('input');
  app.window.dispatch('pointerup', { pointerId: 2 });
  assert.equal(state().elapsed, cycleSeconds + 30);
  assert.equal(state().running, false, '原本暂停时，拖动完成不可自动播放');
  progress.dispatch('pointerdown', { pointerId: 2 });
  progress.value = String(cycleSeconds); progress.dispatch('input');
  app.window.dispatch('pointerup', { pointerId: 2 });
  clock = 1500; app.draw();
  assert.equal(Number(progress.value), cycleSeconds, '暂停拖到末尾后滑块保持在末端');
  assert.equal(state().elapsed, cycleSeconds * 2);
  app.key = 'R'; app.keyPressed({ code: 'KeyR' });
  assert.equal(state().elapsed, start);
  assert.equal(state().running, false, '重播保留暂停状态');
  assert.equal(Number(progress.value), start, '重播后进度显示立即同步');
  toggle.dispatch('click');
  for (const event of ['pointercancel', 'blur']) {
    progress.dispatch('pointerdown', { pointerId: 3 });
    assert.equal(state().running, false);
    app.window.dispatch(event, { pointerId: 3 });
    assert.equal(state().draggingProgress, false, `${event} 不可留下拖动状态`);
    assert.equal(state().running, true, `${event} 应恢复原播放状态`);
  }
});
check('倍速影响动画时间，控件获得焦点时不重复响应全局播放快捷键', () => {
  const app = factorySandbox();
  clock = 0; app.setup();
  const speed = app.elements['play-speed'];
  let expected = 0;
  for (const rate of [1.5, 2, 3, .5, 1]) {
    speed.dispatch('click');
    assert.equal(speed.textContent, `${rate}×`);
    clock += 1000; app.draw(); expected += rate;
    assert.equal(vm.runInContext('elapsed', app), expected);
  }
  for (const id of ['play-toggle', 'play-progress', 'play-speed']) {
    const control = app.elements[id];
    app.document.activeElement = control;
    app.key = ' ';
    app.keyPressed({ code: 'Space', target: control });
    assert.equal(vm.runInContext('running', app), true, `${id} 的空格事件不能被全局快捷键再次切换`);
    app.key = 'r';
    app.keyPressed({ code: 'KeyR', target: control });
    assert.equal(vm.runInContext('elapsed', app), expected, `${id} 内的按键不能意外重播`);
  }
  app.document.activeElement = null;
  app.key = ' '; app.keyPressed({ code: 'Space' });
  assert.equal(vm.runInContext('running', app), false, '离开控件后空格仍能暂停');
});
check('形态页直接选中小葵及新增花色，切换花色与工厂链接同步', () => {
  function element() {
    return { attributes: {}, listeners: {}, children: [], setAttribute(k, v) { this.attributes[k] = v; },
      addEventListener(k, fn) { this.listeners[k] = fn; }, append(child) { this.children.push(child); },
      getContext() { return context; } };
  }
  const cases = [...['xiaokui', 'goldtabby', 'white', 'orangewhite', 'silvershaded', 'bengal', ...newCoatKinds].map(kind => [`?cat=${kind}`, F.recipes.findIndex(recipe => recipe.kind === kind) + 1]), ['?cat=unknown', 0], ['', 0]];
  for (const [search, selectedIndex] of cases) {
    const selectedRecipe = F.recipes[selectedIndex - 1];
    const elements = Object.fromEntries(['cats', 'choices', 'actions', 'action-label', 'pause', 'factory-link', 'character-reference', 'art-comparison'].map(id => [id, element()]));
    let nextFrame;
    const rendered = [];
    const app = { FactoryTimeline: F, URLSearchParams, window: { location: { search } }, performance: { now: () => 0 },
      document: { getElementById: id => elements[id], createElement: element, addEventListener() {}, hidden: false },
      CatArt: { draw: (_ctx, state) => rendered.push(state) }, requestAnimationFrame: fn => { nextFrame = fn; } };
    vm.createContext(app);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'cat-review.js'), 'utf8'), app);
    const buttons = elements.choices.children;
    assert.equal(buttons.length, F.recipes.length + 1);
    assert.deepEqual(buttons.filter(button => button.attributes['aria-pressed'] === 'true'), [buttons[selectedIndex]]);
    assert.equal(elements['factory-link'].href, selectedRecipe ? `index.html?cat=${selectedRecipe.kind}` : 'index.html');
    if (['goldtabby', 'white', 'orangewhite', 'silvershaded', 'bengal'].includes(selectedRecipe?.kind)) {
      assert.equal(elements['art-comparison'].hidden, true);
      assert.equal(elements['character-reference'].hidden, ['goldtabby', 'silvershaded'].includes(selectedRecipe.kind));
      if (!['goldtabby', 'silvershaded'].includes(selectedRecipe.kind)) assert.ok(fs.existsSync(path.join(__dirname, elements['character-reference'].href)));
    } else if (!newCoatKinds.includes(selectedRecipe?.kind)) {
      assert.equal(elements['character-reference'].href, selectedRecipe ? '小葵形象设定-v10.png' : '圆头造型参考.png');
      assert.equal(elements['art-comparison'].href, selectedRecipe ? 'output/playwright/xiaokui/compare.html' : 'review/逐只比对.html');
    }
    nextFrame(1000);
    assert.equal(rendered.length, 2);
    assert.equal(rendered[0].walking, 0); assert.equal(rendered[1].walking, 1);
    if (selectedRecipe) {
      assert.equal(rendered[0].recipe, selectedRecipe);
      assert.equal(rendered[0].coat, 1, '形态页应直接展示所选花色的完整成品');
      assert.equal(elements.cats.attributes['aria-label'], `${selectedRecipe.name}站立和行走对照`);
    }
    else {
      assert.equal(rendered[0].coat, 0);
      assert.equal(rendered[0].recipe.kind, 'bicolor', '纯白初始仍用原标准轮廓，不随小葵调到首位而改变');
    }
    buttons[F.recipes.findIndex(recipe => recipe.kind === 'bicolor') + 1].listeners.click();
    assert.equal(elements['factory-link'].href, 'index.html?cat=bicolor');
    assert.equal(elements['character-reference'].href, '圆头造型参考.png');
    assert.equal(elements['art-comparison'].href, 'review/逐只比对.html');
    assert.equal(elements.cats.attributes['aria-label'], '蓝白站立和行走对照');
    elements.pause.listeners.click({ target: elements.pause });
    const pausedTime = vm.runInContext('reviewTime', app);
    nextFrame(2000);
    assert.equal(vm.runInContext('reviewTime', app), pausedTime);
  }
  const comparisonElements = { choices: element(), comparison: element() }, compared = [];
  comparisonElements.comparison.getContext = () => ({ fillRect() {}, fillText() {}, drawImage() {} });
  const comparisonApp = { FactoryTimeline: F, Image: function () {},
    document: { getElementById: id => comparisonElements[id], createElement: element,
      querySelectorAll: () => comparisonElements.choices.children },
    CatArt: { draw: (_ctx, state) => compared.push(state) } };
  const comparisonSource = fs.readFileSync(path.join(__dirname, 'review/逐只比对.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.createContext(comparisonApp); vm.runInContext(comparisonSource, comparisonApp);
  const sampleKinds = ['bicolor', 'bicolor', 'solid', 'tabby', 'points', 'gold', 'silver'];
  assert.equal(comparisonElements.choices.children.length, sampleKinds.length);
  comparisonElements.choices.children.forEach((button, index) => {
    button.onclick();
    assert.equal(compared.at(-1).recipe.kind, sampleKinds[index], '原稿比对按花色匹配，不受出场顺序调整影响');
    assert.equal(compared.at(-1).coat, index === 0 ? 0 : 1);
  });
});
check('小葵只保留走路与怒叫，表情循环暂停有效，旧炸毛入口回退走路', () => {
  function element() {
    return { attributes: {}, listeners: {}, children: [], setAttribute(k, v) { this.attributes[k] = v; },
      addEventListener(k, fn) { this.listeners[k] = fn; }, append(child) { this.children.push(child); },
      getContext() { return context; } };
  }
  const xiaokuiButtonIndex = F.recipes.findIndex(recipe => recipe.kind === 'xiaokui') + 1;
  for (const action of ['walk', 'puff', 'hiss']) {
    const elements = Object.fromEntries(['cats', 'choices', 'actions', 'action-label', 'pause', 'factory-link', 'character-reference', 'art-comparison'].map(id => [id, element()]));
    let nextFrame, now = 0;
    const rendered = [];
    const app = { FactoryTimeline: F, URLSearchParams,
      window: { location: { search: `?cat=xiaokui&action=${action}` } }, performance: { now: () => now },
      document: { getElementById: id => elements[id], createElement: element, addEventListener() {}, hidden: false },
      CatArt: { draw: (_ctx, state) => rendered.push(state) }, requestAnimationFrame: fn => { nextFrame = fn; } };
    vm.createContext(app);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'cat-review.js'), 'utf8'), app);
    const frame = time => { now = time; rendered.length = 0; nextFrame(now); };
    assert.equal(elements.actions.hidden, false);
    assert.equal(elements.actions.children.length, 2);
    assert.deepEqual(elements.actions.children.map(button => button.textContent), ['日常走路', '怒叫']);
    assert.equal(vm.runInContext('selectedAction', app), action === 'hiss' ? 'hiss' : 'walk', '旧炸毛入口回退日常走路');
    frame(1000);
    assert.equal(rendered[0].walking, 0);
    assert.equal(rendered[0].reaction, undefined, '左侧日常站姿不受动作选项影响');
    assert.equal(rendered[1].walking, action === 'hiss' ? 0 : 1);
    assert.equal(rendered[1].reaction.puff, 0, '预览哈气也不触发炸毛');
    assert.equal(rendered[1].reaction.hiss, action === 'hiss' ? 1 : 0);
    if (action === 'hiss') {
      frame(2400);
      assert.equal(rendered[1].reaction.puff, 0, '动作结束恢复日常');
      assert.equal(rendered[1].reaction.hiss, 0);
      frame(4200);
      assert.equal(rendered[1].reaction.puff, 0, '重复哈气时身体仍不膨胀');
      assert.equal(rendered[1].reaction.hiss, action === 'hiss' ? 1 : 0);
    }
    elements.pause.listeners.click({ target: elements.pause });
    const pausedTime = vm.runInContext('reviewTime', app);
    const pausedReaction = { ...rendered[1].reaction };
    frame(now + 1000);
    assert.equal(vm.runInContext('reviewTime', app), pausedTime);
    assert.deepEqual({ ...rendered[1].reaction }, pausedReaction, '暂停冻结整个动作');
    elements.choices.children[F.recipes.findIndex(recipe => recipe.kind === 'bicolor') + 1].listeners.click();
    assert.equal(elements.actions.hidden, true);
    assert.equal(elements.cats.attributes['aria-label'], '蓝白站立和行走对照');
    frame(now + 1000);
    assert.equal(rendered[1].walking, 1);
    assert.equal(rendered[1].reaction.puff, 0);
    assert.equal(rendered[1].reaction.hiss, 0);
    elements.choices.children[xiaokuiButtonIndex].listeners.click();
    assert.equal(elements.actions.hidden, false);
    assert.equal(elements.actions.children[0].attributes['aria-pressed'], 'true', '返回小葵时重置动作');
    elements.actions.children[1].listeners.click();
    assert.equal(elements['action-label'].textContent, '怒叫');
    elements.pause.listeners.click({ target: elements.pause });
    frame(now + 1000);
    assert.equal(rendered[1].reaction.hiss, 1, '按钮切换与继续播放均生效');
    assert.equal(rendered[1].reaction.puff, 0);
  }
});
check('豹猫从纯白变成暖棕豹斑，斑心、深边和浅胸同步绘制并保留步态', () => {
  const index = F.recipes.findIndex(r => r.kind === 'bengal'), recipe = F.recipes[index];
  assert.equal(index, F.recipes.findIndex(r => r.kind === 'gray') + 1);
  const initial = F.catState(index * 8 + 1.2, index);
  recordedPaints = new Set();
  sandbox.CatArt.draw(context, initial, 1.2, { noBlink: true });
  assert.ok([...recordedPaints].every(color => ['#FFFFFF', '#172356'].includes(color)));
  for (const phase of [5.5, 6, 6.3, 6.8, 7.2]) {
    const state = F.catState(index * 8 + phase, index);
    recordedPaints = new Set();
    sandbox.CatArt.draw(context, state, phase, { noBlink: true });
    for (const color of [recipe.base, recipe.ink, recipe.accent, recipe.cream]) assert.ok(recordedPaints.has(color), '豹斑必须实际绘制全部层次');
    const model = sandbox.CatArt.model(state, phase);
    const plain = sandbox.CatArt.model({ ...state, recipe: F.recipes.find(r => r.kind === 'bicolor') }, phase);
    assert.deepEqual(model.contours, plain.contours, '新增花色不改变已确认的轮廓和步态');
    assert.equal(depth, 0);
  }
  recordedPaints = null;
  assert.deepEqual(F.beanColors(recipe), [recipe.base, recipe.accent, recipe.ink]);
});
check('无虎纹银渐保留银灰渐变和白胸，实际身体与猫饼都不画条纹', () => {
  const index = F.recipes.findIndex(r => r.kind === 'silvershaded');
  assert.equal(index, F.recipes.findIndex(r => r.kind === 'silver') + 1);
  for (const kind of ['silver', 'silvershaded']) {
    const n = F.recipes.findIndex(r => r.kind === kind), recipe = F.recipes[n];
    for (const headOnly of [false, true]) {
      recordedPaints = new Set();
      sandbox.CatArt.draw(context, F.catState(n * 8 + 5.5, n), 5.5, { noBlink: true, headOnly });
      assert.equal(recordedPaints.has(recipe.ink), kind === 'silver', '只有虎纹版使用实心条纹色');
      assert.ok([...recordedPaints].some(paint => typeof paint === 'object'), '保留渐变覆色');
      assert.ok(recordedPaints.has('#FDFCFD'), '胸口与下半脸保持近白色');
      recordedPaints = null; assert.equal(depth, 0);
    }
  }
  const initial = F.catState(index * 8 + 1.2, index);
  assert.equal(initial.coat, 0); assert.equal(initial.baseCoat, 0);
  assert.equal(F.stateAt(index * 8 + 4.5).malfunction, false);
});
check('金渐虎纹沿用金渐底色并实际绘制虎纹，橘白保持白脸白爪和橘斑', () => {
  const colorsAt = kind => {
    const index = F.recipes.findIndex(recipe => recipe.kind === kind);
    recordedPaints = new Set();
    sandbox.CatArt.draw(context, F.catState(index * 8 + 5.5, index), 5.5, { noBlink: true });
    const paints = recordedPaints; recordedPaints = null;
    assert.equal(depth, 0); return paints;
  };
  const gold = F.recipes.find(r => r.kind === 'gold');
  const tiger = F.recipes.find(r => r.kind === 'goldtabby');
  assert.equal(tiger.base, gold.base);
  assert.equal(F.recipes.indexOf(tiger), F.recipes.indexOf(gold) + 1);
  assert.ok(colorsAt('goldtabby').has(tiger.ink));
  assert.ok(!colorsAt('gold').has(tiger.ink), '原金渐层不能被一并加上虎纹');
  const orange = F.recipes.find(r => r.kind === 'orangewhite');
  const paints = colorsAt('orangewhite');
  assert.ok(paints.has('#FFFFFF') && paints.has(orange.ink));
  assert.ok(!paints.has('#293A69'), '橘白耳内不能遗留蓝白的深蓝填色');
  assert.equal(F.primary(orange), orange.ink); assert.equal(F.secondary(orange), '#FFFFFF');
});
check('纯白故障全程无滴液无喷色、压力不上升，实际绘图保留原白猫', () => {
  const index = F.recipes.findIndex(r => r.kind === 'white');
  const flashes = new Set();
  for (let frame = 0; frame < 8 * 60; frame++) {
    const state = F.stateAt(index * 8 + frame / 60);
    assert.equal(state.flow, null); assert.equal(state.brewing, false);
    assert.equal(state.wand.spraying, false); assert.equal(state.pressure, 0);
    const cat = F.catState(state.time, index);
    assert.equal(cat.baseCoat, 0); assert.equal(cat.coat, 0);
    if (state.phase > 3.35 && state.phase < 5.2) flashes.add(state.faultLight);
    recordedPaints = new Set(); sandbox.coffeeFlow(state); sandbox.secondaryMist(state);
    assert.equal(recordedPaints.size, 0, '实际滴液和喷色绘制函数都必须退出'); recordedPaints = null;
  }
  assert.equal(flashes.size, 2);
  recordedPaints = new Set();
  // Check the finished white coat before the mouth opens for its recorded meow.
  sandbox.CatArt.draw(context, F.catState(index * 8 + 5.2, index), 5.2, { noBlink: true });
  assert.ok([...recordedPaints].every(color => ['#FFFFFF', '#172356'].includes(color)));
  recordedPaints = null;
});
check('放大的猫饼保持原脸比例，十五张脸在三行中完整、不重叠', () => {
  assert.equal(F.puckLayout.faceWidth, 58);
  const bounds = F.recipes.map((recipe, index) => {
    const portrait = sandbox.puckPortrait(recipe), slot = F.puckSlot(index);
    const coordinates = sandbox.CatArt.model(portrait.state, 0).head.flatMap(command => {
      const points = []; for (let i = 1; i < command.length; i += 2) points.push([command[i], command[i + 1]]); return points;
    });
    const width = (Math.max(...coordinates.map(p => p[0])) - Math.min(...coordinates.map(p => p[0]))) * portrait.scale;
    const height = (Math.max(...coordinates.map(p => p[1])) - Math.min(...coordinates.map(p => p[1]))) * portrait.scale;
    assert.ok(Math.abs(width - 58) < 1e-8);
    assert.ok(slot.y - height / 2 >= F.puckLayout.top);
    assert.ok(slot.y + height / 2 + 3 <= F.puckLayout.bottom);
    return { ...slot, width, height };
  });
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const a = bounds[i], b = bounds[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 20 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + 20);
  }
});
check('音效接入实际播放控制，暂停、隐藏、重播和拖动会同步停声或重置', () => {
  const syncs = []; let resets = 0;
  const sound = { sync: (...args) => syncs.push(args), reset: () => resets++ };
  const app = factorySandbox('', sound); clock = 0; app.setup();
  clock = 4000; app.draw(); assert.deepEqual(syncs.at(-1), [4, true, 1]);
  app.elements['play-toggle'].dispatch('click'); assert.equal(syncs.at(-1)[1], false);
  app.elements['play-toggle'].dispatch('click'); assert.equal(syncs.at(-1)[1], true);
  app.elements['play-progress'].dispatch('pointerdown'); assert.equal(syncs.at(-1)[1], false);
  app.elements['play-progress'].value = '24'; app.elements['play-progress'].dispatch('input');
  assert.equal(resets, 1); app.window.dispatch('pointerup');
  assert.deepEqual(syncs.at(-1), [24, true, 1]);
  app.key = 'R'; app.keyPressed({ code: 'KeyR' }); assert.equal(resets, 2);
  app.document.hidden = true; app.document.dispatch('visibilitychange'); assert.equal(resets, 3);
  clock = 6000; app.draw(); assert.equal(syncs.at(-1)[1], false);
});
console.log(`完成 ${checks} 项代码检查。本脚本不代替浏览器视觉检查；实际比对结果见制作说明。`);
