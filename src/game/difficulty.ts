import type {
  AABB,
  ArenaBounds,
  BonusToken,
  BoostPad,
  CheckpointGate,
  CourseArchetype,
  DifficultyPreference,
  DifficultyTier,
  DynamicDifficultyState,
  HighwayExitSpec,
  LevelConfig,
  MapDesignPreference,
  MovingGate,
  PropObstacle,
  RoadTile,
  RoadTileKind,
  RoundaboutIsland,
  TrafficLightSpec,
} from '../types/game';

export const TIER_LABELS: Record<DifficultyTier, string> = {
  caylak: 'Çaylak',
  usta: 'Usta',
  profesyonel: 'Profesyonel',
  efsane: 'Efsane',
};

export const TIER_MULTIPLIERS: Record<DifficultyTier, number> = {
  caylak: 1.0,
  usta: 1.35,
  profesyonel: 1.75,
  efsane: 2.25,
};

export const ARCHETYPE_ORDER: CourseArchetype[] = [
  'classic_maze',
  'slalom_chicane',
  'twin_avenue',
  'construction_zone',
  'spiral_citadel',
  'double_roundabout',
];

export const SPECIAL_TRACK_ARCHETYPE: CourseArchetype = 'grand_prix_arena';

export const ARCHETYPE_LABELS: Record<CourseArchetype, string> = {
  classic_maze: 'Klasik Labirent',
  slalom_chicane: 'Slalom & Şikan',
  double_roundabout: 'Çift Döner Kavşak',
  construction_zone: 'Şantiye Parkuru',
  twin_avenue: 'Çift Bulvar',
  spiral_citadel: 'Spiral Kale',
  grand_prix_arena: 'Özel Arena Pisti',
};

export function isHighwayExitLevel(levelNumber: number): boolean {
  return levelNumber > 0 && levelNumber % 5 === 0;
}

export function resolveCourseArchetype(
  levelNumber: number,
  preference: MapDesignPreference = 'auto',
): CourseArchetype {
  if (preference !== 'auto') return preference;
  const idx = Math.max(0, levelNumber - 1) % ARCHETYPE_ORDER.length;
  return ARCHETYPE_ORDER[idx];
}

export function tierFromSkill(skillRating: number): DifficultyTier {
  if (skillRating >= 80) return 'efsane';
  if (skillRating >= 55) return 'profesyonel';
  if (skillRating >= 30) return 'usta';
  return 'caylak';
}

export function resolveActiveTier(state: DynamicDifficultyState): DifficultyTier {
  if (state.preference !== 'dynamic') {
    return state.preference;
  }
  return tierFromSkill(state.skillRating);
}

export function createInitialDifficultyState(): DynamicDifficultyState {
  return {
    preference: 'dynamic',
    skillRating: 22,
    activeTier: 'caylak',
    consecutiveCleanRuns: 0,
    recentFailures: 0,
    lastShift: 'steady',
  };
}

export function updateDynamicDifficulty(
  prev: DynamicDifficultyState,
  outcome: {
    victory: boolean;
    elapsedTime: number;
    parTime: number;
    collisions: number;
  },
): DynamicDifficultyState {
  const prevTier = resolveActiveTier(prev);
  let skill = prev.skillRating;
  let consecutiveCleanRuns = prev.consecutiveCleanRuns;
  let recentFailures = prev.recentFailures;

  if (outcome.victory) {
    recentFailures = 0;
    const ratio = outcome.elapsedTime / Math.max(1, outcome.parTime);
    let delta = 7;
    if (outcome.collisions === 0) {
      consecutiveCleanRuns += 1;
      delta += 6;
    } else {
      consecutiveCleanRuns = 0;
      delta -= Math.min(5, outcome.collisions * 2);
    }
    if (ratio <= 0.72) delta += 7;
    else if (ratio <= 0.95) delta += 3;
    else if (ratio > 1.3) delta -= 3;

    if (consecutiveCleanRuns >= 2) delta += 4;
    skill = Math.max(0, Math.min(100, skill + delta));
  } else {
    consecutiveCleanRuns = 0;
    recentFailures += 1;
    const penalty = recentFailures >= 2 ? 12 : 7;
    skill = Math.max(0, Math.min(100, skill - penalty));
  }

  const nextState: DynamicDifficultyState = {
    preference: prev.preference,
    skillRating: skill,
    activeTier: prev.preference === 'dynamic' ? tierFromSkill(skill) : prev.preference,
    consecutiveCleanRuns,
    recentFailures,
    lastShift: 'steady',
  };

  const order: Record<DifficultyTier, number> = {
    caylak: 0,
    usta: 1,
    profesyonel: 2,
    efsane: 3,
  };
  if (order[nextState.activeTier] > order[prevTier]) {
    nextState.lastShift = 'up';
  } else if (order[nextState.activeTier] < order[prevTier]) {
    nextState.lastShift = 'down';
  }

  return nextState;
}

// Deterministic seeded PRNG (Mulberry32)
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Cell {
  c: number;
  r: number;
  walls: { N: boolean; S: boolean; E: boolean; W: boolean };
  visited: boolean;
}

type Dir = 'N' | 'S' | 'E' | 'W';

export function classifyRoadTile(
  openN: boolean,
  openS: boolean,
  openE: boolean,
  openW: boolean,
  isPlaza = false,
): RoadTileKind {
  if (isPlaza) return 'plaza';
  const count = (openN ? 1 : 0) + (openS ? 1 : 0) + (openE ? 1 : 0) + (openW ? 1 : 0);
  if (count >= 4) return 'cross';
  if (count === 3) return 'tJunction';
  if (count === 2) {
    if (openN && openS) return 'straightZ';
    if (openE && openW) return 'straightX';
    return 'corner';
  }
  return 'deadend';
}

function pointNearAABB(x: number, z: number, pad: number, box: AABB): boolean {
  return (
    Math.abs(x - box.x) < box.halfW + pad &&
    Math.abs(z - box.z) < box.halfD + pad
  );
}

