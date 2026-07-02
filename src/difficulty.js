/* =====================================================================
   APEX GP — DIFFICULTY (AI skill + rubber-banding presets & selection)
   ===================================================================== */

/* difficulty presets: AI skill range + rubber-banding clamp range */
export const DIFFICULTIES = {
  EASY:   { key:'EASY',   label:'EASY',   skillMin:0.62, skillMax:0.72, rubberMin:0.68, rubberMax:0.98 },
  NORMAL: { key:'NORMAL', label:'NORMAL', skillMin:0.74, skillMax:0.84, rubberMin:0.80, rubberMax:1.06 },
  HARD:   { key:'HARD',   label:'HARD',   skillMin:0.86, skillMax:0.97, rubberMin:0.90, rubberMax:1.14 }
};

/* mutable shared state — currently selected difficulty */
export const diffState = { key:'NORMAL' };

export function setDifficulty(key){
  diffState.key = DIFFICULTIES[key] ? key : 'NORMAL';
}

export function getDifficulty(){
  return DIFFICULTIES[diffState.key] || DIFFICULTIES.NORMAL;
}

export function getDifficultyKeys(){
  return ['EASY', 'NORMAL', 'HARD'];
}
