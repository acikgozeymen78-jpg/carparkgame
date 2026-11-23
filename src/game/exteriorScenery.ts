import type { LevelConfig } from '../types/game';

export interface PineTreePlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  crownColorHex: number;
  trunkColorHex: number;
}

export interface BroadleafTreePlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  canopyColorHex: number;
  accentColorHex: number;
  trunkColorHex: number;
}

export interface ShrubPlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  leafColorHex: number;
  blossomColorHex: number;
}

export interface WildflowerPlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  flowerColorHex: number;
}

export interface RockPlacement {
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  colorHex: number;
}

export interface HillPlacement {
  x: number;
  z: number;
  radius: number;
  height: number;
  colorHex: number;
}

export interface CabinPlacement {
  x: number;
  z: number;
  yaw: number;
  variant: 'cabin' | 'watchtower';
  roofColorHex: number;
}

export interface TrailPostPlacement {
  x: number;
  z: number;
  yaw: number;
  hasLantern: boolean;
}

export interface PondPlacement {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  yaw: number;
}

export interface FireflyOrigin {
  x: number;
  y: number;
  z: number;
  phase: number;
  colorHex: number;
}

export interface ExteriorSceneryPlan {
  halfArenaW: number;
  halfArenaD: number;
  outerSpan: number;
  pineTrees: PineTreePlacement[];
  broadleafTrees: BroadleafTreePlacement[];
  shrubs: ShrubPlacement[];
  wildflowers: WildflowerPlacement[];
  rocks: RockPlacement[];
  hills: HillPlacement[];
  ridges: HillPlacement[];
  cabins: CabinPlacement[];
  trailPosts: TrailPostPlacement[];
  pond: PondPlacement | null;
  fireflies: FireflyOrigin[];
}

