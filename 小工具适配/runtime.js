/* Only the lifecycle previously supplied by p5; no drawing or timing rules changed. */
'use strict';
function roundedPath(c, x, y, w, h, radius) {
  const values = Array.isArray(radius) ? radius : [radius];
  const corners = values.length === 1 ? [values[0], values[0], values[0], values[0]]
    : values.length === 2 ? [values[0], values[1], values[0], values[1]]
    : values.length === 3 ? [values[0], values[1], values[2], values[1]] : values;
  const [tl, tr, br, bl] = corners.map(r => Math.max(0, Math.min(r, w / 2, h / 2)));
  c.moveTo(x + tl, y); c.lineTo(x + w - tr, y);
  c.arcTo(x + w, y, x + w, y + tr, tr); c.lineTo(x + w, y + h - br);
  c.arcTo(x + w, y + h, x + w - br, y + h, br); c.lineTo(x + bl, y + h);
  c.arcTo(x, y + h, x, y + h - bl, bl); c.lineTo(x, y + tl);
  c.arcTo(x, y, x + tl, y, tl); c.closePath();
}
function sizeCanvas(scale) {
  const canvas = document.getElementById('factory-canvas');
  if (!canvas) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(900 * scale * ratio));
  const h = Math.max(1, Math.round(1200 * scale * ratio));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(w / 900, 0, 0, h / 1200, 0, 0);
}
(function () {
  let frame = null;
  function tick() { frame = null; if (document.hidden) return; draw(); frame = requestAnimationFrame(tick); }
  function resume() {
    previousTime = performance.now();
    if (document.hidden) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; sound && sound.reset();
    } else if (frame === null) frame = requestAnimationFrame(tick);
  }
  function start() {
    setup();
    window.addEventListener('resize', windowResized);
    window.addEventListener('keydown', event => { if (keyPressed(event) === false) event.preventDefault(); });
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; sound && sound.reset();
    });
    window.addEventListener('pageshow', resume);
    resume();
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
