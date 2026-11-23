import type {
  AABB,
  ArenaBounds,
  BonusToken,
  BoostPad,
  CheckpointGate,
  DifficultyTier,
  LevelConfig,
  MovingGate,
  PropObstacle,
  RealWorldStreetMeta,
  RoadTile,
} from '../types/game';
import { classifyRoadTile, TIER_MULTIPLIERS } from './difficulty';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface WorldStreetSeed {
  id: string;
  cityLabel: string;
  lat: number;
  lng: number;
}

/**
 * Curated global street coordinate seeds used solely as starting coordinates
 * when the player requests a random real-world street via Google Maps API.
 */
export const WORLD_STREET_SEEDS: WorldStreetSeed[] = [
  { id: 'ist-galata', cityLabel: 'İstanbul, Beyoğlu', lat: 41.0256, lng: 28.9744 },
  { id: 'ist-kadikoy', cityLabel: 'İstanbul, Kadıköy', lat: 40.9879, lng: 29.0273 },
  { id: 'ist-nisantasi', cityLabel: 'İstanbul, Nişantaşı', lat: 41.0504, lng: 28.9936 },
  { id: 'ist-bebek', cityLabel: 'İstanbul, Bebek', lat: 41.0769, lng: 29.0434 },
  { id: 'ank-tunali', cityLabel: 'Ankara, Çankaya', lat: 39.9036, lng: 32.8602 },
  { id: 'izm-alsancak', cityLabel: 'İzmir, Alsancak', lat: 38.4368, lng: 27.1426 },
  { id: 'tok-shibuya', cityLabel: 'Tokyo, Shibuya', lat: 35.6595, lng: 139.7004 },
  { id: 'par-montmartre', cityLabel: 'Paris, Montmartre', lat: 48.8867, lng: 2.3431 },
  { id: 'lon-soho', cityLabel: 'Londra, Soho', lat: 51.5136, lng: -0.1365 },
  { id: 'nyc-soho', cityLabel: 'New York, SoHo', lat: 40.7233, lng: -74.003 },
  { id: 'rom-trastevere', cityLabel: 'Roma, Trastevere', lat: 41.8894, lng: 12.4709 },
  { id: 'bcn-elborn', cityLabel: 'Barselona, El Born', lat: 41.3849, lng: 2.1834 },
  { id: 'ber-mitte', cityLabel: 'Berlin, Mitte', lat: 52.5219, lng: 13.4019 },
  { id: 'ams-jordaan', cityLabel: 'Amsterdam, Jordaan', lat: 52.3752, lng: 4.8839 },
  { id: 'sel-myeongdong', cityLabel: 'Seul, Myeongdong', lat: 37.5636, lng: 126.985 },
  { id: 'vie-innere', cityLabel: 'Viyana, Innere Stadt', lat: 48.2082, lng: 16.3738 },
];

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRandomStreetSeed(excludeId?: string): WorldStreetSeed {
  const pool = excludeId
    ? WORLD_STREET_SEEDS.filter((s) => s.id !== excludeId)
    : WORLD_STREET_SEEDS;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? WORLD_STREET_SEEDS[0];
}

/**
 * Generates an origin & destination ~125-180m apart along local street grids
 * so Google Maps Route.computeRoutes yields a multi-turn real street polyline.
 */
export function computeRandomSegmentEndpoints(
  center: LatLngPoint,
  bearingRad: number = Math.random() * Math.PI * 2,
  spanMeters = 145,
): { origin: LatLngPoint; destination: LatLngPoint } {
  const latScale = 111320;
  const lngScale = Math.max(20000, Math.cos((center.lat * Math.PI) / 180) * 111320);

  // Jitter origin slightly within +-45m of seed center so repeated clicks produce fresh streets
  const jitterR = 28;
  const jAng = bearingRad + 1.3;
  const origin: LatLngPoint = {
    lat: center.lat + (Math.sin(jAng) * jitterR) / latScale,
    lng: center.lng + (Math.cos(jAng) * jitterR) / lngScale,
  };

  const destination: LatLngPoint = {
    lat: origin.lat + (Math.sin(bearingRad) * spanMeters) / latScale,
    lng: origin.lng + (Math.cos(bearingRad) * spanMeters) / lngScale,
  };

  return { origin, destination };
}

export interface LocalMeterPoint {
  x: number;
  z: number;
}

/**
 * Projects lat/lng coordinates to a local tangent plane in meters,
 * clamping excessive route length to ~115m so the resulting 3D street arena
 * stays fast-paced, readable, and faithful to local street geometry.
 */
