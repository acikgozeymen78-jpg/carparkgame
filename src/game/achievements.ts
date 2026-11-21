import type { AchievementDef, PlayerProgress, RunResult } from '../types/game';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_park',
    title: 'İlk Park',
    description: 'İlk labirent parkurunu başarıyla tamamla.',
    icon: 'trophy',
    points: 100,
  },
  {
    id: 'zero_scratch',
    title: 'Çiziksiz Sürüş',
    description: 'Hiçbir engele çarpmadan bir seviyeyi tamamla.',
    icon: 'shield',
    points: 200,
  },
  {
    id: 'speed_demon',
    title: 'Hız Şeytanı',
    description: 'Hedef sürenin (Par) en az %30 altında park et.',
    icon: 'zap',
    points: 250,
  },
  {
    id: 'reverse_legend',
    title: 'Geri Vites Ustası',
    description: 'Park alanına geri vites manevrasıyla yerleş.',
    icon: 'reverse',
    points: 200,
  },
  {
    id: 'maze_runner_3',
    title: 'Labirent Kaşifi',
    description: '3. seviyeye ulaş ve tamamla.',
    icon: 'compass',
    points: 300,
  },
  {
    id: 'maze_master_6',
    title: 'Labirent Efsanesi',
    description: '6. seviyeyi başarıyla tamamla.',
    icon: 'crown',
    points: 500,
  },
  {
    id: 'pro_tier',
    title: 'Dinamik Yükseliş',
    description: 'Dinamik zorlukta Profesyonel veya Efsane seviyesinde park et.',
    icon: 'flame',
    points: 350,
  },
  {
    id: 'custom_style',
    title: 'Garaj Tutkunu',
    description: 'Aracının görünümünü garajda özelleştir.',
    icon: 'palette',
    points: 100,
  },
  {
    id: 'three_star_streak',
    title: 'Üç Yıldız Mükemmelliği',
    description: 'Bir parkurdan 3 yıldız derecesi kazan.',
    icon: 'star',
    points: 250,
  },
  {
    id: 'veteran_driver',
    title: 'Usta Vale',
    description: 'Toplamda 5 kez hatasız (0 çarpışma) park tamamla.',
    icon: 'target',
    points: 450,
  },
];

export function evaluateRunAchievements(
  progress: PlayerProgress,
  run: RunResult,
): string[] {
  if (!run.victory) return [];
  const unlocked = new Set(progress.unlockedAchievements);
  const newlyUnlocked: string[] = [];

  const grant = (id: string) => {
    if (!unlocked.has(id)) {
      unlocked.add(id);
      newlyUnlocked.push(id);
    }
  };

  grant('first_park');
  if (run.collisions === 0) grant('zero_scratch');
  if (run.elapsedTime <= run.parTime * 0.7) grant('speed_demon');
  if (run.reverseParked) grant('reverse_legend');
  if (run.levelNumber >= 3) grant('maze_runner_3');
  if (run.levelNumber >= 6) grant('maze_master_6');
  if (run.tier === 'profesyonel' || run.tier === 'efsane') grant('pro_tier');
  if (run.stars === 3) grant('three_star_streak');
  if (progress.cleanParks + (run.collisions === 0 ? 1 : 0) >= 5) {
    grant('veteran_driver');
  }

  return newlyUnlocked;
}

export function calculateRunScore(params: {
  levelNumber: number;
  elapsedTime: number;
  parTime: number;
  collisions: number;
  tierMultiplier: number;
  reverseParked: boolean;
}): { score: number; stars: number } {
  const base = 600 + params.levelNumber * 220;
  const timeBonus = Math.max(0, Math.round((params.parTime * 1.35 - params.elapsedTime) * 35));
  const cleanBonus = params.collisions === 0 ? 350 : Math.max(0, 200 - params.collisions * 90);
  const reverseBonus = params.reverseParked ? 180 : 0;

  const raw = (base + timeBonus + cleanBonus + reverseBonus) * params.tierMultiplier;
  const score = Math.max(100, Math.round(raw));

  let stars = 1;
  if (params.elapsedTime <= params.parTime * 1.15 && params.collisions <= 1) stars = 2;
  if (params.elapsedTime <= params.parTime * 0.92 && params.collisions === 0) stars = 3;

  return { score, stars };
}