export interface PlayableZoneMetrics {
  halfArenaW: number;
  halfArenaD: number;
  hwMinX: number | null;
  hwMaxX: number | null;
  hwMinZ: number | null;
  hwMaxZ: number | null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function getPlayableZoneMetrics(level: LevelConfig): PlayableZoneMetrics {
  const perimeterThickness = level.realWorld ? 1.35 : 1.65;
  const arenaW = level.cols * level.cellSize + perimeterThickness;
  const arenaD = level.rows * level.cellSize + perimeterThickness;

  let halfArenaW = arenaW * 0.5;
  let halfArenaD = arenaD * 0.5;

  // Also respect arenaBounds (excluding highway right tail handled separately)
  if (level.arenaBounds && !level.highwayExit) {
    halfArenaW = Math.max(
      halfArenaW,
      Math.abs(level.arenaBounds.minX) + 1.2,
      Math.abs(level.arenaBounds.maxX) + 1.2,
    );
    halfArenaD = Math.max(
      halfArenaD,
      Math.abs(level.arenaBounds.minZ) + 1.2,
      Math.abs(level.arenaBounds.maxZ) + 1.2,
    );
  }

  if (level.highwayExit) {
    const hw = level.highwayExit;
    return {
      halfArenaW,
      halfArenaD,
      hwMinX: hw.startX - 1.5,
      hwMaxX: hw.endX + perimeterThickness * 0.5 + 1.5,
      hwMinZ: hw.exitZ - hw.halfWidth - perimeterThickness * 0.5 - 0.8,
      hwMaxZ: hw.exitZ + hw.halfWidth + perimeterThickness * 0.5 + 0.8,
    };
  }

  return {
    halfArenaW,
    halfArenaD,
    hwMinX: null,
    hwMaxX: null,
    hwMinZ: null,
    hwMaxZ: null,
  };
}

export function distanceToPlayableZones(
  x: number,
  z: number,
  level: LevelConfig,
  metrics?: PlayableZoneMetrics,
): number {
  const m = metrics ?? getPlayableZoneMetrics(level);
  const dx = Math.max(0, Math.abs(x) - m.halfArenaW);
  const dz = Math.max(0, Math.abs(z) - m.halfArenaD);
  let minDist = Math.hypot(dx, dz);

  if (
    m.hwMinX !== null &&
    m.hwMaxX !== null &&
    m.hwMinZ !== null &&
    m.hwMaxZ !== null
  ) {
    const hdx = x < m.hwMinX ? m.hwMinX - x : x > m.hwMaxX ? x - m.hwMaxX : 0;
    const hdz = z < m.hwMinZ ? m.hwMinZ - z : z > m.hwMaxZ ? z - m.hwMaxZ : 0;
    const hwDist = Math.hypot(hdx, hdz);
    if (hwDist < minDist) minDist = hwDist;
  }

  return minDist;
}

export function isExteriorSpotClear(
  x: number,
  z: number,
  itemRadius: number,
  level: LevelConfig,
  minMargin = 1.6,
  metrics?: PlayableZoneMetrics,
): boolean {
  const dist = distanceToPlayableZones(x, z, level, metrics);
  return dist >= itemRadius + minMargin;
}

const PINE_COLORS = [
  0x1b7a43,
  0x228b4e,
  0x2d9d5b,
  0x156542,
  0x2f855a,
  0x38a169,
  0x1f6f50,
] as const;

const PINE_TRUNK_COLORS = [0x5c3d28, 0x6b462e, 0x4e3422] as const;

const BROADLEAF_PALETTES = [
  { canopy: 0x34a853, accent: 0x6ee77a, trunk: 0x6b472f }, // Vibrant emerald
  { canopy: 0x4ade80, accent: 0x86efac, trunk: 0x734d33 }, // Fresh spring lime
  { canopy: 0x22c55e, accent: 0x4ade80, trunk: 0x5f3f29 }, // Lush meadow
  { canopy: 0xeab308, accent: 0xfde047, trunk: 0x6d4b34 }, // Golden ginkgo
  { canopy: 0xf59e0b, accent: 0xfbbf24, trunk: 0x78543a }, // Warm autumn amber
  { canopy: 0xea580c, accent: 0xfb923c, trunk: 0x5c3c27 }, // Sunset maple orange
  { canopy: 0xef4444, accent: 0xf87171, trunk: 0x563928 }, // Crimson autumn maple
  { canopy: 0xec4899, accent: 0xf9a8d4, trunk: 0x735243 }, // Cherry blossom sakura
  { canopy: 0x10b981, accent: 0x5eead4, trunk: 0xd6cfc2 }, // Birch emerald-teal
] as const;

const SHRUB_LEAF_COLORS = [0x228b4e, 0x2ea043, 0x38a169, 0x1e7e46, 0x48bb78] as const;
const BLOSSOM_COLORS = [0xf472b6, 0xfacc15, 0xfb7185, 0xc084fc, 0x38bdf8, 0xfb923c] as const;
const WILDFLOWER_COLORS = [0xfde047, 0xf472b6, 0xa78bfa, 0xfb923c, 0x60a5fa, 0xf8fafc] as const;
const ROCK_COLORS = [0x64748b, 0x71717a, 0x57636e, 0x78716c] as const;
const HILL_COLORS = [0x236b3c, 0x2a7a44, 0x1e5c37, 0x31834b] as const;
const RIDGE_COLORS = [0x1b4d34, 0x20573c, 0x184430] as const;
const ROOF_COLORS = [0xb91c1c, 0x0f766e, 0xb45309, 0x334155] as const;

interface CircleFootprint {
  x: number;
  z: number;
  r: number;
}

export function generateExteriorSceneryPlan(level: LevelConfig): ExteriorSceneryPlan {
  const metrics = getPlayableZoneMetrics(level);
  const { halfArenaW, halfArenaD } = metrics;
  const maxHalfExtent = Math.max(
    halfArenaW,
    halfArenaD,
    metrics.hwMaxX ?? halfArenaW,
  );
  const outerSpan = maxHalfExtent + 78;

  const seed =
    (level.levelNumber * 9973 +
      level.cols * 313 +
      level.rows * 197 +
      (level.highwayExit ? 4211 : 0)) >>>
    0;
  const rng = mulberry32(seed);

  const pineTrees: PineTreePlacement[] = [];
  const broadleafTrees: BroadleafTreePlacement[] = [];
  const shrubs: ShrubPlacement[] = [];
  const wildflowers: WildflowerPlacement[] = [];
  const rocks: RockPlacement[] = [];
  const hills: HillPlacement[] = [];
  const ridges: HillPlacement[] = [];
  const cabins: CabinPlacement[] = [];
  const trailPosts: TrailPostPlacement[] = [];
  const fireflies: FireflyOrigin[] = [];

  const solidFootprints: CircleFootprint[] = [];

  const hasOverlapWithFootprints = (x: number, z: number, r: number): boolean => {
    for (let i = 0; i < solidFootprints.length; i++) {
      const f = solidFootprints[i];
      const dx = x - f.x;
      const dz = z - f.z;
      const minD = r + f.r;
      if (dx * dx + dz * dz < minD * minD) return true;
    }
    return false;
  };

  // 1. Scenic Forest Pond placed cleanly in an unobstructed corner clearing
  let pond: PondPlacement | null = null;
  const pondCandidates = [
    { x: -halfArenaW - 14.5, z: -halfArenaD - 13.5, yaw: 0.35 },
    { x: -halfArenaW - 14.5, z: halfArenaD + 13.5, yaw: -0.4 },
    { x: halfArenaW + 15.0, z: -halfArenaD - 14.0, yaw: 0.25 },
  ];
  for (const cand of pondCandidates) {
    if (isExteriorSpotClear(cand.x, cand.z, 7.6, level, 3.2, metrics)) {
      pond = {
        x: cand.x,
        z: cand.z,
        radiusX: 7.2,
        radiusZ: 5.0,
        yaw: cand.yaw,
      };
      solidFootprints.push({ x: cand.x, z: cand.z, r: 8.2 });
      break;
    }
  }

  const isInsidePond = (x: number, z: number, pad = 1.6): boolean => {
    if (!pond) return false;
    const dx = x - pond.x;
    const dz = z - pond.z;
    const maxR = Math.max(pond.radiusX, pond.radiusZ) + pad;
    return dx * dx + dz * dz < maxR * maxR;
  };

  // 2. Cozy Timber Cabins & Forest Watchtowers framing views around the perimeter
  const cabinCandidateAnchors = [
    { x: -halfArenaW - 14.0, z: halfArenaD + 12.5, yaw: Math.PI * 0.75, variant: 'watchtower' as const },
    { x: halfArenaW + 13.5, z: -halfArenaD - 12.0, yaw: -Math.PI * 0.28, variant: 'cabin' as const },
    { x: -halfArenaW - 15.5, z: -1.5, yaw: Math.PI * 0.5, variant: 'cabin' as const },
    { x: 2.5, z: halfArenaD + 14.5, yaw: Math.PI, variant: 'watchtower' as const },
    { x: 0, z: -halfArenaD - 14.5, yaw: 0, variant: 'cabin' as const },
  ];

  for (const anchor of cabinCandidateAnchors) {
    if (cabins.length >= 3) break;
    if (
      isExteriorSpotClear(anchor.x, anchor.z, 4.8, level, 5.2, metrics) &&
      !isInsidePond(anchor.x, anchor.z, 3.8) &&
      !hasOverlapWithFootprints(anchor.x, anchor.z, 6.5)
    ) {
      cabins.push({
        x: anchor.x,
        z: anchor.z,
        yaw: anchor.yaw,
        variant: anchor.variant,
        roofColorHex: pickFrom(ROOF_COLORS, rng),
      });
      solidFootprints.push({ x: anchor.x, z: anchor.z, r: 5.8 });
    }
  }

  // 3. Perimeter Trail Posts & Warm Amber Lanterns ringing the outer berm
  const postOffset = 2.65;
  const postSpacing = 9.5;
  const addPostIfClear = (x: number, z: number, yaw: number, idx: number) => {
    if (!isExteriorSpotClear(x, z, 0.65, level, 1.45, metrics)) return;
    if (isInsidePond(x, z, 0.8)) return;
    trailPosts.push({
      x,
      z,
      yaw,
      hasLantern: idx % 2 === 0,
    });
  };

  let postIdx = 0;
  for (let x = -halfArenaW - postOffset; x <= halfArenaW + postOffset + 0.01; x += postSpacing) {
    addPostIfClear(x, -halfArenaD - postOffset, 0, postIdx++);
    addPostIfClear(x, halfArenaD + postOffset, Math.PI, postIdx++);
  }
  for (let z = -halfArenaD + postSpacing * 0.6; z <= halfArenaD - postSpacing * 0.6; z += postSpacing) {
    addPostIfClear(-halfArenaW - postOffset, z, Math.PI / 2, postIdx++);
    addPostIfClear(halfArenaW + postOffset, z, -Math.PI / 2, postIdx++);
  }
  if (level.highwayExit && metrics.hwMaxX !== null && metrics.hwMinZ !== null && metrics.hwMaxZ !== null) {
    for (let x = halfArenaW + 4.5; x <= metrics.hwMaxX + 1.5; x += 10.5) {
      addPostIfClear(x, metrics.hwMinZ - 2.2, 0, postIdx++);
      addPostIfClear(x, metrics.hwMaxZ + 2.2, Math.PI, postIdx++);
    }
  }

  // 4. Rolling Grass Hills in Mid & Outer Terrain (always clear of walls + highway + pond)
  const hillTargetCount = 34;
  for (let attempt = 0; attempt < 260 && hills.length < hillTargetCount; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radiusDist = 20 + rng() * 58;
    const x = Math.cos(angle) * (halfArenaW + radiusDist * 0.95);
    const z = Math.sin(angle) * (halfArenaD + radiusDist * 0.95);
    const hillRadius = 7.5 + rng() * 11.5;

    if (!isExteriorSpotClear(x, z, hillRadius, level, 4.5, metrics)) continue;
    if (isInsidePond(x, z, hillRadius + 1.5)) continue;
    if (hasOverlapWithFootprints(x, z, hillRadius + 1.5)) continue;

    hills.push({
      x,
      z,
      radius: hillRadius,
      height: 2.2 + rng() * 4.6,
      colorHex: pickFrom(HILL_COLORS, rng),
    });
  }

  // 5. Distant Horizon Ridge Mountains around outer rim (dist 76..114m)
  const ridgeCount = 26;
  for (let i = 0; i < ridgeCount; i++) {
    const ang = (i / ridgeCount) * Math.PI * 2 + (rng() - 0.5) * 0.14;
    const rx = Math.cos(ang) * (outerSpan * 0.94 + rng() * 14);
    const rz = Math.sin(ang) * (outerSpan * 0.94 + rng() * 14);
    const rr = 16 + rng() * 14;
    if (!isExteriorSpotClear(rx, rz, rr, level, 8.0, metrics)) continue;
    ridges.push({
      x: rx,
      z: rz,
      radius: rr,
      height: 11 + rng() * 14,
      colorHex: pickFrom(RIDGE_COLORS, rng),
    });
  }

  // 6. Dense Forest Canopy Distribution (Conifers + Colorful Broadleaf Trees)
  // Stratified radial/grid jitter covering all four quadrants and highway flanks
  const cellStep = 6.2;
  const maxReach = Math.min(82, maxHalfExtent + 56);
  const targetTotalTrees = Math.min(440, Math.max(300, Math.round(maxReach * 4.8)));

  const candidatePoints: Array<{ x: number; z: number; dist: number }> = [];
  for (let gx = -maxReach; gx <= maxReach; gx += cellStep) {
    for (let gz = -maxReach; gz <= maxReach; gz += cellStep) {
      const x = gx + (rng() - 0.5) * cellStep * 0.82;
      const z = gz + (rng() - 0.5) * cellStep * 0.82;
      const dist = distanceToPlayableZones(x, z, level, metrics);
      if (dist < 3.7 || dist > 64) continue;
      candidatePoints.push({ x, z, dist });
    }
  }

  // Deterministic Fisher-Yates shuffle on candidate grid cells for organic groves + clearings
  for (let i = candidatePoints.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidatePoints[i];
    candidatePoints[i] = candidatePoints[j];
    candidatePoints[j] = tmp;
  }

  // Sort closer perimeter ring slightly earlier so foreground forests stay lush & rich
  candidatePoints.sort((a, b) => {
    const bucketA = a.dist < 18 ? 0 : a.dist < 36 ? 1 : 2;
    const bucketB = b.dist < 18 ? 0 : b.dist < 36 ? 1 : 2;
    return bucketA - bucketB;
  });

  for (let i = 0; i < candidatePoints.length; i++) {
    if (pineTrees.length + broadleafTrees.length >= targetTotalTrees) break;
    const pt = candidatePoints[i];
    if (isInsidePond(pt.x, pt.z, 1.9)) continue;

    // Leave tiny scenic glade pockets naturally using low-frequency harmonic mask
    const gladeWave =
      Math.sin(pt.x * 0.085 + 0.7) * Math.cos(pt.z * 0.085 - 0.4);
    if (pt.dist > 14 && gladeWave > 0.68) continue;

    const isBroadleaf = rng() < 0.42;
    const distScale = pt.dist < 10 ? 0.84 + rng() * 0.28 : 0.92 + rng() * 0.68;
    const footprintR = isBroadleaf ? distScale * 1.95 : distScale * 1.78;

    if (!isExteriorSpotClear(pt.x, pt.z, footprintR, level, 1.55, metrics)) continue;
    if (hasOverlapWithFootprints(pt.x, pt.z, footprintR * 0.78)) continue;

    solidFootprints.push({ x: pt.x, z: pt.z, r: footprintR * 0.82 });

    if (isBroadleaf) {
      const palette = pickFrom(BROADLEAF_PALETTES, rng);
      broadleafTrees.push({
        x: pt.x,
        z: pt.z,
        scale: distScale,
        yaw: rng() * Math.PI * 2,
        canopyColorHex: palette.canopy,
        accentColorHex: palette.accent,
        trunkColorHex: palette.trunk,
      });
    } else {
      pineTrees.push({
        x: pt.x,
        z: pt.z,
        scale: distScale,
        yaw: rng() * Math.PI * 2,
        crownColorHex: pickFrom(PINE_COLORS, rng),
        trunkColorHex: pickFrom(PINE_TRUNK_COLORS, rng),
      });
    }
  }

  // 7. Mossy Boulder Clusters (placed near trees, pond shoreline, and forest borders)
  for (let attempt = 0; attempt < 240 && rocks.length < 95; attempt++) {
    const angle = rng() * Math.PI * 2;
    const span = maxHalfExtent + 5 + rng() * 44;
    const x = Math.cos(angle) * span;
    const z = Math.sin(angle) * span;
    const sx = 0.65 + rng() * 1.15;
    const sz = 0.65 + rng() * 1.05;
    const maxR = Math.max(sx, sz) * 1.15;

    if (!isExteriorSpotClear(x, z, maxR, level, 1.7, metrics)) continue;
    if (isInsidePond(x, z, -0.2)) continue;
    if (hasOverlapWithFootprints(x, z, maxR * 0.8)) continue;

    solidFootprints.push({ x, z, r: maxR });
    rocks.push({
      x,
      z,
      sx,
      sy: 0.45 + rng() * 0.75,
      sz,
      yaw: rng() * Math.PI * 2,
      colorHex: pickFrom(ROCK_COLORS, rng),
    });
  }

  // 8. Flowering Forest Shrubs & Berry Bushes (clustered close to walls and glades)
  for (let attempt = 0; attempt < 360 && shrubs.length < 150; attempt++) {
    const angle = rng() * Math.PI * 2;
    const nearEdge = rng() < 0.55;
    const reach = nearEdge
      ? Math.max(halfArenaW, halfArenaD) + 2.8 + rng() * 10
      : Math.max(halfArenaW, halfArenaD) + 8 + rng() * 34;
    const x = Math.cos(angle) * reach;
    const z = Math.sin(angle) * reach;
    const scale = 0.68 + rng() * 0.65;

    if (!isExteriorSpotClear(x, z, scale * 1.1, level, 1.35, metrics)) continue;
    if (isInsidePond(x, z, 0.7)) continue;

    shrubs.push({
      x,
      z,
      scale,
      yaw: rng() * Math.PI * 2,
      leafColorHex: pickFrom(SHRUB_LEAF_COLORS, rng),
      blossomColorHex: pickFrom(BLOSSOM_COLORS, rng),
    });
  }

  // 9. Colorful Wildflower Patches bordering the entire forest edge
  for (let attempt = 0; attempt < 460 && wildflowers.length < 240; attempt++) {
    const side = attempt % 4;
    let x = 0;
    let z = 0;
    if (side === 0) {
      x = (rng() - 0.5) * (halfArenaW * 2 + 24);
      z = -halfArenaD - 2.6 - rng() * 16;
    } else if (side === 1) {
      x = (rng() - 0.5) * (halfArenaW * 2 + 24);
      z = halfArenaD + 2.6 + rng() * 16;
    } else if (side === 2) {
      x = -halfArenaW - 2.6 - rng() * 16;
      z = (rng() - 0.5) * (halfArenaD * 2 + 20);
    } else {
      x = (metrics.hwMaxX ?? halfArenaW) + 2.6 + rng() * 16;
      z = (rng() - 0.5) * (halfArenaD * 2 + 20);
    }

    if (!isExteriorSpotClear(x, z, 0.55, level, 1.3, metrics)) continue;
    if (isInsidePond(x, z, 0.9)) continue;

    wildflowers.push({
      x,
      z,
      scale: 0.75 + rng() * 0.7,
      yaw: rng() * Math.PI * 2,
      flowerColorHex: pickFrom(WILDFLOWER_COLORS, rng),
    });
  }

  // 10. Gentle Animated Forest Firefly Motes near foreground trees & pond
  const fireflyPalette = [0xfef08a, 0x86efac, 0xfdba74, 0x7dd3fc] as const;
  for (let i = 0; i < 36; i++) {
    const srcTree =
      broadleafTrees[i % Math.max(1, broadleafTrees.length)] ??
      pineTrees[i % Math.max(1, pineTrees.length)];
    const fx = srcTree ? srcTree.x + (rng() - 0.5) * 3.2 : halfArenaW + 6;
    const fz = srcTree ? srcTree.z + (rng() - 0.5) * 3.2 : halfArenaD + 6;
    if (!isExteriorSpotClear(fx, fz, 0.5, level, 1.8, metrics)) continue;
    fireflies.push({
      x: fx,
      y: 1.1 + rng() * 2.8,
      z: fz,
      phase: rng() * Math.PI * 2,
      colorHex: pickFrom(fireflyPalette, rng),
    });
  }

  return {
    halfArenaW,
    halfArenaD,
    outerSpan,
    pineTrees,
    broadleafTrees,
    shrubs,
    wildflowers,
    rocks,
    hills,
    ridges,
    cabins,
    trailPosts,
    pond,
    fireflies,
  };
}

export const EXTERIOR_BASE_GROUND_Y = -0.18;

export function getExteriorGroundY(
  x: number,
  z: number,
  hills: readonly HillPlacement[],
): number {
  let y = EXTERIOR_BASE_GROUND_Y;
  for (let i = 0; i < hills.length; i++) {
    const h = hills[i];
    const dx = x - h.x;
    const dz = z - h.z;
    const rSq = h.radius * h.radius;
    const dSq = dx * dx + dz * dz;
    if (dSq < rSq) {
      const hillTop = EXTERIOR_BASE_GROUND_Y + h.height * Math.sqrt(Math.max(0, 1 - dSq / rSq));
      if (hillTop > y) y = hillTop;
    }
  }
  return y;
}
