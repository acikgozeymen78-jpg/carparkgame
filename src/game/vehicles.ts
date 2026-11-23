import type { VehicleModelId } from '../types/game';

export interface VehicleSpec {
  id: VehicleModelId;
  name: string;
  shortName: string;
  tagline: string;
  badge: string;
  accelMultiplier: number;
  maxSpeedMultiplier: number;
  turnAgilityMultiplier: number;
  maxSteerBonus: number;
  driftThresholdSpeed: number;
  driftScoreMultiplier: number;
  canHover: boolean;
  maxHoverHeight: number;
  wallClearanceHeight: number;
  disableSmokeParticles: boolean;
  fourWheelSteer?: boolean;
  hasDrsWing?: boolean;
  turboRegenMultiplier?: number;
  stats: {
    speed: number; // 1..5
    handling: number; // 1..5
    drift: number; // 1..5
  };
}

export const INTERIOR_WALL_TOP_Y = 1.67;

export const VEHICLE_SPECS: Record<VehicleModelId, VehicleSpec> = {
  sport_gt: {
    id: 'sport_gt',
    name: 'Klasik Spor GT',
    shortName: 'Spor GT',
    tagline: 'Dengeli yol tutuş, keskin direksiyon ve klasik park performansı.',
    badge: 'DENGELİ',
    accelMultiplier: 1.0,
    maxSpeedMultiplier: 1.0,
    turnAgilityMultiplier: 1.0,
    maxSteerBonus: 0,
    driftThresholdSpeed: 11.8,
    driftScoreMultiplier: 1.0,
    canHover: false,
    maxHoverHeight: 0,
    wallClearanceHeight: 0,
    disableSmokeParticles: false,
    stats: {
      speed: 4,
      handling: 4,
      drift: 3,
    },
  },
  drift_pro: {
    id: 'drift_pro',
    name: 'Pro Drift Makinesi',
    shortName: 'Drift Pro',
    tagline: 'Geniş bodykit, yüksek dönüş açısı ve kesintisiz yanlama hakimiyeti.',
    badge: 'DRİFT',
    accelMultiplier: 1.06,
    maxSpeedMultiplier: 1.02,
    turnAgilityMultiplier: 1.24,
    maxSteerBonus: 0.1,
    driftThresholdSpeed: 5.2,
    driftScoreMultiplier: 1.45,
    canHover: false,
    maxHoverHeight: 0,
    wallClearanceHeight: 0,
    disableSmokeParticles: false,
    stats: {
      speed: 4,
      handling: 5,
      drift: 5,
    },
  },
  hover_thruster: {
    id: 'hover_thruster',
    name: 'Tesla Hover Roadster',
    shortName: 'Tesla Hover',
    tagline: 'Alttan roket itici ile duvarları aşacak kadar alçak irtifa uçuşu [E].',
    badge: 'ROKET İTİCİ',
    accelMultiplier: 1.1,
    maxSpeedMultiplier: 1.06,
    turnAgilityMultiplier: 1.08,
    maxSteerBonus: 0.04,
    driftThresholdSpeed: 12.2,
    driftScoreMultiplier: 1.0,
    canHover: true,
    maxHoverHeight: 2.25,
    wallClearanceHeight: 1.72,
    disableSmokeParticles: true,
    stats: {
      speed: 5,
      handling: 4,
      drift: 3,
    },
  },
  apex_hyper: {
    id: 'apex_hyper',
    name: 'Apex F1 Hiper',
    shortName: 'Apex F1',
    tagline: '4 tekerlekten aktif yönlendirme (4WS), hareketli DRS kanadı ve hızlı KERS turbo.',
    badge: '4WS + DRS',
    accelMultiplier: 1.18,
    maxSpeedMultiplier: 1.14,
    turnAgilityMultiplier: 1.22,
    maxSteerBonus: 0.08,
    driftThresholdSpeed: 10.6,
    driftScoreMultiplier: 1.15,
    canHover: false,
    maxHoverHeight: 0,
    wallClearanceHeight: 0,
    disableSmokeParticles: false,
    fourWheelSteer: true,
    hasDrsWing: true,
    turboRegenMultiplier: 1.55,
    stats: {
      speed: 5,
      handling: 5,
      drift: 4,
    },
  },
};

export const VEHICLE_ORDER: VehicleModelId[] = [
  'sport_gt',
  'drift_pro',
  'hover_thruster',
  'apex_hyper',
];

export function resolveVehicleModel(model?: VehicleModelId): VehicleModelId {
  if (model && model in VEHICLE_SPECS) return model;
  return 'sport_gt';
}
