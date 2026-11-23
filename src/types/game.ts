export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type OverlayScreen =
  | 'none'
  | 'garage'
  | 'leaderboard'
  | 'achievements'
  | 'realworld';

export type CameraMode = 'chase' | 'cockpit' | 'top' | 'hood';

export type ArenaTheme = 'night' | 'sunset' | 'twilight';

export type DifficultyTier = 'caylak' | 'usta' | 'profesyonel' | 'efsane';

export type DifficultyPreference = 'dynamic' | DifficultyTier;

export type CourseArchetype =
  | 'classic_maze'
  | 'slalom_chicane'
  | 'double_roundabout'
  | 'construction_zone'
  | 'twin_avenue'
  | 'spiral_citadel'
  | 'grand_prix_arena';

export type MapDesignPreference = 'auto' | CourseArchetype;

export type PaintFinishId =
  | 'crimson'
  | 'alpine'
  | 'cobalt'
  | 'obsidian'
  | 'amber'
  | 'emerald';

export type RimStyleId = 'sport5' | 'turbine' | 'forgedGold' | 'deepDish';

export type SpoilerStyleId = 'none' | 'lip' | 'gtWing';

export type UnderglowColorId = 'off' | 'cyan' | 'amber' | 'magenta' | 'emerald';

export type VehicleModelId = 'sport_gt' | 'drift_pro' | 'hover_thruster' | 'apex_hyper';

export type DecalStyleId = 'none' | 'dualStripe' | 'sideNumber';

export interface VehicleCustomization {
  model?: VehicleModelId;
  paint: PaintFinishId;
  rim: RimStyleId;
  spoiler: SpoilerStyleId;
  underglow: UnderglowColorId;
  decal: DecalStyleId;
}

export interface DynamicDifficultyState {
  preference: DifficultyPreference;
  skillRating: number; // 0..100
  activeTier: DifficultyTier;
  consecutiveCleanRuns: number;
  recentFailures: number;
  lastShift: 'up' | 'down' | 'steady';
}

export interface AABB {
  x: number; // center x
  z: number; // center z
  halfW: number;
  halfD: number;
}

export interface MovingGate {
  id: string;
  baseX: number;
  baseZ: number;
  axis: 'x' | 'z';
  amplitude: number;
  speed: number;
  phase: number;
  halfW: number;
  halfD: number;
}

export interface PropObstacle {
  x: number;
  z: number;
  radius: number;
  kind: 'cone' | 'bollard' | 'barricade' | 'tire_stack';
  yaw?: number;
}

export interface BonusToken {
  id: string;
  x: number;
  z: number;
  kind: 'star' | 'time';
}

export interface BoostPad {
  id: string;
  x: number;
  z: number;
  yaw: number;
  width: number;
  length: number;
}

export interface CheckpointGate {
  id: string;
  index: number;
  x: number;
  z: number;
  yaw: number;
  width: number;
}

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ParkingZone {
  x: number;
  z: number;
  yaw: number; // target orientation in radians
  width: number;
  length: number;
}

export interface RealWorldStreetMeta {
  streetName: string;
  cityLabel: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  distanceMeters: number;
  pathPoints: number;
}

export type RoadTileKind =
  | 'straightX'
  | 'straightZ'
  | 'corner'
  | 'tJunction'
  | 'cross'
  | 'deadend'
  | 'plaza';

export interface RoadTile {
  x: number;
  z: number;
  openN: boolean;
  openS: boolean;
  openE: boolean;
  openW: boolean;
  kind: RoadTileKind;
}

export interface RoundaboutIsland {
  x: number;
  z: number;
  radius: number;
}

export interface HighwayExitSpec {
  exitZ: number;
  halfWidth: number;
  startX: number;
  endX: number;
  length: number;
}

export type TrafficSignalColor = 'green' | 'yellow' | 'red';

export type TrafficPenaltyKind =
  | 'red_light'
  | 'red_light_speeding'
  | 'yellow_speeding'
  | 'minor_scrape'
  | 'heavy_crash';

export type TrafficPenaltySeverity = 'light' | 'medium' | 'severe';

export interface TrafficLightSpec {
  id: string;
  x: number;
  z: number;
  cellSize: number;
  greenDuration: number;
  yellowDuration: number;
  phaseOffset: number;
  openN: boolean;
  openS: boolean;
  openE: boolean;
  openW: boolean;
}

export interface TrafficLightPhaseState {
  ns: TrafficSignalColor;
  ew: TrafficSignalColor;
  nsRemaining: number;
  ewRemaining: number;
}

export interface TrafficPenaltyRecord {
  id: string;
  kind: TrafficPenaltyKind;
  severity: TrafficPenaltySeverity;
  title: string;
  detail: string;
  scoreDelta: number;
  timePenaltySec: number;
  penaltyPoints: number;
  timestamp: number;
}