export function generateSpecialGrandPrixTrack(
  levelNumber: number,
  tier: DifficultyTier,
): LevelConfig {
  const tierIndex =
    tier === 'caylak' ? 0 : tier === 'usta' ? 1 : tier === 'profesyonel' ? 2 : 3;
  const cols = 7;
  const rows = 6;
  const cellSize = Math.max(9.2, 10.0 - tierIndex * 0.2);
  const wallThickness = 1.05;
  const perimeterThickness = 1.65;

  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        c,
        r,
        walls: { N: true, S: true, E: true, W: true },
        visited: true,
      });
    }
    grid.push(row);
  }

  const openWallBetween = (c: number, r: number, dir: Dir): void => {
    if (dir === 'N' && r > 0) {
      grid[r][c].walls.N = false;
      grid[r - 1][c].walls.S = false;
    } else if (dir === 'S' && r < rows - 1) {
      grid[r][c].walls.S = false;
      grid[r + 1][c].walls.N = false;
    } else if (dir === 'E' && c < cols - 1) {
      grid[r][c].walls.E = false;
      grid[r][c + 1].walls.W = false;
    } else if (dir === 'W' && c > 0) {
      grid[r][c].walls.W = false;
      grid[r][c - 1].walls.E = false;
    }
  };

  // Sector 1: 7-cell Eastbound Pit Drag Straightaway (row 0)
  for (let c = 0; c < cols - 1; c++) openWallBetween(c, 0, 'E');
  openWallBetween(6, 0, 'S');
  openWallBetween(6, 1, 'S');

  // Sector 2: East 2x2 Drift Roundabout Plaza (rc=4, rr=1)
  openWallBetween(4, 1, 'E');
  openWallBetween(4, 1, 'S');
  openWallBetween(5, 1, 'S');
  openWallBetween(4, 2, 'E');
  openWallBetween(5, 1, 'E');
  openWallBetween(5, 2, 'E');

  // Sector 3: Central Chicane & Signalized Crossroads (3,3)
  openWallBetween(4, 2, 'S');
  openWallBetween(4, 2, 'W');
  openWallBetween(4, 3, 'W');
  openWallBetween(3, 2, 'S');
  openWallBetween(3, 3, 'N');
  openWallBetween(3, 3, 'S');
  openWallBetween(3, 3, 'E');
  openWallBetween(3, 3, 'W');

  // North-West Technical Slalom Loop
  openWallBetween(0, 1, 'E');
  openWallBetween(1, 1, 'E');
  openWallBetween(2, 1, 'S');
  openWallBetween(2, 2, 'E');
  openWallBetween(0, 1, 'S');
  openWallBetween(0, 2, 'S');
  openWallBetween(0, 3, 'S');
  openWallBetween(0, 4, 'S');

  // Sector 4: West 2x2 Drift Roundabout Plaza (rc=1, rr=3)
  openWallBetween(1, 3, 'E');
  openWallBetween(1, 3, 'S');
  openWallBetween(2, 3, 'S');
  openWallBetween(1, 4, 'E');
  openWallBetween(1, 3, 'W');
  openWallBetween(1, 4, 'W');

  // Sector 5: South Hairpin Grand Straight & Pit-Stop Finish Bay (row 5)
  for (let c = 0; c < cols - 1; c++) openWallBetween(c, 5, 'E');
  openWallBetween(1, 4, 'S');
  openWallBetween(3, 4, 'S');
  openWallBetween(5, 3, 'S');
  openWallBetween(5, 4, 'S');
  openWallBetween(4, 4, 'E');

  const originX = -(cols * cellSize) / 2;
  const originZ = -(rows * cellSize) / 2;
  const cellCenter = (c: number, r: number) => ({
    x: originX + (c + 0.5) * cellSize,
    z: originZ + (r + 0.5) * cellSize,
  });

  const plazaCells = new Set<string>([
    '4,1', '5,1', '4,2', '5,2',
    '1,3', '2,3', '1,4', '2,4',
  ]);
  const roundabouts: RoundaboutIsland[] = [
    { x: originX + 5 * cellSize, z: originZ + 2 * cellSize, radius: 1.65 },
    { x: originX + 2 * cellSize, z: originZ + 4 * cellSize, radius: 1.65 },
  ];

  // Shortest-path BFS from (0,0) to Finish Pit Box (6,5)
  const distGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const queue: Array<{ c: number; r: number }> = [{ c: 0, r: 0 }];
  distGrid[0][0] = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = distGrid[cur.r][cur.c];
    const cell = grid[cur.r][cur.c];
    const nexts = [
      { ok: !cell.walls.N && cur.r > 0, nc: cur.c, nr: cur.r - 1 },
      { ok: !cell.walls.S && cur.r < rows - 1, nc: cur.c, nr: cur.r + 1 },
      { ok: !cell.walls.E && cur.c < cols - 1, nc: cur.c + 1, nr: cur.r },
      { ok: !cell.walls.W && cur.c > 0, nc: cur.c - 1, nr: cur.r },
    ];
    for (const s of nexts) {
      if (s.ok && distGrid[s.nr][s.nc] === -1) {
        distGrid[s.nr][s.nc] = d + 1;
        queue.push({ c: s.nc, r: s.nr });
      }
    }
  }

  const roadTiles: RoadTile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const openN = !cell.walls.N;
      const openS = !cell.walls.S;
      const openE = !cell.walls.E;
      const openW = !cell.walls.W;
      const center = cellCenter(c, r);
      roadTiles.push({
        x: center.x,
        z: center.z,
        openN,
        openS,
        openE,
        openW,
        kind: classifyRoadTile(openN, openS, openE, openW, plazaCells.has(`${c},${r}`)),
      });
    }
  }

  const totalW = cols * cellSize;
  const totalD = rows * cellSize;
  const walls: AABB[] = [
    { x: 0, z: originZ, halfW: totalW / 2 + perimeterThickness / 2, halfD: perimeterThickness / 2 },
    { x: 0, z: -originZ, halfW: totalW / 2 + perimeterThickness / 2, halfD: perimeterThickness / 2 },
    { x: originX, z: 0, halfW: perimeterThickness / 2, halfD: totalD / 2 + perimeterThickness / 2 },
    { x: -originX, z: 0, halfW: perimeterThickness / 2, halfD: totalD / 2 + perimeterThickness / 2 },
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const cx = originX + (c + 0.5) * cellSize;
      const cz = originZ + (r + 0.5) * cellSize;
      if (c < cols - 1 && cell.walls.E) {
        walls.push({
          x: originX + (c + 1) * cellSize,
          z: cz,
          halfW: wallThickness / 2,
          halfD: cellSize / 2 + wallThickness / 2,
        });
      }
      if (r < rows - 1 && cell.walls.S) {
        walls.push({
          x: cx,
          z: originZ + (r + 1) * cellSize,
          halfW: cellSize / 2 + wallThickness / 2,
          halfD: wallThickness / 2,
        });
      }
    }
  }

  const arenaBounds: ArenaBounds = {
    minX: originX + perimeterThickness * 0.5,
    maxX: -originX - perimeterThickness * 0.5,
    minZ: originZ + perimeterThickness * 0.5,
    maxZ: -originZ - perimeterThickness * 0.5,
  };

  const spawnPos = cellCenter(0, 0);
  const finishPos = cellCenter(6, 5);

  // Dynamic Pit/Chicane Gates cleanly placed on straight corridors
  const g1 = cellCenter(1, 1);
  const g2 = cellCenter(2, 5);
  const g3 = cellCenter(5, 4);
  const movingGates: MovingGate[] = [
    {
      id: 'gp-gate-1',
      baseX: g1.x,
      baseZ: g1.z,
      axis: 'z',
      amplitude: cellSize * 0.25,
      speed: 1.2 + tierIndex * 0.24,
      phase: 0.4,
      halfW: 0.44,
      halfD: 1.05,
    },
    {
      id: 'gp-gate-2',
      baseX: g2.x,
      baseZ: g2.z,
      axis: 'z',
      amplitude: cellSize * 0.26,
      speed: 1.3 + tierIndex * 0.24,
      phase: 2.1,
      halfW: 0.44,
      halfD: 1.05,
    },
    {
      id: 'gp-gate-3',
      baseX: g3.x,
      baseZ: g3.z,
      axis: 'x',
      amplitude: cellSize * 0.24,
      speed: 1.25 + tierIndex * 0.24,
      phase: 3.7,
      halfW: 1.05,
      halfD: 0.44,
    },
  ];

  // Trackside chicane cones & tire stack apex markers
  const props: PropObstacle[] = [
    { ...cellCenter(3, 0), x: cellCenter(3, 0).x, z: cellCenter(3, 0).z + cellSize * 0.28, radius: 0.38, kind: 'cone' },
    { ...cellCenter(4, 0), x: cellCenter(4, 0).x, z: cellCenter(4, 0).z - cellSize * 0.28, radius: 0.38, kind: 'cone' },
    { ...cellCenter(0, 2), x: cellCenter(0, 2).x + cellSize * 0.27, z: cellCenter(0, 2).z, radius: 0.46, kind: 'tire_stack' },
    { ...cellCenter(0, 4), x: cellCenter(0, 4).x - cellSize * 0.27, z: cellCenter(0, 4).z, radius: 0.46, kind: 'tire_stack' },
    { ...cellCenter(4, 5), x: cellCenter(4, 5).x, z: cellCenter(4, 5).z - cellSize * 0.27, radius: 0.48, kind: 'barricade', yaw: 0 },
  ];

  // Boost Pad Strips across Pit Straight, West Run, and Final Sprint
  const bp1 = cellCenter(2, 0);
  const bp2 = cellCenter(5, 0);
  const bp3 = cellCenter(0, 3);
  const bp4 = cellCenter(4, 5);
  const boostPads: BoostPad[] = [
    { id: 'gp-bp-1', x: bp1.x, z: bp1.z, yaw: Math.PI / 2, width: 2.5, length: 3.6 },
    { id: 'gp-bp-2', x: bp2.x, z: bp2.z, yaw: Math.PI / 2, width: 2.5, length: 3.6 },
    { id: 'gp-bp-3', x: bp3.x, z: bp3.z, yaw: 0, width: 2.4, length: 3.4 },
    { id: 'gp-bp-4', x: bp4.x, z: bp4.z, yaw: Math.PI / 2, width: 2.5, length: 3.6 },
  ];

  // Checkpoint Arches
  const cp1 = cellCenter(6, 1);
  const cp2 = cellCenter(1, 5);
  const cp3 = cellCenter(5, 5);
  const checkpoints: CheckpointGate[] = [
    { id: 'gp-cp-1', index: 1, x: cp1.x, z: cp1.z, yaw: 0, width: Math.min(4.8, cellSize - 2.4) },
    { id: 'gp-cp-2', index: 2, x: cp2.x, z: cp2.z, yaw: Math.PI / 2, width: Math.min(4.8, cellSize - 2.4) },
    { id: 'gp-cp-3', index: 3, x: cp3.x, z: cp3.z, yaw: Math.PI / 2, width: Math.min(4.8, cellSize - 2.4) },
  ];

  // Collectible Bonus Stars & Time Crystals
  const tokens: BonusToken[] = [
    { id: 'gp-tok-1', ...cellCenter(4, 0), kind: 'star' },
    { id: 'gp-tok-2', ...cellCenter(5, 2), kind: 'time' },
    { id: 'gp-tok-3', ...cellCenter(2, 1), kind: 'star' },
    { id: 'gp-tok-4', ...cellCenter(1, 4), kind: 'time' },
    { id: 'gp-tok-5', ...cellCenter(3, 5), kind: 'star' },
  ];

  // Realistic Traffic Light at Central 4-Way Grand Intersection (3,3)
  const tlCenter = cellCenter(3, 3);
  const trafficLights: TrafficLightSpec[] = [
    {
      id: 'gp-tl-center',
      x: tlCenter.x,
      z: tlCenter.z,
      cellSize,
      greenDuration: Math.max(4.8, 6.2 - tierIndex * 0.4),
      yellowDuration: 2.0,
      phaseOffset: 1.0,
      openN: true,
      openS: true,
      openE: true,
      openW: true,
    },
  ];

  const shortestPathCells = Math.max(12, distGrid[5][6]);
  const parTime = Math.round(18 + shortestPathCells * 2.5 - tierIndex * 1.4);
  const timeLimit = Math.round(parTime * (2.65 - tierIndex * 0.22));
  const maxCollisions = Math.max(4, 6 - tierIndex);

  return {
    levelNumber,
    archetype: 'grand_prix_arena',
    cols,
    rows,
    cellSize,
    tier,
    tierMultiplier: TIER_MULTIPLIERS[tier],
    parTime,
    timeLimit,
    maxCollisions,
    arenaBounds,
    spawn: {
      x: spawnPos.x,
      z: spawnPos.z,
      yaw: Math.PI / 2,
    },
    parking: {
      x: finishPos.x,
      z: finishPos.z,
      yaw: Math.PI / 2,
      width: Math.max(3.25, 3.7 - tierIndex * 0.14),
      length: Math.max(5.3, 5.85 - tierIndex * 0.16),
    },
    walls,
    movingGates,
    props,
    tokens,
    boostPads,
    checkpoints,
    roadTiles,
    roundabouts,
    trafficLights,
    shortestPathCells,
  };
}

