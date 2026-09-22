"""仅用标准库生成离线小工具；原版动效文件不改动。"""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '交付文件' / '小工具动效预览'
ZIP = ROOT / '交付文件' / '小猫加工厂-动效小工具.zip'
OUT.mkdir(parents=True, exist_ok=True)

def replace(text, old, new, count=1):
    assert text.count(old) == count, ('源代码已变化，请复核适配', old, text.count(old))
    return text.replace(old, new)

def write(name, text):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')

html = (ROOT / 'index.html').read_text()
html = replace(html, 'initial-scale=1"', 'initial-scale=1, viewport-fit=cover"')
html = replace(html, '  <script src="vendor/p5.min.js"></script>\n', '')
html = replace(html, '  <script src="scene.js"></script>', '  <script src="scene.js"></script>\n  <script src="runtime.js"></script>')
html = replace(html, '    <button id="play-speed"', '    <button id="play-replay" type="button">重播</button>\n    <button id="play-speed"')
write('index.html', html.replace('音效关', '声音关'))

text = (ROOT / 'timeline.js').read_text()
text = replace(text, 'Object.fromEntries([', 'fromPairs([')
text = replace(text, '  const voices =', '  function fromPairs(entries) { return entries.reduce((result, pair) => { result[pair[0]] = pair[1]; return result; }, {}); }\n  const voices =')
text = replace(text, 'recipe?.kind', '(recipe && recipe.kind)')
text = replace(text, 'BEAN_BATCH.flatMap(', 'BEAN_BATCH.map(')
text = replace(text, '    });\n  }\n  function refillBeans', '    }).reduce((all, part) => all.concat(part), []);\n  }\n  function refillBeans')
write('timeline.js', text)

text = (ROOT / 'cat.js').read_text()
for member in ['recipe.kind', 'reaction.puff', 'reaction.hiss', 'reaction.meow']:
    obj, prop = member.split('.')
    text = replace(text, 'state.' + obj + '?.' + prop, '(state.' + obj + ' && state.' + member + ')')
text = replace(text, '    const silhouette = new Path2D();\n    for (const contour of m.contours) silhouette.addPath(pathOf(contour));', "    const silhouette = new Path2D(m.contours.map(contour => contour.map(c => c.join(' ')).join(' ')).join(' '));")
for name, fallback, count in [('x', 'state.x', 1), ('y', '844', 1), ('scale', '0.93', 2)]:
    text = replace(text, 'options.' + name + ' ?? ' + fallback, '(options.' + name + ' != null ? options.' + name + ' : ' + fallback + ')', count)
write('cat.js', text)

text = (ROOT / 'scene.js').read_text()
text = replace(text, '/* p5 owns the canvas and frame loop; Canvas paths keep the silhouettes and coat masks identical. */', '/* Offline mini-tool: native Canvas lifecycle; approved illustration paths are preserved. */')
text = replace(text, 'window.FactorySound?.create(F)', '(window.FactorySound ? window.FactorySound.create(F) : null)')
text = replace(text, 'let running = true;', "let running = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);")
start = text.index('  const canvas = createCanvas(900, 1200);')
end = text.index('  // Native <img>', start)
text = text[:start] + '''  const canvas = document.createElement('canvas');
  canvas.id = 'factory-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '十五只小猫的加工厂动效，纯蓝背景，三行猫脸粉饼。');
  document.getElementById('stage').appendChild(canvas);
  ctx = canvas.getContext('2d');
''' + text[end:]
text = replace(text, "event?.target?.closest?.('button, input, select, textarea, a, [contenteditable=\"true\"]')", "event && event.target && event.target.closest && event.target.closest('button, input, select, textarea, a, [contenteditable=\"true\"]')")
text = replace(text, "key === 'r' || key === 'R'", "event && (event.key === 'r' || event.key === 'R')")
text = text.replace('sound?.reset()', 'sound && sound.reset()').replace('sound?.sync(', 'sound && sound.sync(')
text = text.replace('ctx.roundRect(', 'roundedPath(ctx, ')
text = replace(text, "  paint.filter = 'grayscale(1) brightness(1.55)';", "  const hasFilter = typeof paint.filter === 'string';\n  if (hasFilter) paint.filter = 'grayscale(1) brightness(1.55)';")
text = replace(text, "  paint.filter = 'none';", "  if (hasFilter) paint.filter = 'none';")
text = replace(text, "  stage.style.height = `${1200 * scale}px`;", "  stage.style.height = `${1200 * scale}px`;\n  sizeCanvas(scale);")
text = replace(text, 'window.innerHeight - controlsSpace', "window.innerHeight - controlsSpace - (parseFloat(window.getComputedStyle(document.body).paddingTop) || 0)")
text = replace(text, "  const soundButton = document.getElementById('play-sound');", "  document.getElementById('play-replay').addEventListener('click', () => {\n    sound && sound.reset(); elapsed = initialTime; heldCycleEnd = false; running = true;\n    previousTime = performance.now(); renderScene(elapsed); updatePlaybackControls();\n  });\n  const soundButton = document.getElementById('play-sound');")
text = replace(text, "    soundButton.disabled = false;", "    soundButton.disabled = false;\n    if (!enabled) soundButton.title = '声音未开启，可再次点击尝试';")
text = text.replace('音效开', '声音开').replace('音效关', '声音关')
text = replace(text, '`${clockText(position)} / ${clockText(playbackCycle)}`', '`${clockText(position / playbackRate)} / ${clockText(playbackCycle / playbackRate)}`')
# Pointer Events on baseline Chrome; explicit touch fallback for older iOS WebViews.
text = replace(text, "  progressInput.addEventListener('pointerdown', event => {", "  const startDrag = event => {")
text = replace(text, "  });\n  progressInput.addEventListener('input',", "  };\n  progressInput.addEventListener('pointerdown', startDrag);\n  if (!window.PointerEvent) progressInput.addEventListener('touchstart', startDrag, { passive: true });\n  progressInput.addEventListener('input',")
text = replace(text, "['pointerup', 'pointercancel', 'blur']", "['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'blur']")
write('scene.js', text)
for name in ['runtime.js', 'style.css']:
    write(name, (ROOT / '小工具适配' / name).read_text())
for name in ['sound.js', 'assets/audio/clips.js', 'assets/coffee-bean.png']:
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / name, target)
expected = {'index.html', 'style.css', 'runtime.js', 'scene.js', 'timeline.js', 'cat.js', 'sound.js', 'assets/audio/clips.js', 'assets/coffee-bean.png'}
actual = {f.relative_to(OUT).as_posix() for f in OUT.rglob('*') if f.is_file()}
assert actual == expected, ('产物目录含非白名单文件，请人工检查', actual - expected)
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(expected):
        # Reproducible metadata; no host absolute paths or source drafts.
        info = zipfile.ZipInfo(name, (2026, 9, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (OUT / name).read_bytes())
print(str(ZIP))
print('文件数:', len(expected), 'ZIP 字节数:', ZIP.stat().st_size)
