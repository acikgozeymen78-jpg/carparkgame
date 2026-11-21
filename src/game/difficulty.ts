import type {
  AABB,
  DifficultyPreference,
  DifficultyTier,
  DynamicDifficultyState,
  LevelConfig,
  MovingGate,
  PropObstacle,
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

/**
 * Generates a guaranteed-solvable 3D labyrinth parking level whose size,
 * corridor width, moving barrier gates, and time/collision budgets scale
 * with both levelNumber and the active dynamic difficulty tier.
 */
export function generateLabyrinthLevel(
  levelNumber: number,
  tier: DifficultyTier,
): LevelConfig {
  const tierIndex =
    tier === 'caylak' ? 0 : tier === 'usta' ? 1 : tier === 'profesyonel' ? 2 : 3;

  // Grid dimensions grow progressively with level & difficulty
  const cols = Math.min(7, 3 + Math.floor((levelNumber + tierIndex) / 2));
  const rows = Math.min(7, 3 + Math.floor((levelNumber + tierIndex + 1) / 2));

  // Generous corridor width for comfortable 3D driving, slightly tighter on higher tiers
  const cellSize = Math.max(8.2, 10.2 - tierIndex * 0.45 - Math.min(levelNumber, 6) * 0.1);
  const wallThickness = 1.05;

  const seed = levelNumber * 9173 + tierIndex * 357 + 42;
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

  // Recursive backtracker maze carving starting at (0, 0)
  const stack: Cell[] = [grid[0][0]];
  grid[0][0].visited = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Array<{ cell: Cell; dir: 'N' | 'S' | 'E' | 'W'; opp: 'N' | 'S' | 'E' | 'W' }> = [];

    if (current.r > 0 && !grid[current.r - 1][current.c].visited) {
      neighbors.push({ cell: grid[current.r - 1][current.c], dir: 'N', opp: 'S' });
    }
    if (current.r < rows - 1 && !grid[current.r + 1][current.c].visited) {
      neighbors.push({ cell: grid[current.r + 1][current.c], dir: 'S', opp: 'N' });
    }
    if (current.c < cols - 1 && !grid[current.r][current.c + 1].visited) {
      neighbors.push({ cell: grid[current.r][current.c + 1], dir: 'E', opp: 'W' });
    }
    if (current.c > 0 && !grid[current.r][current.c - 1].visited) {
      neighbors.push({ cell: grid[current.r][current.c - 1], dir: 'W', opp: 'E' });
    }

    if (neighbors.length > 0) {
      const pick = neighbors[Math.floor(rand() * neighbors.length)];
      current.walls[pick.dir] = false;
      pick.cell.walls[pick.opp] = false;
      pick.cell.visited = true;
      stack.push(pick.cell);
    } else {
      stack.pop();
    }
  }

  // Add a few strategic loops on larger grids so multiple tactical lines exist
  const extraLoops = Math.floor((cols * rows) * (0.08 + tierIndex * 0.02));
  for (let i = 0; i < extraLoops; i++) {
    const r = Math.floor(rand() * (rows - 1));
    const c = Math.floor(rand() * (cols - 1));
    if (rand() > 0.5) {
      grid[r][c].walls.E = false;
      grid[r][c + 1].walls.W = false;
    } else {
      grid[r][c].walls.S = false;
      grid[r + 1][c].walls.N = false;
    }
  }

  // BFS from spawn (0, 0) to find farthest cell for the parking bay & track path
  const dist: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const parent: Array<Array<{ c: number; r: number } | null>> = Array.from({ length: rows }, () =>
    Array(cols).fill(null),
  );
  const queue: Array<{ c: number; r: number }> = [{ c: 0, r: 0 }];
  dist[0][0] = 0;

  let farthest = { c: cols - 1, r: rows - 1, d: 0 };

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cell = grid[cur.r][cur.c];
    const d = dist[cur.r][cur.c];
    if (d > farthest.d) {
      farthest = { c: cur.c, r: cur.r, d };
    }
    const moves: Array<{ nc: number; nr: number; open: boolean }> = [
      { nc: cur.c, nr: cur.r - 1, open: !cell.walls.N },
      { nc: cur.c, nr: cur.r + 1, open: !cell.walls.S },
      { nc: cur.c + 1, nr: cur.r, open: !cell.walls.E },
      { nc: cur.c - 1, nr: cur.r, open: !cell.walls.W },
    ];
    for (const m of moves) {
      if (
        m.open &&
        m.nr >= 0 &&
        m.nr < rows &&
        m.nc >= 0 &&
        m.nc < cols &&
        dist[m.nr][m.nc] === -1
      ) {
        dist[m.nr][m.nc] = d + 1;
        parent[m.nr][m.nc] = cur;
        queue.push({ c: m.nc, r: m.nr });
      }
    }
  }

  // Reconstruct path from (0,0) to farthest
  const path: Array<{ c: number; r: number }> = [];
  let trace: { c: number; r: number } | null = { c: farthest.c, r: farthest.r };
  while (trace) {
    path.unshift(trace);
    trace = parent[trace.r][trace.c];
  }

  const originX = -(cols * cellSize) / 2;
  const originZ = -(rows * cellSize) / 2;
  const cellCenter = (c: number, r: number) => ({
    x: originX + (c + 0.5) * cellSize,
    z: originZ + (r + 0.5) * cellSize,
  });

  // Determine spawn orientation facing the first open corridor cell!
  // Coordinate convention: yaw = 0 faces -Z (North), +PI/2 faces -X (West), -PI/2 faces +X (East), PI faces +Z (South)
  // Wait: let's define car forward vector clearly in physics.ts as:
  // forward = (-Math.sin(yaw), -Math.cos(yaw)) or (Math.sin(yaw), Math.cos(yaw))
  // Let's standardize across physics & Three.js:
  // In Three.js, car mesh local front points toward -Z when yaw = 0, OR +Z when yaw = 0.
  // Standard Three.js forward for yaw = 0: local +Z or -Z. Let's use forward = (Math.sin(yaw), Math.cos(yaw))
  // Wait: in Three.js rotating Y by `yaw` rotates (0, 0, 1) -> (sin(yaw), 0, cos(yaw)).
  // So if car mesh nose points to +Z: forward = (Math.sin(yaw), Math.cos(yaw))!
  // Let's verify: yaw = 0 -> (0, +1) [South/+Z]; yaw = +PI/2 -> (+1, 0) [East/+X]; yaw = PI -> (0, -1) [North/-Z].
  const spawnCenter = cellCenter(0, 0);
  const nextCell = path[1] ?? { c: 1, r: 0 };
  const dxSpawn = nextCell.c - 0;
  const dzSpawn = nextCell.r - 0;
  const spawnYaw = Math.atan2(dxSpawn, dzSpawn);

  // Parking bay orientation aligns with the entry corridor into the farthest cell
  const prevToGoal = path[path.length - 2] ?? { c: 0, r: 0 };
  const dxGoal = farthest.c - prevToGoal.c;
  const dzGoal = farthest.r - prevToGoal.r;
  const goalYaw = Math.atan2(dxGoal, dzGoal);
  const goalCenter = cellCenter(farthest.c, farthest.r);

  // Build wall AABBs from grid cell boundaries (deduplicated)
  const walls: AABB[] = [];

  // Outer perimeter walls (top/bottom horizontal, left/right vertical)
  const totalW = cols * cellSize;
  const totalD = rows * cellSize;
  walls.push({ x: 0, z: originZ, halfW: totalW / 2 + wallThickness / 2, halfD: wallThickness / 2 });
  walls.push({ x: 0, z: -originZ, halfW: totalW / 2 + wallThickness / 2, halfD: wallThickness / 2 });
  walls.push({ x: originX, z: 0, halfW: wallThickness / 2, halfD: totalD / 2 + wallThickness / 2 });
  walls.push({ x: -originX, z: 0, halfW: wallThickness / 2, halfD: totalD / 2 + wallThickness / 2 });

  // Internal cell walls (check South and East walls of each cell to avoid duplicates)
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

  // Dynamic Moving Barrier Gates on mid-path cells (starting level 2 or tier >= usta)
  const movingGates: MovingGate[] = [];
  const gateBudget =
    levelNumber === 1 && tierIndex === 0
      ? 0
      : Math.min(4, Math.floor((levelNumber + tierIndex) / 2));

  if (path.length >= 4 && gateBudget > 0) {
    const stride = Math.max(2, Math.floor((path.length - 2) / gateBudget));
    for (let i = 2; i < path.length - 1 && movingGates.length < gateBudget; i += stride) {
      const curr = path[i];
      const prev = path[i - 1];
      const pCenter = cellCenter(curr.c, curr.r);
      const movingAlongX = curr.r !== prev.r; // perpendicular to North-South travel
      movingGates.push({
        id: `gate-${movingGates.length}`,
        baseX: pCenter.x,
        baseZ: pCenter.z,
        axis: movingAlongX ? 'x' : 'z',
        amplitude: cellSize * 0.28,
        speed: 1.15 + tierIndex * 0.28 + Math.min(levelNumber, 8) * 0.06,
        phase: movingGates.length * 1.4,
        halfW: movingAlongX ? 1.05 : 0.45,
        halfD: movingAlongX ? 0.45 : 1.05,
      });
    }
  }

  // Traffic cones & bollards along corners (never blocking spawn or goal center)
  const props: PropObstacle[] = [];
  const propCount = Math.min(14, 2 + levelNumber + tierIndex * 2);
  for (let i = 0; i < propCount; i++) {
    const r = Math.floor(rand() * rows);
    const c = Math.floor(rand() * cols);
    if ((c === 0 && r === 0) || (c === farthest.c && r === farthest.r)) continue;
    const center = cellCenter(c, r);
    const cornerSignX = rand() > 0.5 ? 1 : -1;
    const cornerSignZ = rand() > 0.5 ? 1 : -1;
    const offset = cellSize * 0.31;
    props.push({
      x: center.x + cornerSignX * offset,
      z: center.z + cornerSignZ * offset,
      radius: 0.36,
      kind: i % 3 === 0 && tierIndex >= 1 ? 'bollard' : 'cone',
    });
  }

  const parTime = Math.round(14 + path.length * 3.4 - tierIndex * 1.6);
  const timeLimit = Math.round(parTime * (2.6 - tierIndex * 0.25));
  const maxCollisions = Math.max(3, 5 - tierIndex);

  return {
    levelNumber,
    cols,
    rows,
    cellSize,
    tier,
    tierMultiplier: TIER_MULTIPLIERS[tier],
    parTime,
    timeLimit,
    maxCollisions,
    spawn: {
      x: spawnCenter.x,
      z: spawnCenter.z,
      yaw: spawnYaw,
    },
    parking: {
      x: goalCenter.x,
      z: goalCenter.z,
      yaw: goalYaw,
      width: Math.max(3.15, 3.6 - tierIndex * 0.14),
      length: Math.max(5.2, 5.75 - tierIndex * 0.16),
    },
    walls,
    movingGates,
    props,
    shortestPathCells: path.length,
  };
}
