/* The game owns input/state. Approved scene functions supply the machine and character art. */
(function(){
  'use strict';
  const R=CatGameRules, M=CatCollectionMotion, $=id=>document.getElementById(id);
  const canvas=$('factory-art'), paint=canvas.getContext('2d');
  const game={mix:[],history:[],beans:[],added:[],mode:'mix',time:0,playing:false,rate:1,batch:null,awarded:false,
    records:[],page:0,modal:null,card:null,cardFrom:null,restorePlay:false,ready:false,persistent:true,saving:false};
  const white=F.recipes.find(r=>r.kind==='white');
  const audioTimeline={recipes:[white],mod:F.mod,voiceFor:r=>F.voiceFor(r.custom?{kind:'bicolor'}:r),xiaokuiVoice:F.xiaokuiVoice,manualBeans:true,collectAt:M.arrival};
  const gameAudio=FactorySound.create(audioTimeline);
  let last=performance.now(), now=last, frame=null, toastTimer, lastFocus=null,dragging=false,wasPlaying=false;
  coffeeBeanArt=$('coffee-bean-art');ctx=paint;
  const beanSlots=F.hopperBeans(0,true);
  const paletteButtons=[];
  const uid=()=>window.crypto&&window.crypto.getRandomValues?window.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
  function say(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
  function fit(){
    // All game UI shares a 450 × 600 design frame, including on narrow screens.
    const w=Math.max(1,Math.min(580,window.innerWidth-24,Math.max(320,window.innerHeight-170)*.75));
    $('game-shell').style.width=w+'px';$('factory-viewport').style.height=w*4/3+'px';
    $('factory').style.transform='scale('+(w/450)+')';
    const d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*d);canvas.height=Math.round(canvas.width*4/3);drawFrame();
  }
  function isSettled(){return !game.added.length || now-game.added[game.added.length-1]>700;}
  function remember(){game.history.push(JSON.parse(JSON.stringify(game.mix)));if(game.history.length>30)game.history.shift();}
  function setMix(parts,save=true){
    if(save)remember();game.mix=parts;game.beans=R.expand(parts);game.added=[];renderRatios();updateUI();wake();
  }
  function adding(id){
    if(!game.ready||game.mode!=='mix')return;
    if(game.mix.some(p=>p.id===id)){say('已选中，可拖动配色条调比例，或点颜色旁的 × 移除');return;}
    if(game.mix.length>=3){say('最多选三种颜色，可先移除一种');return;}
    setMix(R.portions(Object.fromEntries(game.mix.map(p=>[p.id,1]).concat([[id,1]]))));
  }
  function renderRatios(){
    const holder=$('ratio-controls');holder.replaceChildren();
    if(!game.mix.length)return;
    const labels=document.createElement('div');labels.className='ratio-labels';
    const bar=document.createElement('div');bar.className='ratio-bar';
    const segments=[],texts=[],handles=[];
    game.mix.forEach(part=>{
      const color=R.palette.find(p=>p.id===part.id),label=document.createElement('span'),text=document.createElement('span'),remove=document.createElement('button');
      label.append(text,remove);remove.textContent='×';remove.setAttribute('aria-label','移除'+color.name);
      remove.addEventListener('click',()=>{if(game.mode==='mix')setMix(R.portions(Object.fromEntries(game.mix.filter(p=>p.id!==part.id).map(p=>[p.id,p.amount]))));});
      labels.appendChild(label);texts.push(text);
      const segment=document.createElement('span');segment.style.background=color.hex;bar.appendChild(segment);segments.push(segment);
    });
    function refresh(){
      let edge=0;game.mix.forEach((part,i)=>{texts[i].textContent=R.palette.find(p=>p.id===part.id).name+' '+part.amount+'%';segments[i].style.width=part.amount+'%';edge+=part.amount;if(handles[i]){handles[i].setAttribute('aria-valuemin',String(edge-part.amount+1));handles[i].setAttribute('aria-valuemax',String(edge+game.mix[i+1].amount-1));handles[i].style.left=edge+'%';handles[i].setAttribute('aria-valuenow',String(edge));handles[i].setAttribute('aria-valuetext',game.mix.map(p=>R.palette.find(c=>c.id===p.id).name+' '+p.amount+'%').join('，'));}});
    }
    function move(i,at){
      if(game.mode!=='mix')return;
      const before=game.mix.slice(0,i).reduce((n,p)=>n+p.amount,0),sum=game.mix[i].amount+game.mix[i+1].amount;
      const value=Math.max(1,Math.min(sum-1,Math.round(at)-before));game.mix[i].amount=value;game.mix[i+1].amount=sum-value;
      game.beans=R.expand(game.mix);refresh();updateUI();wake();
    }
    game.mix.slice(0,-1).forEach((part,i)=>{
      const handle=document.createElement('button');handle.className='ratio-handle';handle.setAttribute('role','slider');handle.setAttribute('aria-label','调整'+R.palette.find(p=>p.id===part.id).name+'与下一种颜色的比例');handle.setAttribute('aria-valuemin','1');handle.setAttribute('aria-valuemax','99');
      let active=false;
      const at=e=>{const rect=bar.getBoundingClientRect();move(i,(e.clientX-rect.left)/rect.width*100);};
      handle.addEventListener('pointerdown',e=>{if(game.mode!=='mix')return;e.preventDefault();remember();active=true;if(handle.setPointerCapture)handle.setPointerCapture(e.pointerId);});
      handle.addEventListener('pointermove',e=>{if(active)at(e);});
      ['pointerup','pointercancel','lostpointercapture','blur'].forEach(type=>handle.addEventListener(type,()=>active=false));
      handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();remember();const edge=game.mix.slice(0,i+1).reduce((n,p)=>n+p.amount,0);move(i,e.key==='Home'?0:e.key==='End'?100:edge+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?5:1));});
      bar.appendChild(handle);handles.push(handle);
    });
    holder.append(labels,bar);refresh();
  }
  R.palette.forEach(color=>{
    const button=document.createElement('button');button.className='swatch';button.style.setProperty('--bean',color.hex);
    button.setAttribute('aria-label','选择'+color.name+'色豆');button.setAttribute('aria-pressed','false');
    const circle=document.createElement('span');circle.className='color';
    const name=document.createElement('small');name.textContent=color.name;
    const count=document.createElement('b');count.hidden=true;button.append(circle,name,count);
    button.addEventListener('click',()=>adding(color.id));
    $('palette').appendChild(button);paletteButtons.push({color,button,count});
  });
  $('undo').addEventListener('click',()=>{if(game.history.length)setMix(game.history.pop(),false);});
  $('clear').addEventListener('click',()=>setMix([]));
  function start(){
    if(game.mode!=='mix'||!game.ready||!R.check(game.beans,true))return;
    game.batch=R.make(game.beans,uid(),F.recipes,Date.now());game.time=0;game.mode='loading';game.playing=false;game.awarded=false;
    const stamp=performance.now();game.added=Array.from({length:12},(_,i)=>stamp+i*35);
    last=stamp;updateUI();wake();
  }
  function beginMaking(){
    game.mode='making';game.playing=true;game.added=[];
    audioTimeline.recipes[0]=game.batch.recipe;gameAudio.reset();
    const base=F.primary(game.batch.recipe);GROUND_PALETTES.set('custom',[base,game.batch.recipe.ink,game.batch.recipe.accent]);
    last=performance.now();updateUI();
  }
  $('start').addEventListener('click',start);
  function next(){
    closeAll(false);PUCK_PORTRAITS.clear();game.mode='mix';game.playing=false;game.time=0;game.batch=null;game.beans=[];game.mix=[];game.history=[];game.added=[];game.awarded=false;renderRatios();
    gameAudio.reset();updateUI();wake();$('palette').querySelector('button').focus();
  }
  $('next-batch').addEventListener('click',next);$('card-next').addEventListener('click',next);
  function replay(){if(game.modal||!game.batch||game.mode==='loading')return;gameAudio.reset();game.time=0;game.mode='making';game.playing=true;last=performance.now();updateUI();wake();}
  $('replay').addEventListener('click',replay);
  $('pause').addEventListener('click',()=>{if(game.modal||!game.batch||game.mode==='done')return;game.playing=!game.playing;last=performance.now();updateUI();wake();});
  $('speed').addEventListener('click',()=>{if(game.modal)return;const rates=[.5,1,1.5,2,3];game.rate=rates[(rates.indexOf(game.rate)+1)%rates.length];last=performance.now();gameAudio.reset();updateUI();});
  $('audio').addEventListener('click',async()=>{
    if(game.modal)return;
    $('audio').disabled=true;
    const enabled=await gameAudio.setEnabled(!gameAudio.enabled);
    $('audio').textContent=enabled?'声音开':'声音关';$('audio').setAttribute('aria-pressed',String(enabled));$('audio').disabled=false;
    if(!enabled)say('声音已关闭或当前环境暂不可播放');wake();
  });
  function dragStart(){if(game.modal||!game.batch||dragging)return;dragging=true;wasPlaying=game.playing;game.playing=false;gameAudio.reset();}
  function dragEnd(){if(!dragging)return;dragging=false;game.playing=wasPlaying&&game.mode!=='done';last=performance.now();updateUI();wake();}
  $('progress').addEventListener('pointerdown',dragStart);
  $('progress').addEventListener('touchstart',dragStart,{passive:true});
  ['pointerup','pointercancel','touchend','touchcancel','blur'].forEach(type=>window.addEventListener(type,dragEnd));
  $('progress').addEventListener('input',()=>{
    if(game.modal||!game.batch)return;game.time=F.clamp(Number($('progress').value)||0,0,8);game.mode=game.time>=8?'done':'making';gameAudio.reset();
    if(game.time>=M.arrival)award();drawFrame();updateUI();
  });
  function getState(){
    if(game.mode==='mix'||game.mode==='loading'){
      const s=F.stateAt(0);s.recipe=white;s.pressure=0;s.flow=null;s.overload=0;s.pressureKick=0;
      s.wand=F.wandPose(0);s.pucks=[];s.hopperRecipe={kind:'custom',base:'#FFFFFF',ink:'#FFFFFF',beanColors:R.visualBeans(game.beans).map(id=>R.palette.find(p=>p.id===id).hex)};
      s.hopper=beanSlots.slice(0,game.beans.length?12:0).map((slot,i)=>{
        const t=game.mode==='loading'?F.clamp((now-game.added[i])/700):1;return Object.assign({},slot,{y:F.lerp(-24,slot.y,t*t),angle:slot.angle+(1-t)*.8});
      }).filter((_,i)=>game.mode!=='loading'||now>=game.added[i]);
      s.cats=[Object.assign({},F.catState(0,0),{recipe:white,x:175,walking:0,walkDistance:0,baseCoat:0,coat:0,reaction:{}})];return s;
    }
    const p=Math.min(game.time,7.9999),recipe=game.batch.recipe;
    const matched=F.recipes.findIndex(r=>r.kind===recipe.kind),index=matched<0?8:matched;
    const s=F.stateAt(index*8+p);s.time=p;s.round=0;s.recipe=recipe;s.hopperRecipe=recipe;s.previousRecipe=recipe;
    s.hopper=p<2.4?F.hopperBeans(p,true):[];s.pucks=[];
    if(p<5.8)s.handle=F.handlePose(p,false);
    else s.handle=M.at(p).handle;
    const cat=F.catState(index*8+p,index);cat.recipe=recipe;
    if(recipe.custom)cat.reaction=F.catState(8*8+p,8).reaction;
    s.cats=[cat];
    const collection=M.at(p);s.receive=collection.receive;
    if(collection.puck)s.pucks=[Object.assign({recipe},collection.puck)];
    return s;
  }
  function drawFrame(){
    if(!paint||!coffeeBeanArt)return;
    ctx=paint;paint.setTransform(canvas.width/900,0,0,canvas.height/1200,0,0);paint.fillStyle='#0E3CF1';paint.fillRect(0,0,900,1200);
    paint.save();paint.translate(M.view.x,M.view.y);paint.scale(M.view.scale,M.view.scale);
    const s=getState();machine(s);conveyor(s);steamWand(s);coffeeFlow(s);
    s.cats.forEach(cat=>CatArt.draw(paint,cat,s.time));
    groundCoffee(s);
    // The face emerges from behind the rim, then becomes the foreground object.
    const paintPucks=()=>s.pucks.forEach(puck=>{paint.save();paint.translate(puck.x,puck.y);paint.rotate(puck.angle);paint.scale(puck.scale,puck.scale);paint.globalAlpha=puck.alpha;drawCatPuck(puck.recipe);paint.restore();});
    const emerging=game.time<M.release+.09;
    if(emerging)paintPucks();portafilter(s.handle);secondaryMist(s);if(!emerging)paintPucks();paint.restore();
    $('collection-open').style.setProperty('--receive-scale',String(1+(s.receive||0)*.18));
    $('collection-open').style.setProperty('--receive-ring',((s.receive||0)*9)+'px');
  }
  function updateUI(){
    const mixing=game.mode==='mix',ready=game.ready,tally=R.counts(game.beans);
    $('mix-panel').hidden=!mixing;$('making-panel').hidden=mixing;
    $('bean-count').textContent=game.mix.length+' 种颜色';
    paletteButtons.forEach(({color,button,count})=>{const n=tally[color.id]||0;button.disabled=!mixing||!ready;button.setAttribute('aria-pressed',String(n>0));count.hidden=!n;count.textContent=n+'%';});
    $('undo').disabled=!mixing||!game.history.length;$('clear').disabled=!mixing||!game.beans.length;
    $('recipes-open').disabled=!ready;
    $('start').disabled=!mixing||!ready||!game.mix.length;
    $('start').textContent=game.mix.length?'开始做猫':'选好颜色，开始做猫';
    $('collection-count').textContent=game.records.length;$('collection-open').disabled=!ready;
    $('mix-label').textContent=ready?'选颜色，拖动配色条调比例':'正在打开工厂…';
    $('pause').disabled=!game.batch||game.mode==='done'||game.mode==='loading';$('pause').textContent=game.playing?'暂停':'播放';
    $('replay').disabled=$('progress').disabled=!game.batch||game.mode==='loading';
    if(!dragging)$('progress').value=String(game.time);
    $('speed').textContent=game.rate+'×';
    const clock=v=>'00:'+String(Math.floor(v)).padStart(2,'0');$('clock').textContent=clock(game.time/game.rate)+' / '+clock(8/game.rate);
    $('result-open').hidden=$('next-batch').hidden=game.mode!=='done';
  }

  function batchColors(container,beans){container.replaceChildren();const tally=R.counts(beans);R.palette.filter(p=>tally[p.id]).forEach(p=>{const span=document.createElement('span'),i=document.createElement('i');i.style.background=p.hex;span.appendChild(i);span.appendChild(document.createTextNode(p.name+' '+Math.round(tally[p.id]/beans.length*100)+'%'));container.appendChild(span);});}
  async function award(){
    if(game.awarded||!game.batch)return;
    game.awarded=true;const batch=game.batch;game.records=R.collect(game.records,batch);$('collection-count').textContent=game.records.length;
    game.persistent=await CatGameStore.save(game.records);
    if(!game.persistent)say('已暂存本次收藏，建议把猫卡保存下来');
  }
  function finish(){game.time=8;game.mode='done';game.playing=false;gameAudio.reset();award();updateUI();if(!game.modal)openCard(game.batch,'result');}
  function tick(stamp){
    frame=null;now=stamp;const delta=Math.max(0,(stamp-last)/1000);last=stamp;
    if(document.hidden)return;
    if(game.mode==='making'&&game.playing&&!game.modal&&!dragging){game.time=Math.min(8,game.time+delta*game.rate);if(game.time>=8)finish();}
    if(game.mode==='making'&&game.time>=M.arrival)award();
    if(game.mode==='loading'&&!game.modal&&isSettled())beginMaking();
    drawFrame();updateUI();gameAudio.sync(game.time,game.mode==='making'&&game.playing&&!game.modal&&!dragging,game.rate);
    if((game.mode==='making'&&game.playing&&!game.modal)||(game.mode==='loading'&&!game.modal))frame=requestAnimationFrame(tick);
  }
  function wake(){if(frame===null&&!document.hidden){last=performance.now();frame=requestAnimationFrame(tick);}}
  function pauseForModal(){$('game-controls').inert=true;game.modalAt=performance.now();lastFocus=document.activeElement;game.restorePlay=game.playing;game.playing=false;gameAudio.reset();updateUI();}
  function restoreAfterModal(){$('game-controls').inert=false;if(game.mode==='loading')game.added=game.added.map(t=>t+performance.now()-game.modalAt);game.playing=game.restorePlay;game.restorePlay=false;last=performance.now();updateUI();wake();if(lastFocus&&lastFocus.isConnected)lastFocus.focus();}
  function closeAll(restore){$('game-controls').inert=false;$('collection').hidden=true;$('card-modal').hidden=true;$('recipes-modal').hidden=true;game.modal=null;if(restore)restoreAfterModal();}
  function openCollection(){if(game.modal)return;pauseForModal();game.modal='collection';$('collection').hidden=false;renderCollection();$('collection-close').focus();}
  $('collection-open').addEventListener('click',openCollection);
  $('collection-close').addEventListener('click',()=>closeAll(true));
  $('recipes-open').addEventListener('click',()=>{
    if(game.modal)return;pauseForModal();game.modal='recipes';$('recipes-modal').hidden=false;$('recipe-list').replaceChildren();
    R.formulas.forEach(formula=>{
      const row=document.createElement('div');row.className='recipe-row';const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('div');
      const parts=R.portions(formula.counts);title.textContent=formula.kind==='ginger'?'大橘':F.recipes.find(r=>r.kind===formula.kind).name;
      detail.className='recipe-colors';parts.forEach(part=>{const color=R.palette.find(p=>p.id===part.id),tag=document.createElement('span'),dot=document.createElement('i');dot.style.background=color.hex;tag.append(dot,document.createTextNode(color.name+' '+part.amount+'%'));detail.appendChild(tag);});
      info.append(title,detail);const use=document.createElement('button'),owned=()=>game.records.some(r=>r.id==='known-'+formula.kind);
      use.className='secondary';use.disabled=owned();use.textContent=use.disabled?'已拥有':'使用配方';use.setAttribute('aria-label',use.disabled?'已拥有'+title.textContent:'使用'+title.textContent+'配方');
      use.addEventListener('click',()=>{if(game.mode!=='mix'||owned())return;closeAll(true);setMix(parts.map(p=>({...p})));$('start').focus();});row.append(info,use);$('recipe-list').appendChild(row);
    });$('recipes-close').focus();
  });
  $('recipes-close').addEventListener('click',()=>closeAll(true));
  function renderCollection(){
    const pages=Math.max(1,Math.ceil(game.records.length/15));game.page=F.clamp(game.page,0,pages-1);
    PUCK_PORTRAITS.clear();$('puck-grid').replaceChildren();$('empty-collection').hidden=game.records.length>0;
    $('collection-summary').textContent='已收藏 '+game.records.length+' 只 · 做过 '+game.records.reduce((sum,r)=>sum+r.count,0)+' 杯';
    for(const record of game.records.slice(game.page*15,game.page*15+15)){
      const button=document.createElement('button');button.className='puck-button';button.setAttribute('aria-label',record.recipe.name+'，查看猫卡');
      const face=document.createElement('canvas');face.width=180;face.height=150;const c=face.getContext('2d');
      const previous=ctx;ctx=c;c.translate(90,75);c.scale(2.1,2.1);drawCatPuck(record.recipe);ctx=previous;
      const name=document.createElement('span');name.textContent=record.recipe.name;button.append(face,name);
      if(record.count>1){const count=document.createElement('small');count.textContent='×'+record.count;button.appendChild(count);}
      button.addEventListener('click',()=>openCard(record,'collection'));$('puck-grid').appendChild(button);
    }
    $('page-label').textContent=(game.page+1)+' / '+pages;$('prev-page').disabled=game.page===0;$('next-page').disabled=game.page>=pages-1;
    $('retry-storage').hidden=game.persistent;
    $('storage-note').hidden=game.persistent;
    $('storage-note').textContent=game.persistent?'':'本次收藏暂未写入存储，请先保存喜欢的猫卡。';$('storage-note').classList.toggle('warning',!game.persistent);
  }
  $('retry-storage').addEventListener('click',async()=>{
    $('retry-storage').disabled=true;game.persistent=await CatGameStore.save(game.records);$('retry-storage').disabled=false;renderCollection();say(game.persistent?'收藏已保存':'暂时无法保存，请先留下猫卡图片');
  });
  $('prev-page').addEventListener('click',()=>{game.page--;renderCollection();});$('next-page').addEventListener('click',()=>{game.page++;renderCollection();});
  function rounded(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
  function drawCard(record){
    const c=$('cat-card').getContext('2d'),r=record.recipe;
    c.clearRect(0,0,900,1200);c.fillStyle='#FFF3DF';rounded(c,0,0,900,1200,40);c.fill();
    c.fillStyle='#172356';c.textAlign='left';c.font='500 20px sans-serif';c.fillText('小 猫 加 工 厂',56,66);
    c.fillStyle='#0E3CF1';rounded(c,36,100,828,890,24);c.fill();
    c.save();c.beginPath();c.rect(36,100,828,890);c.clip();
    c.globalAlpha=.14;c.fillStyle='#172356';c.beginPath();c.ellipse(455,777,272,19,0,0,Math.PI*2);c.fill();c.globalAlpha=1;
    const state={recipe:r,index:0,x:0,walking:0,walkDistance:0,coat:1,baseCoat:1,tailLift:1,reaction:{}};
    CatArt.draw(c,state,1,{x:451,y:771,scale:r.kind==='xiaokui'?2.3:2.65,noBlink:true});c.restore();
    const tally=R.counts(record.beans),colors=R.palette.filter(p=>tally[p.id]);
    colors.forEach((p,i)=>{const x=450+(i-(colors.length-1)/2)*220;c.beginPath();c.arc(x-31,1040,17,0,Math.PI*2);c.fillStyle=p.hex;c.fill();c.lineWidth=1;c.strokeStyle='#D6CDBE';c.stroke();c.fillStyle='#172356';c.font='22px sans-serif';c.textAlign='left';c.fillText(p.name+' '+Math.round(tally[p.id]/record.beans.length*100)+'%',x-4,1048);});
    c.strokeStyle='#DAD1C1';c.beginPath();c.moveTo(56,1100);c.lineTo(844,1100);c.stroke();
    const number=game.records.findIndex(item=>item.id===record.id)+1;c.fillStyle='#72758B';c.font='18px sans-serif';c.textAlign='left';c.fillText('收藏 '+String(Math.max(1,number)).padStart(3,'0'),56,1149);
    c.textAlign='right';const d=new Date(record.createdAt);c.fillText(d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'),844,1149);
  }
  function openCard(record,from){
    if(!record)return;if(!game.modal)pauseForModal();game.card=record;game.cardFrom=from;game.modal='card';$('card-modal').hidden=false;
    $('card-heading').textContent=from==='result'?'接住，你的新朋友':'这只猫的收藏卡';$('card-next').hidden=from==='collection';
    $('save-status').textContent='';$('save-card').textContent=window.xhs?'保存到相册':'保存猫卡';drawCard(record);$('card-close').focus();
  }
  $('result-open').addEventListener('click',()=>openCard(game.batch,'result'));
  function closeCard(){
    $('card-modal').hidden=true;
    if(game.cardFrom==='collection'){game.modal='collection';renderCollection();$('collection-close').focus();}
    else{game.modal=null;restoreAfterModal();}
  }
  $('card-close').addEventListener('click',closeCard);
  $('save-card').addEventListener('click',async()=>{
    if(game.saving)return;game.saving=true;$('save-card').disabled=true;$('save-status').textContent='正在保存…';
    try{
      const data=$('cat-card').toDataURL('image/png'),mini=window.xhs&&window.xhs.miniTool;
      if(window.xhs){
        if(!mini||typeof mini.writeTempFile!=='function'||typeof mini.saveImageToPhotosAlbum!=='function')throw new Error('当前环境暂不支持保存到相册');
        const result=await mini.writeTempFile({data});await mini.saveImageToPhotosAlbum({filePath:result.filePath});$('save-status').textContent='猫卡已保存到相册';
      }else{
        const a=document.createElement('a');a.href=data;a.download=game.card.recipe.name+'-猫卡.png';document.body.appendChild(a);a.click();a.remove();$('save-status').textContent='';
      }
    }catch(e){$('save-status').textContent='保存未完成，可以重试。'+(e&&e.message||'请检查相册权限。');}
    finally{game.saving=false;$('save-card').disabled=false;}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&game.modal){if(game.modal==='card')closeCard();else closeAll(true);return;}
    if(game.modal&&event.key==='Tab'){
      const pane=game.modal==='card'?$('card-modal'):game.modal==='recipes'?$('recipes-modal'):$('collection');const focus=Array.from(pane.querySelectorAll('button:not(:disabled)')).filter(b=>!b.hidden);
      if(!focus.length)return;const first=focus[0],end=focus[focus.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();end.focus();}else if(!event.shiftKey&&document.activeElement===end){event.preventDefault();first.focus();}return;
    }
    if(game.modal||event.target.closest('button,input'))return;
    if(event.code==='Space'){event.preventDefault();$('pause').click();}else if(event.key.toLowerCase()==='r')replay();
  });
  const controls=$('game-controls');window.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;const b=controls.getBoundingClientRect();controls.classList.toggle('is-hidden',event.clientY<b.top-30&&!dragging&&!controls.contains(document.activeElement));});
  controls.addEventListener('focusin',()=>controls.classList.remove('is-hidden'));window.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')controls.classList.remove('is-hidden');});
  document.addEventListener('visibilitychange',()=>{gameAudio.reset();if(document.hidden){game.hiddenAt=performance.now();if(frame!==null)cancelAnimationFrame(frame);frame=null;}else{if(game.mode==='loading'&&!game.modal)game.added=game.added.map(t=>t+performance.now()-(game.hiddenAt||0));last=performance.now();wake();}});
  window.addEventListener('pagehide',()=>{gameAudio.reset();if(frame!==null)cancelAnimationFrame(frame);frame=null;});
  window.addEventListener('pageshow',wake);window.addEventListener('resize',fit);
  coffeeBeanArt.addEventListener('load',()=>{beanArtCache.clear();wake();});
  // Exact recipe summaries are refreshed once per newly frozen batch.
  $('start').addEventListener('click',()=>{if(game.batch)batchColors($('batch-colors'),game.batch.beans);});
  CatGameStore.load().then(result=>{game.records=result.records;game.persistent=result.persistent;game.ready=true;updateUI();wake();},()=>{game.ready=true;game.persistent=false;updateUI();wake();});
  renderRatios();fit();updateUI();wake();
  // Read-only diagnostics used by the local smoke checks; not shown in the product.
  window.CatGameDebug={snapshot:()=>JSON.parse(JSON.stringify(game)),state:getState,drawCard,drawFrame};
})();
