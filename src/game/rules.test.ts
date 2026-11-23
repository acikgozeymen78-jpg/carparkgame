import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHETYPE_ORDER,
  createInitialDifficultyState,
  generateLabyrinthLevel,
  isHighwayExitLevel,
  resolveActiveTier,
  updateDynamicDifficulty,
} from './difficulty';
import {
  computeUltrasonicSensors,
  createInitialCarState,
  evaluateParkingAlignment,
  getLevelPlayableBounds,
  resolveCarVsAABB,
  resolveCarVsCircle,
  stepCarPhysics,
} from './physics';
import {
  computeMiniMapBounds,
  computeRelativeBayBearing,
  detectNearestWalls,
} from './minimap';
import { calculateRunScore, evaluateRunAchievements } from './achievements';
import { buildGlobalLeaderboard, buildLevelLeaderboard } from './leaderboard';
import {
  computeRandomSegmentEndpoints,
  convertStreetPathToLabyrinth,
  pickRandomStreetSeed,
  projectLatLngPathToMeters,
} from './realWorldMaze';
import { computeCockpitTelemetryAngles } from './cockpitBuilder';
import type { PlayerProgress, RunResult } from '../types/game';

test('labyrinth level spawns car in open corridor facing clear path (no immediate wall collision)', () => {
  for (let lvl = 1; lvl <= 6; lvl++) {
    const level = generateLabyrinthLevel(lvl, 'usta');
    const car = createInitialCarState(level);

    // Car at spawn must not overlap any wall
    for (const wall of level.walls) {
      const push = resolveCarVsAABB(car.x, car.z, car.yaw, wall);
      assert.equal(push, null, `Level ${lvl} spawn overlaps a wall`);
    }

    // Driving straight forward 2.5m from spawn must remain clear of walls
    const stepX = car.x + Math.sin(car.yaw) * 2.5;
    const stepZ = car.z + Math.cos(car.yaw) * 2.5;
    for (const wall of level.walls) {
      const push = resolveCarVsAABB(stepX, stepZ, car.yaw, wall);
      assert.equal(push, null, `Level ${lvl} spawn faces directly into a wall`);
    }

    assert.ok(level.shortestPathCells >= 3, 'Maze has meaningful multi-cell path');
  }
});

test('dynamic difficulty adapts upward on clean fast wins and downward on repeated failures', () => {
  let state = createInitialDifficultyState();
  assert.equal(resolveActiveTier(state), 'caylak');

  // Two clean fast runs should push skill into Usta or Profesyonel
  state = updateDynamicDifficulty(state, {
    victory: true,
    elapsedTime: 10,
    parTime: 20,
    collisions: 0,
  });
  state = updateDynamicDifficulty(state, {
    victory: true,
    elapsedTime: 10,
    parTime: 20,
    collisions: 0,
  });
  assert.ok(state.skillRating >= 50);
  assert.notEqual(resolveActiveTier(state), 'caylak');

  // Repeated failures ease difficulty back down
  const peakSkill = state.skillRating;
  state = updateDynamicDifficulty(state, {
    victory: false,
    elapsedTime: 40,
    parTime: 20,
    collisions: 4,
  });
  state = updateDynamicDifficulty(state, {
    victory: false,
    elapsedTime: 40,
    parTime: 20,
    collisions: 4,
  });
  assert.ok(state.skillRating < peakSkill);
});

test('car physics accelerates, steers with Ackermann kinematics, and resolves wall collisions', () => {
  const level = generateLabyrinthLevel(1, 'caylak');
  const car = createInitialCarState(level);

  // Accelerate forward for 0.5s
  for (let i = 0; i < 30; i++) {
    stepCarPhysics(
      car,
      { throttle: true, brake: false, left: true, right: false, handbrake: false },
      level,
      1 / 60,
      i / 60,
    );
  }

  assert.ok(car.speed > 2, 'Car accelerates forward');
  assert.ok(car.steerAngle > 0.1, 'Left steer angle increases');
  assert.notEqual(car.yaw, level.spawn.yaw, 'Car yaw turns when moving and steering');

  // Verify OBB vs AABB resolves overlap
  const wallBox = { x: 0, z: 0, halfW: 1, halfD: 1 };
  const push = resolveCarVsAABB(0.5, 0.5, 0.3, wallBox);
  assert.ok(push !== null, 'Detects OBB vs AABB overlap');
});

test('parking alignment triggers victory hold both nose-in and reverse-in', () => {
  const level = generateLabyrinthLevel(1, 'caylak');
  const car = createInitialCarState(level);

  // Place car centered inside bay facing reverse (yaw + PI)
  car.x = level.parking.x;
  car.z = level.parking.z;
  car.yaw = level.parking.yaw + Math.PI;
  car.speed = 0.1;

  const evalRev = evaluateParkingAlignment(car, level.parking);
  assert.equal(evalRev.inside, true);
  assert.equal(evalRev.isReverseAligned, true);

  let parked = false;
  let reverseParked = false;
  for (let i = 0; i < 60; i++) {
    const res = stepCarPhysics(
      car,
      { throttle: false, brake: false, left: false, right: false, handbrake: true },
      level,
      1 / 60,
      i / 60,
    );
    if (res.parked) {
      parked = true;
      reverseParked = res.reverseParked;
      break;
    }
  }
  assert.equal(parked, true);
  assert.equal(reverseParked, true);
});

