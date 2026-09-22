/* The game owns input/state. Approved scene functions supply the machine and character art. */
(function(){
  'use strict';
  const R=CatGameRules, $=id=>document.getElementById(id);
  const canvas=$('factory-art'), paint=canvas.getContext('2d');
  const game={beans:[],added:[],mode:'mix',time:0,playing:false,rate:1,batch:null,awarded:false,
    records:[],page:0,modal:null,card:null,cardFrom:null,restorePlay:false,ready:false,persistent:true,saving:false};
  const white=F.recipes.find(r=>r.kind==='white');
  const audioTimeline={recipes:[white],mod:F.mod,voiceFor:r=>F.voiceFor(r.custom?{kind:'bicolor'}:r),xiaokuiVoice:F.xiaokuiVoice,manualBeans:true};
  const gameAudio=FactorySound.create(audioTimeline);
  let last=performance.now(), now=last, frame=null, toastTimer, lastUI='',lastFocus=null,dragging=false,wasPlaying=false;
  coffeeBeanArt=$('coffee-bean-art');ctx=paint;
  const beanSlots=F.hopperBeans(0,true);
  const paletteButtons=[];
  const uid=()=>window.crypto&&window.crypto.getRandomValues?window.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
  function say(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
  function fit(){const w=$('factory').clientWidth,d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*d);canvas.height=Math.round(w*4/3*d);drawFrame();}
  function isSettled(){return !game.added.length || now-game.added[game.added.length-1]>.7*1000;}
  function adding(id){
    if(!game.ready||game.mode!=='mix')return;
    if(game.beans.length>=12){say('豆仓满了，可以开始做猫啦');return;}
    const next=R.add(game.beans,id);
    if(next.length===game.beans.length){say('这一杯最多放三种颜色');return;}
    game.beans=next;game.added.push(performance.now());updateUI();wake();
  }
  R.palette.forEach(color=>{
    const button=document.createElement('button');button.className='swatch';button.style.setProperty('--bean',color.hex);
    button.setAttribute('aria-label','加入一颗'+color.name+'色豆');button.setAttribute('aria-pressed','false');
    const circle=document.createElement('span');circle.className='color';
    const name=document.createElement('small');name.textContent=color.name;
    const count=document.createElement('b');count.hidden=true;button.append(circle,name,count);
    button.addEventListener('click',()=>adding(color.id));
    // Long press is optional; tapping can perform every action.
    let hold=null,repeat=null;
    const stop=()=>{clearTimeout(hold);clearInterval(repeat);};
    button.addEventListener('pointerdown',()=>{stop();hold=setTimeout(()=>{adding(color.id);repeat=setInterval(()=>adding(color.id),150);},450);});
    ['pointerup','pointercancel','pointerleave','blur'].forEach(type=>button.addEventListener(type,stop));
    document.addEventListener('visibilitychange',stop);
    $('palette').appendChild(button);paletteButtons.push({color,button,count});
  });
  $('undo').addEventListener('click',()=>{game.beans.pop();game.added.pop();updateUI();wake();});
  $('clear').addEventListener('click',()=>{game.beans=[];game.added=[];updateUI();wake();});
  $('try-recipe').addEventListener('click',()=>{
    if(game.mode!=='mix'||!game.ready)return;
    game.beans=['white','white','white','white','white','white','orange','orange','orange','black','black','black'];
    const start=performance.now();game.added=game.beans.map((_,i)=>start+i*60);updateUI();wake();
  });
  function start(){
    if(game.mode!=='mix'||!game.ready||!R.check(game.beans,true)||!isSettled())return;
    game.batch=R.make(game.beans,uid(),F.recipes,Date.now());game.time=0;game.mode='making';game.playing=true;game.awarded=false;
    audioTimeline.recipes[0]=game.batch.recipe;gameAudio.reset();
    const base=F.primary(game.batch.recipe);GROUND_PALETTES.set('custom',[base,game.batch.recipe.ink,game.batch.recipe.accent]);
    last=performance.now();lastUI='';updateUI();wake();
  }
  $('start').addEventListener('click',start);
  function next(){
    closeAll(false);PUCK_PORTRAITS.clear();game.mode='mix';game.playing=false;game.time=0;game.batch=null;game.beans=[];game.added=[];game.awarded=false;
    gameAudio.reset();lastUI='';updateUI();wake();$('palette').querySelector('button').focus();
  }
  $('next-batch').addEventListener('click',next);$('card-next').addEventListener('click',next);
  function replay(){if(!game.batch)return;gameAudio.reset();game.time=0;game.mode='making';game.playing=true;last=performance.now();updateUI();wake();}
  $('replay').addEventListener('click',replay);
  $('pause').addEventListener('click',()=>{if(!game.batch||game.mode==='done')return;game.playing=!game.playing;last=performance.now();updateUI();wake();});
  $('speed').addEventListener('click',()=>{const rates=[.5,1,1.5,2,3];game.rate=rates[(rates.indexOf(game.rate)+1)%rates.length];last=performance.now();gameAudio.reset();updateUI();});
  $('audio').addEventListener('click',async()=>{
    $('audio').disabled=true;
    const enabled=await gameAudio.setEnabled(!gameAudio.enabled);
    $('audio').textContent=enabled?'声音开':'声音关';$('audio').setAttribute('aria-pressed',String(enabled));$('audio').disabled=false;
    if(!enabled)say('声音已关闭或当前环境暂不可播放');wake();
  });
  function dragStart(){if(!game.batch||dragging)return;dragging=true;wasPlaying=game.playing;game.playing=false;gameAudio.reset();}
  function dragEnd(){if(!dragging)return;dragging=false;game.playing=wasPlaying&&game.mode!=='done';last=performance.now();updateUI();wake();}
  $('progress').addEventListener('pointerdown',dragStart);
  $('progress').addEventListener('touchstart',dragStart,{passive:true});
  ['pointerup','pointercancel','touchend','touchcancel','blur'].forEach(type=>window.addEventListener(type,dragEnd));
  $('progress').addEventListener('input',()=>{
    if(!game.batch)return;game.time=F.clamp(Number($('progress').value)||0,0,8);game.mode=game.time>=8?'done':'making';gameAudio.reset();
    if(game.time>=8)award();drawFrame();updateUI();
  });
  function getState(){
    if(game.mode==='mix'){
      const s=F.stateAt(0);s.recipe=white;s.pressure=0;s.flow=null;s.overload=0;s.pressureKick=0;
      s.wand=F.wandPose(0);s.pucks=[];s.hopperRecipe={kind:'custom',base:'#FFFFFF',ink:'#FFFFFF',beanColors:game.beans.map(id=>R.palette.find(p=>p.id===id).hex)};
      s.hopper=beanSlots.slice(0,game.beans.length).map((slot,i)=>{
        const t=F.clamp((now-game.added[i])/700);return Object.assign({},slot,{y:F.lerp(-24,slot.y,t*t),angle:slot.angle+(1-t)*.8});
      }).filter((_,i)=>now>=game.added[i]);
      s.cats=[Object.assign({},F.catState(0,0),{recipe:white,x:175,walking:0,walkDistance:0,baseCoat:0,coat:0,reaction:{}})];return s;
    }
    const p=Math.min(game.time,7.9999),recipe=game.batch.recipe;
    const matched=F.recipes.findIndex(r=>r.kind===recipe.kind),index=matched<0?8:matched;
    const s=F.stateAt(index*8+p);s.time=p;s.round=0;s.recipe=recipe;s.hopperRecipe=recipe;s.previousRecipe=recipe;
    s.hopper=p<2.4?F.hopperBeans(p,true):[];s.pucks=[];
    if(p<5.8)s.handle=F.handlePose(p,false);
    else {s.handle=F.handlePose(Math.min(p-5.8,2.14),true,{x:450,y:920});s.handle.loading=false;s.handle.used=p<6.82;s.handle.powder=s.handle.used?1:0;}
    const cat=F.catState(index*8+p,index);cat.recipe=recipe;
    if(recipe.custom)cat.reaction=F.catState(8*8+p,8).reaction;
    s.cats=[cat];
    if(p>=6.82){const u=F.clamp((p-6.82)/.9);s.pucks=[{recipe,x:F.lerp(450,822,F.ease(u)),y:F.lerp(920,240,F.ease(u))-140*Math.sin(Math.PI*u),alpha:p<7.74?1:Math.max(0,1-(p-7.74)/.2),angle:0,falling:true}];}
    return s;
  }
  function drawFrame(){
    if(!paint||!coffeeBeanArt)return;
    ctx=paint;paint.setTransform(canvas.width/900,0,0,canvas.height/1200,0,0);paint.fillStyle='#0E3CF1';paint.fillRect(0,0,900,1200);
    paint.save();paint.translate(0,-150);
    const s=getState();machine(s);conveyor(s);steamWand(s);coffeeFlow(s);
    s.cats.forEach(cat=>CatArt.draw(paint,cat,s.time));
    groundCoffee(s);portafilter(s.handle);secondaryMist(s);spentPuck(s);paint.restore();
  }
  function updateUI(){
    const mixing=game.mode==='mix',ready=game.ready,tally=R.counts(game.beans);
    $('mix-panel').hidden=!mixing;$('making-panel').hidden=mixing;
    $('bean-count').textContent=game.beans.length+' / 12';
    paletteButtons.forEach(({color,button,count})=>{const n=tally[color.id]||0;button.disabled=!mixing||!ready;button.setAttribute('aria-pressed',String(n>0));count.hidden=!n;count.textContent=n;});
    $('undo').disabled=$('clear').disabled=!mixing||!game.beans.length;
    $('try-recipe').disabled=!ready;
    $('start').disabled=!mixing||!ready||game.beans.length!==12||!isSettled();
    $('start').textContent=game.beans.length===12?(isSettled()?'开始做猫':'豆子正在落下…'):'加满 12 颗，开始做猫';
    $('collection-count').textContent=game.records.length;$('collection-open').disabled=!ready;
    $('mix-label').textContent=ready?'选 1–3 种颜色，调一只猫':'正在打开工厂…';
    $('pause').disabled=!game.batch||game.mode==='done';$('pause').textContent=game.playing?'暂停':'播放';
    $('replay').disabled=$('progress').disabled=!game.batch;
    if(!dragging)$('progress').value=String(game.time);
    $('speed').textContent=game.rate+'×';
    const clock=v=>'00:'+String(Math.floor(v)).padStart(2,'0');$('clock').textContent=clock(game.time/game.rate)+' / '+clock(8/game.rate);
    $('result-open').hidden=$('next-batch').hidden=game.mode!=='done';
    if(game.batch){
      const title=game.mode==='done'?'这一只，做好了':game.time<1.56?'正在磨豆':game.time<3.35?'接粉 · 装上手柄':game.time<5.2?(game.batch.recipe.malfunction?'咦，机器今天没有颜色…':'给小猫穿上颜色'):game.time<6.82?'新朋友，出来啦':'收好这一枚猫饼';
      if(lastUI!==title){$('making-status').textContent=title;lastUI=title;}
    }
  }
  function batchColors(container,beans){container.replaceChildren();const tally=R.counts(beans);R.palette.filter(p=>tally[p.id]).forEach(p=>{const span=document.createElement('span'),i=document.createElement('i');i.style.background=p.hex;span.appendChild(i);span.appendChild(document.createTextNode(p.name+' '+tally[p.id]));container.appendChild(span);});}
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
    drawFrame();updateUI();gameAudio.sync(game.time,game.mode==='making'&&game.playing&&!game.modal&&!dragging,game.rate);
    if((game.mode==='making'&&game.playing&&!game.modal)||(game.mode==='mix'&&!isSettled()))frame=requestAnimationFrame(tick);
  }
  function wake(){if(frame===null&&!document.hidden){last=performance.now();frame=requestAnimationFrame(tick);}}
  function pauseForModal(){lastFocus=document.activeElement;game.restorePlay=game.playing;game.playing=false;gameAudio.reset();updateUI();}
  function restoreAfterModal(){game.playing=game.restorePlay;game.restorePlay=false;last=performance.now();updateUI();wake();if(lastFocus&&lastFocus.isConnected)lastFocus.focus();}
  function closeAll(restore){$('collection').hidden=true;$('card-modal').hidden=true;game.modal=null;if(restore)restoreAfterModal();}
  function openCollection(){if(game.modal)return;pauseForModal();game.modal='collection';$('collection').hidden=false;renderCollection();$('collection-close').focus();}
  $('collection-open').addEventListener('click',openCollection);
  $('collection-close').addEventListener('click',()=>closeAll(true));
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
    $('storage-note').textContent=game.persistent?'收藏保存在当前设备，喜欢的猫卡记得保存。':'本次收藏暂未写入存储，请先保存喜欢的猫卡。';$('storage-note').classList.toggle('warning',!game.persistent);
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
    c.textAlign='right';c.font='18px sans-serif';c.fillText(record.known?'配方命中':'独家调色',844,66);
    c.fillStyle='#0E3CF1';rounded(c,36,100,828,730,24);c.fill();
    c.save();c.beginPath();c.rect(36,100,828,730);c.clip();
    c.globalAlpha=.14;c.fillStyle='#172356';c.beginPath();c.ellipse(455,697,272,19,0,0,Math.PI*2);c.fill();c.globalAlpha=1;
    const state={recipe:r,index:0,x:0,walking:0,walkDistance:0,coat:1,baseCoat:1,tailLift:1,reaction:{}};
    CatArt.draw(c,state,1,{x:451,y:691,scale:r.kind==='xiaokui'?2.3:2.65,noBlink:true});c.restore();
    c.fillStyle='#172356';c.textAlign='center';c.font='600 49px sans-serif';c.fillText(r.name,450,925);
    c.font='22px sans-serif';c.fillStyle='#72758B';c.fillText(record.known?'刚刚好，是这一只。':'这一杯颜色，只属于你。',450,970);
    const tally=R.counts(record.beans),colors=R.palette.filter(p=>tally[p.id]);
    colors.forEach((p,i)=>{const x=450+(i-(colors.length-1)/2)*175;c.beginPath();c.arc(x-31,1040,17,0,Math.PI*2);c.fillStyle=p.hex;c.fill();c.lineWidth=1;c.strokeStyle='#D6CDBE';c.stroke();c.fillStyle='#172356';c.font='22px sans-serif';c.textAlign='left';c.fillText(p.name+' '+tally[p.id],x-4,1048);});
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
        const a=document.createElement('a');a.href=data;a.download=game.card.recipe.name+'-猫卡.png';document.body.appendChild(a);a.click();a.remove();$('save-status').textContent='已发起图片下载，请查看浏览器下载记录';
      }
    }catch(e){$('save-status').textContent='保存未完成，可以重试。'+(e&&e.message||'请检查相册权限。');}
    finally{game.saving=false;$('save-card').disabled=false;}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&game.modal){if(game.modal==='card')closeCard();else closeAll(true);return;}
    if(game.modal&&event.key==='Tab'){
      const pane=game.modal==='card'?$('card-modal'):$('collection');const focus=Array.from(pane.querySelectorAll('button:not(:disabled)')).filter(b=>!b.hidden);
      if(!focus.length)return;const first=focus[0],end=focus[focus.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();end.focus();}else if(!event.shiftKey&&document.activeElement===end){event.preventDefault();first.focus();}return;
    }
    if(game.modal||event.target.closest('button,input'))return;
    if(event.code==='Space'){event.preventDefault();$('pause').click();}else if(event.key.toLowerCase()==='r')replay();
  });
  const controls=$('game-controls');window.addEventListener('pointermove',event=>{if(event.pointerType!=='mouse')return;const b=controls.getBoundingClientRect();controls.classList.toggle('is-hidden',event.clientY<b.top-30&&!dragging&&!controls.contains(document.activeElement));});
  controls.addEventListener('focusin',()=>controls.classList.remove('is-hidden'));window.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')controls.classList.remove('is-hidden');});
  document.addEventListener('visibilitychange',()=>{gameAudio.reset();if(document.hidden){if(frame!==null)cancelAnimationFrame(frame);frame=null;}else{last=performance.now();wake();}});
  window.addEventListener('pagehide',()=>{gameAudio.reset();if(frame!==null)cancelAnimationFrame(frame);frame=null;});
  window.addEventListener('pageshow',wake);window.addEventListener('resize',fit);
  coffeeBeanArt.addEventListener('load',()=>{beanArtCache.clear();wake();});
  // Exact recipe summaries are refreshed once per newly frozen batch.
  $('start').addEventListener('click',()=>{if(game.batch)batchColors($('batch-colors'),game.batch.beans);});
  CatGameStore.load().then(result=>{game.records=result.records;game.persistent=result.persistent;game.ready=true;updateUI();wake();},()=>{game.ready=true;game.persistent=false;updateUI();wake();});
  fit();updateUI();wake();
  // Read-only diagnostics used by the local smoke checks; not shown in the product.
  window.CatGameDebug={snapshot:()=>JSON.parse(JSON.stringify(game)),state:getState,drawCard,drawFrame};
})();
