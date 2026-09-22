/* Deterministic, bounded-memory export of the animation (not the game). */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/wisewong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const F=require(path.join(root,'timeline.js')),S=require(path.join(root,'sound.js')),clips=require(path.join(root,'assets/audio/clips.js'));
const width=3072,height=4096,fps=30,duration=F.recipes.length*8;
const output=path.join(root,'交付文件/小猫加工厂-动效-4K.mp4');
const work=fs.mkdtempSync(path.join(root,'output/render-4k-'));
async function main(){
 const rate=48000,mix=new Float32Array(duration*rate),cues=new Map();
 for(let i=0;i<duration*1000;i++)for(const cue of S.cuesAt(i/1000,F))cues.set(cue.key,cue);
 for(const cue of cues.values()){
  const clip=clips[cue.clip],data=S.decodeClip(clip,atob),length=Math.min(cue.duration,data.length/clip.rate/cue.pitch);
  for(let i=0;i<Math.floor(length*rate);i++){
   const t=i/rate,position=t*clip.rate*cue.pitch,k=Math.floor(position),f=position-k;
   const envelope=Math.max(0,Math.min(1,t/.008,(length-t)/.012));
   const index=Math.round(cue.start*rate)+i;
   if(index<mix.length)mix[index]+=((data[k]||0)*(1-f)+(data[k+1]||0)*f)*cue.gain*S.MASTER_GAIN*envelope;
  }
 }
 const wav=Buffer.alloc(44+mix.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(mix.length*2,40);
 let peak=0;for(let i=0;i<mix.length;i++){peak=Math.max(peak,Math.abs(mix[i]));wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,mix[i]))*32767),44+i*2);}
 if(peak>=1)throw Error('Audio clipping');fs.writeFileSync(path.join(work,'audio.wav'),wav);
 console.log(JSON.stringify({width,height,fps,duration,audioPeak:peak,work}));
 const browser=await chromium.launch({headless:true});let encoder;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('file://'+path.join(root,'index.html'));await page.waitForFunction(()=>typeof ctx!=='undefined'&&ctx&&coffeeBeanArt&&coffeeBeanArt.complete&&coffeeBeanArt.naturalWidth>0);
  await page.evaluate(async data=>{await new Promise((resolve,reject)=>{coffeeBeanArt.onload=resolve;coffeeBeanArt.onerror=reject;coffeeBeanArt.src=data;});beanArtCache.clear();},'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/coffee-bean.png')).toString('base64'));
  await page.evaluate(({width,height})=>{noLoop();running=false;sound.reset();window.exportCanvas=document.createElement('canvas');exportCanvas.width=width;exportCanvas.height=height;ctx=exportCanvas.getContext('2d');},{width,height});
  const log=fs.openSync(path.join(work,'ffmpeg.log'),'w');
  encoder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',path.join(work,'audio.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','6','-c:a','aac','-b:a','192k','-ac','2','-movflags','+faststart','-t',String(duration),output],{stdio:['pipe','ignore',log]});
  const completed=once(encoder,'close');encoder.stdin.on('error',()=>{});
  for(let i=0;i<duration*fps;i++){
   const data=await page.evaluate(({time,width})=>{ctx.setTransform(width/900,0,0,width/900,0,0);renderScene(time);return exportCanvas.toDataURL('image/jpeg',.98).split(',')[1];},{time:i/fps,width});
   if(errors.length)throw Error(errors.join('\n'));
   if(!encoder.stdin.write(Buffer.from(data,'base64')))await once(encoder.stdin,'drain');
   if(i%150===0)console.log(`已渲染 ${i}/${duration*fps} 帧`);
  }
  encoder.stdin.end();const [code]=await completed;fs.closeSync(log);if(code!==0)throw Error(fs.readFileSync(path.join(work,'ffmpeg.log'),'utf8'));
  console.log('完成：'+output);fs.rmSync(work,{recursive:true});
 }finally{await browser.close();if(encoder&&encoder.exitCode===null)encoder.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