export interface TrafficAlertBanner {
  id: string;
  isBonus: boolean;
  severity: TrafficPenaltySeverity | 'bonus';
  title: string;
  detail: string;
  scoreDelta: number;
  timePenaltySec: number;
  penaltyPoints: number;
  edsFlash?: boolean;
  remainingSec: number;
}

export interface ApproachingTrafficLightState {
  id: string;
  color: TrafficSignalColor;
  remainingSec: number;
  distanceMeters: number;
  axis: 'ns' | 'ew';
}

export interface LevelConfig {
  levelNumber: number;
  archetype?: CourseArchetype;
  cols: number;
  rows: number;
  cellSize: number;
  tier: DifficultyTier;
  tierMultiplier: number;
  parTime: number;
  timeLimit: number;
  maxCollisions: number;
  arenaBounds?: ArenaBounds;
  spawn: {
    x: number;
    z: number;
    yaw: number;
  };
  parking: ParkingZone;
  walls: AABB[];
  movingGates: MovingGate[];
  props: PropObstacle[];
  tokens?: BonusToken[];
  boostPads?: BoostPad[];
  checkpoints?: CheckpointGate[];
  roadTiles?: RoadTile[];
  roundabouts?: RoundaboutIsland[];
  highwayExit?: HighwayExitSpec;
  trafficLights?: TrafficLightSpec[];
  shortestPathCells: number;
  realWorld?: RealWorldStreetMeta;
}

export interface UltrasonicSensors {
  front: number;
  rear: number;
  left: number;
  right: number;
  minDistance: number;
}

export interface NearestWallHit {
  wallIndex: number;
  distance: number;
  closestX: number;
  closestZ: number;
  box: AABB;
}

export interface PlayerPose {
  x: number;
  z: number;
  yaw: number;
}

export interface TrafficIntersectionTracker {
  wasInZone: boolean;
  waitedAtRed: boolean;
  resolvedAtTime: number;
}

export interface CarState {
  x: number;
  z: number;
  yaw: number;
  speed: number; // forward m/s (negative = reverse)
  steerAngle: number; // current front wheel steer radians
  wheelSpin: number;
  turboEnergy: number; // 0..100
  turboActive: boolean;
  boostPadTimer: number;
  triggeredBoostPadIds: string[];
  passedCheckpointIds: string[];
  comboCount: number;
  driftScore: number;
  isDrifting: boolean;
  collectedTokenIds: string[];
  bonusScore: number;
  bonusTimeSec: number;
  collisions: number;
  damageFlash: number;
  invulnTimer: number;
  parkProgress: number; // 0..1 hold progress inside parking zone
  parkQuality: number; // 0..1 alignment quality
  distanceToBay: number;
  reverseUsed: boolean;
  penaltyScore: number;
  penaltyTimeSec: number;
  penaltyPoints: number;
  violationCount: number;
  penalties: TrafficPenaltyRecord[];
  trafficTrackers: Record<string, TrafficIntersectionTracker>;
  activeTrafficAlert: TrafficAlertBanner | null;
  edsFlashTimer: number;
  hoverY: number; // elevation above asphalt (0..2.25m)
  hoverVy: number;
  hoverActive: boolean;
  hoverEnergy: number; // 0..100 thruster charge
}

export interface RunResult {
  victory: boolean;
  reason: 'parked' | 'wrecked' | 'timeout' | 'penalty_limit';
  levelNumber: number;
  tier: DifficultyTier;
  elapsedTime: number;
  parTime: number;
  collisions: number;
  stars: number; // 0..3
  score: number;
  reverseParked: boolean;
  difficultyShift: 'up' | 'down' | 'steady';
  newTier: DifficultyTier;
  newlyUnlockedAchievements: string[];
  isRealWorld?: boolean;
  realWorldStreetName?: string;
  tokensCollected?: number;
  totalTokens?: number;
  bonusScore?: number;
  penaltyScore?: number;
  penaltyTimeSec?: number;
  penaltyPoints?: number;
  violationCount?: number;
  penalties?: TrafficPenaltyRecord[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon:
    | 'trophy'
    | 'shield'
    | 'zap'
    | 'compass'
    | 'reverse'
    | 'palette'
    | 'flame'
    | 'star'
    | 'target'
    | 'crown'
    | 'globe';
  points: number;
}

export interface PlayerProgress {
  playerName: string;
  highestLevel: number;
  totalScore: number;
  totalParks: number;
  cleanParks: number;
  reverseParks: number;
  realWorldParks: number;
  unlockedAchievements: string[];
  levelBestScores: Record<number, number>;
  levelBestTimes: Record<number, number>;
  customizationCount: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  bestTime: number;
  levelReached: number;
  tier: DifficultyTier;
  isPlayer: boolean;
}
