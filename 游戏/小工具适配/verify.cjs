'use strict';
// Use Node's bundled parser: no installed dependencies or browser needed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const acorn=require('internal/deps/acorn/acorn/dist/acorn');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'交付文件/小工具游戏预览');
const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script src="([^"]+)"/g),m=>m[1]);
assert.equal(new Set(scripts).size,scripts.length);
const forbidden=new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','RTCPeerConnection','Worker','SharedWorker','WebAssembly','eval','Function','requestFullscreen','webkitRequestFullscreen','serviceWorker','geolocation','clipboard','getBattery','getDisplayMedia','enumerateDevices','Accelerometer','Gyroscope','Magnetometer','DeviceMotionEvent','DeviceOrientationEvent','PaymentRequest']);
for(const name of scripts){
 const text=fs.readFileSync(path.join(out,name),'utf8');
 const ast=acorn.parse(text,{ecmaVersion:2017,sourceType:'script'});
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='Identifier')assert.ok(!forbidden.has(node.name),name+': '+node.name);
  if(node.type==='MemberExpression'){
   assert.notEqual(node.property.name,'download',name);
   if(node.object.name==='window')assert.ok(!['open','prompt'].includes(node.property.name));
  }
  for(const key of Object.keys(node))if(key!=='start'&&key!=='end'){
   if(Array.isArray(node[key]))node[key].forEach(walk);else walk(node[key]);
  }
 }
 walk(ast);
 assert.ok(!/\.replaceChildren\(|\.flatMap\(|Object\.fromEntries\(|\.roundRect\(|\.addPath\(/.test(text),name);
}
assert.ok(!/<script(?![^>]*src=)|\son\w+\s*=|<iframe|<object|<base|type="module"|\bdownload\b|javascript:/i.test(html));
for(const [,ref]of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 assert.ok(!/^(?:[a-z]+:|\/|\.\.\/)/i.test(ref));assert.ok(fs.existsSync(path.join(out,ref)),ref);
}
assert.ok(html.includes('Created by @歪斯Wise'));
assert.ok(scripts.indexOf('compat.js')<scripts.indexOf('game.js'));
const css=fs.readFileSync(path.join(out,'style.css'),'utf8');
assert.ok(!/(?:^|[;{])gap:|inset:|aspect-ratio:|#[\da-f]{8}\b|(?:^|[;{])(?:width|max-width):min\(/i.test(css));
for(const block of css.matchAll(/\{([^{}]*)\}/g))if(block[1].includes('display:flex'))assert.ok(!block[1].includes('grid-gap:'));
assert.ok(css.includes('grid-gap:8px 10px'));
assert.ok(css.includes('.batch-colors>*+*{margin-left:24px}'));
console.log('通过：ES2017 语法、禁用能力、离线引用、署名、加载顺序与旧内核样式回退。');
const beforeF=require(path.join(root,'timeline.js')),afterF=require(path.join(out,'timeline.js'));
const beforeCat=require(path.join(root,'cat.js')),afterCat=require(path.join(out,'cat.js'));
for(let i=0;i<=2400;i++)assert.deepEqual(afterF.stateAt(i/20),beforeF.stateAt(i/20));
for(let i=0;i<15;i++)for(const phase of [0,.8,1.6,3.2,4.5,5.3,6.4,7.8]){
 const t=i*8+phase;for(const cat of beforeF.stateAt(t).cats)assert.equal(JSON.stringify(afterCat.model(cat,t)),JSON.stringify(beforeCat.model(cat,t)));
}
const beforeR=require(path.join(root,'游戏/rules.js')),afterR=require(path.join(out,'rules.js'));
for(const formula of beforeR.formulas){const beans=beforeR.expand(beforeR.portions(formula.counts));assert.deepEqual(afterR.make(beans,42,afterF.recipes,1000),beforeR.make(beans,42,beforeF.recipes,1000));}
for(let i=1;i<=120;i++){
 const beans=beforeR.expand(beforeR.portions({purple:6,cream:4,blue:2}));
 assert.deepEqual(afterR.make(beans,i,afterF.recipes,1000),beforeR.make(beans,i,beforeF.recipes,1000));
}
console.log('通过：打包前后 2401 个动画时刻、十五种猫模型与配方、120 只自创猫一致。');
const host={};host.window=host;vm.createContext(host);vm.runInContext(fs.readFileSync(path.join(out,'assets/audio/clips.js'),'utf8'),host);
let total=0,biggest=0;
for(const clip of Object.values(host.FactoryAudioClips)){
 const size=Buffer.from(clip.data,'base64').length;assert.equal(size,clip.frames*2);assert.ok(size<=1024*1024);total+=size;biggest=Math.max(biggest,size);
}
console.log(`通过：音效均为本地短 PCM，按点击开启；合计 ${total} 字节，单条最大 ${biggest} 字节。`);
console.log('以上为静态与模拟检查；Chrome 61 CSS、小红书真机、相册权限和性能未实测。');
