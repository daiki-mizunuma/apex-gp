/* =====================================================================
   APEX GP — Storage (localStorage persistence)
   - best lap + ghost are PER-CIRCUIT: 'apexgp_<circuit>_v1' (Tsukuba keeps
     the pre-multi-circuit key 'apexgp_tsukuba_v1' so old records survive).
     Rain laps get their own '_rain' records — a dry ghost is unbeatable at
     rain grip and a wet lap must never overwrite a dry record. Sunset
     shares the dry records (identical physics, only the light changes).
   - difficulty + BGM track are GLOBAL prefs: 'apexgp_prefs_v1'; on first
     read they migrate out of the legacy Tsukuba record, where they lived
     before circuits were selectable
   ===================================================================== */
import { currentCircuit } from './circuits.js';
import { gripFactor } from './weather.js';

const KEY = 'apexgp_' + currentCircuit().id + (gripFactor < 1 ? '_rain' : '') + '_v1';
const PREFS_KEY = 'apexgp_prefs_v1';
const LEGACY_KEY = 'apexgp_tsukuba_v1';

function defaults() {
  return { v: 1, bestLap: null, ghost: null };
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
    };
  } catch {
    return defaults();
  }
}

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw !== null) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        return {
          difficulty: typeof p.difficulty === 'string' ? p.difficulty : null,
          track: typeof p.track === 'number' ? p.track : null,
        };
      }
    }
    // no (or corrupt) prefs yet — seed from the legacy Tsukuba record
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch { /* ignore */ }
    const prefs = {
      difficulty: legacy && typeof legacy.difficulty === 'string' ? legacy.difficulty : null,
      track: legacy && typeof legacy.track === 'number' ? legacy.track : null,
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return prefs;
  } catch {
    return { difficulty: null, track: null };
  }
}

function writePrefs(patch) {
  try {
    const p = readPrefs();
    Object.assign(p, patch);
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable — no-op
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
  return readPrefs().difficulty;
}

export function saveDifficulty(key) {
  writePrefs({ difficulty: key });
}

export function loadTrack() {
  return readPrefs().track;
}

export function saveTrack(index) {
  writePrefs({ track: index });
}
