/* Offline game rules. No DOM or random changes after a batch is started. */
(function(root) {
  'use strict';
  const palette = [
    ['white','白','#FFFFFF'], ['silver','银灰','#BFC4D3'], ['blue','蓝灰','#526795'],
    ['warm','暖灰','#79776D'], ['black','黑','#242A41'], ['cream','奶油','#F5D8B1'],
    ['gold','蜜金','#DDA14F'], ['orange','橘','#EE9950'], ['brown','棕','#866049'], ['purple','紫','#AE93CD']
  ].map(p => ({ id:p[0], name:p[1], hex:p[2] }));
  const formulas = [
    ['xiaokui',{warm:7,white:5}], ['silver',{silver:8,white:4}], ['silvershaded',{silver:2,white:10}],
    ['gold',{cream:8,gold:4}], ['goldtabby',{cream:7,gold:3,brown:2}], ['solid',{black:12}],
    ['ginger',{orange:12}], ['orangewhite',{white:8,orange:4}], ['bicolor',{blue:8,white:4}],
    ['tabby',{cream:5,brown:7}], ['points',{cream:9,brown:3}], ['calico',{white:6,orange:3,black:3}],
    ['gray',{silver:12}], ['bengal',{gold:7,brown:4,cream:1}], ['white',{white:12}]
  ].map(p => ({kind:p[0], counts:p[1]}));
  function counts(beans) { const result={}; beans.forEach(id => { result[id]=(result[id]||0)+1; }); return result; }
  function signature(value) { return Object.keys(value).filter(k=>value[k]>0).sort().map(k=>k+':'+value[k]).join('|'); }
  function check(beans, full) {
    if (!Array.isArray(beans) || beans.length>100 || (full && beans.length!==12 && beans.length!==100)) return false;
    return beans.every(id=>palette.some(p=>p.id===id)) && new Set(beans).size<=3;
  }
  function add(beans,id) { const next=beans.concat(id); return next.length<=12&&check(next,false)?next:beans.slice(); }
  function random(seed) { let n=seed>>>0; return () => { n=(Math.imul(1664525,n)+1013904223)>>>0; return n/4294967296; }; }
  function mix(a,b,t) { return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join(''); }
  function light(hex) { return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0); }
  // Store the matching version per record so recipe changes never rewrite old cats.
  function portions(value) {
    const entries=Object.entries(value).filter(([,n])=>Number.isFinite(n)&&n>0), total=entries.reduce((n,[,v])=>n+v,0);
    const parts=entries.map(([id,n])=>({id,amount:Math.floor(n/total*100),fraction:n/total*100%1}));
    let left=100-parts.reduce((n,p)=>n+p.amount,0);
    const ranked=parts.slice().sort((a,b)=>b.fraction-a.fraction);
    for(let i=0;i<left&&ranked.length;i++)ranked[i%ranked.length].amount++;
    return parts.map(({id,amount})=>({id,amount}));
  }
  function expand(parts){return parts.flatMap(p=>Array(p.amount).fill(p.id));}
  function visualBeans(beans){
    if(beans.length<=12)return beans.slice();
    const sampled=Array.from({length:12},(_,i)=>beans[Math.floor((i+.5)*beans.length/12)]);
    for(const color of new Set(beans))if(!sampled.includes(color)){
      const tally=counts(sampled),largest=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
      sampled[sampled.indexOf(largest)]=color;
    }
    return sampled;
  }
  function match(beans,version=2){
    const tally=counts(beans),key=signature(tally);
    if(version===1)return formulas.map(f=>f.kind==='ginger'?{kind:'ginger',counts:{orange:9,cream:3}}:f).find(f=>signature(f.counts)===key);
    const candidates=formulas.concat([{kind:'ginger',counts:{orange:9,cream:3}}]);
    const colors=Object.keys(tally).sort().join('|');
    const scored=candidates.filter(f=>Object.keys(f.counts).sort().join('|')===colors).map(f=>({f,d:Object.keys(tally).reduce((n,id)=>n+Math.abs(tally[id]/beans.length-f.counts[id]/12),0)/2})).sort((a,b)=>a.d-b.d);
    // Same colors and at most 12 percentage points from the nearest recipe.
    return scored[0]&&scored[0].d<=.120001?scored[0].f:null;
  }
  function make(beans, seed, recipes, now, recipeVersion=2) {
    if (!check(beans,true)) throw new Error('请选择一至三种颜色');
    const tally=counts(beans), hit=match(beans,recipeVersion);
    const rng=random(seed), order=palette.filter(p=>tally[p.id]).sort((a,b)=>tally[b.id]-tally[a.id] || palette.indexOf(a)-palette.indexOf(b));
    let recipe, id;
    if(hit) { recipe=Object.assign({},recipes.find(r=>r.kind===hit.kind)); id='known-'+hit.kind; if(recipeVersion>=2&&hit.kind==='ginger')recipe.name='大橘'; }
    else {
      const primary=order[0].hex, secondary=order[1]?order[1].hex:mix(primary,light(primary)>140?'#172356':'#FFFFFF',.32);
      const accent=order[2]?order[2].hex:mix(primary,'#FFFFFF',.60);
      const pattern=['patch','stripe','spots','plain'][Math.floor(rng()*4)];
      const mask=['blaze','cap','split','plain'][Math.floor(rng()*4)];
      const stems={white:'雪顶',silver:'云朵',blue:'蓝莓',warm:'芝麻',black:'墨墨',cream:'奶盖',gold:'蜂蜜',orange:'橘子',brown:'可可',purple:'紫芋'};
      const tails={patch:'布丁',stripe:'卷卷',spots:'泡芙',plain:'团子'};
      const spotData=Array.from({length:7},()=>({x:285+rng()*220,y:195+rng()*85,rx:9+rng()*10,ry:9+rng()*12,tilt:rng()-.5}));
      recipe={kind:'custom',custom:true,name:stems[order[0].id]+tails[pattern],base:primary,ink:secondary,accent,
        eye:(light(primary)<120?['#F9CD77','#B5D6F5','#FFF3DF']:['#172356','#46365C','#354955'])[Math.floor(rng()*3)],
        faceInk:light(mask==='blaze'?accent:primary)<120?'#FFF3DF':'#172356',
        innerEar:mix(accent,'#D9979C',.28),pattern,mask,socks:rng()>.4,tailBands:rng()>.45,spotData};
      id='custom-'+(now||Date.now()).toString(36)+'-'+(seed>>>0).toString(36);
    }
    recipe.beanColors=visualBeans(beans).map(id=>palette.find(p=>p.id===id).hex);
    return {id,known:!!hit,seed:seed>>>0,recipe,beans:beans.slice(),createdAt:now||Date.now(),count:1,artVersion:1,recipeVersion};
  }
  function collect(records,record) {
    const next=records.slice(), at=next.findIndex(r=>r.id===record.id);
    if(at<0) next.push(JSON.parse(JSON.stringify(record)));
    else next[at]=Object.assign({},next[at],{count:next[at].count+1});
    return next;
  }
  function validRecord(r) {
    return !!r && typeof r.id==='string' && typeof r.recipe==='object' && r.recipe && typeof r.recipe.name==='string'
      && check(r.beans,true) && Number.isFinite(r.seed) && Number.isInteger(r.count) && r.count>0 && r.artVersion===1 && (r.recipeVersion===undefined||[1,2].includes(r.recipeVersion));
  }
  const api={palette,formulas,counts,signature,check,add,random,make,collect,validRecord,portions,expand,match,visualBeans};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.CatGameRules=api;
})(typeof window!=='undefined'?window:globalThis);