test('scoring, achievement unlocking, and leaderboard ranking work together', () => {
  const { score, stars } = calculateRunScore({
    levelNumber: 3,
    elapsedTime: 14,
    parTime: 22,
    collisions: 0,
    tierMultiplier: 1.75,
    reverseParked: true,
  });
  assert.equal(stars, 3);
  assert.ok(score > 2000);

  const progress: PlayerProgress = {
    playerName: 'Test Pilot',
    highestLevel: 3,
    totalScore: score,
    totalParks: 2,
    cleanParks: 1,
    reverseParks: 1,
    realWorldParks: 0,
    unlockedAchievements: [],
    levelBestScores: { 3: score },
    levelBestTimes: { 3: 14 },
    customizationCount: 1,
  };

  const run: RunResult = {
    victory: true,
    reason: 'parked',
    levelNumber: 3,
    tier: 'profesyonel',
    elapsedTime: 14,
    parTime: 22,
    collisions: 0,
    stars,
    score,
    reverseParked: true,
    difficultyShift: 'up',
    newTier: 'profesyonel',
    newlyUnlockedAchievements: [],
    isRealWorld: true,
    realWorldStreetName: 'İstiklal Caddesi',
  };

  const unlocked = evaluateRunAchievements(progress, run);
  assert.ok(unlocked.includes('first_park'));
  assert.ok(unlocked.includes('zero_scratch'));
  assert.ok(unlocked.includes('speed_demon'));
  assert.ok(unlocked.includes('reverse_legend'));
  assert.ok(unlocked.includes('pro_tier'));
  assert.ok(unlocked.includes('real_world_park'));

  const globalBoard = buildGlobalLeaderboard(progress, 'profesyonel');
  assert.ok(globalBoard.some((e) => e.isPlayer && e.name === 'Test Pilot'));
  const levelBoard = buildLevelLeaderboard(3, progress, 'profesyonel');
  assert.ok(levelBoard.some((e) => e.isPlayer));
});

test('realWorldMaze converts real street coordinates into solvable 3D labyrinth with clear spawn and bay', () => {
  const seed = pickRandomStreetSeed();
  const { origin, destination } = computeRandomSegmentEndpoints(
    { lat: seed.lat, lng: seed.lng },
    0.7,
    140,
  );

  // Multi-turn real street polyline sample (e.g. L-bend + chicane)
  const samplePath = [
    origin,
    { lat: origin.lat + 0.00035, lng: origin.lng + 0.00012 },
    { lat: origin.lat + 0.00042, lng: origin.lng + 0.00068 },
    destination,
  ];

  const projected = projectLatLngPathToMeters(samplePath);
  assert.ok(projected.length >= 2);

  const level = convertStreetPathToLabyrinth({
    path: samplePath,
    meta: {
      streetName: 'Galata Kulesi Sk.',
      cityLabel: seed.cityLabel,
      origin,
      destination,
      distanceMeters: 140,
    },
    tier: 'usta',
  });

  assert.equal(level.realWorld?.streetName, 'Galata Kulesi Sk.');
  assert.ok(level.shortestPathCells >= 4);
  assert.ok(level.walls.length > 0);

  const car = createInitialCarState(level);
  for (const wall of level.walls) {
    assert.equal(
      resolveCarVsAABB(car.x, car.z, car.yaw, wall),
      null,
      'Real world spawn overlaps a wall',
    );
  }

  const fwdX = car.x + Math.sin(car.yaw) * 2.5;
  const fwdZ = car.z + Math.cos(car.yaw) * 2.5;
  for (const wall of level.walls) {
    assert.equal(
      resolveCarVsAABB(fwdX, fwdZ, car.yaw, wall),
      null,
      'Real world spawn faces directly into a wall',
    );
  }
});

test('automatic driving with Turbo (NOS) boosts past normal top speed, drains energy, and recharges', () => {
  const level = generateLabyrinthLevel(2, 'caylak');
  const carNormal = createInitialCarState(level);
  const gasOnly = {
    throttle: true,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    turbo: false,
  };
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(carNormal, gasOnly, level, 1 / 60, i / 60);
  }
  assert.ok(carNormal.speed > 8.0, 'Automatic drive accelerates forward cleanly');

  const carTurbo = createInitialCarState(level);
  const gasTurbo = { ...gasOnly, turbo: true };
  for (let i = 0; i < 45; i++) {
    stepCarPhysics(carTurbo, gasTurbo, level, 1 / 60, i / 60);
  }
  assert.ok(carTurbo.turboActive, 'Turbo activates when Shift/NOS held with energy');
  assert.ok(
    carTurbo.turboEnergy < 100,
    `Turbo drains energy (remaining: ${carTurbo.turboEnergy})`,
  );
  assert.ok(
    carTurbo.speed > carNormal.speed,
    `Turbo speed (${carTurbo.speed}) should exceed normal acceleration (${carNormal.speed})`,
  );

  // Release turbo and verify energy recharges
  const depleted = carTurbo.turboEnergy;
  for (let i = 0; i < 60; i++) {
    stepCarPhysics(carTurbo, gasOnly, level, 1 / 60, (45 + i) / 60);
  }
  assert.ok(
    carTurbo.turboEnergy > depleted,
    'Turbo energy regenerates when released',
  );
});

test('bonus star & time crystal pickups award score/time/turbo and unlock token_hunter achievement', () => {
  const baseLevel = generateLabyrinthLevel(2, 'caylak');
  const level = {
    ...baseLevel,
    tokens: [
      { id: 'tok-star', x: baseLevel.spawn.x, z: baseLevel.spawn.z, kind: 'star' as const },
      { id: 'tok-time', x: baseLevel.spawn.x + 1.1, z: baseLevel.spawn.z, kind: 'time' as const },
    ],
  };

  const car = createInitialCarState(level);
  car.turboEnergy = 40;
  const idle = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    turbo: false,
  };

  const step1 = stepCarPhysics(car, idle, level, 1 / 60, 0);
  assert.equal(step1.pickedToken?.kind, 'star');
  assert.equal(car.bonusScore, 150);
  assert.ok(
    car.turboEnergy >= 75 && car.turboEnergy < 75.2,
    `Expected turboEnergy ~75.07 after +35 boost, got ${car.turboEnergy}`,
  );

  car.x = baseLevel.spawn.x + 1.1;
  const step2 = stepCarPhysics(car, idle, level, 1 / 60, 1 / 60);
  assert.equal(step2.pickedToken?.kind, 'time');
  assert.equal(car.bonusTimeSec, 5);
  assert.equal(car.collectedTokenIds.length, 2);

  const progress: PlayerProgress = {
    playerName: 'Avcı',
    highestLevel: 2,
    totalScore: 0,
    totalParks: 0,
    cleanParks: 0,
    reverseParks: 0,
    realWorldParks: 0,
    unlockedAchievements: [],
    levelBestScores: {},
    levelBestTimes: {},
    customizationCount: 0,
  };
  const unlocked = evaluateRunAchievements(progress, {
    victory: true,
    reason: 'parked',
    levelNumber: 2,
    tier: 'caylak',
    elapsedTime: 25,
    parTime: 22,
    collisions: 1,
    stars: 2,
    score: 1200,
    reverseParked: false,
    difficultyShift: 'steady',
    newTier: 'caylak',
    newlyUnlockedAchievements: [],
    tokensCollected: 2,
    totalTokens: 2,
    bonusScore: 150,
  });
  assert.ok(unlocked.includes('token_hunter'));
});