export function projectLatLngPathToMeters(path: LatLngPoint[]): LocalMeterPoint[] {
  if (path.length === 0) return [];
  const lat0 = path[0].lat;
  const lng0 = path[0].lng;
  const cosLat = Math.max(0.18, Math.cos((lat0 * Math.PI) / 180));

  const raw: LocalMeterPoint[] = [];
  let totalDist = 0;
  const maxRouteMeters = 115;

  for (let i = 0; i < path.length; i++) {
    const pt = {
      x: (path[i].lng - lng0) * cosLat * 111320,
      z: -(path[i].lat - lat0) * 111320,
    };
    if (i === 0) {
      raw.push(pt);
      continue;
    }
    const prev = raw[raw.length - 1];
    const segLen = Math.hypot(pt.x - prev.x, pt.z - prev.z);
    if (segLen < 0.8) continue;

    if (totalDist + segLen > maxRouteMeters && raw.length >= 2) {
      const remain = Math.max(0, maxRouteMeters - totalDist);
      const t = remain / segLen;
      raw.push({
        x: prev.x + (pt.x - prev.x) * t,
        z: prev.z + (pt.z - prev.z) * t,
      });
      break;
    }
    raw.push(pt);
    totalDist += segLen;
  }

  return raw;
}

interface GridCell {
  c: number;
  r: number;
  active: boolean;
  walls: { N: boolean; S: boolean; E: boolean; W: boolean };
}

function keyOf(c: number, r: number): string {
  return `${c},${r}`;
}

/**
 * Converts a real-world Google Maps street path into a guaranteed-solvable 3D
 * labyrinth parking LevelConfig. Every turn of the real street is preserved via
 * orthogonal supercover corridor carving, augmented with urban side-alley
 * branches, dynamic construction barriers, and a street-aligned parking bay.
 */
