import type {
  AABB,
  ArenaBounds,
  BonusToken,
  BoostPad,
  CarState,
  CheckpointGate,
  LevelConfig,
  MovingGate,
  ParkingZone,
  PropObstacle,
  TrafficPenaltyRecord,
  UltrasonicSensors,
  VehicleModelId,
} from '../types/game';
import {
  applyCollisionPenalty,
  evaluateTrafficLightInteractions,
} from './trafficLights';
import { VEHICLE_SPECS, resolveVehicleModel } from './vehicles';

export const CAR_HALF_W = 0.96;
export const CAR_HALF_L = 2.06;
export const CAR_WHEELBASE = 2.65;
export const MAX_STEER_RAD = 0.62;
export const MAX_FORWARD_SPEED = 17.5;
export const MAX_TURBO_SPEED = 24.0;
export const MAX_PAD_BOOST_SPEED = 27.5;
export const MAX_REVERSE_SPEED = 9.5;
export const ULTRASONIC_MAX_RANGE = 6.0;

export interface CarInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  turbo?: boolean;
  hover?: boolean;
}

export interface StepPhysicsResult {
  collided: boolean;
  impactIntensity: number;
  impactX: number;
  impactZ: number;
  parked: boolean;
  reverseParked: boolean;
  pickedToken: BonusToken | null;
  triggeredBoostPad: BoostPad | null;
  passedCheckpoint: CheckpointGate | null;
  triggeredPenalty: TrafficPenaltyRecord | null;
  awardedTrafficBonus: boolean;
  edsTriggered: boolean;
}

export function createInitialCarState(level: LevelConfig): CarState {
  const dx = level.parking.x - level.spawn.x;
  const dz = level.parking.z - level.spawn.z;
  return {
    x: level.spawn.x,
    z: level.spawn.z,
    yaw: level.spawn.yaw,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    turboEnergy: 100,
    turboActive: false,
    boostPadTimer: 0,
    triggeredBoostPadIds: [],
    passedCheckpointIds: [],
    comboCount: 1,
    driftScore: 0,
    isDrifting: false,
    collectedTokenIds: [],
    bonusScore: 0,
    bonusTimeSec: 0,
    collisions: 0,
    damageFlash: 0,
    invulnTimer: 0,
    parkProgress: 0,
    parkQuality: 0,
    distanceToBay: Math.hypot(dx, dz),
    reverseUsed: false,
    penaltyScore: 0,
    penaltyTimeSec: 0,
    penaltyPoints: 0,
    violationCount: 0,
    penalties: [],
    trafficTrackers: {},
    activeTrafficAlert: null,
    edsFlashTimer: 0,
    hoverY: 0,
    hoverVy: 0,
    hoverActive: false,
    hoverEnergy: 100,
  };
}

export function getLevelPlayableBounds(level: LevelConfig): ArenaBounds {
  if (level.arenaBounds) return level.arenaBounds;
  const halfW = Math.max(8, level.cols * level.cellSize * 0.5 - 0.65);
  const halfD = Math.max(8, level.rows * level.cellSize * 0.5 - 0.65);
  return {
    minX: -halfW,
    maxX: halfW,
    minZ: -halfD,
    maxZ: halfD,
  };
}

/**
 * Hard mathematical safety clamp guaranteeing no bumper or corner of the car OBB
 * can ever escape outside the perimeter walls into outer space.
 */
