/* =====================================================================
   APEX GP — AUDIO (Web Audio API: engine SFX, tyre screech, synth BGM)
   ===================================================================== */
import { TOP_SPEED } from './config.js';

export const Audio = (function(){
  let ctx=null, master=null, musicGain=null, sfxGain=null;
  let engOsc1=null, engOsc2=null, engGain=null, engFilter=null, sub=null, subGain=null, engHi=null, engHiGain=null, engHiBP=null, lastGear=1;
  let noiseBuf=null, screechSrc=null, screechGain=null, screechFilter=null;
  let leadDelayIn=null;
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

    // engine — V12, 4-stroke: 6 firings per crank revolution, so the
    // fundamental "buzz" = (RPM/60)*6. See engine() for the RPM model.
    engFilter=ctx.createBiquadFilter(); engFilter.type='lowpass'; engFilter.frequency.value=900; engFilter.connect(sfxGain);
    engGain=ctx.createGain(); engGain.gain.value=0.0; engGain.connect(engFilter);
    engOsc1=ctx.createOscillator(); engOsc1.type='sawtooth'; engOsc1.frequency.value=400;      // fundamental (firing frequency)
    engOsc2=ctx.createOscillator(); engOsc2.type='square'; engOsc2.frequency.value=800;        // 2nd harmonic -> buzzy edge
    engOsc1.connect(engGain); engOsc2.connect(engGain);
    subGain=ctx.createGain(); subGain.gain.value=0.0; subGain.connect(sfxGain);
    sub=ctx.createOscillator(); sub.type='sine'; sub.frequency.value=67; sub.connect(subGain);  // crank rotation -> mechanical rumble
    // high-rev "scream" harmonic (F1 V12 character) — bypasses the lowpass via
    // its own band-pass, which tracks the harmonic's frequency so it stays
    // audible (rather than filtered out) as revs climb toward redline
    engHiBP=ctx.createBiquadFilter(); engHiBP.type='bandpass'; engHiBP.frequency.value=1200; engHiBP.Q.value=1.0; engHiBP.connect(sfxGain);
    engHiGain=ctx.createGain(); engHiGain.gain.value=0.0; engHiGain.connect(engHiBP);
    engHi=ctx.createOscillator(); engHi.type='sawtooth'; engHi.frequency.value=1200; engHi.connect(engHiGain);
    engOsc1.start(); engOsc2.start(); sub.start(); engHi.start();

    // tyre screech (looping filtered noise, gated)
    screechFilter=ctx.createBiquadFilter(); screechFilter.type='bandpass'; screechFilter.frequency.value=1400; screechFilter.Q.value=1.2;
    screechFilter.connect(sfxGain);
    screechGain=ctx.createGain(); screechGain.gain.value=0; screechGain.connect(screechFilter);
    screechSrc=ctx.createBufferSource(); screechSrc.buffer=noiseBuf; screechSrc.loop=true; screechSrc.connect(screechGain); screechSrc.start();

    // shared feedback delay bus for the lead voice (tracks opt in via voice.delayMix)
    leadDelayIn=ctx.createGain(); leadDelayIn.gain.value=1;
    const dly=ctx.createDelay(1.0); dly.delayTime.value=0.27;
    const dlyFilt=ctx.createBiquadFilter(); dlyFilt.type='lowpass'; dlyFilt.frequency.value=2600;   // darken the repeats
    const fb=ctx.createGain(); fb.gain.value=0.32;
    leadDelayIn.connect(dly); dly.connect(dlyFilt); dlyFilt.connect(fb); fb.connect(dly); dlyFilt.connect(musicGain);

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

  // ---- engine update each frame: V12 firing-order model ----
  // A 4-stroke V12 fires once per cylinder every 2 crank revolutions, i.e.
  // 12/2 = 6 power strokes per revolution, so the fundamental exhaust "buzz"
  // frequency is (RPM/60)*6. Each of the 7 gear bands sweeps roughly idle
  // (4000 RPM) up to redline (12000 RPM) as revs climb through the gear.
  const IDLE_RPM=4000, REDLINE_RPM=12000, FIRINGS_PER_REV=6;
  function engine(speed, throttle, on){
    if(!started||!ctx) return;
    const gear=Math.min(7, Math.floor(speed/(TOP_SPEED/7))+1);
    const band=TOP_SPEED/7;
    const local=Math.min(1,(speed-(gear-1)*band)/band);      // 0..1 within gear (revs)
    const revAbs=speed/TOP_SPEED;
    const now=ctx.currentTime;
    let rpm = IDLE_RPM + local*(REDLINE_RPM-IDLE_RPM);
    if(speed<1) rpm += Math.sin(now*5)*80;                    // idling isn't perfectly steady
    const revNorm = Math.min(1, (rpm-IDLE_RPM)/(REDLINE_RPM-IDLE_RPM));  // 0 at gear-start, 1 at redline
    const fund = (rpm/60)*FIRINGS_PER_REV;                    // firing frequency (fundamental)
    engOsc1.frequency.setTargetAtTime(fund, now, 0.04);       // fundamental
    engOsc2.frequency.setTargetAtTime(fund*2, now, 0.04);     // 2nd harmonic -> buzzy edge
    sub.frequency.setTargetAtTime(rpm/60, now, 0.06);         // crank rotation -> mechanical rumble
    const screamFreq = fund*3;                                // 3rd harmonic -> the high-rev scream
    engHi.frequency.setTargetAtTime(screamFreq, now, 0.035);
    engHiBP.frequency.setTargetAtTime(screamFreq, now, 0.035);  // keep the band-pass centred on it
    engHiGain.gain.setTargetAtTime(on ? (0.006 + 0.18*revNorm*revNorm*revAbs) : 0, now, 0.05);  // opens up sharply near redline
    const vol = on ? (0.05 + 0.10*revAbs + 0.06*throttle) : 0.0;
    engGain.gain.setTargetAtTime(vol, now, 0.07);
    subGain.gain.setTargetAtTime(on?0.05+0.05*revAbs:0, now, 0.1);
    engFilter.frequency.setTargetAtTime(900 + revNorm*4200 + gear*160, now, 0.05);
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

  // ---- music engine: a 4-bar / 64-step sequencer driven by per-track data ----
  function mid(n){ return 440*Math.pow(2,(n-69)/12); }
  function buildMelLookup(mel){ const o={}; mel.forEach(m=>{ o[m.step]={m:m.note,d:m.dur}; }); return o; }

  // Each track supplies: bpm, root (4 bar roots), chords (4x4 voicing), 16-step
  // bassPattern (semitone offset from that bar's root, or null), padPattern/
  // kickPattern/snarePattern (16-step 0/1 hit patterns), melody (note events
  // across the 64-step loop), and per-instrument "voice" timbre parameters.
  // All patterns/melodies below are original compositions written for this game.
  const TRACKS=[
    { name:'MIDNIGHT VECTOR',                             // synthwave night-drive
      bpm:100,
      root:[45,41,48,43],
      chords:[[57,64,67,71],[53,57,60,64],[60,64,67,71],[55,59,62,69]],
      bassPattern:[0,null,0,null,12,null,0,3,0,null,0,null,12,null,7,10],
      padPattern:[1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0],
      kickPattern:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snarePattern:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      melody:[{step:0,note:76,dur:4},{step:4,note:72,dur:2},{step:8,note:69,dur:3},{step:12,note:71,dur:3},{step:16,note:69,dur:2},{step:18,note:72,dur:2},{step:22,note:77,dur:4},{step:26,note:76,dur:2},{step:28,note:72,dur:3},
        {step:32,note:67,dur:2},{step:34,note:76,dur:3},{step:38,note:74,dur:2},{step:40,note:72,dur:2},{step:42,note:71,dur:2},{step:44,note:67,dur:4},{step:48,note:69,dur:2},{step:50,note:74,dur:2},{step:52,note:78,dur:3},
        {step:55,note:76,dur:1},{step:56,note:74,dur:2},{step:60,note:71,dur:2},{step:62,note:69,dur:2}],
      voices:{
        bass:{ osc:'sawtooth', osc2:'sine', filterFreq:380 },
        pad: { osc1:'sawtooth', osc2:'sawtooth', detune:12, filterType:'lowpass', filterFreq:1400, attack:0.06 },
        lead:{ osc1:'sawtooth', osc2:'sawtooth', detune:9, filterType:'lowpass', filterFreq:2600, scoop:0.993, delayMix:0.22 },
      }
    },
    { name:'REDLINE ASCENSION',                           // epic cinematic tension-builder
      bpm:128,
      root:[50,46,41,48],
      chords:[[50,53,57,62],[46,50,53,58],[41,45,48,53],[48,52,55,60]],
      bassPattern:[0,null,7,null,0,null,7,10,0,null,7,null,0,7,10,12],
      padPattern:[1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      kickPattern:[1,0,0,1,0,0,1,0,1,0,0,1,0,1,0,0],
      snarePattern:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      melody:[{step:0,note:74,dur:3},{step:3,note:77,dur:1},{step:4,note:79,dur:2},{step:6,note:81,dur:2},{step:8,note:77,dur:3},{step:12,note:74,dur:2},{step:14,note:72,dur:2},
        {step:16,note:70,dur:3},{step:19,note:74,dur:1},{step:20,note:77,dur:2},{step:22,note:81,dur:2},{step:24,note:82,dur:3},{step:28,note:79,dur:2},{step:30,note:77,dur:2},
        {step:32,note:77,dur:2},{step:34,note:77,dur:1},{step:35,note:79,dur:1},{step:36,note:81,dur:2},{step:38,note:84,dur:2},{step:40,note:81,dur:3},{step:44,note:79,dur:1},{step:45,note:77,dur:1},{step:46,note:74,dur:2},
        {step:48,note:72,dur:3},{step:51,note:74,dur:1},{step:52,note:77,dur:2},{step:54,note:79,dur:2},{step:56,note:81,dur:4},{step:60,note:79,dur:2},{step:62,note:77,dur:2}],
      voices:{
        bass:{ osc:'sawtooth', osc2:'sine', filterFreq:900, filterFreqEnd:450, filterEnvTime:0.09 },
        pad: { osc1:'sawtooth', osc2:'sawtooth', detune:7, filterType:'lowpass', filterFreq:2000, attack:0.06 },
        lead:{ osc1:'sawtooth', osc2:'triangle', detune:5, filterType:'lowpass', filterFreq:3200, filterFreqEnd:2200, filterEnvTime:0.09, filterQ:1.2, scoop:0.975, scoopTime:0.08 },
      }
    },
    { name:'MIDNIGHT MOTORWAY',                           // upbeat 70s funk/disco
      bpm:112,
      root:[40,45,40,47],
      chords:[[56,59,62,66],[61,64,67,71],[56,59,62,66],[59,63,66,69]],
      bassPattern:[0,0,null,0,7,null,0,10,null,0,null,7,12,null,10,7],
      padPattern:[0,1,0,1,0,0,1,0,0,1,0,1,0,0,1,0],
      kickPattern:[1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      snarePattern:[0,0,1,0,0,0,1,0,0,0,1,0,0,1,1,0],
      melody:[{step:2,note:71,dur:2},{step:4,note:76,dur:3},{step:8,note:75,dur:1},{step:9,note:76,dur:1},{step:10,note:78,dur:3},{step:14,note:76,dur:2},{step:18,note:71,dur:2},
        {step:20,note:73,dur:1},{step:21,note:71,dur:1},{step:22,note:68,dur:4},{step:28,note:71,dur:1},{step:29,note:73,dur:1},{step:30,note:75,dur:2},{step:34,note:78,dur:2},{step:36,note:80,dur:3},
        {step:40,note:78,dur:1},{step:41,note:80,dur:1},{step:42,note:83,dur:3},{step:46,note:80,dur:2},{step:50,note:75,dur:2},{step:52,note:76,dur:1},{step:53,note:75,dur:1},{step:54,note:71,dur:4},
        {step:59,note:73,dur:1},{step:60,note:75,dur:1},{step:61,note:71,dur:1},{step:62,note:68,dur:2}],
      voices:{
        bass:{ osc:'sawtooth', filterFreq:700, filterFreqEnd:380, filterEnvTime:0.045 },
        pad: { osc1:'square', osc2:'sine', detune:0, filterType:'bandpass', filterFreq:1500, filterQ:3.5, attack:0.006, decayMul:0.5 },
        lead:{ osc1:'sawtooth', osc2:'square', detune:3, filterType:'lowpass', filterFreq:2400, scoop:0.991 },
      }
    },
    { name:'REDLINE HORIZON',                             // uptempo Japanese-style fusion/jazz-rock
      bpm:158,
      root:[43,38,45,41],
      chords:[[62,67,71,74],[57,62,65,69],[64,69,72,76],[60,65,69,72]],
      bassPattern:[0,null,12,7,null,10,null,0,12,null,7,10,0,null,12,7],
      padPattern:[1,0,0,1,0,1,0,0,1,0,0,1,0,1,1,0],
      kickPattern:[1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      snarePattern:[0,0,1,0,0,0,1,0,0,0,1,0,0,1,1,0],
      melody:[{step:0,note:79,dur:2},{step:2,note:82,dur:2},{step:4,note:79,dur:1},{step:5,note:76,dur:1},{step:6,note:74,dur:2},{step:8,note:79,dur:3},{step:12,note:81,dur:1},{step:13,note:79,dur:1},{step:14,note:77,dur:2},
        {step:16,note:74,dur:2},{step:18,note:77,dur:2},{step:20,note:74,dur:1},{step:21,note:72,dur:1},{step:22,note:69,dur:2},{step:24,note:74,dur:4},{step:29,note:77,dur:1},{step:30,note:79,dur:2},
        {step:32,note:84,dur:2},{step:34,note:81,dur:1},{step:35,note:79,dur:1},{step:36,note:77,dur:2},{step:38,note:79,dur:2},{step:40,note:76,dur:3},{step:44,note:78,dur:1},{step:45,note:76,dur:1},{step:46,note:74,dur:2},
        {step:48,note:79,dur:2},{step:50,note:82,dur:2},{step:52,note:79,dur:1},{step:53,note:77,dur:1},{step:54,note:74,dur:2},{step:56,note:72,dur:4},{step:61,note:74,dur:1},{step:62,note:77,dur:2}],
      voices:{
        bass:{ osc:'sawtooth', filterFreq:850, filterFreqEnd:480, filterEnvTime:0.05 },
        pad: { osc1:'square', osc2:'sine', detune:0, filterType:'bandpass', filterFreq:1800, filterQ:2.5, attack:0.006, decayMul:0.6 },
        lead:{ osc1:'sawtooth', osc2:'triangle', detune:8, filterType:'lowpass', filterFreq:2900, filterQ:1.2, scoop:0.985, scoopTime:0.04, attack:0.015 },
      }
    },
  ];
  TRACKS.forEach(tr=>{ tr.melLookup=buildMelLookup(tr.melody); });

  let curTrackIdx=0;
  let STEP=60/TRACKS[0].bpm/4;          // 16th-note duration, recomputed on track switch
  let nextTime=0, step=0;
  const SILENT=TRACKS.length;           // virtual slot after the real tracks = no BGM

  function setTrack(idx){
    const n=TRACKS.length+1;            // real tracks + silent slot
    curTrackIdx=((idx%n)+n)%n;
    if(curTrackIdx===SILENT) return;    // silent: scheduler idles, nothing to resync
    STEP=60/TRACKS[curTrackIdx].bpm/4;
    if(started){ step=0; nextTime=ctx.currentTime+0.05; }   // resync cleanly at the switch point
  }
  function nextTrack(){ setTrack(curTrackIdx+1); return getTrackName(); }
  function getTrackName(){ return curTrackIdx===SILENT ? 'BGM なし' : TRACKS[curTrackIdx].name; }
  function getTrackIndex(){ return curTrackIdx; }

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
  function bass(t,freq,v){
    const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type=v.osc||'sawtooth'; o.frequency.value=freq;
    let o2=null;
    if(v.osc2){ o2=ctx.createOscillator(); o2.type=v.osc2; o2.frequency.value=freq/2; }   // sub layer, an octave down
    f.type='lowpass';
    if(v.filterFreqEnd!=null){ f.frequency.setValueAtTime(v.filterFreq,t); f.frequency.exponentialRampToValueAtTime(v.filterFreqEnd,t+(v.filterEnvTime||0.08)); }
    else f.frequency.value=v.filterFreq;
    g.gain.setValueAtTime(0.0,t); g.gain.linearRampToValueAtTime(0.30,t+0.012); g.gain.setTargetAtTime(0.0001,t+0.14,0.09);
    o.connect(f);
    if(o2){ const g2=ctx.createGain(); g2.gain.value=0.5; o2.connect(g2); g2.connect(f); }
    f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t+STEP*2); if(o2){ o2.start(t); o2.stop(t+STEP*2); }
  }
  function pad(t,notes,v){ notes.forEach((nn,k)=>{ if(k>3)return;
    const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type=v.osc1||'sine'; o2.type=v.osc2||'triangle'; o.frequency.value=mid(nn); o2.frequency.value=mid(nn); o2.detune.value=v.detune!=null?v.detune:6;
    f.type=v.filterType||'lowpass'; f.frequency.value=v.filterFreq||1900; if(v.filterQ!=null) f.Q.value=v.filterQ;
    const atk=v.attack!=null?v.attack:0.015, dec=v.decayMul!=null?v.decayMul:2.4;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.05,t+atk); g.gain.exponentialRampToValueAtTime(0.0006,t+STEP*dec);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o2.start(t); o.stop(t+STEP*dec+0.15); o2.stop(t+STEP*dec+0.15); }); }
  function lead(t,freq,dur,v){
    const o=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
    o.type=v.osc1||'sawtooth'; o2.type=v.osc2||'triangle'; o2.detune.value=v.detune!=null?v.detune:4;
    const scoop=v.scoop!=null?v.scoop:0.991, scoopT=v.scoopTime!=null?v.scoopTime:0.05;
    o.frequency.setValueAtTime(freq*scoop,t); o.frequency.linearRampToValueAtTime(freq,t+scoopT);
    o2.frequency.setValueAtTime(freq*scoop,t); o2.frequency.linearRampToValueAtTime(freq,t+scoopT);
    f.type=v.filterType||'lowpass';
    if(v.filterFreqEnd!=null){ f.frequency.setValueAtTime(v.filterFreq,t); f.frequency.exponentialRampToValueAtTime(v.filterFreqEnd,t+(v.filterEnvTime||0.09)); }
    else f.frequency.value=v.filterFreq||2300;
    if(v.filterQ!=null) f.Q.value=v.filterQ;
    const d=Math.max(0.12,dur), atk=v.attack!=null?v.attack:0.025;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.15,t+atk); g.gain.setValueAtTime(0.13,t+d*0.6); g.gain.exponentialRampToValueAtTime(0.0008,t+d+0.1);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicGain);
    if(v.delayMix){ const send=ctx.createGain(); send.gain.value=v.delayMix; g.connect(send); send.connect(leadDelayIn); }
    o.start(t); o2.start(t); o.stop(t+d+0.14); o2.stop(t+d+0.14);
  }

  function scheduleStep(s,t){
    const tr=TRACKS[curTrackIdx];
    const bar=Math.floor(s/16)%4, w=s%16, root=tr.root[bar], chord=tr.chords[bar];
    if(tr.kickPattern[w]) kick(t);
    if(tr.snarePattern[w]) snare(t,false);
    if(tr.ghostSnare && tr.ghostSnare[w]) snare(t,true);
    hat(t, w%4===2);
    const bo=tr.bassPattern[w]; if(bo!=null) bass(t, mid(root+bo), tr.voices.bass);
    if(tr.padPattern[w]) pad(t, chord, tr.voices.pad);
    const m=tr.melLookup[s%64]; if(m) lead(t, mid(m.m), m.d*STEP, tr.voices.lead);
  }
  function scheduler(){
    if(!started||!ctx) return;
    // silent slot: schedule nothing, but keep the resume point pinned just
    // ahead so switching back to a real track doesn't burst catch-up notes
    if(curTrackIdx===SILENT){ nextTime=ctx.currentTime+0.05; return; }
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
  return { init, engine, screech, thud, downfire, setMuted, isMuted, resume, setTrack, nextTrack, getTrackName, getTrackIndex, get started(){return started;} };
})();
