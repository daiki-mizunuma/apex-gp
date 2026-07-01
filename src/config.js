/* =====================================================================
   APEX GP — Config (game-wide constants)
   ===================================================================== */
export const TOTAL_LAPS = 3;
export const NUM_CARS   = 6;            // 1 player + 5 AI
export const ROAD_HALF  = 7.0;          // half road width (m) — ~14 m, Tsukuba-like
export const KERB_W     = 1.3;
export const OFFTRACK   = ROAD_HALF + KERB_W;     // beyond this = grass
export const WALL_LAT   = ROAD_HALF + KERB_W + 9; // hard limit
export const N          = 720;          // centreline samples
export const TOP_SPEED  = 76;           // m/s (~274 km/h)
export const GRIP       = 20;           // lateral accel on track
export const GRIP_GRASS = 8;
