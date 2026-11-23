import type {
  ApproachingTrafficLightState,
  CarState,
  LevelConfig,
  TrafficAlertBanner,
  TrafficLightPhaseState,
  TrafficLightSpec,
  TrafficPenaltyRecord,
} from '../types/game';

export const MAX_PENALTY_POINTS = 100;
export const ALL_RED_CLEARANCE_SEC = 0.8;

/**
 * Computes live North-South vs East-West signal phase and remaining countdown
 * seconds using deterministic cycle timing + per-intersection phaseOffset.
 */
export function evaluateTrafficLightState(
  light: TrafficLightSpec,
  elapsedTime: number,
): TrafficLightPhaseState {
  const green = Math.max(2.5, light.greenDuration);
  const yellow = Math.max(1.2, light.yellowDuration);
  const allRed = ALL_RED_CLEARANCE_SEC;
  const halfCycle = green + yellow + allRed;
  const fullCycle = halfCycle * 2;

  const raw = (elapsedTime + light.phaseOffset) % fullCycle;
  const t = raw < 0 ? raw + fullCycle : raw;

  // Phase 1: NS Green, EW Red
  if (t < green) {
    return {
      ns: 'green',
      ew: 'red',
      nsRemaining: Number((green - t).toFixed(1)),
      ewRemaining: Number((halfCycle - t).toFixed(1)),
    };
  }
  // Phase 2: NS Yellow, EW Red
  if (t < green + yellow) {
    return {
      ns: 'yellow',
      ew: 'red',
      nsRemaining: Number((green + yellow - t).toFixed(1)),
      ewRemaining: Number((halfCycle - t).toFixed(1)),
    };
  }
  // Phase 3: All-Red clearance before EW turns Green
  if (t < halfCycle) {
    return {
      ns: 'red',
      ew: 'red',
      nsRemaining: Number((fullCycle - t).toFixed(1)),
      ewRemaining: Number((halfCycle - t).toFixed(1)),
    };
  }

  const t2 = t - halfCycle;
  // Phase 4: EW Green, NS Red
  if (t2 < green) {
    return {
      ns: 'red',
      ew: 'green',
      nsRemaining: Number((halfCycle - t2).toFixed(1)),
      ewRemaining: Number((green - t2).toFixed(1)),
    };
  }
  // Phase 5: EW Yellow, NS Red
  if (t2 < green + yellow) {
    return {
      ns: 'red',
      ew: 'yellow',
      nsRemaining: Number((halfCycle - t2).toFixed(1)),
      ewRemaining: Number((green + yellow - t2).toFixed(1)),
    };
  }
  // Phase 6: All-Red clearance before NS turns Green
  return {
    ns: 'red',
    ew: 'red',
    nsRemaining: Number((halfCycle - t2).toFixed(1)),
    ewRemaining: Number((fullCycle - t2).toFixed(1)),
  };
}

/**
 * Returns the closest traffic light ahead of/near the car for live HUD display.
 */
export function resolveApproachingTrafficLight(
  car: Pick<CarState, 'x' | 'z' | 'yaw'>,
  level: Pick<LevelConfig, 'trafficLights'>,
  elapsedTime: number,
): ApproachingTrafficLightState | null {
  const lights = level.trafficLights ?? [];
  if (lights.length === 0) return null;

  const sinY = Math.sin(car.yaw);
  const cosY = Math.cos(car.yaw);

  let best: ApproachingTrafficLightState | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < lights.length; i++) {
    const tl = lights[i];
    const dx = tl.x - car.x;
    const dz = tl.z - car.z;
    const dist = Math.hypot(dx, dz);
    const maxApproach = tl.cellSize * 1.15;
    if (dist > maxApproach) continue;

    // Prefer signals in front of the car or immediately occupied
    const forwardDot = dist > 0.3 ? (dx * sinY + dz * cosY) / dist : 1;
    if (dist > 3.2 && forwardDot < -0.15) continue;

    const score = dist - forwardDot * 1.8;
    if (score < bestScore) {
      bestScore = score;
      const axis: 'ns' | 'ew' =
        dist > 2.2
          ? Math.abs(dz) >= Math.abs(dx)
            ? 'ns'
            : 'ew'
          : Math.abs(cosY) >= Math.abs(sinY)
            ? 'ns'
            : 'ew';
      const state = evaluateTrafficLightState(tl, elapsedTime);
      best = {
        id: tl.id,
        color: axis === 'ns' ? state.ns : state.ew,
        remainingSec: axis === 'ns' ? state.nsRemaining : state.ewRemaining,
        distanceMeters: Math.max(0, Math.round(dist)),
        axis,
      };
    }
  }

  return best;
}