export function clampCarInsideArenaBounds(
  car: Pick<CarState, 'x' | 'z' | 'yaw' | 'speed'>,
  level: LevelConfig,
): boolean {
  const bounds = getLevelPlayableBounds(level);
  const absSin = Math.abs(Math.sin(car.yaw));
  const absCos = Math.abs(Math.cos(car.yaw));
  const extX = CAR_HALF_W * absCos + CAR_HALF_L * absSin;
  const extZ = CAR_HALF_W * absSin + CAR_HALF_L * absCos;

  const hw = level.highwayExit;
  const insideExitZone =
    Boolean(hw) &&
    hw !== undefined &&
    Math.abs(car.z - hw.exitZ) <= hw.halfWidth &&
    car.x >= bounds.maxX - CAR_HALF_L - 1.5;

  const minAllowedX = bounds.minX + extX;
  const maxAllowedX =
    insideExitZone && hw ? hw.endX - extX : bounds.maxX - extX;
  const minAllowedZ =
    hw && car.x > bounds.maxX - 0.5
      ? hw.exitZ - hw.halfWidth + extZ
      : bounds.minZ + extZ;
  const maxAllowedZ =
    hw && car.x > bounds.maxX - 0.5
      ? hw.exitZ + hw.halfWidth - extZ
      : bounds.maxZ - extZ;

  let clamped = false;
  if (minAllowedX <= maxAllowedX) {
    if (car.x < minAllowedX) {
      car.x = minAllowedX;
      clamped = true;
    } else if (car.x > maxAllowedX) {
      car.x = maxAllowedX;
      clamped = true;
    }
  }
  if (minAllowedZ <= maxAllowedZ) {
    if (car.z < minAllowedZ) {
      car.z = minAllowedZ;
      clamped = true;
    } else if (car.z > maxAllowedZ) {
      car.z = maxAllowedZ;
      clamped = true;
    }
  }
  if (clamped) {
    car.speed *= -0.2;
  }
  return clamped;
}

export function getMovingGateAABB(gate: MovingGate, elapsedTime: number): AABB {
  const offset = Math.sin(elapsedTime * gate.speed + gate.phase) * gate.amplitude;
  return {
    x: gate.axis === 'x' ? gate.baseX + offset : gate.baseX,
    z: gate.axis === 'z' ? gate.baseZ + offset : gate.baseZ,
    halfW: gate.halfW,
    halfD: gate.halfD,
  };
}

/**
 * Separates an oriented car bounding box (OBB) against an axis-aligned wall (AABB)
 * using Separating Axis Theorem (SAT) on the 4 axes (X, Z, carRight, carForward).
 */
export function resolveCarVsAABB(
  carX: number,
  carZ: number,
  carYaw: number,
  box: AABB,
): { pushX: number; pushZ: number } | null {
  const sinY = Math.sin(carYaw);
  const cosY = Math.cos(carYaw);
  // Car local axes in XZ: forward = (sinY, cosY), right = (cosY, -sinY)
  const fx = sinY;
  const fz = cosY;
  const rx = cosY;
  const rz = -sinY;

  const dx = carX - box.x;
  const dz = carZ - box.z;

  let minOverlap = Infinity;
  let bestNx = 0;
  let bestNz = 0;

  const axes: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [rx, rz],
    [fx, fz],
  ];

  for (let i = 0; i < axes.length; i++) {
    const ax = axes[i][0];
    const az = axes[i][1];

    const dist = Math.abs(dx * ax + dz * az);
    const carProj =
      CAR_HALF_W * Math.abs(rx * ax + rz * az) +
      CAR_HALF_L * Math.abs(fx * ax + fz * az);
    const boxProj = box.halfW * Math.abs(ax) + box.halfD * Math.abs(az);

    const overlap = carProj + boxProj - dist;
    if (overlap <= 0) {
      return null;
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      const sign = dx * ax + dz * az >= 0 ? 1 : -1;
      bestNx = ax * sign;
      bestNz = az * sign;
    }
  }

  return {
    pushX: bestNx * minOverlap,
    pushZ: bestNz * minOverlap,
  };
}

/**
 * Smoothly separates an oriented car bounding box (OBB) against a circular
 * roundabout curb island so circulating around roundabouts never snags.
 */
