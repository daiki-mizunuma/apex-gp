/* =====================================================================
   APEX GP — Storage (localStorage persistence for best lap, ghost,
   difficulty, and BGM track choice)
   ===================================================================== */
const KEY = 'apexgp_tsukuba_v1';

function defaults() {
  return { v: 1, bestLap: null, ghost: null, difficulty: null, track: null };
}

function readRecord() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return defaults();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults();
    return {
      v: 1,
      bestLap: typeof parsed.bestLap === 'number' ? parsed.bestLap : null,
      ghost: Array.isArray(parsed.ghost) ? parsed.ghost : null,
      difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty : null,
      track: typeof parsed.track === 'number' ? parsed.track : null,
    };
  } catch {
    return defaults();
  }
}

export function loadRecord() {
  return readRecord();
}

export function saveBestLap(timeSec, frames) {
  try {
    const rec = readRecord();
    if (rec.bestLap !== null && !(timeSec < rec.bestLap)) return false;
    rec.bestLap = timeSec; // never Infinity: JSON.stringify(Infinity) === 'null'
    rec.ghost = frames;
    localStorage.setItem(KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

export function loadDifficulty() {
  return readRecord().difficulty;
}

export function saveDifficulty(key) {
  try {
    const rec = readRecord();
    rec.difficulty = key;
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    // storage unavailable — no-op
  }
}

export function loadTrack() {
  return readRecord().track;
}

export function saveTrack(index) {
  try {
    const rec = readRecord();
    rec.track = index;
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    // storage unavailable — no-op
  }
}