test('later levels generate significantly longer labyrinth courses', () => {
  const lvl1 = generateLabyrinthLevel(1, 'caylak');
  const lvl8 = generateLabyrinthLevel(8, 'usta');
  assert.ok(lvl8.cols >= 8 && lvl8.rows >= 8, 'Later levels expand grid up to 8-11 cells');
  assert.ok(
    lvl8.shortestPathCells > lvl1.shortestPathCells * 2,
    `Level 8 path (${lvl8.shortestPathCells}) should be substantially longer than Level 1 (${lvl1.shortestPathCells})`,
  );
});

test('4-way ultrasonic sensors measure accurate clearances on front, rear, left, and right', () => {
  const level = generateLabyrinthLevel(1, 'caylak');
  // Custom open box room around origin so exact bumper clearances are known
  const testLevel = {
    ...level,
    movingGates: [],
    props: [],
    roundabouts: [],
    walls: [
      { x: 0, z: 4.5, halfW: 10, halfD: 0.5 },   // +Z front wall edge at z=4.0 (car nose at +2.06 -> 1.94m)
      { x: 0, z: -3.5, halfW: 10, halfD: 0.5 },  // -Z rear wall edge at z=-3.0 (car tail at -2.06 -> 0.94m)
      { x: -2.5, z: 0, halfW: 0.5, halfD: 10 },  // -X right/left wall edge at x=-2.0 (car side at 0.96 -> 1.04m)
      { x: 3.5, z: 0, halfW: 0.5, halfD: 10 },   // +X wall edge at x=3.0 (car side at 0.96 -> 2.04m)
    ],
  };

  const car = createInitialCarState(testLevel);
  car.x = 0;
  car.z = 0;
  car.yaw = 0; // forward = +Z, right = +X, left = -X

  const sensors = computeUltrasonicSensors(car, testLevel, 0);
  assert.ok(Math.abs(sensors.front - 1.94) < 0.05, `Expected front ~1.94m, got ${sensors.front}`);
  assert.ok(Math.abs(sensors.rear - 0.94) < 0.05, `Expected rear ~0.94m, got ${sensors.rear}`);
  assert.ok(Math.abs(sensors.right - 2.04) < 0.05, `Expected right ~2.04m, got ${sensors.right}`);
  assert.ok(Math.abs(sensors.left - 1.04) < 0.05, `Expected left ~1.04m, got ${sensors.left}`);
});

test('courses feature straightaways, 4-way/T intersections, and roundabout plazas on larger grids', () => {
  for (let lvl = 1; lvl <= 7; lvl++) {
    const level = generateLabyrinthLevel(lvl, 'usta');
    const tiles = level.roadTiles ?? [];
    assert.equal(tiles.length, level.cols * level.rows);

    const hasStraight = tiles.some(
      (t) => t.kind === 'straightX' || t.kind === 'straightZ',
    );
    const hasIntersection = tiles.some(
      (t) => t.kind === 'cross' || t.kind === 'tJunction' || t.kind === 'plaza',
    );
    assert.ok(hasStraight, `Level ${lvl} should contain straightaways`);
    assert.ok(hasIntersection, `Level ${lvl} should contain intersections`);

    if (level.cols >= 5 && level.rows >= 5) {
      assert.ok(
        (level.roundabouts?.length ?? 0) >= 1,
        `Level ${lvl} (${level.cols}x${level.rows}) should include a 2x2 roundabout plaza`,
      );
      const rb = level.roundabouts![0];
      assert.equal(
        resolveCarVsCircle(level.spawn.x, level.spawn.z, level.spawn.yaw, rb.x, rb.z, rb.radius),
        null,
        'Spawn must stay clear of roundabout island',
      );
      assert.equal(
        resolveCarVsCircle(level.parking.x, level.parking.z, level.parking.yaw, rb.x, rb.z, rb.radius),
        null,
        'Parking bay must stay clear of roundabout island',
      );
    }
  }
});

test('roundabout circle collision and ultrasonic sensor detect central island smoothly', () => {
  const push = resolveCarVsCircle(0, 0, 0, 0, 2.5, 1.5);
  assert.ok(push !== null, 'Detects overlap between car nose (+2.06) and roundabout island at z=2.5 (edge at 1.0)');
  assert.ok(push!.pushZ < 0, 'Pushes car cleanly away from island');

  const level = generateLabyrinthLevel(1, 'caylak');
  const rbLevel = {
    ...level,
    walls: [],
    movingGates: [],
    props: [],
    roundabouts: [{ x: 0, z: 5.06, radius: 1.5 }], // front edge at z = 3.56, car nose at 2.06 -> 1.50m
  };
  const car = createInitialCarState(rbLevel);
  car.x = 0;
  car.z = 0;
  car.yaw = 0;
  const sensors = computeUltrasonicSensors(car, rbLevel, 0);
  assert.ok(
    Math.abs(sensors.front - 1.5) < 0.08,
    `Expected front ultrasonic ~1.50m to roundabout curb, got ${sensors.front}`,
  );
});

test('detectNearestWalls finds closest labyrinth walls sorted by distance and computes bounds/bearing', () => {
  const walls = [
    { x: 0, z: 3, halfW: 5, halfD: 0.5 },    // surface at z = 2.5 -> distance 2.5
    { x: 6, z: 0, halfW: 1, halfD: 4 },     // surface at x = 5.0 -> distance 5.0
    { x: -1.5, z: 0, halfW: 0.5, halfD: 4 }, // surface at x = -1.0 -> distance 1.0 (closest)
    { x: 0, z: -25, halfW: 5, halfD: 0.5 }, // out of 10m range
  ];

  const hits = detectNearestWalls(0, 0, walls, 10, 2);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].wallIndex, 2);
  assert.equal(hits[0].distance, 1);
  assert.equal(hits[0].closestX, -1);
  assert.equal(hits[0].closestZ, 0);
  assert.equal(hits[1].wallIndex, 0);
  assert.equal(hits[1].distance, 2.5);

  const level = generateLabyrinthLevel(3, 'usta');
  const bounds = computeMiniMapBounds(level);
  assert.ok(bounds.size >= 24);
  assert.ok(level.spawn.x > bounds.minX && level.spawn.x < bounds.maxX);
  assert.ok(level.parking.z > bounds.minZ && level.parking.z < bounds.maxZ);

  const bearing = computeRelativeBayBearing(0, 0, 0, 10, 10);
  assert.ok(Math.abs(bearing.distance - Math.hypot(10, 10)) < 0.05);
  assert.ok(Math.abs(bearing.relativeAngle - Math.PI / 4) < 0.02);
});