export function resolveCarVsCircle(
  carX: number,
  carZ: number,
  carYaw: number,
  cx: number,
  cz: number,
  radius: number,
): { pushX: number; pushZ: number } | null {
  const sinY = Math.sin(carYaw);
  const cosY = Math.cos(carYaw);
  const dx = cx - carX;
  const dz = cz - carZ;

  // Transform circle center into car local axes (right = (cosY, -sinY), forward = (sinY, cosY))
  const localR = dx * cosY - dz * sinY;
  const localF = dx * sinY + dz * cosY;

  const clampedR = Math.max(-CAR_HALF_W, Math.min(CAR_HALF_W, localR));
  const clampedF = Math.max(-CAR_HALF_L, Math.min(CAR_HALF_L, localF));

  const diffR = localR - clampedR;
  const diffF = localF - clampedF;
  const distSq = diffR * diffR + diffF * diffF;

  if (distSq >= radius * radius) {
    return null;
  }

  let pushLocalR = 0;
  let pushLocalF = 0;
  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    pushLocalR = -(diffR / dist) * overlap;
    pushLocalF = -(diffF / dist) * overlap;
  } else {
    // Center is inside car OBB: push out along nearest edge
    const penR = CAR_HALF_W - Math.abs(localR);
    const penF = CAR_HALF_L - Math.abs(localF);
    if (penR < penF) {
      pushLocalR = (localR >= 0 ? -1 : 1) * (penR + radius);
    } else {
      pushLocalF = (localF >= 0 ? -1 : 1) * (penF + radius);
    }
  }

  return {
    pushX: pushLocalR * cosY + pushLocalF * sinY,
    pushZ: -pushLocalR * sinY + pushLocalF * cosY,
  };
}

export function evaluateParkingAlignment(
  car: Pick<CarState, 'x' | 'z' | 'yaw' | 'speed'>,
  bay: ParkingZone,
): {
  inside: boolean;
  quality: number;
  isReverseAligned: boolean;
  distance: number;
} {
  const dx = car.x - bay.x;
  const dz = car.z - bay.z;
  const distance = Math.hypot(dx, dz);

  // Transform offset into bay's local space (forward = sin(bay.yaw), cos(bay.yaw))
  const sinB = Math.sin(bay.yaw);
  const cosB = Math.cos(bay.yaw);
  const localForward = dx * sinB + dz * cosB;
  const localRight = dx * cosB - dz * sinB;

  const maxRightErr = Math.max(0.45, bay.width * 0.5 - CAR_HALF_W + 0.18);
  const maxForwardErr = Math.max(0.55, bay.length * 0.5 - CAR_HALF_L + 0.22);

  const posRatioX = Math.abs(localRight) / maxRightErr;
  const posRatioZ = Math.abs(localForward) / maxForwardErr;

  const angleDot = Math.cos(car.yaw - bay.yaw);
  const absAngleDot = Math.abs(angleDot); // 1.0 = parallel either forward or reverse
  const isReverseAligned = angleDot < -0.5;

  const posScore = Math.max(0, 1 - Math.max(posRatioX, posRatioZ));
  const angleScore = Math.max(0, (absAngleDot - 0.85) / 0.15);
  const quality = Math.min(1, posScore * 0.65 + angleScore * 0.35);

  const inside =
    Math.abs(localRight) <= maxRightErr &&
    Math.abs(localForward) <= maxForwardErr &&
    absAngleDot >= 0.91 &&
    Math.abs(car.speed) < 0.85;

  return { inside, quality, isReverseAligned, distance };
}

function isOverlappingAnyInteriorObstacle(
  carX: number,
  carZ: number,
  carYaw: number,
  level: LevelConfig,
  elapsedTime: number,
): boolean {
  for (let i = 0; i < level.walls.length; i++) {
    if (resolveCarVsAABB(carX, carZ, carYaw, level.walls[i])) return true;
  }
  for (let i = 0; i < level.movingGates.length; i++) {
    if (resolveCarVsAABB(carX, carZ, carYaw, getMovingGateAABB(level.movingGates[i], elapsedTime))) {
      return true;
    }
  }
  for (let i = 0; i < level.props.length; i++) {
    const p = level.props[i];
    if (resolveCarVsAABB(carX, carZ, carYaw, { x: p.x, z: p.z, halfW: p.radius, halfD: p.radius })) {
      return true;
    }
  }
  const roundabouts = level.roundabouts ?? [];
  for (let i = 0; i < roundabouts.length; i++) {
    const rb = roundabouts[i];
    if (resolveCarVsCircle(carX, carZ, carYaw, rb.x, rb.z, rb.radius)) return true;
  }
  return false;
}

