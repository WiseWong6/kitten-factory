/* Game-only collection choreography. Every pose comes from the playback clock. */
(function(root){
  'use strict';
  const start=5.8,release=7.06,arrival=7.52;
  const view={x:81,y:-50,scale:.82};
  // The collection button is centered at (401, 40) in the 450 × 600 design.
  const target={x:(802-view.x)/view.scale,y:(80-view.y)/view.scale};
  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=v=>{const u=clamp(v);return u*u*u*(10+u*(-15+6*u));};
  const lerp=(a,b,u)=>a+(b-a)*u;
  function curve(a,b,c,d,u){
    const v=1-u;
    return {x:v*v*v*a.x+3*v*v*u*b.x+3*v*u*u*c.x+u*u*u*d.x,
      y:v*v*v*a.y+3*v*v*u*b.y+3*v*u*u*c.y+u*u*u*d.y};
  }
  const tilt=Math.PI*.58,carry={x:760,y:260};
  // Release at the rim of the tilted basket, not at an unrelated screen point.
  const origin={x:carry.x+8*Math.sin(tilt),y:carry.y-8*Math.cos(tilt)};
  function at(time){
    const h={x:435,y:598,yaw:0,roll:0,locked:time<=start,loading:false,used:time<release,powder:time<release?1:0};
    if(time<6){h.yaw=lerp(0,-1,smooth((time-start)/.2));}
    else if(time<6.14){h.yaw=-1;h.y=lerp(598,624,smooth((time-6)/.14));}
    else if(time<6.82){
      const u=smooth((time-6.14)/.68);
      Object.assign(h,curve({x:435,y:624},{x:650,y:650},{x:760,y:460},carry,u));
      h.yaw=-1;h.roll=-.10*Math.sin(Math.PI*u);
    }else if(time<release){Object.assign(h,carry);h.yaw=-1;h.roll=tilt*smooth((time-6.82)/.24);}
    else if(time<7.18){
      const u=smooth((time-release)/.12);h.x=lerp(760,754,u);h.y=lerp(260,270,u);h.yaw=-1;h.roll=lerp(tilt,1.65,u);
    }else if(time<7.82){
      const u=smooth((time-7.18)/.64);
      Object.assign(h,curve({x:754,y:270},{x:742,y:448},{x:606,y:646},{x:435,y:624},u));
      h.yaw=-1;h.roll=1.65*(1-smooth((time-7.18)/.4));
    }else if(time<7.92){h.yaw=-1;h.y=lerp(624,598,smooth((time-7.82)/.1));}
    else{h.yaw=lerp(-1,0,smooth((time-7.92)/.08));h.locked=time>=8;}
    let puck=null;
    if(time>=release&&time<arrival){
      const u=clamp((time-release)/(arrival-release)),travel=smooth(u);
      puck=Object.assign(curve(origin,{x:origin.x+110,y:origin.y+18},{x:target.x+6,y:target.y+60},target,travel),{
        scale:lerp(.7,1.15,smooth(u/.3))*(1-.82*smooth((u-.6)/.4)),
        alpha:1-smooth((u-.72)/.28),angle:-.1*Math.sin(Math.PI*u),falling:true
      });
    }
    const catchU=clamp((time-(arrival-.05))/.36);
    const receive=Math.sin(Math.PI*catchU)*(1-catchU);
    return {handle:h,puck,receive};
  }
  const api={at,start,release,arrival,view,target,origin};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CatCollectionMotion=api;
})(typeof window!=='undefined'?window:globalThis);