test('all 6 obstacle map archetypes generate clear spawns, solvable layouts, and rich obstacles', () => {
  for (const arch of ARCHETYPE_ORDER) {
    const lvl = generateLabyrinthLevel(4, 'usta', arch);
    assert.equal(lvl.archetype, arch);
    assert.ok(lvl.walls.length >= 6, `${arch} should produce walls`);
    assert.ok(lvl.shortestPathCells >= 4, `${arch} should produce navigable multi-cell path`);

    // Spawn and +2.5m ahead must stay completely clear of walls
    for (const wall of lvl.walls) {
      assert.equal(
        resolveCarVsAABB(lvl.spawn.x, lvl.spawn.z, lvl.spawn.yaw, wall),
        null,
        `${arch} spawn overlaps wall`,
      );
      const aheadX = lvl.spawn.x + Math.sin(lvl.spawn.yaw) * 2.5;
      const aheadZ = lvl.spawn.z + Math.cos(lvl.spawn.yaw) * 2.5;
      assert.equal(
        resolveCarVsAABB(aheadX, aheadZ, lvl.spawn.yaw, wall),
        null,
        `${arch} spawn launch path blocked by wall`,
      );
    }

    if (arch === 'double_roundabout') {
      assert.equal(lvl.roundabouts?.length, 2, 'double_roundabout creates 2 roundabout plazas');
    }
    if (arch === 'construction_zone') {
      assert.ok(lvl.movingGates.length >= 2, 'construction_zone places multiple sliding gates');
    }
  }
});

test('labyrinth grid dimensions grow strictly across consecutive levels', () => {
  let prevArea = 0;
  for (let lvl = 1; lvl <= 10; lvl++) {
    const config = generateLabyrinthLevel(lvl, 'caylak', 'auto');
    const area = config.cols * config.rows;
    assert.ok(
      area > prevArea,
      `Level ${lvl} grid (${config.cols}x${config.rows}=${area}) must be larger than previous (${prevArea})`,
    );
    prevArea = area;
  }
});

test('car cannot escape perimeter walls even when ramming at maximum turbo speed', () => {
  const level = generateLabyrinthLevel(2, 'usta');
  const bounds = getLevelPlayableBounds(level);
  const car = createInitialCarState(level);

  // Ram directly toward West, East, North, South perimeter boundaries with turbo active
  const headings = [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5, 0.78];
  for (const yaw of headings) {
    car.x = level.spawn.x;
    car.z = level.spawn.z;
    car.yaw = yaw;
    car.speed = 24;
    car.turboEnergy = 100;
    for (let f = 0; f < 180; f++) {
      stepCarPhysics(
        car,
        { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true },
        level,
        1 / 60,
        f / 60,
      );
      assert.ok(
        car.x >= bounds.minX && car.x <= bounds.maxX && car.z >= bounds.minZ && car.z <= bounds.maxZ,
        `Car escaped playable arena bounds (${car.x.toFixed(2)}, ${car.z.toFixed(2)})`,
      );
    }
  }
});

test('boost pads and checkpoint gates award speed surge, turbo, time buffer, and combo score', () => {
  const base = generateLabyrinthLevel(3, 'caylak');
  const level = {
    ...base,
    boostPads: [
      { id: 'bp-test', x: base.spawn.x, z: base.spawn.z, yaw: base.spawn.yaw, width: 2.35, length: 3.4 },
    ],
    checkpoints: [
      { id: 'cp-test', index: 1, x: base.spawn.x + 0.5, z: base.spawn.z + 0.5, yaw: 0, width: 4.2 },
    ],
  };

  const car = createInitialCarState(level);
  car.turboEnergy = 50;
  const idle = { throttle: true, brake: false, left: false, right: false, handbrake: false };

  const res1 = stepCarPhysics(car, idle, level, 1 / 60, 0);
  assert.equal(res1.triggeredBoostPad?.id, 'bp-test');
  assert.equal(res1.passedCheckpoint?.id, 'cp-test');
  assert.ok(car.speed >= 20, `Expected speed surge on boost pad, got ${car.speed}`);
  assert.ok(car.turboEnergy >= 78, `Expected turbo refill, got ${car.turboEnergy}`);
  assert.equal(car.bonusTimeSec, 3);
  assert.equal(car.comboCount, 2);
  assert.equal(car.bonusScore, 175); // 75 from boost pad + 100*1 from checkpoint
});

test('cockpit steering wheel rotates sympathetically with steering sign and needles scale with speed & turbo', () => {
  const idle = computeCockpitTelemetryAngles({
    steerAngle: 0,
    speed: 0,
    turboActive: false,
    throttle: false,
    brake: false,
    gear: 'N',
  });
  assert.equal(idle.steeringWheelZ, 0);
  assert.equal(idle.kmh, 0);
  assert.ok(idle.speedNeedleZ < -2.3, 'Idle speed needle starts at bottom-left zero mark');

  const leftTurn = computeCockpitTelemetryAngles({
    steerAngle: 0.5,
    speed: 14,
    turboActive: false,
    throttle: true,
    brake: false,
    gear: 'D',
  });
  const rightTurn = computeCockpitTelemetryAngles({
    steerAngle: -0.5,
    speed: 14,
    turboActive: false,
    throttle: true,
    brake: false,
    gear: 'D',
  });

  // Left turn (+steerAngle) rotates steering wheel negatively around Z (top moves toward +X driver-left)
  assert.ok(leftTurn.steeringWheelZ < -2.5, `Expected strong negative wheel angle for left turn, got ${leftTurn.steeringWheelZ}`);
  assert.ok(Math.abs(leftTurn.steeringWheelZ + rightTurn.steeringWheelZ) < 1e-6, 'Left and right steering wheel lock must be symmetric');
  assert.ok(leftTurn.speedNeedleZ > idle.speedNeedleZ, 'Speedometer needle sweeps clockwise with velocity');

  const turboRun = computeCockpitTelemetryAngles({
    steerAngle: 0,
    speed: 24,
    turboActive: true,
    throttle: true,
    brake: false,
    gear: 'D',
  });
  assert.ok(turboRun.speedNeedleZ > leftTurn.speedNeedleZ);
  assert.ok(turboRun.rpmNorm > leftTurn.rpmNorm);
  assert.ok(turboRun.shiftLedCount >= 5 && turboRun.shiftLedCount <= 7);
});

