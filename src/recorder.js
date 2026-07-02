// recorder.js -- APEX GP
// Records a car's position/heading/speed over one lap as compact numeric
// samples, and provides playback helpers for ghost cars and race replays.
// Zero external dependencies: operates only on plain numbers/arrays.
//
// Frame layout (array of 6 numbers): [t, frac, x, z, heading, speed]
//   t       seconds elapsed since the start of the current lap
//   frac    lap progress fraction in [0, 1), monotonically increasing
//   x, z    world position (metres)
//   heading car heading in radians; forward = (Math.sin(heading), 0, Math.cos(heading))
//   speed   scalar speed in m/s (negative when reversing)

export function newRecording(){
  return { frames: [] };
}

export function recordSample(rec, t, frac, x, z, heading, speed){
  const frames = rec.frames;
  if(frames.length>0 && t<=frames[frames.length-1][0]) return;
  frames.push([
    Math.round(t*1000)/1000,
    Math.round(frac*1000)/1000,
    Math.round(x*100)/100,
    Math.round(z*100)/100,
    Math.round(heading*1000)/1000,
    Math.round(speed*10)/10,
  ]);
}

// Wrap an angle difference into the range [-PI, PI].
function wrapAngleDelta(d){
  d = d % (Math.PI*2);
  if(d>Math.PI) d -= Math.PI*2;
  if(d<-Math.PI) d += Math.PI*2;
  return d;
}

// Binary-search frames for the largest index whose value at `key`
// (a function frame -> number) is <= target. Assumes values are sorted
// non-decreasing across frames. Returns -1 if target is before frames[0].
function findFloorIndex(frames, target, key){
  let lo=0, hi=frames.length-1, result=-1;
  while(lo<=hi){
    const mid=(lo+hi)>>1;
    if(key(frames[mid])<=target){ result=mid; lo=mid+1; }
    else hi=mid-1;
  }
  return result;
}

export function sampleAt(frames, t){
  if(!frames || frames.length===0) return null;

  const first = frames[0];
  const last = frames[frames.length-1];

  if(t<=first[0]) return { x:first[2], z:first[3], heading:first[4], speed:first[5] };
  if(t>=last[0]) return null;

  const i = findFloorIndex(frames, t, f=>f[0]);
  const a = frames[i];
  const b = frames[i+1];

  const span = b[0]-a[0];
  const u = span>0 ? (t-a[0])/span : 0;

  const x = a[2] + (b[2]-a[2])*u;
  const z = a[3] + (b[3]-a[3])*u;
  const speed = a[5] + (b[5]-a[5])*u;
  const heading = a[4] + wrapAngleDelta(b[4]-a[4])*u;

  return { x, z, heading, speed };
}

export function frameTimeAtProgress(frames, frac){
  if(!frames || frames.length===0) return null;

  const first = frames[0];
  const last = frames[frames.length-1];

  if(frac<first[1] || frac>last[1]) return null;
  if(frac===first[1]) return first[0];
  if(frac===last[1]) return last[0];

  const i = findFloorIndex(frames, frac, f=>f[1]);
  // i could be -1 only if frac < first[1], already excluded above.
  const a = frames[i];
  const b = frames[Math.min(i+1, frames.length-1)];

  const span = b[1]-a[1];
  const u = span>0 ? (frac-a[1])/span : 0;

  return a[0] + (b[0]-a[0])*u;
}