export function convertStreetPathToLabyrinth(params: {
  path: LatLngPoint[];
  meta: Omit<RealWorldStreetMeta, 'pathPoints'>;
  tier: DifficultyTier;
  levelNumber?: number;
}): LevelConfig {
  const { path, meta, tier, levelNumber = 1 } = params;
  const tierIndex =
    tier === 'caylak' ? 0 : tier === 'usta' ? 1 : tier === 'profesyonel' ? 2 : 3;

  const cellSize = Math.max(8.8, 9.9 - tierIndex * 0.35);
  const wallThickness = 1.35;

  let localPts = projectLatLngPathToMeters(path);
  if (localPts.length < 2) {
    // Minimal synthetic fallback if caller passes a single degenerate point
    localPts = [
      { x: 0, z: 0 },
      { x: cellSize * 3, z: cellSize * 2 },
    ];
  }

  // Deterministic seed derived from coordinates so identical street yields repeatable course
  const coordSeed =
    Math.abs(Math.round(meta.origin.lat * 100000) * 73856093) ^
    Math.abs(Math.round(meta.origin.lng * 100000) * 19349663);
  const rand = createSeededRng(coordSeed + tierIndex * 97);

  // Convert local meters to floating grid coordinates and trace 4-connected street cells
  const streetPathCells: Array<{ c: number; r: number }> = [];
  const pushCell = (c: number, r: number) => {
    const last = streetPathCells[streetPathCells.length - 1];
    if (last && last.c === c && last.r === r) return;
    if (!last) {
      streetPathCells.push({ c, r });
      return;
    }
    // Bridge any diagonal or multi-cell step orthogonally step-by-step
    let curC = last.c;
    let curR = last.r;
    while (curC !== c || curR !== r) {
      const dc = c - curC;
      const dr = r - curR;
      if (Math.abs(dc) >= Math.abs(dr) && dc !== 0) {
        curC += Math.sign(dc);
      } else if (dr !== 0) {
        curR += Math.sign(dr);
      }
      const prev = streetPathCells[streetPathCells.length - 1];
      if (!prev || prev.c !== curC || prev.r !== curR) {
        streetPathCells.push({ c: curC, r: curR });
      }
    }
  };

  for (const p of localPts) {
    pushCell(Math.round(p.x / cellSize), Math.round(p.z / cellSize));
  }

  // Remove immediate self-backtracking cycles in raw cell sequence to keep main route crisp
  const dedupedPath: Array<{ c: number; r: number }> = [];
  const seenIndex = new Map<string, number>();
  for (const cell of streetPathCells) {
    const k = keyOf(cell.c, cell.r);
    const prevIdx = seenIndex.get(k);
    if (prevIdx !== undefined) {
      while (dedupedPath.length - 1 > prevIdx) {
        const removed = dedupedPath.pop()!;
        seenIndex.delete(keyOf(removed.c, removed.r));
      }
    } else {
      seenIndex.set(k, dedupedPath.length);
      dedupedPath.push(cell);
    }
  }

  // Ensure minimum navigable length of 4 cells so every real street is a fun drive
  while (dedupedPath.length < 4) {
    const tail = dedupedPath[dedupedPath.length - 1];
    const prev = dedupedPath[dedupedPath.length - 2] ?? { c: tail.c - 1, r: tail.r };
    let dc = Math.sign(tail.c - prev.c);
    let dr = Math.sign(tail.r - prev.r);
    if (dc === 0 && dr === 0) dc = 1;
    const candidate = { c: tail.c + dc, r: tail.r + dr };
    if (seenIndex.has(keyOf(candidate.c, candidate.r))) {
      // Turn 90 degrees if continuing hits self
      const alt = { c: tail.c + dr, r: tail.r - dc };
      dedupedPath.push(alt);
      seenIndex.set(keyOf(alt.c, alt.r), dedupedPath.length - 1);
    } else {
      dedupedPath.push(candidate);
      seenIndex.set(keyOf(candidate.c, candidate.r), dedupedPath.length - 1);
    }
  }

  // Build active cell map and open passages along the main real-world street corridor
  const cellMap = new Map<string, GridCell>();
  const ensureCell = (c: number, r: number): GridCell => {
    const k = keyOf(c, r);
    let existing = cellMap.get(k);
    if (!existing) {
      existing = {
        c,
        r,
        active: true,
        walls: { N: true, S: true, E: true, W: true },
      };
      cellMap.set(k, existing);
    }
    return existing;
  };

  const openPassage = (a: { c: number; r: number }, b: { c: number; r: number }) => {
    const cellA = ensureCell(a.c, a.r);
    const cellB = ensureCell(b.c, b.r);
    if (b.c === a.c + 1 && b.r === a.r) {
      cellA.walls.E = false;
      cellB.walls.W = false;
    } else if (b.c === a.c - 1 && b.r === a.r) {
      cellA.walls.W = false;
      cellB.walls.E = false;
    } else if (b.r === a.r + 1 && b.c === a.c) {
      cellA.walls.S = false;
      cellB.walls.N = false;
    } else if (b.r === a.r - 1 && b.c === a.c) {
      cellA.walls.N = false;
      cellB.walls.S = false;
    }
  };

  for (let i = 0; i < dedupedPath.length; i++) {
    ensureCell(dedupedPath[i].c, dedupedPath[i].r);
    if (i > 0) {
      openPassage(dedupedPath[i - 1], dedupedPath[i]);
    }
  }

  // Add side-alley dead-end labyrinth branches off intermediate street cells
  const branchCount = Math.min(4, 1 + Math.floor(dedupedPath.length / 3) + (tierIndex >= 2 ? 1 : 0));
  const dirs = [
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
  ];

  let addedBranches = 0;
  for (
    let i = 1;
    i < dedupedPath.length - 1 && addedBranches < branchCount;
    i += Math.max(1, Math.floor((dedupedPath.length - 2) / branchCount))
  ) {
    const anchor = dedupedPath[i];
    const startDirIdx = Math.floor(rand() * 4);
    for (let d = 0; d < 4; d++) {
      const dir = dirs[(startDirIdx + d) % 4];
      const b1 = { c: anchor.c + dir.dc, r: anchor.r + dir.dr };
      if (cellMap.has(keyOf(b1.c, b1.r))) continue;

      openPassage(anchor, b1);
      // Optionally extend the side alley 1 more cell with a turn for genuine maze feel
      const turnDir = dirs[(startDirIdx + d + (rand() > 0.5 ? 1 : 3)) % 4];
      const b2 = { c: b1.c + turnDir.dc, r: b1.r + turnDir.dr };
      if (!cellMap.has(keyOf(b2.c, b2.r)) && rand() > 0.25) {
        openPassage(b1, b2);
      }
      addedBranches++;
      break;
    }
  }

  // Normalize grid indices to [0..cols-1, 0..rows-1] centered around world origin (0,0)
  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const cell of cellMap.values()) {
    minC = Math.min(minC, cell.c);
    maxC = Math.max(maxC, cell.c);
    minR = Math.min(minR, cell.r);
    maxR = Math.max(maxR, cell.r);
  }

  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const originX = -(cols * cellSize) / 2;
  const originZ = -(rows * cellSize) / 2;

  const cellCenter = (c: number, r: number) => ({
    x: originX + (c - minC + 0.5) * cellSize,
    z: originZ + (r - minR + 0.5) * cellSize,
  });

  // Build deduplicated wall AABBs around every active street/alley cell
  const walls: AABB[] = [];
  const wallKeys = new Set<string>();
  const addWall = (key: string, box: AABB) => {
    if (wallKeys.has(key)) return;
    wallKeys.add(key);
    walls.push(box);
  };

  for (const cell of cellMap.values()) {
    const nc = cell.c - minC;
    const nr = cell.r - minR;
    const cx = originX + (nc + 0.5) * cellSize;
    const cz = originZ + (nr + 0.5) * cellSize;

    if (cell.walls.N) {
      addWall(`H:${nc},${nr}`, {
        x: cx,
        z: originZ + nr * cellSize,
        halfW: cellSize / 2 + wallThickness / 2,
        halfD: wallThickness / 2,
      });
    }
    if (cell.walls.S) {
      addWall(`H:${nc},${nr + 1}`, {
        x: cx,
        z: originZ + (nr + 1) * cellSize,
        halfW: cellSize / 2 + wallThickness / 2,
        halfD: wallThickness / 2,
      });
    }
    if (cell.walls.W) {
      addWall(`V:${nc},${nr}`, {
        x: originX + nc * cellSize,
        z: cz,
        halfW: wallThickness / 2,
        halfD: cellSize / 2 + wallThickness / 2,
      });
    }
    if (cell.walls.E) {
      addWall(`V:${nc + 1},${nr}`, {
        x: originX + (nc + 1) * cellSize,
        z: cz,
        halfW: wallThickness / 2,
        halfD: cellSize / 2 + wallThickness / 2,
      });
    }
  }

  // Spawn & Parking Bay orientation aligned to street path
  const startCell = dedupedPath[0];
  const secondCell = dedupedPath[1];
  const spawnCenter = cellCenter(startCell.c, startCell.r);
  const spawnYaw = Math.atan2(secondCell.c - startCell.c, secondCell.r - startCell.r);

  const goalCell = dedupedPath[dedupedPath.length - 1];
  const preGoalCell = dedupedPath[dedupedPath.length - 2];
  const goalCenter = cellCenter(goalCell.c, goalCell.r);
  const goalYaw = Math.atan2(goalCell.c - preGoalCell.c, goalCell.r - preGoalCell.r);

  // Dynamic moving street work barriers along intermediate street segments
  const movingGates: MovingGate[] = [];
  const gateBudget = tierIndex === 0 ? 1 : Math.min(3, 1 + tierIndex);
  if (dedupedPath.length >= 4) {
    const stride = Math.max(2, Math.floor((dedupedPath.length - 2) / gateBudget));
    for (let i = 2; i < dedupedPath.length - 1 && movingGates.length < gateBudget; i += stride) {
      const curr = dedupedPath[i];
      const prev = dedupedPath[i - 1];
      const pCenter = cellCenter(curr.c, curr.r);
      const movingAlongX = curr.r !== prev.r;
      movingGates.push({
        id: `rw-gate-${movingGates.length}`,
        baseX: pCenter.x,
        baseZ: pCenter.z,
        axis: movingAlongX ? 'x' : 'z',
        amplitude: cellSize * 0.27,
        speed: 1.1 + tierIndex * 0.28,
        phase: movingGates.length * 1.35,
        halfW: movingAlongX ? 1.0 : 0.45,
        halfD: movingAlongX ? 0.45 : 1.0,
      });
    }
  }

  // Collectible tokens first so props stay clear of them
  const tokens: BonusToken[] = [];
  for (let i = 1; i < dedupedPath.length - 1 && tokens.length < 3; i += 2) {
    const c = cellCenter(dedupedPath[i].c, dedupedPath[i].r);
    tokens.push({
      id: `rw-tok-${tokens.length}`,
      x: c.x,
      z: c.z,
      kind: tokens.length === 1 ? 'time' : 'star',
    });
  }

  // Urban cones, bollards & street barricades on non-spawn/non-goal street cells
  const props: PropObstacle[] = [];
  for (let i = 1; i < dedupedPath.length - 1; i++) {
    if (i % 2 === 1 || rand() > 0.45) {
      const c = cellCenter(dedupedPath[i].c, dedupedPath[i].r);
      const sx = rand() > 0.5 ? 1 : -1;
      const sz = rand() > 0.5 ? 1 : -1;
      const offset = cellSize * 0.31;
      const px = c.x + sx * offset;
      const pz = c.z + sz * offset;
      const kind: PropObstacle['kind'] =
        i % 4 === 0 ? 'barricade' : i % 3 === 0 ? 'bollard' : 'cone';
      const radius = kind === 'barricade' ? 0.5 : 0.36;

      const hitsWall = walls.some(
        (w) => Math.abs(px - w.x) < w.halfW + radius + 0.3 && Math.abs(pz - w.z) < w.halfD + radius + 0.3,
      );
      const hitsGate = movingGates.some(
        (g) => Math.hypot(px - g.baseX, pz - g.baseZ) < g.amplitude + Math.max(g.halfW, g.halfD) + radius + 0.5,
      );
      const hitsToken = tokens.some((tok) => Math.hypot(px - tok.x, pz - tok.z) < 2.2);
      if (hitsWall || hitsGate || hitsToken) continue;

      props.push({
        x: px,
        z: pz,
        radius,
        kind,
        yaw: rand() * Math.PI,
      });
    }
  }

  const parTime = Math.round(14 + dedupedPath.length * 3.5 - tierIndex * 1.4);
  const timeLimit = Math.round(parTime * (2.6 - tierIndex * 0.22));
  const maxCollisions = Math.max(3, 5 - tierIndex);

  const roadTiles: RoadTile[] = [];
  for (const cell of cellMap.values()) {
    const center = cellCenter(cell.c, cell.r);
    const openN = !cell.walls.N;
    const openS = !cell.walls.S;
    const openE = !cell.walls.E;
    const openW = !cell.walls.W;
    roadTiles.push({
      x: center.x,
      z: center.z,
      openN,
      openS,
      openE,
      openW,
      kind: classifyRoadTile(openN, openS, openE, openW),
    });
  }

  const arenaBounds: ArenaBounds = {
    minX: originX + wallThickness * 0.5,
    maxX: originX + cols * cellSize - wallThickness * 0.5,
    minZ: originZ + wallThickness * 0.5,
    maxZ: originZ + rows * cellSize - wallThickness * 0.5,
  };

  // Optional Boost Pads & Checkpoints along real-world straightaways
  const boostPads: BoostPad[] = [];
  const checkpoints: CheckpointGate[] = [];
  for (let i = 1; i < dedupedPath.length - 1; i++) {
    const curr = dedupedPath[i];
    const prev = dedupedPath[i - 1];
    const next = dedupedPath[i + 1];
    const center = cellCenter(curr.c, curr.r);
    const blockedByGate = movingGates.some(
      (g) => Math.hypot(center.x - g.baseX, center.z - g.baseZ) < 3.4,
    );
    if (blockedByGate) continue;
    const isStraight =
      (curr.c - prev.c === next.c - curr.c && curr.r - prev.r === next.r - curr.r);
    const yaw = Math.atan2(curr.c - prev.c, curr.r - prev.r);
    if (isStraight && boostPads.length < 2) {
      boostPads.push({
        id: `rw-boost-${boostPads.length}`,
        x: center.x,
        z: center.z,
        yaw,
        width: 2.35,
        length: 3.4,
      });
    } else if (i === Math.floor(dedupedPath.length / 2) && checkpoints.length < 1) {
      checkpoints.push({
        id: `rw-cp-0`,
        index: 1,
        x: center.x,
        z: center.z,
        yaw,
        width: Math.min(4.5, cellSize - 2.6),
      });
    }
  }

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
    arenaBounds,
    spawn: {
      x: spawnCenter.x,
      z: spawnCenter.z,
      yaw: spawnYaw,
    },
    parking: {
      x: goalCenter.x,
      z: goalCenter.z,
      yaw: goalYaw,
      width: Math.max(3.2, 3.6 - tierIndex * 0.14),
      length: Math.max(5.25, 5.75 - tierIndex * 0.15),
    },
    walls,
    movingGates,
    props,
    tokens,
    boostPads,
    checkpoints,
    roadTiles,
    shortestPathCells: dedupedPath.length,
    realWorld: {
      ...meta,
      pathPoints: path.length,
    },
  };
}