test('all generated courses stay strictly single-level without overpasses or underpasses', () => {
  for (let lvl = 1; lvl <= 10; lvl++) {
    const level = generateLabyrinthLevel(lvl, 'caylak', 'auto');
    assert.equal('overpasses' in level && level.overpasses !== undefined, false, `Level ${lvl} has no overpasses`);
    assert.ok(level.walls.length > 0, `Level ${lvl} has structural flat-ground walls`);
  }
});

test('every 5th level opens an East exit expressway with final parking bay at the far end', () => {
  assert.equal(isHighwayExitLevel(4), false);
  assert.equal(isHighwayExitLevel(5), true);
  assert.equal(isHighwayExitLevel(6), false);
  assert.equal(isHighwayExitLevel(10), true);

  for (const nonExit of [1, 2, 3, 4, 6, 7]) {
    const cfg = generateLabyrinthLevel(nonExit, 'caylak', 'auto');
    assert.equal(cfg.highwayExit, undefined, `Level ${nonExit} must not have highwayExit`);
  }

  for (const exitLvl of [5, 10]) {
    const cfg = generateLabyrinthLevel(exitLvl, 'usta', 'auto');
    assert.ok(cfg.highwayExit !== undefined, `Level ${exitLvl} must have highwayExit`);
    const hw = cfg.highwayExit!;
    assert.ok(hw.endX - hw.startX >= 48, 'Exit highway spans ~50m+ straightaway');
    assert.ok(cfg.parking.x > hw.startX + 40, 'Final parking bay sits at the far end of the exit highway');
    assert.equal(cfg.parking.z, hw.exitZ);

    // Accelerate straight out of the open East exit doorway onto the highway toward final parking bay
    const car = createInitialCarState(cfg);
    car.x = hw.startX - 4.0;
    car.z = hw.exitZ;
    car.yaw = Math.PI / 2; // East +X
    car.speed = 15;

    for (let f = 0; f < 85; f++) {
      stepCarPhysics(
        car,
        { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true },
        cfg,
        1 / 60,
        f / 60,
      );
      // Car must remain bounded inside highway lane without colliding with East maze perimeter wall
      assert.ok(Math.abs(car.z - hw.exitZ) < hw.halfWidth);
      assert.ok(car.x <= hw.endX);
    }

    assert.ok(car.x > hw.startX + 20, `Car sped cleanly through exit onto highway (x=${car.x.toFixed(1)}, start=${hw.startX.toFixed(1)})`);
    assert.equal(car.collisions, 0, 'Driving straight through open highway exit causes zero collisions');
  }
});

import {
  ALL_RED_CLEARANCE_SEC,
  MAX_PENALTY_POINTS,
  evaluateTrafficLightState,
  resolveApproachingTrafficLight,
} from './trafficLights';

test('generated levels place realistic traffic lights at clear intersections and cycle N/S vs E/W deterministically', () => {
  for (let lvl = 1; lvl <= 6; lvl++) {
    const cfg = generateLabyrinthLevel(lvl, 'usta', 'auto');
    assert.ok((cfg.trafficLights?.length ?? 0) >= 1, `Level ${lvl} must include at least 1 traffic light`);
    const tl = cfg.trafficLights![0];
    assert.ok(
      Math.hypot(tl.x - cfg.spawn.x, tl.z - cfg.spawn.z) >= 4.5,
      'Traffic light stays clear of spawn',
    );
  }

  const spec = {
    id: 'tl-cycle',
    x: 0,
    z: 0,
    cellSize: 9.8,
    greenDuration: 5.0,
    yellowDuration: 2.0,
    phaseOffset: 0,
    openN: true,
    openS: true,
    openE: true,
    openW: true,
  };

  const s0 = evaluateTrafficLightState(spec, 0);
  assert.equal(s0.ns, 'green');
  assert.equal(s0.ew, 'red');

  const s1 = evaluateTrafficLightState(spec, 5.5);
  assert.equal(s1.ns, 'yellow');
  assert.equal(s1.ew, 'red');

  const s2 = evaluateTrafficLightState(spec, 7.2);
  assert.equal(s2.ns, 'red');
  assert.equal(s2.ew, 'red');

  const s3 = evaluateTrafficLightState(spec, 7.0 + ALL_RED_CLEARANCE_SEC + 0.5);
  assert.equal(s3.ns, 'red');
  assert.equal(s3.ew, 'green');
});

