/* Small structured records only; native storage where supported, browser fallback elsewhere. */
(function(root){
  'use strict';
  const KEY='cat-factory-game-v1', PAGE=50;
  let mode='browser', api=null, chain=Promise.resolve(), savedGeneration=null;
  function sanitize(data){
    if(!data || data.version!==1 || !Array.isArray(data.records)) return [];
    const unique=new Map();
    for(const r of data.records){
      if(!root.CatGameRules.validRecord(r) || !Number.isFinite(r.createdAt)) continue;
      const restored=root.CatGameRules.make(r.beans,r.seed,root.FactoryTimeline.recipes,r.createdAt,r.recipeVersion||1);
      if(restored.id!==r.id) continue;
      restored.count=r.count; unique.set(restored.id,restored);
    }
    return Array.from(unique.values());
  }
  function browserRead(){try{return sanitize(JSON.parse(root.localStorage.getItem(KEY)));}catch(_){return [];}}
  function bounded(promise){return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('缓存响应超时')),3500);
    Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});
  });}
  async function detect(){
    const xhs=root.xhs;api=xhs&&xhs.miniTool;
    let options=xhs&&xhs.launchOptions;
    if(!(options&&options.miniToolEnv&&options.miniToolEnv.buildVersion)&&api&&typeof api.getLaunchOptions==='function') {
      try{options=await bounded(api.getLaunchOptions());}catch(_){}
    }
    const build=Number(options&&options.miniToolEnv&&options.miniToolEnv.buildVersion)||0;
    if(Math.floor(build/1000)>=9460 && api && ['getStorage','setStorage'].every(k=>typeof api[k]==='function')) mode='native';
  }
  async function nativeRead(){
    if(typeof api.getStorageInfo==='function'){
      const info=await bounded(api.getStorageInfo());
      if(info&&Array.isArray(info.keys)&&!info.keys.includes(KEY))return [];
    }
    let result;
    try{result=await bounded(api.getStorage({key:KEY}));}
    catch(e){if(/not found|not exist|no such|不存在|无数据/i.test(String(e&&e.errMsg))) return []; throw e;}
    const manifest=result&&result.data;
    if(!manifest) return [];
    if(manifest.version!==1 || !Array.isArray(manifest.pages) || manifest.pages.length>100) throw new Error('收藏目录无法读取');
    const records=[];
    for(const key of manifest.pages){
      if(typeof key!=='string'||key.indexOf(KEY+'-')!==0) throw new Error('收藏目录损坏');
      const part=await bounded(api.getStorage({key}));
      if(!part||!part.data||!Array.isArray(part.data.records)) throw new Error('收藏内容不完整');
      records.push.apply(records,sanitize(part.data));
    }
    savedGeneration=manifest;return records;
  }
  async function write(records){
    const payload={version:1,records};
    if(mode==='memory')return false;
    try{
      if(mode==='browser'){root.localStorage.setItem(KEY,JSON.stringify(payload));return true;}
      const generation=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8), pages=[];
      for(let i=0;i<records.length;i+=PAGE){
        const key=KEY+'-'+generation+'-'+i/PAGE, data={version:1,records:records.slice(i,i+PAGE)};
        if(new Blob([JSON.stringify(data)]).size>900000)throw new Error('单项收藏过大');
        await bounded(api.setStorage({key,data}));
        const readback=await bounded(api.getStorage({key}));
        if(!readback||JSON.stringify(readback.data)!==JSON.stringify(data))throw new Error('收藏写入不完整');
        pages.push(key);
      }
      const manifest={version:1,pages};
      await bounded(api.setStorage({key:KEY,data:manifest}));
      const confirm=await bounded(api.getStorage({key:KEY}));
      if(JSON.stringify(confirm.data)!==JSON.stringify(manifest))throw new Error('缓存校验失败');
      const old=savedGeneration;savedGeneration=manifest;
      if(old&&typeof api.removeStorage==='function') for(const key of old.pages) {
        try{await bounded(api.removeStorage({key}));}catch(_){}
      }
      return true;
    }catch(_){return false;}
  }
  async function load(){
    await detect();
    if(mode==='browser')return {records:browserRead(),persistent:true,mode};
    try{
      const records=await nativeRead(), legacy=browserRead();
      if(legacy.length){
        const merged=new Map(records.map(r=>[r.id,r]));
        legacy.forEach(r=>{if(!merged.has(r.id))merged.set(r.id,r);});
        const combined=Array.from(merged.values());
        if(await write(combined)){try{root.localStorage.removeItem(KEY);}catch(_){}return {records:combined,persistent:true,mode};}
        return {records:combined,persistent:false,mode};
      }
      return {records,persistent:true,mode};
    }catch(_){mode='memory';return {records:browserRead(),persistent:false,mode};}
  }
  function save(records){const snapshot=JSON.parse(JSON.stringify(records));chain=chain.then(()=>write(snapshot),()=>write(snapshot));return chain;}
  const value={load,save,sanitize};
  if(typeof module!=='undefined'&&module.exports)module.exports=value;else root.CatGameStore=value;
})(typeof window!=='undefined'?window:globalThis);
