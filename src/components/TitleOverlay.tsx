import React from 'react';
import { Award, Car, Play, Trophy, SlidersHorizontal } from 'lucide-react';
import type {
  DifficultyPreference,
  DynamicDifficultyState,
  PlayerProgress,
} from '../types/game';
import { TIER_LABELS } from '../game/difficulty';

interface TitleOverlayProps {
  selectedLevel: number;
  highestLevel: number;
  difficulty: DynamicDifficultyState;
  progress: PlayerProgress;
  onSelectLevel: (level: number) => void;
  onChangeDifficultyPref: (pref: DifficultyPreference) => void;
  onStart: () => void;
  onOpenGarage: () => void;
  onOpenLeaderboard: () => void;
  onOpenAchievements: () => void;
}

const PREF_OPTIONS: Array<{ id: DifficultyPreference; label: string }> = [
  { id: 'dynamic', label: 'Dinamik' },
  { id: 'caylak', label: 'Çaylak' },
  { id: 'usta', label: 'Usta' },
  { id: 'profesyonel', label: 'Pro' },
  { id: 'efsane', label: 'Efsane' },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedLevel,
  highestLevel,
  difficulty,
  progress,
  onSelectLevel,
  onChangeDifficultyPref,
  onStart,
  onOpenGarage,
  onOpenLeaderboard,
  onOpenAchievements,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Left/Top-Left Negative-Space Title Lockup & Menu */}
      <div className="pointer-events-auto max-w-md bg-[#0b111e]/88 border border-slate-700/70 rounded-2xl p-6 shadow-2xl">
        {/* Bespoke Inline SVG Title Emblem */}
        <div className="flex items-center gap-4 mb-5">
          <svg
            viewBox="0 0 64 64"
            className="w-14 h-14 shrink-0"
            aria-hidden="true"
          >
            <polygon
              points="32,3 59,18 59,46 32,61 5,46 5,18"
              fill="#111a2e"
              stroke="#34d399"
              strokeWidth="2.5"
            />
            <path
              d="M20 44 V20 H34 C41 20 45 24 45 29 C45 34 41 38 34 38 H26 V44 Z M26 25 V33 H33.5 C37 33 39 31.3 39 29 C39 26.7 37 25 33.5 25 Z"
              fill="#f8fafc"
            />
            <path
              d="M16 50 L48 50"
              stroke="#f59e0b"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-none">
              LABİRENT PARK <span className="text-emerald-400">3D</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 mt-1.5">
              Dinamik Parkur &amp; Hassas Sürüş
            </p>
          </div>
        </div>

        {/* Level Selector */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-1.5">
            <span>Seviye Seçimi</span>
            <span className="font-mono-num text-emerald-400">
              Toplam Skor: {progress.totalScore.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.max(6, highestLevel + 1) }, (_, idx) => {
              const lvl = idx + 1;
              const locked = lvl > highestLevel;
              const active = lvl === selectedLevel;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={locked}
                  onClick={() => onSelectLevel(lvl)}
                  aria-label={`Seviye ${lvl}`}
                  className={`font-mono-num h-9 min-w-[2.5rem] px-2.5 rounded-lg text-sm font-bold border transition-colors ${
                    active
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : locked
                        ? 'bg-slate-900/60 text-slate-600 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-800/90 text-slate-200 border-slate-700 hover:border-emerald-400/70'
                  }`}
                >
                  {locked ? `🔒` : lvl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Difficulty Selector */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-1.5">
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              Zorluk Modu
            </span>
            <span className="text-amber-300 font-semibold">
              Aktif: {TIER_LABELS[difficulty.activeTier]}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {PREF_OPTIONS.map((opt) => {
              const active = difficulty.preference === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeDifficultyPref(opt.id)}
                  className={`py-1.5 px-1 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Start CTA */}
        <button
          type="button"
          data-start="true"
          onClick={onStart}
          className="w-full py-3.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-lg tracking-wide flex items-center justify-center gap-2.5 shadow-lg transition-colors cursor-pointer"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>SEVİYE {selectedLevel} BAŞLAT</span>
        </button>

        {/* Secondary Actions (<= 3) */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            type="button"
            onClick={onOpenGarage}
            className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Car className="w-4 h-4 text-cyan-400" />
            <span>GARAJ</span>
          </button>
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>LİDERLİK</span>
          </button>
          <button
            type="button"
            onClick={onOpenAchievements}
            className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Award className="w-4 h-4 text-emerald-400" />
            <span>BAŞARIM ({progress.unlockedAchievements.length})</span>
          </button>
        </div>
      </div>

      {/* Single flat, borderless inline control-hint line in bottom safe margin */}
      <div className="text-center text-xs md:text-sm text-slate-300/90 tracking-wide hud-text-stroke">
        WASD / Oklar Sürüş · Space El Freni · C Kamera · R Yeniden Başlat · Esc Duraklat
      </div>
    </div>
  );
};
