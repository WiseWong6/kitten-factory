"""Build the approved game into an isolated, reproducible offline mini-tool ZIP."""
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / '游戏'
ADAPT = GAME / '小工具适配'
OUT = ROOT / '交付文件' / '小工具游戏预览'
ZIP = ROOT / '交付文件' / '小猫加工厂-游戏小工具.zip'

def replace(text, old, new, count=1):
    assert text.count(old) == count, ('源代码已变化，请复核适配', old, text.count(old))
    return text.replace(old, new)

files = {}
for name in ['index.html', 'style.css', 'rules.js', 'custom-art.js', 'storage.js', 'collection-motion.js', 'game.js']:
    files[name] = (GAME / name).read_text()
for name in ['timeline.js', 'cat.js', 'sound.js', 'assets/audio/clips.js']:
    files[name] = (ROOT / name).read_text()
files['assets/coffee-bean.png'] = (ROOT / 'assets/coffee-bean.png').read_bytes()
files['index.html'] = files['index.html'].replace('src="../', 'src="')
files['index.html'] = replace(files['index.html'], '<script src="timeline.js">', '<script src="compat.js"></script><script src="timeline.js">')
files['compat.js'] = (ADAPT / 'compat.js').read_text()
# Reuse the existing rounded-path implementation, without the animation lifecycle.
runtime = (ROOT / '小工具适配/runtime.js').read_text()
files['compat.js'] += '\n' + runtime[runtime.index('function roundedPath('):runtime.index('function sizeCanvas(')]

text = files['timeline.js']
text = replace(text, 'Object.fromEntries([', 'fromPairs([')
text = replace(text, '  const voices =', '  function fromPairs(entries) { return entries.reduce((out, pair) => { out[pair[0]] = pair[1]; return out; }, {}); }\n  const voices =')
text = replace(text, 'recipe?.kind', '(recipe && recipe.kind)')
text = replace(text, 'BEAN_BATCH.flatMap(', 'BEAN_BATCH.map(')
text = replace(text, '    });\n  }\n  function refillBeans', '    }).reduce((all, part) => all.concat(part), []);\n  }\n  function refillBeans')
files['timeline.js'] = text

text = files['cat.js']
for member in ['recipe.kind', 'reaction.puff', 'reaction.hiss', 'reaction.meow']:
    obj, prop = member.split('.')
    text = replace(text, 'state.' + obj + '?.' + prop, '(state.' + obj + ' && state.' + member + ')')
text = replace(text, '    const silhouette = new Path2D();\n    for (const contour of m.contours) silhouette.addPath(pathOf(contour));', "    const silhouette = new Path2D(m.contours.map(contour => contour.map(c => c.join(' ')).join(' ')).join(' '));")
for name, fallback, count in [('x', 'state.x', 1), ('y', '844', 1), ('scale', '0.93', 2)]:
    text = replace(text, 'options.' + name + ' ?? ' + fallback, '(options.' + name + ' != null ? options.' + name + ' : ' + fallback + ')', count)
files['cat.js'] = text

# The game owns timing and controls; carry over only the shared drawing functions.
text = (ROOT / 'scene.js').read_text()
text = "'use strict';\nconst F=FactoryTimeline,BLUE='#0E3CF1',NAVY='#172356',WHITE='#FFFFFF',ACCENT='#3D66E2',TAU=Math.PI*2;\nlet ctx,coffeeBeanArt;\n" + text[text.index('function shape('):]
start = text.index('function renderScene(')
end = text.index('const beanArtCache', start)
text = text[:start] + text[end:]
text = text.replace('ctx.roundRect(', 'roundedPath(ctx, ')
text = replace(text, "  paint.filter = 'grayscale(1) brightness(1.55)';", "  const hasFilter = typeof paint.filter === 'string';\n  if (hasFilter) paint.filter = 'grayscale(1) brightness(1.55)';")
text = replace(text, "  paint.filter = 'none';", "  if (hasFilter) paint.filter = 'none';")
files['scene.js'] = text
files['rules.js'] = replace(files['rules.js'], 'parts.flatMap(p=>Array(p.amount).fill(p.id))', 'parts.reduce((all,p)=>all.concat(Array(p.amount).fill(p.id)),[])')
text = files['game.js'].replace('Object.fromEntries(', 'MiniCompat.fromEntries(')
text = re.sub(r"(\$\('[^']+'\)|holder|container)\.replaceChildren\(\)", r'MiniCompat.clear(\1)', text)
text = replace(text, 'parts.map(p=>({...p}))', 'parts.map(p=>Object.assign({},p))')
text = text.replace("$('game-controls').inert=true", "MiniCompat.blockControls($('game-controls'),true)").replace("$('game-controls').inert=false", "MiniCompat.blockControls($('game-controls'),false)")
start = text.index('      if(window.xhs){', text.index("$('save-card').addEventListener"))
end = text.index('\n    }catch(e)', start)
text = text[:start] + """      if(!mini||typeof mini.writeTempFile!=='function'||typeof mini.saveImageToPhotosAlbum!=='function')throw new Error('请在小红书小工具中保存猫卡');
      const result=await mini.writeTempFile({data});
      if(!result||typeof result.filePath!=='string'||!result.filePath)throw new Error('猫卡图片未生成，请重试');
      await mini.saveImageToPhotosAlbum({filePath:result.filePath});$('save-status').textContent='猫卡已保存到相册';""" + text[end:]