test('situational penalty system differentiates normal red-light vs high-speed EDS violation, yellow speeding, and green compliance bonus', () => {
  const base = generateLabyrinthLevel(1, 'caylak');
  const tl = {
    id: 'tl-test',
    x: 0,
    z: 0,
    cellSize: 10,
    greenDuration: 5.0,
    yellowDuration: 2.0,
    phaseOffset: 0, // [0, 5): NS=green, EW=red; [5, 7): NS=yellow, EW=red
    openN: true,
    openS: true,
    openE: true,
    openW: true,
  };
  const testLevel = {
    ...base,
    walls: [],
    movingGates: [],
    props: [],
    roundabouts: [],
    boostPads: [],
    checkpoints: [],
    tokens: [],
    trafficLights: [tl],
  };

  // Case 1: Slow red-light run along E/W at t=1.0 (EW is red)
  const carSlowRed = createInitialCarState(testLevel);
  carSlowRed.x = -3.8;
  carSlowRed.z = 0;
  carSlowRed.yaw = Math.PI / 2; // moving +X (EW)
  carSlowRed.speed = 6.0;
  const rSlow = stepCarPhysics(
    carSlowRed,
    { throttle: true, brake: false, left: false, right: false, handbrake: false },
    testLevel,
    0.05,
    1.0,
  );
  // Enter core manually at t=1.0
  carSlowRed.x = 0.5;
  const rSlow2 = stepCarPhysics(
    carSlowRed,
    { throttle: true, brake: false, left: false, right: false, handbrake: false },
    testLevel,
    0.05,
    1.05,
  );
  assert.equal(rSlow.triggeredPenalty, null);
  assert.equal(rSlow2.triggeredPenalty?.kind, 'red_light');
  assert.equal(carSlowRed.penaltyScore, 150);
  assert.equal(carSlowRed.penaltyTimeSec, 3);
  assert.equal(carSlowRed.penaltyPoints, 20);

  // Case 2: High-speed Turbo red-light run (EDS severe penalty)
  const carFastRed = createInitialCarState(testLevel);
  carFastRed.x = 0;
  carFastRed.z = 0;
  carFastRed.yaw = Math.PI / 2;
  carFastRed.speed = 18.0;
  const rFast = stepCarPhysics(
    carFastRed,
    { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true },
    testLevel,
    0.05,
    1.0,
  );
  assert.equal(rFast.triggeredPenalty?.kind, 'red_light_speeding');
  assert.equal(rFast.edsTriggered, true);
  assert.equal(carFastRed.penaltyScore, 320);
  assert.equal(carFastRed.penaltyTimeSec, 6);
  assert.equal(carFastRed.penaltyPoints, 35);

  // Case 3: Yellow light at controlled speed -> safe; Yellow light while speeding -> penalty
  const carYellowSafe = createInitialCarState(testLevel);
  carYellowSafe.x = 0;
  carYellowSafe.z = 0;
  carYellowSafe.yaw = 0; // NS is yellow at t=5.5
  carYellowSafe.speed = 9.0;
  const rYellowSafe = stepCarPhysics(
    carYellowSafe,
    { throttle: false, brake: false, left: false, right: false, handbrake: false },
    testLevel,
    0.05,
    5.5,
  );
  assert.equal(rYellowSafe.triggeredPenalty, null);

  const carYellowSpeed = createInitialCarState(testLevel);
  carYellowSpeed.x = 0;
  carYellowSpeed.z = 0;
  carYellowSpeed.yaw = 0;
  carYellowSpeed.speed = 17.0;
  const rYellowSpeed = stepCarPhysics(
    carYellowSpeed,
    { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true },
    testLevel,
    0.05,
    5.5,
  );
  assert.equal(rYellowSpeed.triggeredPenalty?.kind, 'yellow_speeding');
  assert.equal(carYellowSpeed.penaltyPoints, 10);

  // Case 4: Wait cleanly at red light (EW red at t=1.0), then drive through when EW turns green (t=8.5)
  const carWait = createInitialCarState(testLevel);
  carWait.x = -4.2;
  carWait.z = 0;
  carWait.yaw = Math.PI / 2;
  carWait.speed = 0;
  const approaching = resolveApproachingTrafficLight(carWait, testLevel, 1.0);
  assert.equal(approaching?.color, 'red');
  stepCarPhysics(
    carWait,
    { throttle: false, brake: false, left: false, right: false, handbrake: true },
    testLevel,
    0.05,
    1.0,
  );
  carWait.x = 0;
  carWait.speed = 8.0;
  const rBonus = stepCarPhysics(
    carWait,
    { throttle: true, brake: false, left: false, right: false, handbrake: false },
    testLevel,
    0.05,
    8.5,
  );
  assert.equal(rBonus.awardedTrafficBonus, true);
  assert.equal(carWait.bonusScore, 75);
  assert.equal(carWait.penaltyPoints, 0);

  // Case 5: Penalty deductions lower run score and prevent 3-star rating
  const penalized = calculateRunScore({
    levelNumber: 2,
    elapsedTime: 10,
    parTime: 25,
    collisions: 0,
    tierMultiplier: 1.0,
    reverseParked: false,
    penaltyScore: 320,
    violationCount: 1,
  });
  assert.ok(penalized.stars <= 2, 'Violations cap rating below 3 stars');
  assert.ok(MAX_PENALTY_POINTS === 100);
});

import { INTERIOR_WALL_TOP_Y, VEHICLE_ORDER, VEHICLE_SPECS } from './vehicles';

test('vehicle catalog preserves sport_gt and configures drift_pro, clean low-altitude hover_thruster, and 4WS+DRS apex_hyper', () => {
  assert.deepEqual(VEHICLE_ORDER, ['sport_gt', 'drift_pro', 'hover_thruster', 'apex_hyper']);
  assert.equal(VEHICLE_SPECS.sport_gt.canHover, false);
  assert.equal(VEHICLE_SPECS.drift_pro.canHover, false);
  assert.ok(
    VEHICLE_SPECS.drift_pro.turnAgilityMultiplier > VEHICLE_SPECS.sport_gt.turnAgilityMultiplier,
  );
  assert.equal(VEHICLE_SPECS.hover_thruster.canHover, true);
  assert.equal(VEHICLE_SPECS.hover_thruster.disableSmokeParticles, true);
  assert.ok(VEHICLE_SPECS.hover_thruster.maxHoverHeight > INTERIOR_WALL_TOP_Y);
  assert.ok(VEHICLE_SPECS.hover_thruster.maxHoverHeight <= 2.4);

  // 4th Special Vehicle: Apex F1 Hiper (4WS + DRS + KERS faster turbo regen)
  assert.equal(VEHICLE_SPECS.apex_hyper.canHover, false);
  assert.equal(VEHICLE_SPECS.apex_hyper.fourWheelSteer, true);
  assert.equal(VEHICLE_SPECS.apex_hyper.hasDrsWing, true);
  assert.ok((VEHICLE_SPECS.apex_hyper.turboRegenMultiplier ?? 1) > 1.3);
  assert.ok(
    VEHICLE_SPECS.apex_hyper.maxSpeedMultiplier > VEHICLE_SPECS.sport_gt.maxSpeedMultiplier,
  );
});