export function stepCarPhysics(
  car: CarState,
  input: CarInput,
  level: LevelConfig,
  dt: number,
  elapsedTime: number,
  vehicleModel: VehicleModelId = 'sport_gt',
): StepPhysicsResult {
  const safeDt = Math.min(dt, 0.05);
  const spec = VEHICLE_SPECS[resolveVehicleModel(vehicleModel)];

  // Steering smoothing (speed-sensitive clamp + model-specific steer lock)
  const steerDir = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFactor = 1 - Math.min(0.45, (Math.abs(car.speed) / MAX_TURBO_SPEED) * 0.45);
  const maxSteer = MAX_STEER_RAD + spec.maxSteerBonus;
  const targetSteer = steerDir * maxSteer * speedFactor;
  const steerRate =
    steerDir !== 0
      ? spec.id === 'drift_pro' || spec.fourWheelSteer
        ? 7.0
        : 5.6
      : 8.2;
  car.steerAngle += (targetSteer - car.steerAngle) * (1 - Math.exp(-steerRate * safeDt));

  // Timers
  if (car.boostPadTimer > 0) {
    car.boostPadTimer = Math.max(0, car.boostPadTimer - safeDt);
  }
  if (car.invulnTimer > 0) car.invulnTimer = Math.max(0, car.invulnTimer - safeDt);
  if (car.damageFlash > 0) car.damageFlash = Math.max(0, car.damageFlash - safeDt * 3.5);

  // Under-chassis SpaceX/Tesla rocket thruster low-altitude hover kinematics (<= 2.25m)
  if (spec.canHover) {
    const wantsHover = Boolean(input.hover) && car.hoverEnergy > 1.5;
    if (wantsHover) {
      car.hoverActive = true;
      car.hoverEnergy = Math.max(0, car.hoverEnergy - 20 * safeDt);
      const targetY = spec.maxHoverHeight;
      const climbDiff = targetY - car.hoverY;
      car.hoverVy += (climbDiff * 7.5 - car.hoverVy * 4.5) * safeDt;
      car.hoverY = Math.min(spec.maxHoverHeight, Math.max(0, car.hoverY + car.hoverVy * safeDt));
    } else {
      car.hoverActive = false;
      // Only safely descend past wall height once horizontally clear of interior walls
      const overInterior =
        car.hoverY >= spec.wallClearanceHeight &&
        isOverlappingAnyInteriorObstacle(car.x, car.z, car.yaw, level, elapsedTime);
      const minSafeY = overInterior ? spec.wallClearanceHeight + 0.06 : 0;
      const targetY = minSafeY;
      if (car.hoverY > targetY + 0.005) {
        const descDiff = targetY - car.hoverY;
        car.hoverVy += (descDiff * 6.0 - car.hoverVy * 3.8) * safeDt;
        car.hoverY = Math.max(minSafeY, Math.min(spec.maxHoverHeight, car.hoverY + car.hoverVy * safeDt));
      } else {
        car.hoverY = minSafeY;
        car.hoverVy = 0;
      }
      if (car.hoverY <= 0.12) {
        car.hoverEnergy = Math.min(100, car.hoverEnergy + 24 * safeDt);
      }
    }
  } else {
    car.hoverY = 0;
    car.hoverVy = 0;
    car.hoverActive = false;
  }

  const isHoverClearingWalls = spec.canHover && car.hoverY >= spec.wallClearanceHeight;

  // Turbo boost & automatic longitudinal acceleration / braking / auto-reverse
  const canTurbo =
    Boolean(input.turbo) &&
    input.throttle &&
    !input.brake &&
    !input.handbrake &&
    car.turboEnergy > 2.0;

  if (canTurbo) {
    car.turboActive = true;
    car.turboEnergy = Math.max(0, car.turboEnergy - 30 * safeDt);
  } else {
    car.turboActive = false;
    const regenRate =
      (Math.abs(car.speed) > 1.5 ? 9.5 : 4.0) * (spec.turboRegenMultiplier ?? 1);
    car.turboEnergy = Math.min(100, car.turboEnergy + regenRate * safeDt);
  }

  const padBoosting = car.boostPadTimer > 0;
  const baseAccel = padBoosting ? 29.0 : car.turboActive ? 24.5 : 15.2;
  const accel = baseAccel * spec.accelMultiplier;
  const baseMaxForward = padBoosting
    ? MAX_PAD_BOOST_SPEED
    : car.turboActive
      ? MAX_TURBO_SPEED
      : MAX_FORWARD_SPEED;
  const maxForward = baseMaxForward * spec.maxSpeedMultiplier;
  const brakeForce = 25.0;
  const reverseAccel = 11.4 * spec.accelMultiplier;
  const drag = isHoverClearingWalls ? 2.4 : 4.6;

  if (input.handbrake) {
    const decel = (spec.id === 'drift_pro' ? 22.0 : 30.0) * safeDt;
    if (Math.abs(car.speed) <= decel) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * decel;
  } else if (input.throttle && !input.brake) {
    if (car.speed < 0) {
      car.speed += brakeForce * safeDt;
    } else {
      car.speed = Math.min(maxForward, car.speed + accel * safeDt);
    }
  } else if (input.brake && !input.throttle) {
    if (car.speed > 0.25) {
      car.speed -= brakeForce * safeDt;
    } else {
      car.speed = Math.max(-MAX_REVERSE_SPEED, car.speed - reverseAccel * safeDt);
      if (car.speed < -0.5) car.reverseUsed = true;
    }
  } else {
    const roll = drag * safeDt;
    if (Math.abs(car.speed) <= roll) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * roll;
  }

  // Drift & handbrake hairpin bonus telemetry (grounded only)
  const sharpCornering =
    car.hoverY < 0.25 &&
    Math.abs(car.speed) > (spec.id === 'drift_pro' ? 5.0 : 6.0) &&
    Math.abs(car.steerAngle) > (spec.id === 'drift_pro' ? 0.2 : 0.26) &&
    (input.handbrake || Math.abs(car.speed) > spec.driftThresholdSpeed);
  car.isDrifting = sharpCornering;
  if (sharpCornering) {
    const prevBucket = Math.floor(car.driftScore / 10);
    car.driftScore += 75 * spec.driftScoreMultiplier * safeDt;
    const nextBucket = Math.floor(car.driftScore / 10);
    if (nextBucket > prevBucket) {
      car.bonusScore += (nextBucket - prevBucket) * 10;
    }
  }

  // Sub-stepped integration + 2-pass SAT collision resolution + hard boundary clamp
  // Note: Hovering above wallClearanceHeight clears interior walls/obstacles,
  // while outer arena bounds ALWAYS stay enforced at every height.
  let collided = false;
  let impactIntensity = 0;
  let impactX = car.x;
  let impactZ = car.z;

  const subSteps = 2;
  const subDt = safeDt / subSteps;
  const roundabouts = level.roundabouts ?? [];

  for (let step = 0; step < subSteps; step++) {
    if (Math.abs(car.speed) > 0.02) {
      const fourWsBonus = spec.fourWheelSteer ? 1.08 : 1.0;
      const turnAgility =
        (car.isDrifting ? 1.16 : 1.0) * spec.turnAgilityMultiplier * fourWsBonus;
      const angularVel =
        (car.speed / CAR_WHEELBASE) * Math.tan(car.steerAngle) * turnAgility;
      car.yaw += angularVel * subDt;
    }

    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    car.x += sinY * car.speed * subDt;
    car.z += cosY * car.speed * subDt;
    if (car.hoverY < 0.25) {
      car.wheelSpin += (car.speed / 0.36) * subDt;
    }

    const resolveBox = (box: AABB) => {
      const push = resolveCarVsAABB(car.x, car.z, car.yaw, box);
      if (!push) return;
      car.x += push.pushX;
      car.z += push.pushZ;

      const pushLen = Math.hypot(push.pushX, push.pushZ);
      if (pushLen > 0.001) {
        const nx = push.pushX / pushLen;
        const nz = push.pushZ / pushLen;
        const vx = sinY * car.speed;
        const vz = cosY * car.speed;
        const intoWall = -(vx * nx + vz * nz);
        if (intoWall > 1.2) {
          impactIntensity = Math.max(impactIntensity, Math.min(1, intoWall / 12));
          impactX = car.x - nx * 0.9;
          impactZ = car.z - nz * 0.9;
          collided = true;
        }
        car.speed *= -0.28;
      }
    };

    for (let pass = 0; pass < 2; pass++) {
      if (!isHoverClearingWalls) {
        for (let i = 0; i < level.walls.length; i++) {
          resolveBox(level.walls[i]);
        }
        for (let i = 0; i < level.movingGates.length; i++) {
          resolveBox(getMovingGateAABB(level.movingGates[i], elapsedTime));
        }
        for (let i = 0; i < level.props.length; i++) {
          const p: PropObstacle = level.props[i];
          resolveBox({ x: p.x, z: p.z, halfW: p.radius, halfD: p.radius });
        }
        for (let i = 0; i < roundabouts.length; i++) {
          const rb = roundabouts[i];
          const push = resolveCarVsCircle(car.x, car.z, car.yaw, rb.x, rb.z, rb.radius);
          if (!push) continue;
          car.x += push.pushX;
          car.z += push.pushZ;
          const pushLen = Math.hypot(push.pushX, push.pushZ);
          if (pushLen > 0.001) {
            const nx = push.pushX / pushLen;
            const nz = push.pushZ / pushLen;
            const vx = sinY * car.speed;
            const vz = cosY * car.speed;
            const intoIsland = -(vx * nx + vz * nz);
            if (intoIsland > 1.2) {
              impactIntensity = Math.max(impactIntensity, Math.min(1, intoIsland / 12));
              impactX = car.x - nx * 0.9;
              impactZ = car.z - nz * 0.9;
              collided = true;
            }
            car.speed *= -0.28;
          }
        }
      }
      if (clampCarInsideArenaBounds(car, level)) {
        collided = true;
        impactIntensity = Math.max(impactIntensity, 0.35);
      }
    }
  }

  let crashPenalty: TrafficPenaltyRecord | null = null;
  if (collided && car.invulnTimer <= 0) {
    car.collisions += 1;
    car.comboCount = 1;
    car.invulnTimer = 0.65;
    car.damageFlash = 1.0;
    crashPenalty = applyCollisionPenalty(car, impactIntensity, elapsedTime);
  } else if (collided) {
    // Minor scrape during invulnerability grace period shouldn't double-count
    collided = false;
  }

  // Situational Traffic Light Violation & Red-Light Wait Compliance Evaluation (applies when grounded)
  const trafficRes = isHoverClearingWalls
    ? { triggeredPenalty: null, awardedComplianceBonus: false, edsTriggered: false }
    : evaluateTrafficLightInteractions(car, level, elapsedTime, safeDt);

  // Boost Pad Strip Triggers
  let triggeredBoostPad: BoostPad | null = null;
  const boostPads = level.boostPads ?? [];
  if (car.hoverY < 0.8) {
    for (let i = 0; i < boostPads.length; i++) {
      const bp = boostPads[i];
      if (car.triggeredBoostPadIds.includes(bp.id)) continue;
      if (Math.hypot(car.x - bp.x, car.z - bp.z) <= 2.45) {
        car.triggeredBoostPadIds.push(bp.id);
        car.boostPadTimer = 1.15;
        car.turboEnergy = Math.min(100, car.turboEnergy + 28);
        if (car.speed >= -0.5) {
          car.speed = Math.min(MAX_PAD_BOOST_SPEED, Math.max(car.speed + 6.0, 20.5));
        }
        car.bonusScore += 75;
        triggeredBoostPad = bp;
        break;
      }
    }
  }

  // Checkpoint Gate Triggers (+100 * combo bonus score & +3s time buffer)
  let passedCheckpoint: CheckpointGate | null = null;
  const checkpoints = level.checkpoints ?? [];
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    if (car.passedCheckpointIds.includes(cp.id)) continue;
    if (Math.hypot(car.x - cp.x, car.z - cp.z) <= cp.width * 0.5 + 1.1) {
      car.passedCheckpointIds.push(cp.id);
      car.bonusScore += 100 * car.comboCount;
      car.bonusTimeSec += 3;
      car.comboCount = Math.min(5, car.comboCount + 1);
      passedCheckpoint = cp;
      break;
    }
  }

  // Bonus token collection (Star = +150 pts & +35% turbo, Time = +5s & +35% turbo)
  let pickedToken: BonusToken | null = null;
  const tokens = level.tokens ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (car.collectedTokenIds.includes(tok.id)) continue;
    if (Math.hypot(car.x - tok.x, car.z - tok.z) <= 2.25) {
      car.collectedTokenIds.push(tok.id);
      car.turboEnergy = Math.min(100, car.turboEnergy + 35);
      if (tok.kind === 'star') {
        car.bonusScore += 150;
      } else {
        car.bonusTimeSec += 5;
      }
      pickedToken = tok;
      break;
    }
  }

  // Evaluate parking alignment (hover car must touch down below 0.35m to complete park)
  const align = evaluateParkingAlignment(car, level.parking);
  car.distanceToBay = align.distance;
  car.parkQuality = align.quality;

  if (align.inside && car.hoverY <= 0.35) {
    car.parkProgress = Math.min(1, car.parkProgress + safeDt / 0.72);
  } else {
    car.parkProgress = Math.max(0, car.parkProgress - safeDt * 1.6);
  }

  const parked = car.parkProgress >= 1;
  return {
    collided,
    impactIntensity,
    impactX,
    impactZ,
    parked,
    reverseParked: parked && (align.isReverseAligned || car.reverseUsed),
    pickedToken,
    triggeredBoostPad,
    passedCheckpoint,
    triggeredPenalty: trafficRes.triggeredPenalty ?? crashPenalty,
    awardedTrafficBonus: trafficRes.awardedComplianceBonus,
    edsTriggered: trafficRes.edsTriggered,
  };
}