text = replace(text, "(e&&e.message||'请检查相册权限。')", "(e&&(e.errMsg||e.message)||'请检查相册权限。')")
text = replace(text, '    const w=Math.max(1,Math.min(580,window.innerWidth-24,Math.max(320,window.innerHeight-170)*.75));', """    const bodyStyle=window.getComputedStyle(document.body);
    const horizontal=(parseFloat(bodyStyle.paddingLeft)||0)+(parseFloat(bodyStyle.paddingRight)||0);
    const vertical=(parseFloat(bodyStyle.paddingTop)||0)+(parseFloat(bodyStyle.paddingBottom)||0);
    const controlsSpace=window.innerWidth<=720?112:74;
    const w=Math.max(1,Math.min(580,window.innerWidth-horizontal,Math.max(1,window.innerHeight-vertical-controlsSpace)*.75));""")
text = replace(text, "    if(!dragging)$('progress').value=String(game.time);", "    if(!dragging)$('progress').value=String(game.time);\n    $('progress').style.setProperty('--progress',game.time/8*100+'%');")
files['game.js'] = text

css = files['style.css']
css = css.replace(':focus-visible', ':focus').replace('inset:0;', 'top:0;right:0;bottom:0;left:0;')
css = re.sub(r'aspect-ratio:[^;}]+;?', '', css)
css = re.sub(r'@supports\(height:100dvh\)\{\.card-sheet\{[^{}]*\}\}', '', css)
css = re.sub(r'(?:max-)?width:min\([^;{}]*\);?', '', css)
css = css.replace('min-height:100dvh', 'min-height:100vh')
css = re.sub(r'(?<![-\w])gap:', 'grid-gap:', css)
css = re.sub(r'\{([^{}]*)\}', lambda m:'{'+(re.sub(r'grid-gap:[^;]+;?', '', m[1]) if 'display:flex' in m[1] else m[1])+'}', css)
css = re.sub(r'#([0-9a-fA-F]{6})([0-9a-fA-F]{2})(?![0-9a-fA-F])', lambda m:'rgba('+','.join(str(int(m[1][i:i+2],16)) for i in [0,2,4])+','+str(round(int(m[2],16)/255,4))+')', css)
for side in ['top','bottom']:
    css = css.replace(f'env(safe-area-inset-{side},0px)', f'var(--mini-safe-{side})')
css += """
/* Chrome 61 baseline: fixed design scales as a unit; flex spacing uses margins. */
:root{--mini-safe-top:var(--safe-area-inset-top,0px);--mini-safe-bottom:var(--safe-area-inset-bottom,0px)}
@supports(padding:env(safe-area-inset-top)){:root{--mini-safe-top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));--mini-safe-bottom:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))}}
body{-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.batch-colors>*+*{margin-left:24px}.batch-colors i{margin-bottom:10px}
.recipe-row>*+*{margin-left:10px}.recipe-colors span{margin-right:10px;margin-bottom:6px}.recipe-colors{margin-bottom:-6px}
#card-close{display:flex;align-items:center;justify-content:center}
.collection-sheet,.card-sheet{min-height:0;-webkit-overflow-scrolling:touch}
.recipe-row>div,.mix-actions>*{min-width:0}
.playback input{background:transparent;accent-color:auto;-webkit-appearance:none;appearance:none}
.playback input::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,#f3c680 0%,#f3c680 var(--progress,0%),rgba(255,255,255,.22) var(--progress,0%),rgba(255,255,255,.22) 100%)}
.playback input::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#fff2d9}
"""
files['style.css'] = css
# Fail rather than silently carry over stale files into a release.
OUT.mkdir(parents=True, exist_ok=True)
existing = {p.relative_to(OUT).as_posix() for p in OUT.rglob('*') if p.is_file()}
assert existing <= set(files), ('交付目录包含额外文件，请检查', existing-set(files))
for name, data in files.items():
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data if isinstance(data, bytes) else data.encode('utf-8'))
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2026, 9, 23, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (OUT / name).read_bytes())
print(ZIP)
print('文件数:', len(files), 'ZIP 字节数:', ZIP.stat().st_size)
