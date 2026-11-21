import type {
  DynamicDifficultyState,
  PlayerProgress,
  VehicleCustomization,
} from '../types/game';
import { createInitialDifficultyState } from './difficulty';

const PROGRESS_KEY = 'labirent_park_3d_progress_v1';
const CUSTOMIZATION_KEY = 'labirent_park_3d_custom_v1';
const DIFFICULTY_KEY = 'labirent_park_3d_difficulty_v1';

export function getDefaultCustomization(): VehicleCustomization {
  return {
    paint: 'crimson',
    rim: 'sport5',
    spoiler: 'lip',
    underglow: 'cyan',
    decal: 'dualStripe',
  };
}

export function getDefaultProgress(): PlayerProgress {
  return {
    playerName: 'Sürücü #01',
    highestLevel: 1,
    totalScore: 0,
    totalParks: 0,
    cleanParks: 0,
    reverseParks: 0,
    unlockedAchievements: [],
    levelBestScores: {},
    levelBestTimes: {},
    customizationCount: 0,
  };
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return getDefaultProgress();
    return { ...getDefaultProgress(), ...JSON.parse(raw) };
  } catch {
    return getDefaultProgress();
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCustomization(): VehicleCustomization {
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATION_KEY);
    if (!raw) return getDefaultCustomization();
    return { ...getDefaultCustomization(), ...JSON.parse(raw) };
  } catch {
    return getDefaultCustomization();
  }
}

export function saveCustomization(custom: VehicleCustomization): void {
  try {
    window.localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(custom));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadDifficultyState(): DynamicDifficultyState {
  try {
    const raw = window.localStorage.getItem(DIFFICULTY_KEY);
    if (!raw) return createInitialDifficultyState();
    return { ...createInitialDifficultyState(), ...JSON.parse(raw) };
  } catch {
    return createInitialDifficultyState();
  }
}

export function saveDifficultyState(state: DynamicDifficultyState): void {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
