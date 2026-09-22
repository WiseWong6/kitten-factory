'use strict';
const reviewCanvas = document.getElementById('cats');
const reviewCtx = reviewCanvas.getContext('2d');
const choices = document.getElementById('choices');
const actions = document.getElementById('actions');
let selected = FactoryTimeline.recipeIndexFromSearch(window.location.search);
let reviewPlaying = true, reviewTime = 0, reviewLast = performance.now();
let selectedAction = 'walk';
const labels = ['纯白初始', ...FactoryTimeline.recipes.map(r => r.name)];
const whiteRecipe = FactoryTimeline.recipes.find(recipe => recipe.kind === 'bicolor');
const actionOptions = [{ kind: 'walk', label: '日常走路' }, { kind: 'hiss', label: '怒叫' }];
function selectAction(kind) {
  const canReact = FactoryTimeline.recipes[selected]?.kind === 'xiaokui';
  selectedAction = canReact && actionOptions.some(action => action.kind === kind) ? kind : 'walk';
  const label = actionOptions.find(action => action.kind === selectedAction).label;
  [...actions.children].forEach((button, n) => button.setAttribute('aria-pressed', String(actionOptions[n].kind === selectedAction)));
  document.getElementById('action-label').textContent = label;
  reviewCanvas.setAttribute('aria-label', `${labels[selected + 1]}站立和${selectedAction === 'walk' ? '行走' : label}对照`);
  reviewTime = 0; reviewLast = performance.now();
}
function selectCat(index) {
  selected = index;
  [...choices.children].forEach((button, n) => button.setAttribute('aria-pressed', String(n === selected + 1)));
  actions.hidden = FactoryTimeline.recipes[selected]?.kind !== 'xiaokui';
  selectAction('walk');
  document.getElementById('factory-link').href = selected < 0 ? 'index.html' : `index.html?cat=${FactoryTimeline.recipes[selected].kind}`;
  const kind = FactoryTimeline.recipes[selected]?.kind;
  const derived = ['goldtabby', 'white', 'orangewhite', 'silvershaded', 'bengal'].includes(kind);
  const newCoat = ['ginger', 'calico', 'gray'].includes(kind);
  document.getElementById('character-reference').href = newCoat ? '美术审核/新花色六猫-v1.png' : kind === 'xiaokui' ? '小葵形象设定-v10.png' : '圆头造型参考.png';
  document.getElementById('art-comparison').hidden = derived;
  document.getElementById('character-reference').hidden = ['goldtabby', 'silvershaded'].includes(kind);
  if (kind === 'bengal') document.getElementById('character-reference').href = '美术审核/豹猫优化参考-v1.png';
  if (kind === 'orangewhite') document.getElementById('character-reference').href = '美术审核/新增五猫候选-v1.png';
  if (kind === 'white') document.getElementById('character-reference').href = '美术审核/蓝金与纯白故障分镜-v1.png';
  document.getElementById('art-comparison').href = newCoat ? `review/新花色比对.html?cat=${kind}` : kind === 'xiaokui' ? 'output/playwright/xiaokui/compare.html' : 'review/逐只比对.html';
}
actionOptions.forEach(action => {
  const button = document.createElement('button');
  button.textContent = action.label; button.type = 'button';
  button.addEventListener('click', () => selectAction(action.kind));
  actions.append(button);
});
labels.forEach((label, i) => {
  const button = document.createElement('button');
  button.textContent = label; button.type = 'button';
  button.addEventListener('click', () => selectCat(i - 1));
  choices.append(button);
});
selectCat(selected);
selectAction(new URLSearchParams(window.location.search).get('action'));
document.getElementById('pause').addEventListener('click', event => {
  reviewPlaying = !reviewPlaying;
  event.target.textContent = reviewPlaying ? '暂停动作' : '继续动作';
});
document.addEventListener('visibilitychange', () => { reviewLast = performance.now(); });
function reviewReaction() {
  if (selectedAction === 'walk') return { puff: 0, hiss: 0 };
  const phase = reviewTime % 3.2;
  const ease = FactoryTimeline.ease;
  return {
    puff: 0,
    hiss: selectedAction === 'hiss' ? ease((phase - 0.65) / 0.2) * (1 - ease((phase - 1.6) / 0.35)) : 0
  };
}
function reviewFrame(now) {
  if (reviewPlaying && !document.hidden) reviewTime += (now - reviewLast) / 1000;
  reviewLast = now;
  reviewCtx.fillStyle = '#0E3CF1'; reviewCtx.fillRect(0, 0, 900, 440);
  reviewCtx.strokeStyle = '#5F80F6'; reviewCtx.lineWidth = 1;
  reviewCtx.beginPath(); reviewCtx.moveTo(40, 342); reviewCtx.lineTo(860, 342); reviewCtx.stroke();
  const state = { x: reviewTime * 60, index: 0, age: 5.4, walking: 0, coat: selected < 0 ? 0 : 1, tailLift: selected < 0 ? 0 : 1, recipe: selected < 0 ? whiteRecipe : FactoryTimeline.recipes[selected] };
  CatArt.draw(reviewCtx, state, reviewTime, { x: 229, y: 341, scale: 1.75, noBlink: true });
  CatArt.draw(reviewCtx, { ...state, walking: selectedAction === 'walk' ? 1 : 0, reaction: reviewReaction() }, reviewTime, { x: 678, y: 341, scale: 1.75, noBlink: true });
  requestAnimationFrame(reviewFrame);
}
requestAnimationFrame(reviewFrame);
