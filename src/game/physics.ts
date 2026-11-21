import type {
  AABB,
  CarState,
  LevelConfig,
  MovingGate,
  ParkingZone,
  PropObstacle,
} from '../types/game';

export const CAR_HALF_W = 0.96;
export const CAR_HALF_L = 2.06;
export const CAR_WHEELBASE = 2.65;
export const MAX_STEER_RAD = 0.62;
export const MAX_FORWARD_SPEED = 17.5;
export const MAX_REVERSE_SPEED = 9.5;

export interface CarInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export interface StepPhysicsResult {
  collided: boolean;
  impactIntensity: number;
  impactX: number;
  impactZ: number;
  parked: boolean;
  reverseParked: boolean;
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
    collisions: 0,
    damageFlash: 0,
    invulnTimer: 0,
    parkProgress: 0,
    parkQuality: 0,
    distanceToBay: Math.hypot(dx, dz),
    reverseUsed: false,
  };
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

export function stepCarPhysics(
  car: CarState,
  input: CarInput,
  level: LevelConfig,
  dt: number,
  elapsedTime: number,
): StepPhysicsResult {
  const safeDt = Math.min(dt, 0.05);

  // Steering smoothing (speed-sensitive clamp so high-speed turns stay controllable)
  const steerDir = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFactor = 1 - Math.min(0.42, (Math.abs(car.speed) / MAX_FORWARD_SPEED) * 0.42);
  const targetSteer = steerDir * MAX_STEER_RAD * speedFactor;
  const steerRate = steerDir !== 0 ? 5.6 : 7.8;
  car.steerAngle += (targetSteer - car.steerAngle) * (1 - Math.exp(-steerRate * safeDt));

  // Longitudinal acceleration / braking / handbrake
  const accel = 15.2;
  const brakeForce = 24.0;
  const reverseAccel = 11.2;
  const drag = 4.6;

  if (input.handbrake) {
    const decel = 34.0 * safeDt;
    if (Math.abs(car.speed) <= decel) car.speed = 0;
    else car.speed -= Math.sign(car.speed) * decel;
  } else if (input.throttle && !input.brake) {
    if (car.speed < 0) {
      car.speed += brakeForce * safeDt;
    } else {
      car.speed = Math.min(MAX_FORWARD_SPEED, car.speed + accel * safeDt);
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

  // Bicycle kinematics update
  if (Math.abs(car.speed) > 0.02) {
    const angularVel = (car.speed / CAR_WHEELBASE) * Math.tan(car.steerAngle);
    car.yaw += angularVel * safeDt;
  }

  const sinY = Math.sin(car.yaw);
  const cosY = Math.cos(car.yaw);
  car.x += sinY * car.speed * safeDt;
  car.z += cosY * car.speed * safeDt;
  car.wheelSpin += (car.speed / 0.36) * safeDt;

  // Timers
  if (car.invulnTimer > 0) car.invulnTimer = Math.max(0, car.invulnTimer - safeDt);
  if (car.damageFlash > 0) car.damageFlash = Math.max(0, car.damageFlash - safeDt * 3.5);

  // Collision resolution against walls, moving gates, and cone/bollard props
  let collided = false;
  let impactIntensity = 0;
  let impactX = car.x;
  let impactZ = car.z;

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
      // Bounce back slightly along velocity
      car.speed *= -0.28;
    }
  };

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

  if (collided && car.invulnTimer <= 0) {
    car.collisions += 1;
    car.invulnTimer = 0.65;
    car.damageFlash = 1.0;
  } else if (collided) {
    // Minor scrape during invulnerability grace period shouldn't double-count
    collided = false;
  }

  // Evaluate parking alignment
  const align = evaluateParkingAlignment(car, level.parking);
  car.distanceToBay = align.distance;
  car.parkQuality = align.quality;

  if (align.inside) {
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
  };
}