function rayAABBHitDistance(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  box: AABB,
  maxDist: number,
): number {
  const minX = box.x - box.halfW;
  const maxX = box.x + box.halfW;
  const minZ = box.z - box.halfD;
  const maxZ = box.z + box.halfD;

  let tMin = 0;
  let tMax = maxDist;

  if (Math.abs(dx) < 1e-6) {
    if (ox < minX || ox > maxX) return maxDist;
  } else {
    const invD = 1 / dx;
    let t1 = (minX - ox) * invD;
    let t2 = (maxX - ox) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return maxDist;
  }

  if (Math.abs(dz) < 1e-6) {
    if (oz < minZ || oz > maxZ) return maxDist;
  } else {
    const invD = 1 / dz;
    let t1 = (minZ - oz) * invD;
    let t2 = (maxZ - oz) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return maxDist;
  }

  return tMin >= 0 ? Math.min(maxDist, tMin) : maxDist;
}

function rayCircleHitDistance(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  maxDist: number,
): number {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return maxDist;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) * 0.5;
  if (t1 >= 0 && t1 <= maxDist) return t1;
  const t2 = (-b + sqrtDisc) * 0.5;
  if (t2 >= 0 && t2 <= maxDist) return t2;
  return maxDist;
}

/**
 * Simulates 4-direction automotive ultrasonic parking sensors (front, rear, left, right)
 * using 3-beam fan rays along each bumper/side against walls, moving gates, props, and roundabouts.
 */
