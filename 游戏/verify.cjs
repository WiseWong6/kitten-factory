'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),F=require('../timeline.js'),R=require('./rules.js');
let checks=0;function check(label,fn){fn();checks++;console.log('通过：'+label);}
const customBeans=['purple','purple','purple','purple','purple','purple','cream','cream','cream','cream','blue','blue'];
const flatten=f=>Object.entries(f.counts).flatMap(([id,n])=>Array(n).fill(id));
check('十五种配方互不冲突且投入顺序不影响命中',()=>{
 assert.equal(new Set(R.formulas.map(f=>R.signature(f.counts))).size,15);
 for(const f of R.formulas){const b=flatten(f),r=R.make(b,42,F.recipes,1000);assert.equal(b.length,12);assert.equal(r.recipe.kind,f.kind);assert.ok(r.known);assert.equal(R.make(b.reverse(),42,F.recipes,1000).id,r.id);}
});
check('豆数、最多三色、未知颜色和无效配方限制',()=>{
 assert.equal(R.add(Array(12).fill('white'),'white').length,12);
 assert.deepEqual(R.add(['white','purple','blue'],'orange'),['white','purple','blue']);
 assert.equal(R.check(['no'],false),false);assert.throws(()=>R.make(['white'],1,F.recipes,1000));
});
check('自创猫随机结果冻结、配色来自输入且同次重画不变',()=>{
 const results=[];for(let seed=1;seed<=120;seed++){const r=R.make(customBeans,(seed*2654435761)>>>0,F.recipes,1000);assert.equal(r.known,false);assert.equal(r.recipe.base,'#AE93CD');assert.equal(r.recipe.beanColors.length,12);assert.deepEqual(r,R.make(customBeans,(seed*2654435761)>>>0,F.recipes,1000));results.push(r.recipe.pattern+':'+r.recipe.mask);}
 assert.ok(new Set(results).size>=8);
 const r=R.make(customBeans,42,F.recipes,1000);assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
});
check('已有猫累计次数，自创猫分别保存',()=>{
 const a=R.make(flatten(R.formulas[0]),1,F.recipes,1000),b=R.make(customBeans,2,F.recipes,1000),c=R.make(customBeans,3,F.recipes,1000);
 let list=R.collect([],a);list=R.collect(list,a);list=R.collect(list,b);list=R.collect(list,c);assert.equal(list.length,3);assert.equal(list[0].count,2);
});
check('比例匹配：全橘、旧橘配方、轻微偏差及银渐层区间',()=>{
 const from=value=>R.expand(R.portions(value));
 for(const f of R.formulas){const result=R.make(from(f.counts),9,F.recipes,1000);assert.equal(result.recipe.kind,f.kind);assert.equal(result.recipe.beanColors.length,12);assert.equal(new Set(result.recipe.beanColors).size,Object.keys(f.counts).length);}
 assert.equal(R.make(from({orange:1}),1,F.recipes,1000).recipe.kind,'ginger');
 assert.equal(R.make(from({orange:9,cream:3}),1,F.recipes,1000).recipe.kind,'ginger');
 assert.equal(R.make(from({white:48,orange:26,black:26}),1,F.recipes,1000).recipe.kind,'calico');
 assert.equal(R.make(from({white:50,orange:49,black:1}),1,F.recipes,1000).known,false);
 assert.equal(R.make(from({silver:22,white:78}),1,F.recipes,1000).recipe.kind,'silvershaded');
 assert.equal(R.make(from({silver:60,white:40}),1,F.recipes,1000).recipe.kind,'silver');
 assert.equal(R.make(from({silver:40,white:60}),1,F.recipes,1000).known,false);
 const legacy=R.make(Array(12).fill('orange'),1,F.recipes,1000,1);assert.equal(legacy.known,false);assert.equal(R.make(legacy.beans,legacy.seed,F.recipes,legacy.createdAt,1).id,legacy.id);
 for(let n=1;n<=3;n++){const parts=R.portions(Object.fromEntries(R.palette.slice(0,n).map(p=>[p.id,1])));assert.equal(R.expand(parts).length,100);}
});
function target(extra={}){
 const handlers={},classes=new Set();
 const obj=Object.assign({children:[],hidden:false,disabled:false,value:'',textContent:'',isConnected:true,attributes:{},
 style:{setProperty(k,v){this[k]=v;}},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){if(on===undefined)on=!classes.has(k);on?classes.add(k):classes.delete(k);}},
 addEventListener(k,fn){(handlers[k]||(handlers[k]=[])).push(fn);},
 fire(k,e={}){for(const fn of handlers[k]||[])fn(Object.assign({target:this,preventDefault(){},key:''},e));},
 click(){if(!this.disabled)this.fire('click');},append(...children){children.forEach(c=>this.appendChild(c));},
 appendChild(child){this.children.push(child);child.parentNode=this;return child;},replaceChildren(...children){this.children=[];this.append(...children);},
 setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},
 querySelectorAll(selector){let result=[];for(const c of this.children){if(c.tagName==='BUTTON'&&(!selector.includes(':disabled')||!c.disabled))result.push(c);if(c.querySelectorAll)result=result.concat(c.querySelectorAll(selector));}return result;},
 querySelector(s){return this.querySelectorAll(s)[0]||null;},closest(){return null;},contains(n){return n===this||this.children.some(c=>c.contains&&c.contains(n));},
 getBoundingClientRect(){return {left:0,right:375,top:600,bottom:680,width:375,height:80};},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
 },extra);return obj;
}
function fixture(options={}){
 let clock=0,id=0,seed=1,calls=0,downloads=0;
 const frames=new Map(),contexts=[],local=options.local||new Map();
 class FakePath{constructor(d=''){assert.ok(!/NaN|Infinity|undefined/.test(d));}addPath(){}}
 function canvas(){
  let depth=0;
  const c=target({tagName:'CANVAS',width:900,height:1200,toDataURL:()=> 'data:image/png;base64,aGVsbG8='});
  const ctx=new Proxy({canvas:c},{get(o,k){if(k in o)return o[k];if(k==='depth')return depth;if(k==='save')return()=>{depth++;};if(k==='restore')return()=>{assert.ok(depth>0,'画布恢复不能越界');depth--;};if(k==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>{calls++;for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),'无效坐标 '+k);};}});
  c.getContext=()=>ctx;contexts.push(ctx);return c;
 }
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),els={};
 for(const [,tag,attrs,name] of html.matchAll(/<(\w+)([^>]*?)\bid="([^"]+)"[^>]*>/g))els[name]=tag==='canvas'?canvas():target({tagName:tag.toUpperCase(),clientWidth:375});
 els['coffee-bean-art'].complete=true;els['coffee-bean-art'].naturalWidth=1254;
 const doc=target({hidden:false,readyState:'complete',activeElement:null,body:target(),getElementById:n=>els[n]||null,
 createElement(tag){if(tag==='canvas')return canvas();const el=target({tagName:tag.toUpperCase()});el.focus=()=>doc.activeElement=el;if(tag==='a')el.click=()=>{downloads++;};return el;},
 createTextNode:text=>({textContent:text})});
 Object.values(els).forEach(el=>{el.focus=()=>doc.activeElement=el;});
 const host=target({document:doc,Path2D:FakePath,URLSearchParams,Blob,console,
 performance:{now:()=>clock},devicePixelRatio:1,innerWidth:375,innerHeight:812,location:{search:''},
 localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem(k,v){if(options.failStorage)throw Error('quota');local.set(k,v);},removeItem:k=>local.delete(k)},
 crypto:{getRandomValues(array){array[0]=seed++;return array;}},
 matchMedia:()=>({matches:false}),getComputedStyle:()=>({paddingBottom:'0px'}),
 requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i),
 setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},atob:s=>Buffer.from(s,'base64').toString('binary'),
 xhs:options.xhs});host.window=host;
 vm.createContext(host);
 for(const [,src]of html.matchAll(/<script src="([^"]+)"/g)){
   const file=path.resolve(__dirname,src);assert.ok(fs.existsSync(file));vm.runInContext(fs.readFileSync(file,'utf8'),host,{filename:src});
 }
 const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
 function step(ms){clock+=ms;const pending=Array.from(frames.values());frames.clear();pending.forEach(fn=>fn(clock));}
 const view=()=>host.CatGameDebug.snapshot();
 function addColor(id){const at=R.palette.findIndex(p=>p.id===id);els.palette.children[at].click();}
 return{host,els,doc,step,view,flush,local,contexts,frames,addColor,downloads:()=>downloads,calls:()=>calls};
}
(async()=>{
 const mix=fixture();await mix.flush();
 mix.addColor('orange');assert.equal(mix.els.start.disabled,false);assert.equal(mix.view().beans.length,100);mix.addColor('orange');assert.equal(mix.view().mix.length,1);assert.equal(mix.view().history.length,1);
 mix.els.start.click();assert.equal(mix.view().mode,'loading');mix.step(300);mix.doc.hidden=true;mix.doc.fire('visibilitychange');mix.step(10000);mix.doc.hidden=false;mix.doc.fire('visibilitychange');mix.step(100);assert.equal(mix.view().mode,'loading');mix.step(1200);assert.equal(mix.view().batch.recipe.kind,'ginger');mix.step(8000);await mix.flush();mix.els['card-next'].click();
 mix.addColor('white');mix.addColor('orange');mix.addColor('black');mix.addColor('purple');assert.equal(mix.view().mix.length,3);assert.equal(mix.view().mix[0].amount,34);
 let bar=mix.els['ratio-controls'].children[1],handle=bar.children[3];handle.fire('pointerdown',{pointerId:1});handle.fire('pointermove',{clientX:187.5});handle.fire('pointerup');assert.equal(mix.view().mix[0].amount,50);assert.equal(mix.view().beans.length,100);
 mix.els.undo.click();assert.equal(mix.view().mix[0].amount,34);
 bar=mix.els['ratio-controls'].children[1];handle=bar.children[3];handle.fire('keydown',{key:'End'});assert.equal(mix.view().mix[1].amount,1);handle.fire('keydown',{key:'Home'});assert.equal(mix.view().mix[0].amount,1);
 mix.els['ratio-controls'].children[0].children[1].children[1].click();assert.equal(mix.view().mix.length,2);assert.equal(mix.view().beans.length,100);
 mix.els.clear.click();assert.equal(mix.view().beans.length,0);assert.ok(mix.els.start.disabled);mix.els.undo.click();assert.equal(mix.view().mix.length,2);
 mix.els['recipes-open'].click();assert.equal(mix.view().modal,'recipes');assert.equal(mix.els['recipe-list'].children.length,15);
 for(let i=0;i<15;i++){
   if(i)mix.els['recipes-open'].click();mix.els['recipe-list'].children[i].children[1].click();assert.equal(mix.view().modal,null);assert.equal(R.make(mix.view().beans,1,F.recipes,1000).recipe.kind,R.formulas[i].kind);
 }
 mix.host.innerWidth=320;mix.host.innerHeight=568;mix.host.fire('resize');assert.ok(Math.abs(parseFloat(mix.els['factory-viewport'].style.height)/parseFloat(mix.els['game-shell'].style.width)-4/3)<1e-10);assert.ok(parseFloat(mix.els['game-shell'].style.width)<=296);
 const legacy=R.make(Array(12).fill('orange'),8,F.recipes,888,1);delete legacy.recipeVersion;
 const old=fixture({local:new Map([['cat-factory-game-v1',JSON.stringify({version:1,records:[legacy]})]])});await old.flush();assert.equal(old.view().records.length,1);assert.equal(old.view().records[0].id,legacy.id);assert.equal(old.view().records[0].recipe.kind,'custom');
 console.log('通过：选色两步制橘猫、重复点不累加、三色上限、拖动/键盘比例、删除/撤销、十五配方套用、3:4尺寸与旧收藏兼容。');checks++;
 const app=fixture();await app.flush();assert.ok(app.view().ready);
 app.els['try-recipe'].click();app.step(1400);assert.equal(app.els.start.disabled,false);app.els.start.click();app.els.start.click();assert.equal(app.view().mode,'loading');app.step(1200);assert.equal(app.view().mode,'making');assert.equal(app.view().batch.recipe.kind,'calico');
 app.step(2000);const when=app.view().time;app.els['collection-open'].click();app.step(2000);assert.equal(app.view().time,when);app.els['collection-close'].click();
 app.step(2000);app.els.progress.fire('pointerdown');app.els.progress.value='1.8';app.els.progress.fire('input');app.host.fire('pointerup');assert.equal(app.view().time,1.8);
 app.doc.hidden=true;app.doc.fire('visibilitychange');assert.equal(app.frames.size,0);app.step(50000);app.doc.hidden=false;app.doc.fire('visibilitychange');app.step(100);assert.ok(app.view().time<2);
 for(let i=0;i<70;i++)app.step(100);await app.flush();assert.equal(app.view().records.length,1);assert.equal(app.view().mode,'done');assert.equal(app.view().modal,'card');assert.equal(app.view().records[0].recipe.kind,'calico');
 app.els['save-card'].click();await app.flush();assert.equal(app.downloads(),1);assert.match(app.els['save-status'].textContent,/下载/);
 app.els['card-close'].click();app.els.replay.click();for(let i=0;i<81;i++)app.step(100);await app.flush();assert.equal(app.view().records.length,1);assert.equal(app.view().records[0].count,1);
 app.els['card-next'].click();assert.equal(app.view().mode,'mix');assert.equal(app.view().beans.length,0);assert.equal(app.view().modal,null);
 app.addColor('purple',6);app.addColor('cream',4);app.addColor('blue',2);app.step(800);app.els.start.click();app.step(1200);assert.ok(app.view().batch.recipe.custom);
 assert.equal(app.host.CatGameDebug.state().overload,0,'自创猫不能沿用小葵爆表');
 for(let i=0;i<81;i++)app.step(100);await app.flush();assert.equal(app.view().records.length,2);const custom=app.view().records[1];
 app.els['card-close'].click();app.els['collection-open'].click();assert.equal(app.els['puck-grid'].children.length,2);app.els['puck-grid'].children[1].click();assert.equal(app.view().card.id,custom.id);
 app.els['card-close'].click();assert.equal(app.view().modal,'collection');app.els['collection-close'].click();
 for(const c of app.contexts)assert.equal(c.depth,0);
 const restored=fixture({local:app.local});await restored.flush();assert.equal(JSON.stringify(restored.view().records),JSON.stringify(app.view().records));
 console.log('通过：配豆 → 三花 → 收藏 → 猫卡下载 → 重播不重复领取 → 新批自创猫 → 收藏查看 → 刷新恢复。');checks++;
 console.log('通过：收藏暂停恢复、进度拖动、后台不推进、自创猫无爆表与绘制状态平衡。');checks++;
 const failed=fixture({failStorage:true});await failed.flush();failed.els['try-recipe'].click();failed.step(1400);failed.els.start.click();failed.step(1200);failed.step(8000);await failed.flush();assert.equal(failed.view().records.length,1);assert.equal(failed.view().persistent,false);assert.equal(failed.view().modal,'card');
 console.log('通过：缓存失败仍能获得本次猫卡，并标记暂存。');checks++;
 // Paint all approved results and 120 generated coats, including all pattern/face combinations.
 for(const formula of R.formulas)app.host.CatGameDebug.drawCard(R.make(flatten(formula),9,F.recipes,1000));
 for(let seed=1;seed<=120;seed++)app.host.CatGameDebug.drawCard(R.make(customBeans,(seed*2654435761)>>>0,F.recipes,1000));
 for(const c of app.contexts)assert.equal(c.depth,0);
 console.log('通过：十五种已知猫与 120 个自创猫卡绘制，无无效数值或状态泄漏。');checks++;
 const many=Array.from({length:17},(_,i)=>R.make(customBeans,100+i,F.recipes,1000+i));
 const paged=fixture({local:new Map([['cat-factory-game-v1',JSON.stringify({version:1,records:many})]])});await paged.flush();paged.els['collection-open'].click();assert.equal(paged.els['puck-grid'].children.length,15);paged.els['next-page'].click();assert.equal(paged.els['puck-grid'].children.length,2);paged.els['puck-grid'].children[0].click();assert.equal(paged.view().card.id,many[15].id);paged.els['card-close'].click();assert.equal(paged.view().page,1);paged.els['prev-page'].click();assert.equal(paged.els['puck-grid'].children.length,15);
 console.log('通过：收藏超过十五只分页，点猫卡与返回保留页码。');checks++;
 // Native API contract, version gating, migration and saving to album.
 const native=new Map(),events=[];
 const api={async getStorage({key}){return {data:native.get(key)};},async setStorage({key,data}){native.set(key,JSON.parse(JSON.stringify(data)));},async removeStorage({key}){native.delete(key);},async writeTempFile(args){assert.deepEqual(Object.keys(args),['data']);assert.ok(args.data.startsWith('data:image/png;base64,'));events.push('temp');return {filePath:'local-card.png'};},async saveImageToPhotosAlbum(args){assert.deepEqual(Object.keys(args),['filePath']);assert.equal(args.filePath,'local-card.png');events.push('album');}};
 const nativeApp=fixture({local:new Map(app.local),xhs:{launchOptions:{miniToolEnv:{buildVersion:9462004}},miniTool:api}});await nativeApp.flush();assert.equal(nativeApp.view().records.length,2);assert.ok(native.has('cat-factory-game-v1'));assert.equal(nativeApp.local.has('cat-factory-game-v1'),false);
 nativeApp.els['collection-open'].click();nativeApp.els['puck-grid'].children[0].click();nativeApp.els['save-card'].click();await nativeApp.flush();assert.deepEqual(events,['temp','album']);assert.equal(nativeApp.downloads(),0);
 api.saveImageToPhotosAlbum=async()=>{throw {errMsg:'denied'};};nativeApp.els['save-card'].click();await nativeApp.flush();assert.match(nativeApp.els['save-status'].textContent,/重试/);assert.equal(nativeApp.els['save-card'].disabled,false);
 const low=fixture({local:app.local,xhs:{launchOptions:{miniToolEnv:{buildVersion:9459999}},miniTool:{getStorage(){throw Error('不应使用新版缓存');}}}});await low.flush();assert.equal(low.view().records.length,2);
 console.log('通过：新版缓存迁移、旧版降级、相册接口参数/顺序，以及拒绝权限后可重试。');checks++;
 console.log(`共 ${checks} 组游戏检查通过；未操作浏览器，视觉与真实下载/相册/音效由用户体验验收。`);
})().catch(e=>{console.error(e);process.exitCode=1;});