/**
 * Generates a guaranteed-solvable 3D labyrinth parking level across 6 campaign
 * obstacle map designs plus the dedicated All-Vehicles Special Track (`grand_prix_arena`),
 * complete with straightaways, 4-way/T intersections, roundabout plazas, dynamic moving barrier
 * gates, and an open East exit expressway on every 5th campaign level (`levelNumber % 5 === 0`).
 */
export function generateLabyrinthLevel(
  levelNumber: number,
  tier: DifficultyTier,
  archetypeOverride?: MapDesignPreference,
): LevelConfig {
  const archetype = resolveCourseArchetype(levelNumber, archetypeOverride ?? 'auto');
  if (archetype === 'grand_prix_arena') {
    return generateSpecialGrandPrixTrack(levelNumber, tier);
  }

  const tierIndex =
    tier === 'caylak' ? 0 : tier === 'usta' ? 1 : tier === 'profesyonel' ? 2 : 3;
  const hasHighwayExit = isHighwayExitLevel(levelNumber);

  // Grid dimensions scale strictly upward with every level
  let baseCols = 3;
  let baseRows = 3;
  if (levelNumber === 2) {
    baseCols = 5;
    baseRows = 3;
  } else if (levelNumber === 3) {
    baseCols = 5;
    baseRows = 4;
  } else if (levelNumber === 4) {
    baseCols = 5;
    baseRows = 5;
  } else if (levelNumber === 5) {
    baseCols = 6;
    baseRows = 5;
  } else if (levelNumber === 6) {
    baseCols = 6;
    baseRows = 6;
  } else if (levelNumber === 7) {
    baseCols = 7;
    baseRows = 6;
  } else if (levelNumber >= 8) {
    const extra = levelNumber - 8;
    baseCols = Math.min(14, 8 + Math.ceil(extra / 2));
    baseRows = Math.min(13, 8 + Math.floor(extra / 2));
  }

  let cols = Math.min(16, baseCols + tierIndex);
  let rows = Math.min(15, baseRows + tierIndex);
  if (archetype === 'double_roundabout') {
    cols = Math.max(cols, 6);
    rows = Math.max(rows, 5);
  } else if (archetype === 'spiral_citadel' || archetype === 'twin_avenue') {
    cols = Math.max(cols, levelNumber >= 2 ? 5 : 4);
    rows = Math.max(rows, 4);
  }

  // Consistent corridor width so higher levels visibly grow in physical area
  const widthBonus =
    archetype === 'slalom_chicane' || archetype === 'construction_zone' ? 0.35 : 0;
  const cellSize = Math.max(8.8, 9.9 + widthBonus - tierIndex * 0.25);
  const wallThickness = 1.05;
  const perimeterThickness = 1.65;

  const archIdx = ARCHETYPE_ORDER.indexOf(archetype);
  const seed = levelNumber * 9173 + tierIndex * 357 + archIdx * 131 + 42;
  const rand = createRng(seed);

  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        c,
        r,
        walls: { N: true, S: true, E: true, W: true },
        visited: false,
      });
    }
    grid.push(row);
  }

  const openWallBetween = (c: number, r: number, dir: Dir): boolean => {
    if (dir === 'N' && r > 0) {
      grid[r][c].walls.N = false;
      grid[r - 1][c].walls.S = false;
      return true;
    }
    if (dir === 'S' && r < rows - 1) {
      grid[r][c].walls.S = false;
      grid[r + 1][c].walls.N = false;
      return true;
    }
    if (dir === 'E' && c < cols - 1) {
      grid[r][c].walls.E = false;
      grid[r][c + 1].walls.W = false;
      return true;
    }
    if (dir === 'W' && c > 0) {
      grid[r][c].walls.W = false;
      grid[r][c - 1].walls.E = false;
      return true;
    }
    return false;
  };

  const originX = -(cols * cellSize) / 2;
  const originZ = -(rows * cellSize) / 2;
  const cellCenter = (c: number, r: number) => ({
    x: originX + (c + 0.5) * cellSize,
    z: originZ + (r + 0.5) * cellSize,
  });

  // Reserve 2x2 Roundabout Plaza regions (centered on larger grids, twin corners for double_roundabout)
  const plazaRegions: Array<{ rc: number; rr: number }> = [];
  const plazaCells = new Set<string>();
  const registerPlaza = (rc: number, rr: number) => {
    plazaRegions.push({ rc, rr });
    plazaCells.add(`${rc},${rr}`);
    plazaCells.add(`${rc + 1},${rr}`);
    plazaCells.add(`${rc},${rr + 1}`);
    plazaCells.add(`${rc + 1},${rr + 1}`);
  };

  if (archetype === 'double_roundabout' && cols >= 6 && rows >= 5) {
    registerPlaza(1, 1);
    registerPlaza(cols - 3, rows - 3);
  } else if (cols >= 5 && rows >= 5) {
    const midRc = Math.max(1, Math.min(cols - 3, Math.floor(cols / 2) - 1));
    const midRr = Math.max(1, Math.min(rows - 3, Math.floor(rows / 2) - 1));
    registerPlaza(midRc, midRr);
  }

  if (archetype === 'spiral_citadel') {
    let top = 0;
    let bottom = rows - 1;
    let left = 0;
    let right = cols - 1;
    let curC = 0;
    let curR = 0;
    grid[0][0].visited = true;

    const stepTo = (nc: number, nr: number) => {
      if (nc === curC + 1 && nr === curR) openWallBetween(curC, curR, 'E');
      else if (nc === curC - 1 && nr === curR) openWallBetween(curC, curR, 'W');
      else if (nc === curC && nr === curR + 1) openWallBetween(curC, curR, 'S');
      else if (nc === curC && nr === curR - 1) openWallBetween(curC, curR, 'N');
      curC = nc;
      curR = nr;
      grid[curR][curC].visited = true;
    };

    while (top <= bottom && left <= right) {
      for (let c = curC + 1; c <= right; c++) stepTo(c, top);
      top++;
      if (top > bottom) break;
      for (let r = curR + 1; r <= bottom; r++) stepTo(right, r);
      right--;
      if (left > right) break;
      for (let c = curC - 1; c >= left; c--) stepTo(c, bottom);
      bottom--;
      if (top > bottom) break;
      for (let r = curR - 1; r >= top; r--) stepTo(left, r);
      left++;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].visited) {
          if (c > 0) openWallBetween(c, r, 'W');
          else if (r > 0) openWallBetween(c, r, 'N');
          grid[r][c].visited = true;
        }
      }
    }
    if (cols >= 5 && rows >= 5) {
      openWallBetween(Math.floor(cols / 2), 0, 'S');
      openWallBetween(cols - 1, Math.floor(rows / 2), 'W');
    }
  } else {
    const straightBias =
      archetype === 'slalom_chicane' || archetype === 'twin_avenue'
        ? 0.84
        : archetype === 'construction_zone'
          ? 0.72
          : 0.65;

    const stack: Array<{ cell: Cell; lastDir: Dir | null }> = [
      { cell: grid[0][0], lastDir: levelNumber % 2 === 0 ? 'S' : 'E' },
    ];
    grid[0][0].visited = true;

    // Give spawn an immediate 2-cell straight launch avenue on medium+ grids
    if (cols >= 4 && rows >= 4) {
      const launchDir: Dir = levelNumber % 2 === 0 ? 'S' : 'E';
      const first = launchDir === 'S' ? grid[1][0] : grid[0][1];
      const second = launchDir === 'S' ? grid[2][0] : grid[0][2];
      openWallBetween(0, 0, launchDir);
      first.visited = true;
      openWallBetween(first.c, first.r, launchDir);
      second.visited = true;
      stack.push({ cell: first, lastDir: launchDir });
      stack.push({ cell: second, lastDir: launchDir });
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const current = top.cell;
      const neighbors: Array<{ cell: Cell; dir: Dir }> = [];

      if (current.r > 0 && !grid[current.r - 1][current.c].visited) {
        neighbors.push({ cell: grid[current.r - 1][current.c], dir: 'N' });
      }
      if (current.r < rows - 1 && !grid[current.r + 1][current.c].visited) {
        neighbors.push({ cell: grid[current.r + 1][current.c], dir: 'S' });
      }
      if (current.c < cols - 1 && !grid[current.r][current.c + 1].visited) {
        neighbors.push({ cell: grid[current.r][current.c + 1], dir: 'E' });
      }
      if (current.c > 0 && !grid[current.r][current.c - 1].visited) {
        neighbors.push({ cell: grid[current.r][current.c - 1], dir: 'W' });
      }

      if (neighbors.length > 0) {
        const straightPick = top.lastDir
          ? neighbors.find((n) => n.dir === top.lastDir)
          : undefined;
        const pick =
          straightPick && rand() < straightBias
            ? straightPick
            : neighbors[Math.floor(rand() * neighbors.length)];

        openWallBetween(current.c, current.r, pick.dir);
        pick.cell.visited = true;
        stack.push({ cell: pick.cell, lastDir: pick.dir });
      } else {
        stack.pop();
      }
    }
  }

  // Twin Avenue enhancement: carve twin parallel high-speed boulevards
  if (archetype === 'twin_avenue' && cols >= 4 && rows >= 4) {
    for (let r = 0; r < rows - 1; r++) {
      openWallBetween(0, r, 'S');
      openWallBetween(cols - 1, r, 'S');
    }
    const midRow = Math.floor(rows / 2);
    for (let c = 0; c < cols - 1; c++) {
      openWallBetween(c, midRow, 'E');
    }
  }

  // Carve intentional 4-way crossroads
  const crossAnchors: Array<{ c: number; r: number }> = [];
  if (cols >= 3 && rows >= 3) {
    const targetCrossCount =
      archetype === 'twin_avenue'
        ? 3
        : cols >= 7
          ? 3
          : cols >= 5
            ? 2
            : 1;
    const candidateCenters: Array<{ c: number; r: number }> = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        candidateCenters.push({ c, r });
      }
    }
    for (
      let attempt = 0;
      attempt < candidateCenters.length && crossAnchors.length < targetCrossCount;
      attempt++
    ) {
      const idx = Math.floor(rand() * candidateCenters.length);
      const cand = candidateCenters.splice(idx, 1)[0];
      const tooClose = crossAnchors.some(
        (a) => Math.abs(a.c - cand.c) + Math.abs(a.r - cand.r) < 3,
      );
      if (tooClose) continue;
      crossAnchors.push(cand);
      openWallBetween(cand.c, cand.r, 'N');
      openWallBetween(cand.c, cand.r, 'S');
      openWallBetween(cand.c, cand.r, 'E');
      openWallBetween(cand.c, cand.r, 'W');
    }
  }

  // Carve reserved 2x2 Roundabout Plazas
  const roundabouts: RoundaboutIsland[] = [];
  for (const reg of plazaRegions) {
    const { rc, rr } = reg;
    openWallBetween(rc, rr, 'E');
    openWallBetween(rc, rr, 'S');
    openWallBetween(rc + 1, rr, 'S');
    openWallBetween(rc, rr + 1, 'E');
    openWallBetween(rc, rr, 'W');
    openWallBetween(rc + 1, rr, 'N');
    openWallBetween(rc + 1, rr + 1, 'E');

    roundabouts.push({
      x: originX + (rc + 1) * cellSize,
      z: originZ + (rr + 1) * cellSize,
      radius: 1.55,
    });
  }

  // Subtle extra loops for intersection variety
  if (archetype !== 'spiral_citadel') {
    const loopFactor = levelNumber >= 4 ? 0.02 : 0.04 + tierIndex * 0.01;
    const extraLoops = Math.floor(cols * rows * loopFactor);
    for (let i = 0; i < extraLoops; i++) {
      const r = Math.floor(rand() * (rows - 1));
      const c = Math.floor(rand() * (cols - 1));
      if (rand() > 0.5) openWallBetween(c, r, 'E');
      else openWallBetween(c, r, 'S');
    }
  }

  // Shortest-path BFS from spawn (0,0)
  const distGrid: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(-1),
  );
  const parentGrid: Array<Array<{ c: number; r: number } | null>> = Array.from(
    { length: rows },
    () => Array(cols).fill(null),
  );
  const queue: Array<{ c: number; r: number }> = [{ c: 0, r: 0 }];
  distGrid[0][0] = 0;

  let farthestAny = { c: cols - 1, r: rows - 1, d: 0 };
  let farthestValid = { c: cols - 1, r: rows - 1, d: -1 };
  let bestExitRow = { r: Math.floor(rows / 2), d: -1 };

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = distGrid[cur.r][cur.c];
    const key = `${cur.c},${cur.r}`;

    if (d > farthestAny.d) {
      farthestAny = { c: cur.c, r: cur.r, d };
    }
    if (!plazaCells.has(key) && d > farthestValid.d) {
      farthestValid = { c: cur.c, r: cur.r, d };
    }
    if (cur.c === cols - 1 && !plazaCells.has(key) && d > bestExitRow.d) {
      bestExitRow = { r: cur.r, d };
    }

    const cell = grid[cur.r][cur.c];
    const steps: Array<{ ok: boolean; nc: number; nr: number }> = [
      { ok: !cell.walls.N && cur.r > 0, nc: cur.c, nr: cur.r - 1 },
      { ok: !cell.walls.S && cur.r < rows - 1, nc: cur.c, nr: cur.r + 1 },
      { ok: !cell.walls.E && cur.c < cols - 1, nc: cur.c + 1, nr: cur.r },
      { ok: !cell.walls.W && cur.c > 0, nc: cur.c - 1, nr: cur.r },
    ];
    for (const s of steps) {
      if (s.ok && distGrid[s.nr][s.nc] === -1) {
        distGrid[s.nr][s.nc] = d + 1;
        parentGrid[s.nr][s.nc] = cur;
        queue.push({ c: s.nc, r: s.nr });
      }
    }
  }

  const targetCell = hasHighwayExit
    ? { c: cols - 1, r: bestExitRow.r, d: Math.max(3, bestExitRow.d) }
    : farthestValid.d >= 3
      ? farthestValid
      : farthestAny;

  // Reconstruct shortest path from (0,0) to targetCell
  const path: Array<{ c: number; r: number }> = [];
  let trace: { c: number; r: number } | null = { c: targetCell.c, r: targetCell.r };
  while (trace) {
    path.unshift(trace);
    trace = parentGrid[trace.r][trace.c];
  }

  const spawnCenter = cellCenter(0, 0);
  const nextCell = path[1] ?? (!grid[0][0].walls.E ? { c: 1, r: 0 } : { c: 0, r: 1 });
  const spawnYaw = Math.atan2(nextCell.c - 0, nextCell.r - 0);

  const prevToGoal = path[path.length - 2] ?? { c: 0, r: 0 };
  const goalYaw = hasHighwayExit
    ? Math.PI / 2
    : Math.atan2(targetCell.c - prevToGoal.c, targetCell.r - prevToGoal.r);
  const mazeGoalCenter = cellCenter(targetCell.c, targetCell.r);

  // Classify every cell for road markings
  const roadTiles: RoadTile[] = [];
  const tileKindMap = new Map<string, RoadTileKind>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const openN = !cell.walls.N;
      const openS = !cell.walls.S;
      const openE = !cell.walls.E || (hasHighwayExit && c === cols - 1 && r === targetCell.r);
      const openW = !cell.walls.W;
      const kind = classifyRoadTile(
        openN,
        openS,
        openE,
        openW,
        plazaCells.has(`${c},${r}`),
      );
      tileKindMap.set(`${c},${r}`, kind);
      const center = cellCenter(c, r);
      roadTiles.push({
        x: center.x,
        z: center.z,
        openN,
        openS,
        openE,
        openW,
        kind,
      });
    }
  }

  // Build structural wall AABBs (outer perimeter + interior corridor walls)
  const walls: AABB[] = [];
  const totalW = cols * cellSize;
  const totalD = rows * cellSize;

  // North, South, West solid outer perimeter walls
  walls.push({
    x: 0,
    z: originZ,
    halfW: totalW / 2 + perimeterThickness / 2,
    halfD: perimeterThickness / 2,
  });
  walls.push({
    x: 0,
    z: -originZ,
    halfW: totalW / 2 + perimeterThickness / 2,
    halfD: perimeterThickness / 2,
  });
  walls.push({
    x: originX,
    z: 0,
    halfW: perimeterThickness / 2,
    halfD: totalD / 2 + perimeterThickness / 2,
  });

  let highwayExit: HighwayExitSpec | undefined;
  if (hasHighwayExit) {
    const exitZ = mazeGoalCenter.z;
    const hwHalfWidth = cellSize * 0.5 - perimeterThickness * 0.5;
    const highwayTotalLength = 54;
    const startX = -originX;
    const endWallX = startX + highwayTotalLength;

    // Split East outer wall around the exit doorway
    const minOuterZ = originZ - perimeterThickness / 2;
    const maxOuterZ = -originZ + perimeterThickness / 2;
    const doorTopZ = exitZ - hwHalfWidth;
    const doorBotZ = exitZ + hwHalfWidth;

    const topSpan = doorTopZ - minOuterZ;
    if (topSpan > 0.25) {
      walls.push({
        x: startX,
        z: (minOuterZ + doorTopZ) * 0.5,
        halfW: perimeterThickness / 2,
        halfD: topSpan * 0.5,
      });
    }
    const botSpan = maxOuterZ - doorBotZ;
    if (botSpan > 0.25) {
      walls.push({
        x: startX,
        z: (doorBotZ + maxOuterZ) * 0.5,
        halfW: perimeterThickness / 2,
        halfD: botSpan * 0.5,
      });
    }

    // Highway corridor North, South & Far-East End-Stop walls
    walls.push({
      x: startX + highwayTotalLength * 0.5,
      z: exitZ - cellSize * 0.5,
      halfW: highwayTotalLength * 0.5 + perimeterThickness * 0.5,
      halfD: perimeterThickness / 2,
    });
    walls.push({
      x: startX + highwayTotalLength * 0.5,
      z: exitZ + cellSize * 0.5,
      halfW: highwayTotalLength * 0.5 + perimeterThickness * 0.5,
      halfD: perimeterThickness / 2,
    });
    walls.push({
      x: endWallX,
      z: exitZ,
      halfW: perimeterThickness / 2,
      halfD: cellSize * 0.5 + perimeterThickness / 2,
    });

    highwayExit = {
      exitZ,
      halfWidth: hwHalfWidth,
      startX,
      endX: endWallX - perimeterThickness * 0.5,
      length: highwayTotalLength,
    };
  } else {
    // Solid East outer perimeter wall
    walls.push({
      x: -originX,
      z: 0,
      halfW: perimeterThickness / 2,
      halfD: totalD / 2 + perimeterThickness / 2,
    });
  }

  const arenaBounds: ArenaBounds = {
    minX: originX + perimeterThickness * 0.5,
    maxX: -originX - perimeterThickness * 0.5,
    minZ: originZ + perimeterThickness * 0.5,
    maxZ: -originZ - perimeterThickness * 0.5,
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const cx = originX + (c + 0.5) * cellSize;
      const cz = originZ + (r + 0.5) * cellSize;
      if (c < cols - 1 && cell.walls.E) {
        walls.push({
          x: originX + (c + 1) * cellSize,
          z: cz,
          halfW: wallThickness / 2,
          halfD: cellSize / 2 + wallThickness / 2,
        });
      }
      if (r < rows - 1 && cell.walls.S) {
        walls.push({
          x: cx,
          z: originZ + (r + 1) * cellSize,
          halfW: cellSize / 2 + wallThickness / 2,
          halfD: wallThickness / 2,
        });
      }
    }
  }

  const finalGoalCenter = highwayExit
    ? { x: highwayExit.endX - 5.2, z: highwayExit.exitZ }
    : mazeGoalCenter;

  // Safety zone check for added chicane dividers, median blocks & obstacle props
  const launchAheadX = spawnCenter.x + Math.sin(spawnYaw) * 2.5;
  const launchAheadZ = spawnCenter.z + Math.cos(spawnYaw) * 2.5;

  const isSafeInteriorSpot = (
    x: number,
    z: number,
    halfW: number,
    halfD: number,
    extraPad = 0.5,
  ): boolean => {
    const pad = Math.max(halfW, halfD) + extraPad;
    if (Math.hypot(x - spawnCenter.x, z - spawnCenter.z) < 4.5 + pad) return false;
    if (Math.hypot(x - launchAheadX, z - launchAheadZ) < 4.2 + pad) return false;
    if (Math.hypot(x - finalGoalCenter.x, z - finalGoalCenter.z) < 4.9 + pad) return false;
    if (
      highwayExit &&
      x >= highwayExit.startX - cellSize &&
      Math.abs(z - highwayExit.exitZ) < cellSize * 0.6
    ) {
      return false;
    }
    for (const rb of roundabouts) {
      if (Math.hypot(x - rb.x, z - rb.z) < rb.radius + 3.2 + pad) return false;
    }
    return true;
  };

  // Archetype-specific interior concrete obstacles (away from plazas & exit zone)
  if (archetype === 'slalom_chicane') {
    let side = 1;
    for (let i = 1; i < path.length - 1; i++) {
      const curr = path[i];
      const kind = tileKindMap.get(`${curr.c},${curr.r}`);
      if (kind !== 'straightX' && kind !== 'straightZ') continue;
      const center = cellCenter(curr.c, curr.r);
      const halfSpan = Math.min(1.15, cellSize * 0.13);
      const offset = (cellSize * 0.5 - wallThickness * 0.5 - halfSpan) * side;
      const bx = kind === 'straightZ' ? center.x + offset : center.x;
      const bz = kind === 'straightX' ? center.z + offset : center.z;
      const hw = kind === 'straightZ' ? halfSpan : 0.42;
      const hd = kind === 'straightX' ? halfSpan : 0.42;
      if (isSafeInteriorSpot(bx, bz, hw, hd)) {
        walls.push({ x: bx, z: bz, halfW: hw, halfD: hd });
        side *= -1;
      }
    }
  } else if (archetype === 'construction_zone') {
    let side = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c + r) % 2 !== 0) continue;
        const kind = tileKindMap.get(`${c},${r}`);
        if (kind !== 'straightX' && kind !== 'straightZ') continue;
        const center = cellCenter(c, r);
        const halfSpan = 0.95;
        const offset = (cellSize * 0.5 - wallThickness * 0.5 - halfSpan) * side;
        const bx = kind === 'straightZ' ? center.x + offset : center.x;
        const bz = kind === 'straightX' ? center.z + offset : center.z;
        const hw = kind === 'straightZ' ? halfSpan : 0.44;
        const hd = kind === 'straightX' ? halfSpan : 0.44;
        if (isSafeInteriorSpot(bx, bz, hw, hd)) {
          walls.push({ x: bx, z: bz, halfW: hw, halfD: hd });
          side *= -1;
        }
      }
    }
  } else if (archetype === 'twin_avenue') {
    for (let r = 1; r < rows - 1; r += 2) {
      for (const c of [0, cols - 1]) {
        const kind = tileKindMap.get(`${c},${r}`);
        if (kind !== 'straightZ') continue;
        const center = cellCenter(c, r);
        if (isSafeInteriorSpot(center.x, center.z, 0.34, 1.35)) {
          walls.push({ x: center.x, z: center.z, halfW: 0.34, halfD: 1.35 });
        }
      }
    }
  }

  // Dynamic Moving Barrier Gates on flat straightaways/corridors
  const movingGates: MovingGate[] = [];
  const baseBudget =
    levelNumber === 1 && tierIndex === 0 && archetype === 'classic_maze'
      ? 0
      : Math.min(7, Math.floor((levelNumber + tierIndex + 1) / 2));
  const gateBudget =
    archetype === 'construction_zone'
      ? Math.max(2, Math.min(8, baseBudget + 2))
      : baseBudget;

  if (path.length >= 4 && gateBudget > 0) {
    const stride = Math.max(2, Math.floor((path.length - 2) / gateBudget));
    for (let i = 2; i < path.length - 1 && movingGates.length < gateBudget; i += stride) {
      const curr = path[i];
      const kind = tileKindMap.get(`${curr.c},${curr.r}`);
      if (kind === 'plaza' || kind === 'cross') continue;
      const prev = path[i - 1];
      const pCenter = cellCenter(curr.c, curr.r);
      const movingAlongX = curr.r !== prev.r;
      if (!isSafeInteriorSpot(pCenter.x, pCenter.z, 1.2, 1.2, 0.2)) continue;
      movingGates.push({
        id: `gate-${movingGates.length}`,
        baseX: pCenter.x,
        baseZ: pCenter.z,
        axis: movingAlongX ? 'x' : 'z',
        amplitude: cellSize * 0.28,
        speed:
          (archetype === 'construction_zone' ? 1.28 : 1.15) +
          tierIndex * 0.28 +
          Math.min(levelNumber, 10) * 0.05,
        phase: movingGates.length * 1.4,
        halfW: movingAlongX ? 1.05 : 0.45,
        halfD: movingAlongX ? 0.45 : 1.05,
      });
    }
  }

  // Helper to ensure ground props never overlap walls, ramps, gates, or tokens
  const isPropClear = (px: number, pz: number, radius: number, existingTokens: BonusToken[] = []): boolean => {
    if (!isSafeInteriorSpot(px, pz, radius, radius, 0.2)) return false;
    for (const w of walls) {
      if (pointNearAABB(px, pz, radius + 0.35, w)) return false;
    }
    for (const g of movingGates) {
      const span = g.amplitude + Math.max(g.halfW, g.halfD) + radius + 0.6;
      if (Math.hypot(px - g.baseX, pz - g.baseZ) < span) return false;
    }
    for (const tok of existingTokens) {
      if (Math.hypot(px - tok.x, pz - tok.z) < 2.2) return false;
    }
    return true;
  };

  // Par time, time limit & collision budget
  const shortestPathCells = path.length + (highwayExit ? 5 : 0);
  const parTime = Math.round(14 + shortestPathCells * 3.1 - tierIndex * 1.4);
  const timeLimit = Math.round(parTime * (2.65 - tierIndex * 0.24));
  const maxCollisions = Math.max(3, 5 - tierIndex + (levelNumber >= 5 ? 1 : 0));

  // Collectible bonus stars & time crystals (including highway crystal!)
  const tokens: BonusToken[] = [];
  if (highwayExit) {
    tokens.push({
      id: `tok-highway-${levelNumber}`,
      x: highwayExit.startX + 19,
      z: highwayExit.exitZ,
      kind: 'time',
    });
  }

  const tokenTarget = Math.min(6, 2 + Math.floor(levelNumber / 2));
  const usedCells = new Set<string>(['0,0', `${targetCell.c},${targetCell.r}`]);

  const candidateCells: Array<{ c: number; r: number }> = [];
  const pathSet = new Set(path.map((p) => `${p.c},${p.r}`));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (!usedCells.has(key) && !pathSet.has(key)) {
        candidateCells.push({ c, r });
      }
    }
  }
  for (let i = 1; i < path.length - 1; i += 2) {
    const key = `${path[i].c},${path[i].r}`;
    if (!usedCells.has(key)) candidateCells.push(path[i]);
  }

  for (let i = 0; i < candidateCells.length && tokens.length < tokenTarget; i++) {
    const pickIdx = Math.floor(rand() * candidateCells.length);
    const cell = candidateCells.splice(pickIdx, 1)[0];
    const key = `${cell.c},${cell.r}`;
    if (usedCells.has(key)) continue;
    usedCells.add(key);
    const center = cellCenter(cell.c, cell.r);
    const blockedByWall = walls.some((w) => pointNearAABB(center.x, center.z, 1.35, w));
    const blockedByRb = roundabouts.some((rb) => Math.hypot(center.x - rb.x, center.z - rb.z) < rb.radius + 1.4);
    if (blockedByWall || blockedByRb) continue;

    tokens.push({
      id: `tok-${levelNumber}-${tokens.length}`,
      x: center.x,
      z: center.z,
      kind: tokens.length === 0 && path.length >= 7 ? 'time' : 'star',
    });
  }

  // Archetype-styled obstacles & traffic props
  const props: PropObstacle[] = [];
  const tryPushProp = (prop: PropObstacle) => {
    if (!isPropClear(prop.x, prop.z, prop.radius, tokens)) return;
    if (props.some((other) => Math.hypot(prop.x - other.x, prop.z - other.z) < prop.radius + other.radius + 0.55)) {
      return;
    }
    props.push(prop);
  };

  if (archetype === 'slalom_chicane') {
    for (let i = 1; i < path.length - 1; i++) {
      const cell = path[i];
      const kind = tileKindMap.get(`${cell.c},${cell.r}`);
      if (kind !== 'straightX' && kind !== 'straightZ') continue;
      const cPos = cellCenter(cell.c, cell.r);
      const sign = i % 2 === 0 ? 1 : -1;
      const offset = cellSize * 0.24 * sign;
      tryPushProp({
        x: kind === 'straightZ' ? cPos.x + offset : cPos.x,
        z: kind === 'straightX' ? cPos.z + offset : cPos.z,
        radius: 0.44,
        kind: i % 3 === 0 ? 'tire_stack' : 'cone',
      });
    }
  } else if (archetype === 'construction_zone') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c === 0 && r === 0) || (c === targetCell.c && r === targetCell.r)) continue;
        if (plazaCells.has(`${c},${r}`)) continue;
        if (rand() > 0.65) continue;
        const center = cellCenter(c, r);
        const sx = rand() > 0.5 ? 1 : -1;
        const sz = rand() > 0.5 ? 1 : -1;
        const offset = cellSize * 0.29;
        const isBarricade = (c + r) % 2 === 0;
        tryPushProp({
          x: center.x + sx * offset,
          z: center.z + sz * offset,
          radius: isBarricade ? 0.52 : 0.36,
          kind: isBarricade ? 'barricade' : 'bollard',
          yaw: ((c + r) % 4) * (Math.PI * 0.25),
        });
      }
    }
  } else if (archetype === 'spiral_citadel' || archetype === 'double_roundabout') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = tileKindMap.get(`${c},${r}`);
        if (kind !== 'corner') continue;
        const center = cellCenter(c, r);
        const sx = grid[r][c].walls.E ? 1 : -1;
        const sz = grid[r][c].walls.S ? 1 : -1;
        tryPushProp({
          x: center.x + sx * (cellSize * 0.31),
          z: center.z + sz * (cellSize * 0.31),
          radius: 0.48,
          kind: 'tire_stack',
        });
      }
    }
  }

  const propCount = Math.min(26, 2 + levelNumber * 2 + tierIndex * 2);
  for (let i = 0; i < propCount; i++) {
    const r = Math.floor(rand() * rows);
    const c = Math.floor(rand() * cols);
    if ((c === 0 && r === 0) || (c === targetCell.c && r === targetCell.r)) continue;
    if (plazaCells.has(`${c},${r}`)) continue;
    const center = cellCenter(c, r);
    const cornerSignX = rand() > 0.5 ? 1 : -1;
    const cornerSignZ = rand() > 0.5 ? 1 : -1;
    const offset = cellSize * 0.31;
    const roll = i % 5;
    const kind: PropObstacle['kind'] =
      roll === 0 && tierIndex >= 1
        ? 'bollard'
        : roll === 3
          ? 'tire_stack'
          : roll === 4
            ? 'barricade'
            : 'cone';
    tryPushProp({
      x: center.x + cornerSignX * offset,
      z: center.z + cornerSignZ * offset,
      radius: kind === 'barricade' ? 0.52 : kind === 'tire_stack' ? 0.46 : 0.36,
      kind,
      yaw: rand() * Math.PI,
    });
  }

  // Boost Pad Strips (Turbo Hızlanma Şeritleri) + Twin Highway Boosters on % 5 === 0
  const boostPads: BoostPad[] = [];
  if (highwayExit) {
    boostPads.push(
      {
        id: `boost-hw-${levelNumber}-1`,
        x: highwayExit.startX + 10,
        z: highwayExit.exitZ,
        yaw: Math.PI / 2,
        width: 2.55,
        length: 3.8,
      },
      {
        id: `boost-hw-${levelNumber}-2`,
        x: highwayExit.startX + 28,
        z: highwayExit.exitZ,
        yaw: Math.PI / 2,
        width: 2.55,
        length: 3.8,
      },
    );
  }
  const boostBudget = (levelNumber >= 2 ? Math.min(4, 1 + Math.floor(levelNumber / 2)) : 1) + (highwayExit ? 2 : 0);
  for (let i = 1; i < path.length - 1 && boostPads.length < boostBudget; i++) {
    const curr = path[i];
    const prev = path[i - 1];
    const kind = tileKindMap.get(`${curr.c},${curr.r}`);
    if (kind !== 'straightX' && kind !== 'straightZ') continue;
    const center = cellCenter(curr.c, curr.r);
    const blockedByGate = movingGates.some(
      (g) => Math.hypot(center.x - g.baseX, center.z - g.baseZ) < 3.6,
    );
    const blockedByWall = walls.some((w) => pointNearAABB(center.x, center.z, 1.8, w));
    if (blockedByGate || blockedByWall) continue;
    const yaw = Math.atan2(curr.c - prev.c, curr.r - prev.r);
    boostPads.push({
      id: `boost-${levelNumber}-${boostPads.length}`,
      x: center.x,
      z: center.z,
      yaw,
      width: 2.35,
      length: 3.4,
    });
  }

  // Checkpoint Arches (Kontrol Kapıları) on flat path cells (plus Exit Gate Arch on highway levels)
  const checkpoints: CheckpointGate[] = [];
  const cpTarget = path.length >= 9 ? 3 : path.length >= 6 ? 2 : path.length >= 4 ? 1 : 0;
  if (cpTarget > 0) {
    for (let k = 1; k <= cpTarget; k++) {
      const idx = Math.max(
        1,
        Math.min(path.length - 2, Math.round((k * (path.length - 1)) / (cpTarget + 1))),
      );
      const curr = path[idx];
      const prev = path[idx - 1];
      const center = cellCenter(curr.c, curr.r);
      if (plazaCells.has(`${curr.c},${curr.r}`)) continue;
      if (boostPads.some((bp) => Math.hypot(bp.x - center.x, bp.z - center.z) < 3.0)) continue;
      if (movingGates.some((g) => Math.hypot(g.baseX - center.x, g.baseZ - center.z) < 2.8)) {
        continue;
      }
      if (walls.some((w) => pointNearAABB(center.x, center.z, 1.25, w))) continue;
      if (checkpoints.some((cp) => Math.hypot(cp.x - center.x, cp.z - center.z) < 4.0)) continue;
      const yaw = Math.atan2(curr.c - prev.c, curr.r - prev.r);
      checkpoints.push({
        id: `cp-${levelNumber}-${checkpoints.length}`,
        index: checkpoints.length + 1,
        x: center.x,
        z: center.z,
        yaw,
        width: Math.min(4.6, cellSize - 2.6),
      });
    }
  }

  if (highwayExit) {
    checkpoints.push({
      id: `cp-exit-${levelNumber}`,
      index: checkpoints.length + 1,
      x: highwayExit.startX + 1.2,
      z: highwayExit.exitZ,
      yaw: Math.PI / 2,
      width: Math.min(5.2, highwayExit.halfWidth * 1.5),
    });
  }

  // Realistic Traffic Lights placed at well-spaced 4-way & T intersections
  const trafficLights: TrafficLightSpec[] = [];
  const tlBudget = levelNumber === 1 ? 1 : Math.min(4, 1 + Math.floor(levelNumber / 2));
  const tlCandidates: Array<{
    c: number;
    r: number;
    tile: RoadTile;
    score: number;
  }> = [];

  for (const tile of roadTiles) {
    if (tile.kind !== 'cross' && tile.kind !== 'tJunction') continue;
    const c = Math.round((tile.x - originX) / cellSize - 0.5);
    const r = Math.round((tile.z - originZ) / cellSize - 0.5);
    if ((c === 0 && r === 0) || (c === targetCell.c && r === targetCell.r)) continue;
    if (plazaCells.has(`${c},${r}`)) continue;
    if (!isSafeInteriorSpot(tile.x, tile.z, 1.8, 1.8, 0.3)) continue;
    if (movingGates.some((g) => Math.hypot(g.baseX - tile.x, g.baseZ - tile.z) < 3.6)) continue;
    if (checkpoints.some((cp) => Math.hypot(cp.x - tile.x, cp.z - tile.z) < 3.6)) continue;
    if (boostPads.some((bp) => Math.hypot(bp.x - tile.x, bp.z - tile.z) < 3.6)) continue;

    const onMainPath = pathSet.has(`${c},${r}`) ? 10 : 0;
    const isCross = tile.kind === 'cross' ? 5 : 2;
    tlCandidates.push({ c, r, tile, score: onMainPath + isCross });
  }

  tlCandidates.sort((a, b) => b.score - a.score);
  const minSpacing = cellSize * 1.85;
  for (const cand of tlCandidates) {
    if (trafficLights.length >= tlBudget) break;
    const tooClose = trafficLights.some(
      (existing) => Math.hypot(existing.x - cand.tile.x, existing.z - cand.tile.z) < minSpacing,
    );
    if (tooClose) continue;
    trafficLights.push({
      id: `tl-${levelNumber}-${trafficLights.length}`,
      x: cand.tile.x,
      z: cand.tile.z,
      cellSize,
      greenDuration: Math.max(4.6, 6.2 - tierIndex * 0.4),
      yellowDuration: 2.0,
      phaseOffset: trafficLights.length * 3.2 + (levelNumber % 3) * 1.1,
      openN: cand.tile.openN,
      openS: cand.tile.openS,
      openE: cand.tile.openE,
      openW: cand.tile.openW,
    });
  }

  return {
    levelNumber,
    archetype,
    cols,
    rows,
    cellSize,
    tier,
    tierMultiplier: TIER_MULTIPLIERS[tier],
    parTime,
    timeLimit,
    maxCollisions,
    arenaBounds,
    spawn: {
      x: spawnCenter.x,
      z: spawnCenter.z,
      yaw: spawnYaw,
    },
    parking: {
      x: finalGoalCenter.x,
      z: finalGoalCenter.z,
      yaw: goalYaw,
      width: Math.max(3.15, 3.6 - tierIndex * 0.14),
      length: Math.max(5.2, 5.75 - tierIndex * 0.16),
    },
    walls,
    movingGates,
    props,
    tokens,
    boostPads,
    checkpoints,
    roadTiles,
    roundabouts,
    highwayExit,
    trafficLights,
    shortestPathCells,
  };
}


