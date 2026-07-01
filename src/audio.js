/* =====================================================================
   APEX GP — AUDIO (Web Audio API: engine SFX, tyre screech, synth BGM)
   ===================================================================== */
import { TOP_SPEED } from './config.js';

export const Audio = (function(){
  let ctx=null, master=null, musicGain=null, sfxGain=null;
  let engOsc1=null, engOsc2=null, engGain=null, engFilter=null, sub=null, subGain=null, engHi=null, engHiGain=null, lastGear=1;
  let noiseBuf=null, screechSrc=null, screechGain=null, screechFilter=null;
  let started=false, muted=false;
  let schedTimer=null;

  function makeNoise(){
    const len=ctx.sampleRate*2; const b=ctx.createBuffer(1,len,ctx.sampleRate);
    const d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    return b;
  }
  function init(){
    if(started) return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    ctx=new AC();
    master=ctx.createGain(); master.gain.value=muted?0:0.9; master.connect(ctx.destination);
    musicGain=ctx.createGain(); musicGain.gain.value=0.33; musicGain.connect(master);
    sfxGain=ctx.createGain(); sfxGain.gain.value=0.9; sfxGain.connect(master);
    noiseBuf=makeNoise();

    // engine
    engFilter=ctx.createBiquadFilter(); engFilter.type='lowpass'; engFilter.frequency.value=900; engFilter.connect(sfxGain);
    engGain=ctx.createGain(); engGain.gain.value=0.0; engGain.connect(engFilter);
    engOsc1=ctx.createOscillator(); engOsc1.type='sawtooth'; engOsc1.frequency.value=70;
    engOsc2=ctx.createOscillator(); engOsc2.type='square'; engOsc2.frequency.value=71.5;
    engOsc1.connect(engGain); engOsc2.connect(engGain);
    subGain=ctx.createGain(); subGain.gain.value=0.0; subGain.connect(sfxGain);
    sub=ctx.createOscillator(); sub.type='sine'; sub.frequency.value=45; sub.connect(subGain);
    // high-rev "scream" harmonic (F1 character) — bypasses the lowpass via its own band-pass
    const engHiBP=ctx.createBiquadFilter(); engHiBP.type='bandpass'; engHiBP.frequency.value=3200; engHiBP.Q.value=0.8; engHiBP.connect(sfxGain);
    engHiGain=ctx.createGain(); engHiGain.gain.value=0.0; engHiGain.connect(engHiBP);
    engHi=ctx.createOscillator(); engHi.type='sawtooth'; engHi.frequency.value=600; engHi.connect(engHiGain);
    engOsc1.start(); engOsc2.start(); sub.start(); engHi.start();

    // tyre screech (looping filtered noise, gated)
    screechFilter=ctx.createBiquadFilter(); screechFilter.type='bandpass'; screechFilter.frequency.value=1400; screechFilter.Q.value=1.2;
    screechFilter.connect(sfxGain);
    screechGain=ctx.createGain(); screechGain.gain.value=0; screechGain.connect(screechFilter);
    screechSrc=ctx.createBufferSource(); screechSrc.buffer=noiseBuf; screechSrc.loop=true; screechSrc.connect(screechGain); screechSrc.start();

    started=true;
    startMusic();
  }

  // ---- exhaust crackle: short filtered-noise burst ----
  function burst(dur, hp, vol){
    const n=ctx.createBufferSource(); n.buffer=noiseBuf;
    const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp;
    const g=ctx.createGain(); const t=ctx.currentTime;
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    n.connect(f); f.connect(g); g.connect(sfxGain); n.start(t); n.stop(t+dur+0.02);
  }
  function backfire(){ burst(0.10, 1100, 0.34); }   // "blat" on upshift
  function pop(){ burst(0.045, 2400, 0.13); }        // overrun crackle
  function downfire(){                                 // downshift firing "braap"
    if(!started||!ctx) return;
    burst(0.16, 700, 0.42);
    const o=ctx.createOscillator(), g=ctx.createGain(), t=ctx.currentTime;
    o.type='sawtooth'; o.frequency.setValueAtTime(440,t); o.frequency.exponentialRampToValueAtTime(80,t+0.17);
    g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+0.22);
  }

  // ---- engine update each frame ----
  function engine(speed, throttle, on){
    if(!started||!ctx) return;
    const gear=Math.min(7, Math.floor(speed/(TOP_SPEED/7))+1);
    const band=TOP_SPEED/7;
    const local=Math.min(1,(speed-(gear-1)*band)/band);      // 0..1 within gear (revs)
    const revAbs=speed/TOP_SPEED;
    const now=ctx.currentTime;
    let f=95 + local*230 + gear*10 + (speed<1? Math.sin(now*5)*3:0);   // higher, F1-ish
    engOsc1.frequency.setTargetAtTime(f, now, 0.04);
    engOsc2.frequency.setTargetAtTime(f*1.5+1, now, 0.04);             // fifth -> raspier
    sub.frequency.setTargetAtTime(f*0.5, now, 0.06);
    engHi.frequency.setTargetAtTime(f*6 + 300, now, 0.035);            // the scream
    engHiGain.gain.setTargetAtTime(on ? (0.012 + 0.06*local*revAbs + 0.03*revAbs) : 0, now, 0.05);
    const vol = on ? (0.05 + 0.10*revAbs + 0.06*throttle) : 0.0;
    engGain.gain.setTargetAtTime(vol, now, 0.07);
    subGain.gain.setTargetAtTime(on?0.045+0.045*revAbs:0, now, 0.1);
    engFilter.frequency.setTargetAtTime(700 + local*3200 + gear*160, now, 0.05);
    if(on && gear>lastGear) backfire();                       // upshift "blat"
    lastGear = gear;
    if(on && throttle<0.05 && speed>28 && Math.random()<0.12) pop();   // overrun crackle
  }
  function screech(amount){
    if(!started||!ctx) return;
    screechGain.gain.setTargetAtTime(Math.min(0.3, amount*0.3), ctx.currentTime, 0.05);
  }
  function thud(intensity){
    if(!started||!ctx) return;
    const n=ctx.createBufferSource(); n.buffer=noiseBuf;
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=240;
    const g=ctx.createGain();
    const t=ctx.currentTime;
    g.gain.setValueAtTime(Math.min(0.9,intensity), t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.25);
    n.connect(f); f.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t+0.3);
  }

  // ---- original music loop ----
  const BPM=114, STEP=60/BPM/4;        // 16th, fusion groove
  let nextTime=0, step=0;
  function mid(n){ return 440*Math.pow(2,(n-69)/12); }
  // Original jazz-fusion vamp (I–vi–ii–V in A): Amaj7 - F#m7 - Bm7 - E7
  const ROOT=[45,42,47,40];
  const CHORD=[[57,61,64,68],[54,57,61,64],[59,62,66,69],[52,56,59,62]];
  const BASSPAT=[0,null,0,7,null,0,null,12,0,null,7,null,0,null,10,null];   // syncopated funk
  const EPPAT  =[0,0,1,0,0,1,1,0,0,0,1,0,0,1,1,0];                          // off-beat EP comping
  const KICK   =[1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0];
  const SNARE  =[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0];
  // Original sax-like lead over the 4 bars: [absStep, midi, durSteps]
  const MEL={};
  [[0,76,3],[3,73,1],[4,69,2],[7,71,1],[8,73,4],[13,69,1],[14,68,2],
   [16,78,2],[18,76,1],[19,73,1],[20,69,3],[24,66,2],[27,69,1],[28,73,4],
   [32,74,2],[34,78,2],[36,81,3],[40,78,1],[41,76,1],[42,74,2],[44,71,4],
   [48,71,1],[49,74,1],[50,76,2],[52,80,2],[54,78,1],[55,76,1],[56,74,2],[58,71,2],[60,73,4]
  ].forEach(a=>{MEL[a[0]]={m:a[1],d:a[2]};});

  function kick(t){ const o=ctx.createOscillator(),g=ctx.createGain();
    o.frequency.setValueAtTime(155,t); o.frequency.exponentialRampToValueAtTime(48,t+0.11);
    g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t+0.22); }
  function snare(t,ghost){ const n=ctx.createBufferSource(); n.buffer=noiseBuf;
    const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=1700;
    const g=ctx.createGain(); g.gain.setValueAtTime(ghost?0.12:0.45,t); g.gain.exponentialRampToValueAtTime(0.001,t+(ghost?0.08:0.17));
    n.connect(f); f.connect(g); g.connect(musicGain); n.start(t); n.stop(t+0.2); }
  function hat(t,acc){ const n=ctx.createBufferSource(); n.buffer=noiseBuf;
    const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=8500;
    const g=ctx.createGain(); g.gain.setValueAtTime(acc?0.16:0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
    n.connect(f); f.connect(g); g.connect(musicGain); n.start(t); n.stop(t+0.05); }
  function bass(t,freq){ const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type='sawtooth'; o.frequency.value=freq; f.type='lowpass'; f.frequency.value=520;
    g.gain.setValueAtTime(0.0,t); g.gain.linearRampToValueAtTime(0.30,t+0.012); g.gain.setTargetAtTime(0.0001,t+0.14,0.09);
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t+STEP*2); }
  function ep(t,notes){ notes.forEach((nn,k)=>{ if(k>3)return;
    const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type='sine'; o2.type='triangle'; o.frequency.value=mid(nn); o2.frequency.value=mid(nn); o2.detune.value=6;
    f.type='lowpass'; f.frequency.value=1900;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.05,t+0.015); g.gain.exponentialRampToValueAtTime(0.0006,t+STEP*2.4);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o2.start(t); o.stop(t+STEP*2.6); o2.stop(t+STEP*2.6); }); }
  function lead(t,freq,dur){ const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type='sawtooth'; o2.type='triangle'; o2.detune.value=4;
    o.frequency.setValueAtTime(freq*0.991,t); o.frequency.linearRampToValueAtTime(freq,t+0.05);
    o2.frequency.setValueAtTime(freq*0.991,t); o2.frequency.linearRampToValueAtTime(freq,t+0.05);
    f.type='lowpass'; f.frequency.value=2300;
    const d=Math.max(0.12,dur);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.15,t+0.025); g.gain.setValueAtTime(0.13,t+d*0.6); g.gain.exponentialRampToValueAtTime(0.0008,t+d+0.1);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o2.start(t); o.stop(t+d+0.14); o2.stop(t+d+0.14); }

  function scheduleStep(s,t){
    const bar=Math.floor(s/16)%4, w=s%16, root=ROOT[bar], chord=CHORD[bar];
    if(KICK[w]) kick(t);
    if(SNARE[w]) snare(t,false);
    if(w===14) snare(t,true);
    hat(t, w%4===2);
    const bo=BASSPAT[w]; if(bo!==null) bass(t, mid(root+bo));
    if(EPPAT[w]) ep(t, chord);
    const m=MEL[s%64]; if(m) lead(t, mid(m.m), m.d*STEP);
  }
  function scheduler(){
    if(!started||!ctx) return;
    while(nextTime < ctx.currentTime + 0.12){
      scheduleStep(step, nextTime);
      nextTime += STEP; step=(step+1)%64;
    }
  }
  function startMusic(){
    nextTime=ctx.currentTime+0.1; step=0;
    if(schedTimer) clearInterval(schedTimer);
    schedTimer=setInterval(scheduler,25);
  }
  function setMuted(m){ muted=m; if(master&&ctx) master.gain.setTargetAtTime(m?0:0.9, ctx.currentTime,0.05); }
  function isMuted(){ return muted; }
  function resume(){ if(ctx&&ctx.state==='suspended') ctx.resume(); }
  return { init, engine, screech, thud, downfire, setMuted, isMuted, resume, get started(){return started;} };
})();