export interface TrafficStepOutcome {
  triggeredPenalty: TrafficPenaltyRecord | null;
  awardedComplianceBonus: boolean;
  edsTriggered: boolean;
}

function recordPenalty(
  car: CarState,
  penalty: TrafficPenaltyRecord,
  edsFlash: boolean,
): void {
  car.penalties.push(penalty);
  car.penaltyScore += penalty.scoreDelta;
  car.penaltyTimeSec += penalty.timePenaltySec;
  car.penaltyPoints = Math.min(MAX_PENALTY_POINTS, car.penaltyPoints + penalty.penaltyPoints);
  car.violationCount += 1;
  car.comboCount = 1;
  if (edsFlash) {
    car.edsFlashTimer = 0.65;
  }
  car.activeTrafficAlert = {
    id: penalty.id,
    isBonus: false,
    severity: penalty.severity,
    title: penalty.title,
    detail: penalty.detail,
    scoreDelta: penalty.scoreDelta,
    timePenaltySec: penalty.timePenaltySec,
    penaltyPoints: penalty.penaltyPoints,
    edsFlash,
    remainingSec: 3.2,
  };
}

/**
 * Evaluates situational traffic light violations and red-light wait compliance bonuses.
 */
export function evaluateTrafficLightInteractions(
  car: CarState,
  level: Pick<LevelConfig, 'trafficLights'>,
  elapsedTime: number,
  dt: number,
): TrafficStepOutcome {
  if (car.edsFlashTimer > 0) {
    car.edsFlashTimer = Math.max(0, car.edsFlashTimer - dt);
  }
  if (car.activeTrafficAlert) {
    const nextRem = car.activeTrafficAlert.remainingSec - dt;
    if (nextRem <= 0) {
      car.activeTrafficAlert = null;
    } else {
      car.activeTrafficAlert = {
        ...car.activeTrafficAlert,
        remainingSec: nextRem,
      };
    }
  }

  const lights = level.trafficLights ?? [];
  let triggeredPenalty: TrafficPenaltyRecord | null = null;
  let awardedComplianceBonus = false;
  let edsTriggered = false;

  const speedAbs = Math.abs(car.speed);
  const vx = Math.sin(car.yaw) * car.speed;
  const vz = Math.cos(car.yaw) * car.speed;

  for (let i = 0; i < lights.length; i++) {
    const tl = lights[i];
    let tracker = car.trafficTrackers[tl.id];
    if (!tracker) {
      tracker = { wasInZone: false, waitedAtRed: false, resolvedAtTime: -10 };
      car.trafficTrackers[tl.id] = tracker;
    }

    const dx = car.x - tl.x;
    const dz = car.z - tl.z;
    const dist = Math.hypot(dx, dz);
    const coreHalf = Math.min(2.65, tl.cellSize * 0.27);
    const inCore = Math.abs(dx) <= coreHalf && Math.abs(dz) <= coreHalf;

    // Detect clean stop-line waiting while facing a red signal
    if (!inCore && dist <= tl.cellSize * 0.68 && dist >= coreHalf * 0.9 && speedAbs < 0.85) {
      const waitAxis: 'ns' | 'ew' = Math.abs(dz) >= Math.abs(dx) ? 'ns' : 'ew';
      const st = evaluateTrafficLightState(tl, elapsedTime);
      const sig = waitAxis === 'ns' ? st.ns : st.ew;
      if (sig === 'red') {
        tracker.waitedAtRed = true;
      }
    }

    if (inCore && !tracker.wasInZone) {
      tracker.wasInZone = true;

      // Prevent duplicate triggers from brief border oscillations
      if (elapsedTime - tracker.resolvedAtTime < 3.2) continue;

      // Determine travel axis along intersection
      const axis: 'ns' | 'ew' =
        Math.abs(vx) > Math.abs(vz)
          ? 'ew'
          : Math.abs(vz) > Math.abs(vx)
            ? 'ns'
            : Math.abs(dx) > Math.abs(dz)
              ? 'ew'
              : 'ns';

      const state = evaluateTrafficLightState(tl, elapsedTime);
      const signal = axis === 'ns' ? state.ns : state.ew;

      // Only enforce signal rules while moving forward or rapidly traversing
      const activeMotion = car.speed > 0.65 || speedAbs > 3.5;
      if (!activeMotion) continue;

      if (signal === 'red') {
        tracker.resolvedAtTime = elapsedTime;
        tracker.waitedAtRed = false;
        const isHighSpeed = speedAbs >= 14.0 || car.turboActive;
        const penalty: TrafficPenaltyRecord = isHighSpeed
          ? {
              id: `pen-${tl.id}-${car.penalties.length}`,
              kind: 'red_light_speeding',
              severity: 'severe',
              title: 'EDS Ağır İhlal: Kırmızı + Hız',
              detail: `${Math.round(speedAbs * 3.6)} km/s ile kırmızı ışık ihlali tespit edildi`,
              scoreDelta: 320,
              timePenaltySec: 6,
              penaltyPoints: 35,
              timestamp: elapsedTime,
            }
          : {
              id: `pen-${tl.id}-${car.penalties.length}`,
              kind: 'red_light',
              severity: 'medium',
              title: 'Kırmızı Işık İhlali',
              detail: 'Dur çizgisi geçildi (-150 puan · +3sn)',
              scoreDelta: 150,
              timePenaltySec: 3,
              penaltyPoints: 20,
              timestamp: elapsedTime,
            };
        recordPenalty(car, penalty, isHighSpeed);
        triggeredPenalty = penalty;
        if (isHighSpeed) edsTriggered = true;
      } else if (signal === 'yellow') {
        if (speedAbs >= 15.5 || car.turboActive) {
          tracker.resolvedAtTime = elapsedTime;
          tracker.waitedAtRed = false;
          const penalty: TrafficPenaltyRecord = {
            id: `pen-${tl.id}-${car.penalties.length}`,
            kind: 'yellow_speeding',
            severity: 'light',
            title: 'Sarı Işıkta Aşırı Hız',
            detail: 'Kavşağa kontrolsüz hızla girildi (-90 puan · +2sn)',
            scoreDelta: 90,
            timePenaltySec: 2,
            penaltyPoints: 10,
            timestamp: elapsedTime,
          };
          recordPenalty(car, penalty, false);
          triggeredPenalty = penalty;
        }
      } else if (signal === 'green') {
        tracker.resolvedAtTime = elapsedTime;
        if (tracker.waitedAtRed) {
          tracker.waitedAtRed = false;
          car.bonusScore += 75;
          awardedComplianceBonus = true;
          const bonusBanner: TrafficAlertBanner = {
            id: `bonus-${tl.id}-${Math.round(elapsedTime * 10)}`,
            isBonus: true,
            severity: 'bonus',
            title: 'Kurala Saygı Bonusu',
            detail: 'Kırmızıda bekleyip yeşilde geçildi (+75 puan)',
            scoreDelta: 75,
            timePenaltySec: 0,
            penaltyPoints: 0,
            remainingSec: 2.6,
          };
          car.activeTrafficAlert = bonusBanner;
        }
      }
    } else if (!inCore && (Math.abs(dx) > coreHalf + 1.0 || Math.abs(dz) > coreHalf + 1.0)) {
      tracker.wasInZone = false;
    }
  }

  return { triggeredPenalty, awardedComplianceBonus, edsTriggered };
}

/**
 * Applies situational collision penalties scaled by impact severity.
 */
export function applyCollisionPenalty(
  car: CarState,
  impactIntensity: number,
  elapsedTime: number,
): TrafficPenaltyRecord {
  const isHeavy = impactIntensity >= 0.48;
  const penalty: TrafficPenaltyRecord = isHeavy
    ? {
        id: `pen-crash-${car.penalties.length}`,
        kind: 'heavy_crash',
        severity: 'severe',
        title: 'Şiddetli Çarpışma Cezası',
        detail: 'Yüksek darbeli kaza (-150 puan · +2sn)',
        scoreDelta: 150,
        timePenaltySec: 2,
        penaltyPoints: 20,
        timestamp: elapsedTime,
      }
    : {
        id: `pen-scrape-${car.penalties.length}`,
        kind: 'minor_scrape',
        severity: 'light',
        title: 'Hafif Sürtme Cezası',
        detail: 'Bariyer teması tespit edildi (-60 puan)',
        scoreDelta: 60,
        timePenaltySec: 0,
        penaltyPoints: 10,
        timestamp: elapsedTime,
      };
  recordPenalty(car, penalty, false);
  return penalty;
}
