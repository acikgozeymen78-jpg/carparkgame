import type {
  DifficultyTier,
  LeaderboardEntry,
  PlayerProgress,
} from '../types/game';

const RIVAL_DRIVERS: Array<{
  id: string;
  name: string;
  baseScore: number;
  baseTime: number;
  levelReached: number;
  tier: DifficultyTier;
}> = [
  { id: 'r1', name: 'Kaan Vural', baseScore: 7840, baseTime: 16.4, levelReached: 7, tier: 'efsane' },
  { id: 'r2', name: 'Ece Tekin', baseScore: 6420, baseTime: 18.2, levelReached: 6, tier: 'profesyonel' },
  { id: 'r3', name: 'Mert Arslan', baseScore: 5190, baseTime: 19.8, levelReached: 5, tier: 'profesyonel' },
  { id: 'r4', name: 'Selin Kaya', baseScore: 3940, baseTime: 22.1, levelReached: 4, tier: 'usta' },
  { id: 'r5', name: 'Burak Demir', baseScore: 2650, baseTime: 25.5, levelReached: 3, tier: 'usta' },
  { id: 'r6', name: 'Defne Yıldız', baseScore: 1480, baseTime: 28.9, levelReached: 2, tier: 'caylak' },
];

export function buildGlobalLeaderboard(
  progress: PlayerProgress,
  activeTier: DifficultyTier,
): LeaderboardEntry[] {
  const bestTimes = Object.values(progress.levelBestTimes);
  const fastestTime = bestTimes.length > 0 ? Math.min(...bestTimes) : 0;

  const entries: LeaderboardEntry[] = RIVAL_DRIVERS.map((r) => ({
    id: r.id,
    name: r.name,
    score: r.baseScore,
    bestTime: r.baseTime,
    levelReached: r.levelReached,
    tier: r.tier,
    isPlayer: false,
  }));

  entries.push({
    id: 'player-local',
    name: progress.playerName || 'Sürücü #01',
    score: progress.totalScore,
    bestTime: fastestTime,
    levelReached: progress.highestLevel,
    tier: activeTier,
    isPlayer: true,
  });

  return entries.sort((a, b) => b.score - a.score);
}

export function buildLevelLeaderboard(
  levelNumber: number,
  progress: PlayerProgress,
  activeTier: DifficultyTier,
): LeaderboardEntry[] {
  const parEstimate = 16 + levelNumber * 4.5;
  const entries: LeaderboardEntry[] = RIVAL_DRIVERS.slice(0, 5).map((r, idx) => {
    const time = Number((parEstimate * (0.76 + idx * 0.12)).toFixed(1));
    const score = Math.round((1300 + levelNumber * 380) * (1.35 - idx * 0.14));
    return {
      id: `${r.id}-lvl-${levelNumber}`,
      name: r.name,
      score,
      bestTime: time,
      levelReached: levelNumber,
      tier: r.tier,
      isPlayer: false,
    };
  });

  const playerScore = progress.levelBestScores[levelNumber] ?? 0;
  const playerTime = progress.levelBestTimes[levelNumber] ?? 0;

  if (playerScore > 0) {
    entries.push({
      id: `player-lvl-${levelNumber}`,
      name: progress.playerName || 'Sürücü #01',
      score: playerScore,
      bestTime: Number(playerTime.toFixed(1)),
      levelReached: levelNumber,
      tier: activeTier,
      isPlayer: true,
    });
  }

  return entries.sort((a, b) => b.score - a.score);
}
