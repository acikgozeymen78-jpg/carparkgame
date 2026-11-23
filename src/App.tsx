import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AchievementDef,
  ArenaTheme,
  CameraMode,
  DifficultyPreference,
  GamePhase,
  LevelConfig,
  MapDesignPreference,
  OverlayScreen,
  RunResult,
  VehicleCustomization,
} from './types/game';
import {
  generateLabyrinthLevel,
  resolveActiveTier,
  TIER_MULTIPLIERS,
  updateDynamicDifficulty,
} from './game/difficulty';
import {
  ACHIEVEMENTS,
  calculateRunScore,
  evaluateRunAchievements,
} from './game/achievements';
import {
  loadCustomization,
  loadDifficultyState,
  loadProgress,
  saveCustomization,
  saveDifficultyState,
  saveProgress,
} from './game/storage';
import { SoundEngine } from './game/audio';
import {
  ThreeGameEngine,
  type HudTelemetry,
} from './game/ThreeGameEngine';
import { resolveVehicleModel } from './game/vehicles';
import { TitleOverlay } from './components/TitleOverlay';
import { HudOverlay } from './components/HudOverlay';
import { GarageDock } from './components/GarageDock';
import { LeaderboardModal } from './components/LeaderboardModal';
import { AchievementsModal } from './components/AchievementsModal';
import { GameModal } from './components/GameModal';
import { RealWorldModal } from './components/RealWorldModal';

