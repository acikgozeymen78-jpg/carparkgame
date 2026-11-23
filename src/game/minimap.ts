import type { AABB, LevelConfig, NearestWallHit } from '../types/game';

export interface MiniMapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  size: number;
}

/**
 * Computes a square bounding box enclosing the entire labyrinth,
 * spawn, parking bay, roundabouts, and optional highway exit with uniform margin.
 */
export function computeMiniMapBounds(level: LevelConfig, padding = 1.2): MiniMapBounds {
  let minX = Math.min(level.spawn.x, level.parking.x) - 3.5;
  let maxX = Math.max(level.spawn.x, level.parking.x) + 3.5;
  let minZ = Math.min(level.spawn.z, level.parking.z) - 3.5;
  let maxZ = Math.max(level.spawn.z, level.parking.z) + 3.5;

  if (level.highwayExit) {
    maxX = Math.max(maxX, level.highwayExit.endX + 2.0);
    minZ = Math.min(minZ, level.highwayExit.exitZ - level.highwayExit.halfWidth - 2.0);
    maxZ = Math.max(maxZ, level.highwayExit.exitZ + level.highwayExit.halfWidth + 2.0);
  }

  for (let i = 0; i < level.walls.length; i++) {
    const w = level.walls[i];
    minX = Math.min(minX, w.x - w.halfW);
    maxX = Math.max(maxX, w.x + w.halfW);
    minZ = Math.min(minZ, w.z - w.halfD);
    maxZ = Math.max(maxZ, w.z + w.halfD);
  }

  const rawW = maxX - minX + padding * 2;
  const rawH = maxZ - minZ + padding * 2;
  const size = Math.max(rawW, rawH, 24);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  return {
    minX: cx - size * 0.5,
    maxX: cx + size * 0.5,
    minZ: cz - size * 0.5,
    maxZ: cz + size * 0.5,
    size,
  };
}

/**
 * Detects the nearest labyrinth walls around the player's world position.
 */
export function detectNearestWalls(
  carX: number,
  carZ: number,
  walls: AABB[],
  maxRange = 11.5,
  limit = 5,
): NearestWallHit[] {
  const hits: NearestWallHit[] = [];

  for (let i = 0; i < walls.length; i++) {
    const box = walls[i];
    const minX = box.x - box.halfW;
    const maxX = box.x + box.halfW;
    const minZ = box.z - box.halfD;
    const maxZ = box.z + box.halfD;

    const closestX = Math.max(minX, Math.min(carX, maxX));
    const closestZ = Math.max(minZ, Math.min(carZ, maxZ));
    const distance = Math.hypot(carX - closestX, carZ - closestZ);

    if (distance <= maxRange) {
      hits.push({
        wallIndex: i,
        distance: Number(distance.toFixed(2)),
        closestX: Number(closestX.toFixed(2)),
        closestZ: Number(closestZ.toFixed(2)),
        box,
      });
    }
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, Math.max(0, limit));
}

/**
 * Computes relative bearing angle (radians) and distance from player to park bay.
 * Returns deltaAngle in [-PI, PI] relative to car's forward heading.
 */
export function computeRelativeBayBearing(
  carX: number,
  carZ: number,
  carYaw: number,
  bayX: number,
  bayZ: number,
): { distance: number; worldAngle: number; relativeAngle: number } {
  const dx = bayX - carX;
  const dz = bayZ - carZ;
  const distance = Math.hypot(dx, dz);
  // Forward vector in Three.js XZ plane is (sin(yaw), cos(yaw))
  const worldAngle = Math.atan2(dx, dz);
  let relativeAngle = worldAngle - carYaw;
  while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
  while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
  return {
    distance: Number(distance.toFixed(2)),
    worldAngle,
    relativeAngle,
  };
}