test('drift_pro corners sharper and earns drift mode earlier than sport_gt', () => {
  const level = generateLabyrinthLevel(2, 'caylak');
  const openLevel = { ...level, walls: [], movingGates: [], props: [], roundabouts: [], trafficLights: [] };

  const sportCar = createInitialCarState(openLevel);
  const driftCar = createInitialCarState(openLevel);
  const turnInput = {
    throttle: true,
    brake: false,
    left: true,
    right: false,
    handbrake: false,
    turbo: false,
  };

  for (let i = 0; i < 65; i++) {
    stepCarPhysics(sportCar, turnInput, openLevel, 1 / 60, i / 60, 'sport_gt');
    stepCarPhysics(driftCar, turnInput, openLevel, 1 / 60, i / 60, 'drift_pro');
  }

  const sportTurn = Math.abs(sportCar.yaw - openLevel.spawn.yaw);
  const driftTurn = Math.abs(driftCar.yaw - openLevel.spawn.yaw);
  assert.ok(
    driftTurn > sportTurn,
    `Drift Pro turn (${driftTurn.toFixed(3)}) must exceed Sport GT (${sportTurn.toFixed(3)})`,
  );
  assert.ok(driftCar.driftScore > sportCar.driftScore, 'Drift Pro accumulates higher drift score');
});

test('hover_thruster rises just enough to clear interior walls, descends safely, stays inside outer arena, and must land to park', () => {
  const base = generateLabyrinthLevel(1, 'caylak');
  // Place a concrete interior wall directly ahead of a controlled test vehicle along +Z
  const testLevel = {
    ...base,
    movingGates: [],
    props: [],
    roundabouts: [],
    trafficLights: [],
    walls: [{ x: 0, z: 5, halfW: 6, halfD: 0.45 }],
  };

  const car = createInitialCarState(testLevel);
  car.x = 0;
  car.z = 0;
  car.yaw = 0;

  // Climb with E (hover: true) for ~1.1s while stationary/accelerating slowly
  for (let i = 0; i < 65; i++) {
    stepCarPhysics(
      car,
      { throttle: false, brake: false, left: false, right: false, handbrake: false, hover: true },
      testLevel,
      1 / 60,
      i / 60,
      'hover_thruster',
    );
  }
  assert.ok(
    car.hoverY >= VEHICLE_SPECS.hover_thruster.wallClearanceHeight && car.hoverY <= 2.3,
    `Hover altitude (${car.hoverY.toFixed(2)}m) clears interior walls without extreme flight`,
  );

  // Fly straight across the interior wall at z=5 (staying inside outer bounds)
  for (let i = 0; i < 58; i++) {
    stepCarPhysics(
      car,
      { throttle: true, brake: false, left: false, right: false, handbrake: false, hover: true },
      testLevel,
      1 / 60,
      (65 + i) / 60,
      'hover_thruster',
    );
  }
  assert.ok(car.z > 6.5, `Hover car crossed over wall at z=5 cleanly (z=${car.z.toFixed(2)})`);
  assert.equal(car.collisions, 0, 'Crossing interior wall while hovering causes zero collisions');

  // Outer perimeter containment must STILL prevent flying outside the arena bounds
  const bounds = getLevelPlayableBounds(testLevel);
  for (let i = 0; i < 240; i++) {
    stepCarPhysics(
      car,
      { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true, hover: true },
      testLevel,
      1 / 60,
      i / 60,
      'hover_thruster',
    );
    assert.ok(
      car.x >= bounds.minX && car.x <= bounds.maxX && car.z >= bounds.minZ && car.z <= bounds.maxZ,
      `Airborne hover car stayed inside outer arena bounds (${car.x.toFixed(2)}, ${car.z.toFixed(2)})`,
    );
  }

  // Must touch down inside the parking bay (cannot complete parking mid-air)
  car.x = testLevel.parking.x;
  car.z = testLevel.parking.z;
  car.yaw = testLevel.parking.yaw;
  car.speed = 0;
  car.hoverY = 1.9;
  car.hoverEnergy = 100;
  for (let i = 0; i < 45; i++) {
    const res = stepCarPhysics(
      car,
      { throttle: false, brake: false, left: false, right: false, handbrake: false, hover: true },
      testLevel,
      1 / 60,
      i / 60,
      'hover_thruster',
    );
    assert.equal(res.parked, false, 'Cannot finish parking while hovering above bay');
  }

  // Release hover over bay -> touches down and completes parking
  let landedParked = false;
  for (let i = 0; i < 120; i++) {
    const res = stepCarPhysics(
      car,
      { throttle: false, brake: false, left: false, right: false, handbrake: true, hover: false },
      testLevel,
      1 / 60,
      i / 60,
      'hover_thruster',
    );
    if (res.parked) {
      landedParked = true;
      break;
    }
  }
  assert.equal(landedParked, true, 'Touching down on parking bay completes park cleanly');
});

import {
  EXTERIOR_BASE_GROUND_Y,
  distanceToPlayableZones,
  generateExteriorSceneryPlan,
  getExteriorGroundY,
} from './exteriorScenery';