const INITIAL_TELEMETRY: HudTelemetry = {
  speedKmh: 0,
  elapsedTime: 0,
  timeLimit: 60,
  collisions: 0,
  maxCollisions: 5,
  parkProgress: 0,
  parkQuality: 0,
  distanceToBay: 25,
  gear: 'N',
  turboEnergy: 100,
  turboActive: false,
  boostPadActive: false,
  isDrifting: false,
  comboCount: 1,
  checkpointsPassed: 0,
  totalCheckpoints: 0,
  passedCheckpointIds: [],
  gridSizeLabel: '3×3',
  headlightsOn: true,
  tokensCollected: 0,
  totalTokens: 0,
  bonusScore: 0,
  bonusTimeSec: 0,
  steerAngle: 0,
  ultrasonic: {
    front: 6,
    rear: 6,
    left: 6,
    right: 6,
    minDistance: 6,
  },
  playerPose: { x: 0, z: 0, yaw: 0 },
  nearestWalls: [],
  collectedTokenIds: [],
  archetype: 'classic_maze',
  penaltyScore: 0,
  penaltyTimeSec: 0,
  penaltyPoints: 0,
  maxPenaltyPoints: 100,
  violationCount: 0,
  approachingSignal: null,
  activeTrafficAlert: null,
  edsFlashActive: false,
  vehicleModel: 'sport_gt',
  hoverY: 0,
  hoverEnergy: 100,
  hoverActive: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ThreeGameEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);

  const [progress, setProgress] = useState(() => loadProgress());
  const [customization, setCustomization] = useState<VehicleCustomization>(() => {
    const base = loadCustomization();
    const paramVeh = new URLSearchParams(window.location.search).get('vehicle');
    if (
      paramVeh === 'sport_gt' ||
      paramVeh === 'drift_pro' ||
      paramVeh === 'hover_thruster' ||
      paramVeh === 'apex_hyper'
    ) {
      return { ...base, model: paramVeh };
    }
    return base;
  });
  const [difficulty, setDifficulty] = useState(() => loadDifficultyState());
  const [selectedLevel, setSelectedLevel] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    const paramLevel = Number(params.get('level'));
    if (Number.isInteger(paramLevel) && paramLevel >= 1 && paramLevel <= 50) {
      return paramLevel;
    }
    return Math.max(1, loadProgress().highestLevel);
  });

  const [phase, setPhase] = useState<GamePhase>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' ? 'playing' : 'title';
  });
  const [overlay, setOverlay] = useState<OverlayScreen>('none');
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [arenaTheme, setArenaTheme] = useState<ArenaTheme>('night');
  const [muted, setMuted] = useState(false);
  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [toastAchievement, setToastAchievement] = useState<AchievementDef | null>(null);
  const [realWorldLevel, setRealWorldLevel] = useState<LevelConfig | null>(null);
  const [mapDesignPref, setMapDesignPref] = useState<MapDesignPreference>(() => {
    const paramMap = new URLSearchParams(window.location.search).get('map');
    if (
      paramMap === 'auto' ||
      paramMap === 'classic_maze' ||
      paramMap === 'slalom_chicane' ||
      paramMap === 'double_roundabout' ||
      paramMap === 'construction_zone' ||
      paramMap === 'twin_avenue' ||
      paramMap === 'spiral_citadel' ||
      paramMap === 'grand_prix_arena'
    ) {
      return paramMap;
    }
    return 'auto';
  });
  const toastTimerRef = useRef<number | null>(null);

  const activeTier = useMemo(() => resolveActiveTier(difficulty), [difficulty]);
  const campaignLevelConfig = useMemo(
    () => generateLabyrinthLevel(selectedLevel, activeTier, mapDesignPref),
    [selectedLevel, activeTier, mapDesignPref],
  );
  const activeLevelConfig = realWorldLevel ?? campaignLevelConfig;

  // Refs for stable access inside engine callbacks
  const stateRef = useRef({
    phase,
    overlay,
    selectedLevel,
    activeTier,
    mapDesignPref,
    activeLevelConfig,
    customization,
    progress,
    difficulty,
  });
  stateRef.current = {
    phase,
    overlay,
    selectedLevel,
    activeTier,
    mapDesignPref,
    activeLevelConfig,
    customization,
    progress,
    difficulty,
  };

  // Sync document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((achId: string) => {
    const found = ACHIEVEMENTS.find((a) => a.id === achId);
    if (!found) return;
    setToastAchievement(found);
    soundRef.current?.playAchievement();
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastAchievement((curr) => (curr?.id === found.id ? null : curr));
    }, 3400);
  }, []);

  const handleRunFinish = useCallback(
    (outcome: {
      victory: boolean;
      reason: 'parked' | 'wrecked' | 'timeout' | 'penalty_limit';
      elapsedTime: number;
      collisions: number;
      reverseParked: boolean;
      tokensCollected: number;
      totalTokens: number;
      bonusScore: number;
      penaltyScore: number;
      penaltyTimeSec: number;
      penaltyPoints: number;
      violationCount: number;
      penalties: import('./types/game').TrafficPenaltyRecord[];
    }) => {
      const snap = stateRef.current;
      const lvl = snap.activeLevelConfig;
      const prevProg = snap.progress;
      const prevDiff = snap.difficulty;

      const nextDiff = updateDynamicDifficulty(prevDiff, {
        victory: outcome.victory,
        elapsedTime: outcome.elapsedTime,
        parTime: lvl.parTime,
        collisions: outcome.collisions,
      });
      setDifficulty(nextDiff);
      saveDifficultyState(nextDiff);

      let score = 0;
      let stars = 0;
      if (outcome.victory) {
        const calc = calculateRunScore({
          levelNumber: lvl.levelNumber,
          elapsedTime: outcome.elapsedTime,
          parTime: lvl.parTime,
          collisions: outcome.collisions,
          tierMultiplier: TIER_MULTIPLIERS[lvl.tier],
          reverseParked: outcome.reverseParked,
          penaltyScore: outcome.penaltyScore,
          violationCount: outcome.violationCount,
        });
        score = Math.max(0, calc.score + (outcome.bonusScore ?? 0));
        stars = calc.stars;
      }

      const isRealWorld = Boolean(lvl.realWorld);
      const runResult: RunResult = {
        victory: outcome.victory,
        reason: outcome.reason,
        levelNumber: lvl.levelNumber,
        tier: lvl.tier,
        elapsedTime: outcome.elapsedTime,
        parTime: lvl.parTime,
        collisions: outcome.collisions,
        stars,
        score,
        reverseParked: outcome.reverseParked,
        difficultyShift: nextDiff.lastShift,
        newTier: nextDiff.activeTier,
        newlyUnlockedAchievements: [],
        isRealWorld,
        realWorldStreetName: lvl.realWorld?.streetName,
        tokensCollected: outcome.tokensCollected,
        totalTokens: outcome.totalTokens,
        bonusScore: outcome.bonusScore,
        penaltyScore: outcome.penaltyScore,
        penaltyTimeSec: outcome.penaltyTimeSec,
        penaltyPoints: outcome.penaltyPoints,
        violationCount: outcome.violationCount,
        penalties: outcome.penalties,
      };

      const newlyUnlocked = evaluateRunAchievements(prevProg, runResult);
      runResult.newlyUnlockedAchievements = newlyUnlocked;

      if (outcome.victory) {
        const achPoints = newlyUnlocked.reduce((sum, id) => {
          const def = ACHIEVEMENTS.find((a) => a.id === id);
          return sum + (def?.points ?? 0);
        }, 0);
        const prevBestLvlScore = prevProg.levelBestScores[lvl.levelNumber] ?? 0;
        const prevBestLvlTime = prevProg.levelBestTimes[lvl.levelNumber] ?? Infinity;

        const nextProg = {
          ...prevProg,
          highestLevel: isRealWorld
            ? prevProg.highestLevel
            : Math.max(prevProg.highestLevel, lvl.levelNumber + 1),
          totalScore: prevProg.totalScore + score + achPoints,
          totalParks: prevProg.totalParks + 1,
          cleanParks: prevProg.cleanParks + (outcome.collisions === 0 ? 1 : 0),
          reverseParks: prevProg.reverseParks + (outcome.reverseParked ? 1 : 0),
          realWorldParks: (prevProg.realWorldParks ?? 0) + (isRealWorld ? 1 : 0),
          unlockedAchievements: Array.from(
            new Set([...prevProg.unlockedAchievements, ...newlyUnlocked]),
          ),
          levelBestScores: isRealWorld
            ? prevProg.levelBestScores
            : {
                ...prevProg.levelBestScores,
                [lvl.levelNumber]: Math.max(prevBestLvlScore, score),
              },
          levelBestTimes: isRealWorld
            ? prevProg.levelBestTimes
            : {
                ...prevProg.levelBestTimes,
                [lvl.levelNumber]: Math.min(prevBestLvlTime, outcome.elapsedTime),
              },
        };
        setProgress(nextProg);
        saveProgress(nextProg);
      }

      setLastRun(runResult);
      setPhase('gameover');
      engineRef.current?.setPhase('gameover', 'none');
    },
    [],
  );

  // Mount Three.js engine once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const sound = new SoundEngine();
    soundRef.current = sound;

    const initialAutostart =
      new URLSearchParams(window.location.search).get('autostart') === '1';

    const engine = new ThreeGameEngine(
      mount,
      stateRef.current.activeLevelConfig,
      stateRef.current.customization,
      sound,
      {
        onTelemetry: (t) => setTelemetry(t),
        onFinish: handleRunFinish,
      },
    );
    engine.setPhase(initialAutostart ? 'playing' : 'title', 'none');
    engineRef.current = engine;

    return () => {
      engine.dispose();
      sound.dispose();
      engineRef.current = null;
      soundRef.current = null;
    };
  }, [handleRunFinish]);

  const startLevel = useCallback(
    (levelNum: number, customTier?: DifficultyPreference) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      soundRef.current?.playClick();

      const nextDiff = customTier
        ? {
            ...stateRef.current.difficulty,
            preference: customTier,
            activeTier:
              customTier === 'dynamic'
                ? resolveActiveTier({
                    ...stateRef.current.difficulty,
                    preference: 'dynamic',
                  })
                : customTier,
          }
        : stateRef.current.difficulty;

      const tier = resolveActiveTier(nextDiff);
      const cfg = generateLabyrinthLevel(
        levelNum,
        tier,
        stateRef.current.mapDesignPref,
      );
      setRealWorldLevel(null);
      setSelectedLevel(levelNum);
      setLastRun(null);
      setOverlay('none');
      setPhase('playing');
      engineRef.current?.loadLevel(cfg);
      engineRef.current?.setPhase('playing', 'none');
    },
    [],
  );

  const launchRealWorldLevel = useCallback((cfg: LevelConfig) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundRef.current?.playClick();
    setRealWorldLevel(cfg);
    setLastRun(null);
    setOverlay('none');
    setPhase('playing');
    engineRef.current?.loadLevel(cfg);
    engineRef.current?.setPhase('playing', 'none');
  }, []);

  const restartActiveLevel = useCallback(() => {
    const rw = stateRef.current.activeLevelConfig.realWorld
      ? stateRef.current.activeLevelConfig
      : null;
    if (rw) {
      launchRealWorldLevel(rw);
    } else {
      startLevel(stateRef.current.selectedLevel);
    }
  }, [launchRealWorldLevel, startLevel]);

  const handleSelectLevel = (lvl: number) => {
    soundRef.current?.playClick();
    setRealWorldLevel(null);
    setSelectedLevel(lvl);
    const cfg = generateLabyrinthLevel(lvl, activeTier, mapDesignPref);
    engineRef.current?.loadLevel(cfg);
  };

  const handleChangeDifficultyPref = (pref: DifficultyPreference) => {
    soundRef.current?.playClick();
    const updated = {
      ...difficulty,
      preference: pref,
      activeTier:
        pref === 'dynamic'
          ? resolveActiveTier({ ...difficulty, preference: 'dynamic' })
          : pref,
    };
    setDifficulty(updated);
    saveDifficultyState(updated);
    const cfg = generateLabyrinthLevel(
      selectedLevel,
      updated.activeTier,
      mapDesignPref,
    );
    engineRef.current?.loadLevel(cfg);
  };

  const handleChangeMapDesignPref = (pref: MapDesignPreference) => {
    soundRef.current?.playClick();
    setRealWorldLevel(null);
    setMapDesignPref(pref);
    const cfg = generateLabyrinthLevel(selectedLevel, activeTier, pref);
    engineRef.current?.loadLevel(cfg);
  };

  const handleUpdateCustomization = (next: VehicleCustomization) => {
    soundRef.current?.playClick();
    setCustomization(next);
    saveCustomization(next);
    engineRef.current?.setCustomization(next);

    if (!progress.unlockedAchievements.includes('custom_style')) {
      const def = ACHIEVEMENTS.find((a) => a.id === 'custom_style');
      const nextProg = {
        ...progress,
        totalScore: progress.totalScore + (def?.points ?? 100),
        customizationCount: progress.customizationCount + 1,
        unlockedAchievements: [...progress.unlockedAchievements, 'custom_style'],
      };
      setProgress(nextProg);
      saveProgress(nextProg);
      showToast('custom_style');
    }
  };

  const openGarage = () => {
    soundRef.current?.playClick();
    setOverlay('garage');
    engineRef.current?.setPhase(phase, 'garage');
  };

  const closeOverlay = () => {
    soundRef.current?.playClick();
    setOverlay('none');
    engineRef.current?.setPhase(phase, 'none');
  };

  const handlePause = useCallback(() => {
    if (stateRef.current.phase !== 'playing') return;
    setPhase('paused');
    engineRef.current?.setPhase('paused', 'none');
  }, []);

  const handleResume = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundRef.current?.playClick();
    setPhase('playing');
    engineRef.current?.setPhase('playing', 'none');
  }, []);

  const handleCycleCamera = useCallback(() => {
    if (!engineRef.current) return;
    soundRef.current?.playClick();
    const next = engineRef.current.cycleCameraMode();
    setCameraMode(next);
  }, []);

  const handleToggleCockpit = useCallback(() => {
    if (!engineRef.current) return;
    soundRef.current?.playClick();
    const next = engineRef.current.toggleCockpitMode();
    setCameraMode(next);
  }, []);

  const handleCycleTheme = useCallback(() => {
    if (!engineRef.current) return;
    soundRef.current?.playClick();
    const next = engineRef.current.cycleTheme();
    setArenaTheme(next);
  }, []);

  const handleToggleHeadlights = useCallback(() => {
    if (!engineRef.current) return;
    soundRef.current?.playClick();
    engineRef.current.toggleHeadlights();
  }, []);

  const handleToggleMute = useCallback(() => {
    if (!soundRef.current) return;
    const nextMuted = soundRef.current.toggleMute();
    setMuted(nextMuted);
  }, []);

  // Global keyboard shortcuts (Enter/Space on Title, Esc/P Pause, C Camera, T Atmosphere, R Restart, M Mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const curPhase = stateRef.current.phase;
      const curOverlay = stateRef.current.overlay;

      if (curPhase === 'title' && curOverlay === 'none') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startLevel(stateRef.current.selectedLevel);
          return;
        }
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (curOverlay !== 'none') {
          closeOverlay();
          return;
        }
        if (curPhase === 'playing') {
          handlePause();
          return;
        }
        if (curPhase === 'paused') {
          handleResume();
          return;
        }
      }

      if (curPhase === 'playing' && curOverlay === 'none') {
        if (e.code === 'KeyC') {
          handleCycleCamera();
        } else if (e.code === 'KeyV') {
          handleToggleCockpit();
        } else if (e.code === 'KeyT') {
          handleCycleTheme();
        } else if (e.code === 'KeyF') {
          handleToggleHeadlights();
        } else if (e.code === 'KeyR') {
          restartActiveLevel();
        } else if (e.code === 'KeyM') {
          handleToggleMute();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleCycleCamera,
    handleToggleCockpit,
    handleCycleTheme,
    handleToggleHeadlights,
    handlePause,
    handleResume,
    handleToggleMute,
    restartActiveLevel,
    startLevel,
  ]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0b101b]">
      {/* Isolated WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        data-testid="three-canvas-container"
        className="absolute inset-0 w-full h-full"
      />

      {/* Title Screen */}
      {phase === 'title' && overlay === 'none' && (
        <TitleOverlay
          selectedLevel={selectedLevel}
          highestLevel={progress.highestLevel}
          gridSizeLabel={`${campaignLevelConfig.cols}×${campaignLevelConfig.rows}`}
          selectedModel={resolveVehicleModel(customization.model)}
          difficulty={difficulty}
          mapDesignPref={mapDesignPref}
          progress={progress}
          onSelectLevel={handleSelectLevel}
          onSelectVehicleModel={(model) =>
            handleUpdateCustomization({ ...customization, model })
          }
          onChangeDifficultyPref={handleChangeDifficultyPref}
          onChangeMapDesignPref={handleChangeMapDesignPref}
          onStart={() => startLevel(selectedLevel)}
          onOpenGarage={openGarage}
          onOpenLeaderboard={() => setOverlay('leaderboard')}
          onOpenAchievements={() => setOverlay('achievements')}
          onOpenRealWorld={() => {
            soundRef.current?.playClick();
            setOverlay('realworld');
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && overlay === 'none' && (
        <HudOverlay
          levelNumber={selectedLevel}
          levelConfig={activeLevelConfig}
          realWorldStreetName={activeLevelConfig.realWorld?.streetName}
          tier={activeTier}
          parTime={activeLevelConfig.parTime}
          telemetry={telemetry}
          cameraMode={cameraMode}
          arenaTheme={arenaTheme}
          muted={muted}
          toastAchievement={toastAchievement}
          onCycleCamera={handleCycleCamera}
          onToggleCockpit={handleToggleCockpit}
          onCycleTheme={handleCycleTheme}
          onToggleHeadlights={handleToggleHeadlights}
          onToggleMute={handleToggleMute}
          onRestart={restartActiveLevel}
          onPause={handlePause}
          onRearCameraRectChange={(rect) =>
            engineRef.current?.setRearCameraRect(rect)
          }
          onTouchControl={(key, pressed) =>
            engineRef.current?.setTouchControl(key, pressed)
          }
        />
      )}

      {/* Garage Customization Bottom Dock */}
      {overlay === 'garage' && (
        <GarageDock
          customization={customization}
          onChange={handleUpdateCustomization}
          onClose={closeOverlay}
        />
      )}

      {/* Leaderboard Modal */}
      {overlay === 'leaderboard' && (
        <LeaderboardModal
          progress={progress}
          activeTier={activeTier}
          currentLevel={selectedLevel}
          onUpdateName={(name) => {
            const next = { ...progress, playerName: name };
            setProgress(next);
            saveProgress(next);
          }}
          onClose={closeOverlay}
        />
      )}

      {/* Achievements Modal */}
      {overlay === 'achievements' && (
        <AchievementsModal progress={progress} onClose={closeOverlay} />
      )}

      {/* Real World Google Maps Street Picker & Generator */}
      {overlay === 'realworld' && (
        <RealWorldModal
          activeTier={activeTier}
          onLaunchLevel={launchRealWorldLevel}
          onClose={closeOverlay}
        />
      )}

      {/* Pause / Victory / Game Over Modal */}
      {(phase === 'paused' || phase === 'gameover') && overlay === 'none' && (
        <GameModal
          phase={phase}
          levelNumber={selectedLevel}
          realWorldStreetName={activeLevelConfig.realWorld?.streetName}
          lastRun={lastRun}
          onResume={handleResume}
          onRetry={restartActiveLevel}
          onNextLevel={() => startLevel(selectedLevel + 1)}
          onPickNewStreet={() => {
            soundRef.current?.playClick();
            setOverlay('realworld');
          }}
          onOpenGarage={openGarage}
          onReturnTitle={() => {
            soundRef.current?.playClick();
            setRealWorldLevel(null);
            setOverlay('none');
            setPhase('title');
            engineRef.current?.loadLevel(campaignLevelConfig);
            engineRef.current?.setPhase('title', 'none');
          }}
        />
      )}
    </div>
  );
}
