export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type OverlayScreen = 'none' | 'garage' | 'leaderboard' | 'achievements';

export type CameraMode = 'chase' | 'top' | 'hood';

export type DifficultyTier = 'caylak' | 'usta' | 'profesyonel' | 'efsane';

export type DifficultyPreference = 'dynamic' | DifficultyTier;

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

export type DecalStyleId = 'none' | 'dualStripe' | 'sideNumber';

export interface VehicleCustomization {
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
  kind: 'cone' | 'bollard';
}

export interface ParkingZone {
  x: number;
  z: number;
  yaw: number; // target orientation in radians
  width: number;
  length: number;
}

export interface LevelConfig {
  levelNumber: number;
  cols: number;
  rows: number;
  cellSize: number;
  tier: DifficultyTier;
  tierMultiplier: number;
  parTime: number;
  timeLimit: number;
  maxCollisions: number;
  spawn: {
    x: number;
    z: number;
    yaw: number;
  };
  parking: ParkingZone;
  walls: AABB[];
  movingGates: MovingGate[];
  props: PropObstacle[];
  shortestPathCells: number;
}

export interface CarState {
  x: number;
  z: number;
  yaw: number;
  speed: number; // forward m/s (negative = reverse)
  steerAngle: number; // current front wheel steer radians
  wheelSpin: number;
  collisions: number;
  damageFlash: number;
  invulnTimer: number;
  parkProgress: number; // 0..1 hold progress inside parking zone
  parkQuality: number; // 0..1 alignment quality
  distanceToBay: number;
  reverseUsed: boolean;
}

export interface RunResult {
  victory: boolean;
  reason: 'parked' | 'wrecked' | 'timeout';
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
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: 'trophy' | 'shield' | 'zap' | 'compass' | 'reverse' | 'palette' | 'flame' | 'star' | 'target' | 'crown';
  points: number;
}

export interface PlayerProgress {
  playerName: string;
  highestLevel: number;
  totalScore: number;
  totalParks: number;
  cleanParks: number;
  reverseParks: number;
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