export function computeUltrasonicSensors(
  car: Pick<CarState, 'x' | 'z' | 'yaw'> & { hoverY?: number },
  level: LevelConfig,
  elapsedTime: number,
): UltrasonicSensors {
  const hoveringHigh = (car.hoverY ?? 0) >= VEHICLE_SPECS.hover_thruster.wallClearanceHeight;
  if (hoveringHigh) {
    const bounds = getLevelPlayableBounds(level);
    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const fx = sinY;
    const fz = cosY;
    const rx = cosY;
    const rz = -sinY;
    const boundaryBoxes: AABB[] = [
      { x: bounds.minX - 0.5, z: 0, halfW: 0.5, halfD: 500 },
      { x: bounds.maxX + 0.5, z: 0, halfW: 0.5, halfD: 500 },
      { x: 0, z: bounds.minZ - 0.5, halfW: 500, halfD: 0.5 },
      { x: 0, z: bounds.maxZ + 0.5, halfW: 500, halfD: 0.5 },
    ];
    const measureBoundary = (lf: number, lr: number, dx: number, dz: number): number => {
      let best = ULTRASONIC_MAX_RANGE;
      const ox = car.x + fx * lf + rx * lr;
      const oz = car.z + fz * lf + rz * lr;
      for (let b = 0; b < boundaryBoxes.length; b++) {
        const hit = rayAABBHitDistance(ox, oz, dx, dz, boundaryBoxes[b], best);
        if (hit < best) best = hit;
      }
      return Number(best.toFixed(2));
    };
    const front = measureBoundary(CAR_HALF_L, 0, fx, fz);
    const rear = measureBoundary(-CAR_HALF_L, 0, -fx, -fz);
    const right = measureBoundary(0, CAR_HALF_W, rx, rz);
    const left = measureBoundary(0, -CAR_HALF_W, -rx, -rz);
    return { front, rear, left, right, minDistance: Math.min(front, rear, left, right) };
  }

  const sinY = Math.sin(car.yaw);
  const cosY = Math.cos(car.yaw);
  // Car local frame: forward = (sinY, cosY), right = (cosY, -sinY)
  const fx = sinY;
  const fz = cosY;
  const rx = cosY;
  const rz = -sinY;

  const boxes: AABB[] = [...level.walls];
  for (let i = 0; i < level.movingGates.length; i++) {
    boxes.push(getMovingGateAABB(level.movingGates[i], elapsedTime));
  }
  for (let i = 0; i < level.props.length; i++) {
    const p = level.props[i];
    boxes.push({ x: p.x, z: p.z, halfW: p.radius, halfD: p.radius });
  }
  const roundabouts = level.roundabouts ?? [];

  const measureSide = (
    localForward: number,
    localRight: number,
    dirX: number,
    dirZ: number,
    spreadAxisX: number,
    spreadAxisZ: number,
    spreadOffsets: number[],
  ): number => {
    let best = ULTRASONIC_MAX_RANGE;
    for (let s = 0; s < spreadOffsets.length; s++) {
      const off = spreadOffsets[s];
      const ox = car.x + fx * localForward + rx * localRight + spreadAxisX * off;
      const oz = car.z + fz * localForward + rz * localRight + spreadAxisZ * off;
      for (let b = 0; b < boxes.length; b++) {
        const hit = rayAABBHitDistance(ox, oz, dirX, dirZ, boxes[b], best);
        if (hit < best) best = hit;
      }
      for (let r = 0; r < roundabouts.length; r++) {
        const rb = roundabouts[r];
        const hit = rayCircleHitDistance(ox, oz, dirX, dirZ, rb.x, rb.z, rb.radius, best);
        if (hit < best) best = hit;
      }
    }
    return Number(best.toFixed(2));
  };

  const front = measureSide(CAR_HALF_L, 0, fx, fz, rx, rz, [-0.68, 0, 0.68]);
  const rear = measureSide(-CAR_HALF_L, 0, -fx, -fz, rx, rz, [-0.68, 0, 0.68]);
  const right = measureSide(0, CAR_HALF_W, rx, rz, fx, fz, [-1.45, 0, 1.45]);
  const left = measureSide(0, -CAR_HALF_W, -rx, -rz, fx, fz, [-1.45, 0, 1.45]);

  return {
    front,
    rear,
    left,
    right,
    minDistance: Math.min(front, rear, left, right),
  };
}
