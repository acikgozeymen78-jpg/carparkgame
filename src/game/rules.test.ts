import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialDifficultyState,
  generateLabyrinthLevel,
  resolveActiveTier,
  updateDynamicDifficulty,
} from './difficulty';
import {
  createInitialCarState,
  evaluateParkingAlignment,
  resolveCarVsAABB,
  stepCarPhysics,
} from './physics';
import { calculateRunScore, evaluateRunAchievements } from './achievements';
import { buildGlobalLeaderboard, buildLevelLeaderboard } from './leaderboard';
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
  };

  const unlocked = evaluateRunAchievements(progress, run);
  assert.ok(unlocked.includes('first_park'));
  assert.ok(unlocked.includes('zero_scratch'));
  assert.ok(unlocked.includes('speed_demon'));
  assert.ok(unlocked.includes('reverse_legend'));
  assert.ok(unlocked.includes('pro_tier'));

  const globalBoard = buildGlobalLeaderboard(progress, 'profesyonel');
  assert.ok(globalBoard.some((e) => e.isPlayer && e.name === 'Test Pilot'));
  const levelBoard = buildLevelLeaderboard(3, progress, 'profesyonel');
  assert.ok(levelBoard.some((e) => e.isPlayer));
});