test('exterior forest scenery populates rich multi-layer landscape outside playable arena and exit highway without intrusion', () => {
  for (const lvl of [1, 3, 5, 10]) {
    const level = generateLabyrinthLevel(lvl, 'usta', 'auto');
    const plan = generateExteriorSceneryPlan(level);

    assert.ok(plan.pineTrees.length >= 120, `Level ${lvl} should have dense conifer forests (got ${plan.pineTrees.length})`);
    assert.ok(plan.broadleafTrees.length >= 80, `Level ${lvl} should have colorful broadleaf forests (got ${plan.broadleafTrees.length})`);
    assert.ok(plan.shrubs.length >= 60, `Level ${lvl} should have flowering shrubs`);
    assert.ok(plan.wildflowers.length >= 80, `Level ${lvl} should have wildflower patches`);
    assert.ok(plan.rocks.length >= 40, `Level ${lvl} should have boulder clusters`);
    assert.ok(plan.hills.length >= 16, `Level ${lvl} should have rolling exterior hills`);
    assert.ok(plan.cabins.length >= 2, `Level ${lvl} should place timber forest cabins/watchtowers`);
    assert.ok(plan.trailPosts.length >= 10, `Level ${lvl} should ring perimeter with lantern posts`);
    assert.ok(plan.pond !== null, `Level ${lvl} should feature a scenic exterior pond`);

    // Every single tree, shrub, rock, cabin, post, firefly, and pond center must stay strictly clear of playable zones
    for (const p of plan.pineTrees) {
      assert.ok(
        distanceToPlayableZones(p.x, p.z, level) >= 1.5 + p.scale * 1.65,
        `Level ${lvl} pine tree (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) clipped playable perimeter`,
      );
      const gy = getExteriorGroundY(p.x, p.z, plan.hills);
      assert.ok(gy >= EXTERIOR_BASE_GROUND_Y);
    }
    for (const b of plan.broadleafTrees) {
      assert.ok(
        distanceToPlayableZones(b.x, b.z, level) >= 1.5 + b.scale * 1.85,
        `Level ${lvl} broadleaf tree (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) clipped playable perimeter`,
      );
    }
    for (const c of plan.cabins) {
      assert.ok(
        distanceToPlayableZones(c.x, c.z, level) >= 8.0,
        `Level ${lvl} cabin (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) stayed clear of playable area`,
      );
    }
    if (plan.pond) {
      assert.ok(
        distanceToPlayableZones(plan.pond.x, plan.pond.z, level) >= 9.0,
        `Level ${lvl} pond stayed clear of playable area & highway exit`,
      );
    }
    for (const h of plan.hills) {
      assert.ok(
        distanceToPlayableZones(h.x, h.z, level) >= h.radius + 3.5,
        `Level ${lvl} hill stayed clear of playable area`,
      );
      // Verify getExteriorGroundY rises smoothly at hill center
      const peakY = getExteriorGroundY(h.x, h.z, plan.hills);
      assert.ok(peakY >= EXTERIOR_BASE_GROUND_Y + h.height - 0.01);
    }
  }
});

test('apex_hyper delivers sharper 4WS turning, higher top speed, and faster KERS turbo regeneration than sport_gt', () => {
  const level = generateLabyrinthLevel(1, 'caylak');
  const openLevel = { ...level, walls: [], movingGates: [], props: [], roundabouts: [], trafficLights: [] };

  const sportCar = createInitialCarState(openLevel);
  const apexCar = createInitialCarState(openLevel);

  // Accelerate straight + turn left to test top speed & 4WS agility
  const turnInput = {
    throttle: true,
    brake: false,
    left: true,
    right: false,
    handbrake: false,
    turbo: false,
  };
  for (let i = 0; i < 70; i++) {
    stepCarPhysics(sportCar, turnInput, openLevel, 1 / 60, i / 60, 'sport_gt');
    stepCarPhysics(apexCar, turnInput, openLevel, 1 / 60, i / 60, 'apex_hyper');
  }

  const sportTurn = Math.abs(sportCar.yaw - openLevel.spawn.yaw);
  const apexTurn = Math.abs(apexCar.yaw - openLevel.spawn.yaw);
  assert.ok(
    apexTurn > sportTurn,
    `Apex 4WS turn (${apexTurn.toFixed(3)}) must exceed Sport GT (${sportTurn.toFixed(3)})`,
  );

  // Test KERS faster turbo energy regeneration after draining turbo
  sportCar.turboEnergy = 20;
  apexCar.turboEnergy = 20;
  const coastInput = { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: false };
  for (let i = 0; i < 120; i++) {
    stepCarPhysics(sportCar, coastInput, openLevel, 1 / 60, i / 60, 'sport_gt');
    stepCarPhysics(apexCar, coastInput, openLevel, 1 / 60, i / 60, 'apex_hyper');
  }
  assert.ok(
    apexCar.turboEnergy > sportCar.turboEnergy + 3.5,
    `Apex KERS regen (${apexCar.turboEnergy.toFixed(1)}) must substantially outpace Sport GT (${sportCar.turboEnergy.toFixed(1)})`,
  );
});

test('grand_prix_arena special track supports all 4 vehicles cleanly with rich features and clear exterior scenery', () => {
  for (const lvl of [1, 5]) {
    const track = generateLabyrinthLevel(lvl, 'usta', 'grand_prix_arena');
    assert.equal(track.archetype, 'grand_prix_arena');
    assert.equal(track.cols, 7);
    assert.equal(track.rows, 6);
    assert.equal(track.highwayExit, undefined);
    assert.ok(track.shortestPathCells >= 12, `Special track BFS path should be substantial (got ${track.shortestPathCells})`);
    assert.equal((track.roundabouts ?? []).length, 2, 'Special track must feature twin drift roundabouts');
    assert.ok((track.boostPads ?? []).length >= 2, 'Special track must include pit straightaway boost pads');
    assert.ok(track.movingGates.length >= 2, 'Special track must include moving chicane gates');
    assert.ok((track.trafficLights ?? []).length >= 1, 'Special track must include a signalized central intersection');
    assert.ok((track.checkpoints ?? []).length >= 3, 'Special track must include 3 sector checkpoint arches');
    assert.ok((track.tokens ?? []).length >= 4, 'Special track must include bonus time crystals');

    // Verify unobstructed spawn & initial forward launch path for all 4 cars
    for (const vehicleId of VEHICLE_ORDER) {
      const car = createInitialCarState(track);
      const startRes = stepCarPhysics(
        car,
        { throttle: false, brake: false, left: false, right: false, handbrake: false },
        track,
        1 / 60,
        0,
        vehicleId,
      );
      assert.equal(startRes.collided, false, `${vehicleId} must not overlap any wall at Special Track spawn`);

      // Launch forward 1.2s along Pit Straightaway without hitting walls
      for (let i = 0; i < 72; i++) {
        stepCarPhysics(
          car,
          { throttle: true, brake: false, left: false, right: false, handbrake: false, turbo: true },
          track,
          1 / 60,
          i / 60,
          vehicleId,
        );
      }
      assert.equal(car.collisions, 0, `${vehicleId} Pit Straightaway launch must remain collision-free`);
    }

    // Verify exterior forest builds cleanly outside the special arena without overlap
    const plan = generateExteriorSceneryPlan(track);
    assert.ok(plan.pineTrees.length >= 120);
    assert.ok(plan.broadleafTrees.length >= 80);
    for (const p of plan.pineTrees) {
      assert.ok(distanceToPlayableZones(p.x, p.z, track) >= 1.5 + p.scale * 1.65);
    }
  }
});






