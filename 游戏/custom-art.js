/* New coats use the approved silhouette and gait, with all pattern paint clipped to each part. */
(function(root){
  'use strict';
  function path(commands){return new Path2D(commands.map(p=>p.join(' ')).join(' '));}
  function point(x,y){return [(x-440)*.44,(y-374)*.44];}
  function mapped(commands, transform) {
    return commands.map(command=>{
      const result=[command[0]];
      for(let i=1;i<command.length;i+=2) result.push.apply(result,transform.apply(null,point(command[i],command[i+1])));
      return result;
    });
  }
  function region(c,commands,base,draw){c.save();c.clip(path(commands));c.fillStyle=base;c.fillRect(-160,-205,370,250);if(draw)draw();c.restore();}
  function oval(c,x,y,rx,ry,color,transform){const p=transform.apply(null,point(x,y));c.beginPath();c.ellipse(p[0],p[1],rx*.44,ry*.44,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
  function drawPath(c,commands,color,transform){c.fillStyle=color;c.fill(path(mapped(commands,transform)));}
  root.FactoryCustomCoat=function(c,m,r){
    region(c,m.tail,r.base,()=>{
      if(r.tailBands) for(let i=0;i<3;i++) drawPath(c,[['M',210,90+i*49],['Q',265,75+i*49,310,108+i*49],['L',306,126+i*49],['Q',260,99+i*49,206,111+i*49],['Z']],r.ink,m.tailTransform);
    });
    for(const leg of m.legs) region(c,leg.commands,r.base,()=>{
      if(r.socks){c.fillStyle=r.accent;c.fillRect(leg.footX-30,leg.footY-14,60,35);}
    });
    region(c,m.body,r.base,()=>{
      if(r.pattern==='patch') {
        oval(c,324,234,58,72,r.ink,m.bodyTransform);oval(c,483,237,35,55,r.accent,m.bodyTransform);
      } else if(r.pattern==='stripe') {
        for(let i=0;i<5;i++) {const x=291+i*42;drawPath(c,[['M',x,163],['Q',x+27,222,x+19,263],['Q',x+10,286,x+4,264],['Q',x+10,217,x-12,164],['Z']],r.ink,m.bodyTransform);}
      } else if(r.pattern==='spots') {
        for(const p of r.spotData) {oval(c,p.x,p.y,p.rx,p.ry,r.ink,m.bodyTransform);oval(c,p.x+2,p.y,p.rx*.46,p.ry*.5,r.accent,m.bodyTransform);}
      }
      if(r.socks) oval(c,555,302,42,65,r.accent,m.bodyTransform);
    });
    region(c,m.head,r.base,()=>{
      if(r.mask==='cap') drawPath(c,[['M',430,18],['L',677,15],['L',692,124],['Q',605,148,562,111],['Q',498,166,430,127],['Z']],r.ink,m.headTransform);
      if(r.mask==='split') drawPath(c,[['M',430,12],['L',555,12],['Q',586,89,556,205],['L',431,240],['Z']],r.ink,m.headTransform);
      if(r.mask==='blaze') drawPath(c,[['M',575,52],['Q',580,110,632,196],['L',592,235],['L',542,215],['Q',575,140,575,52],['Z']],r.accent,m.headTransform);
      drawPath(c,[['M',465,81],['L',475,47],['L',500,73],['Z']],r.innerEar,m.headTransform);
      drawPath(c,[['M',615,59],['L',632,40],['L',642,79],['Z']],r.innerEar,m.headTransform);
      // Tiny base-color eye cushions guarantee readability on any face patch.
      oval(c,554,161,24,27,r.base,m.headTransform);oval(c,644,149,16,22,r.base,m.headTransform);
    });
  };
})(window);
