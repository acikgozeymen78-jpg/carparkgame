import React from 'react';
import { Award, Car, Globe, Layers, Play, Trophy, SlidersHorizontal } from 'lucide-react';
import type {
  DifficultyPreference,
  DynamicDifficultyState,
  MapDesignPreference,
  PlayerProgress,
  VehicleModelId,
} from '../types/game';
import {
  ARCHETYPE_LABELS,
  isHighwayExitLevel,
  resolveCourseArchetype,
  TIER_LABELS,
} from '../game/difficulty';
import { VEHICLE_ORDER, VEHICLE_SPECS } from '../game/vehicles';

interface TitleOverlayProps {
  selectedLevel: number;
  highestLevel: number;
  gridSizeLabel: string;
  selectedModel: VehicleModelId;
  difficulty: DynamicDifficultyState;
  mapDesignPref: MapDesignPreference;
  progress: PlayerProgress;
  onSelectLevel: (level: number) => void;
  onSelectVehicleModel: (model: VehicleModelId) => void;
  onChangeDifficultyPref: (pref: DifficultyPreference) => void;
  onChangeMapDesignPref: (pref: MapDesignPreference) => void;
  onStart: () => void;
  onOpenGarage: () => void;
  onOpenLeaderboard: () => void;
  onOpenAchievements: () => void;
  onOpenRealWorld: () => void;
}

const PREF_OPTIONS: Array<{ id: DifficultyPreference; label: string }> = [
  { id: 'dynamic', label: 'Dinamik' },
  { id: 'caylak', label: 'Çaylak' },
  { id: 'usta', label: 'Usta' },
  { id: 'profesyonel', label: 'Pro' },
  { id: 'efsane', label: 'Efsane' },
];

const MAP_DESIGN_OPTIONS: Array<{ id: MapDesignPreference; label: string }> = [
  { id: 'auto', label: 'Otomatik' },
  { id: 'classic_maze', label: 'Klasik' },
  { id: 'slalom_chicane', label: 'Slalom' },
  { id: 'double_roundabout', label: '2x Kavşak' },
  { id: 'construction_zone', label: 'Şantiye' },
  { id: 'twin_avenue', label: '2x Bulvar' },
  { id: 'spiral_citadel', label: 'Spiral' },
  { id: 'grand_prix_arena', label: 'Özel Pist' },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedLevel,
  highestLevel,
  gridSizeLabel,
  selectedModel,
  difficulty,
  mapDesignPref,
  progress,
  onSelectLevel,
  onSelectVehicleModel,
  onChangeDifficultyPref,
  onChangeMapDesignPref,
  onStart,
  onOpenGarage,
  onOpenLeaderboard,
  onOpenAchievements,
  onOpenRealWorld,
}) => {
  const activeArchetype = resolveCourseArchetype(selectedLevel, mapDesignPref);
  const activeSpec = VEHICLE_SPECS[selectedModel];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-8 overflow-y-auto">
      {/* Left/Top-Left Negative-Space Title Lockup & Menu */}
      <div className="pointer-events-auto max-w-md bg-[#0b111e]/88 border border-slate-700/70 rounded-2xl p-5 md:p-6 shadow-2xl">
        {/* Bespoke Inline SVG Title Emblem */}
        <div className="flex items-center gap-4 mb-4">
          <svg
            viewBox="0 0 64 64"
            className="w-12 h-12 md:w-14 md:h-14 shrink-0"
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
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white leading-none">
              LABİRENT PARK <span className="text-emerald-400">3D</span>
            </h1>
            <p className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-slate-400 mt-1.5">
              Dinamik Parkur &amp; Hassas Sürüş
            </p>
          </div>
        </div>

        {/* Level Selector */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-1.5">
            <span>
              Seviye Seçimi · <span className="font-mono-num text-cyan-300">{gridSizeLabel}</span>
              {isHighwayExitLevel(selectedLevel) && (
                <span className="ml-1.5 text-emerald-300 font-bold">· Otoban Çıkışı</span>
              )}
            </span>
            <span className="font-mono-num text-emerald-400">
              Toplam Skor: {progress.totalScore.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.max(8, highestLevel + 1) }, (_, idx) => {
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
                  className={`font-mono-num h-8 min-w-[2.25rem] px-2 rounded-lg text-sm font-bold border transition-colors ${
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

        {/* Obstacle Map Design Selector */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Engel Haritası
            </span>
            <span className="text-cyan-300 font-semibold">
              {ARCHETYPE_LABELS[activeArchetype]}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MAP_DESIGN_OPTIONS.map((opt) => {
              const active = mapDesignPref === opt.id;
              const isSpecial = opt.id === 'grand_prix_arena';
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-map-design={opt.id}
                  onClick={() => onChangeMapDesignPref(opt.id)}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer truncate ${
                    active
                      ? isSpecial
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-cyan-400 text-slate-950 border-cyan-300'
                      : isSpecial
                        ? 'bg-amber-500/15 text-amber-200 border-amber-400/50 hover:border-amber-300'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vehicle Model Quick Selector */}
        <div className="mb-3.5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-emerald-400" />
              Araç Seçimi
            </span>
            <span className="text-emerald-300 font-semibold">
              {activeSpec.name}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {VEHICLE_ORDER.map((id) => {
              const spec = VEHICLE_SPECS[id];
              const active = selectedModel === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-vehicle-select={id}
                  onClick={() => onSelectVehicleModel(id)}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                    active
                      ? id === 'hover_thruster'
                        ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                        : id === 'drift_pro'
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : id === 'apex_hyper'
                            ? 'bg-rose-500 text-white border-rose-300'
                            : 'bg-emerald-400 text-slate-950 border-emerald-300'
                      : 'bg-slate-800/80 text-slate-200 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <span className="truncate">{spec.shortName}</span>
                  <span
                    className={`text-[9px] font-semibold tracking-wider shrink-0 ${
                      active ? 'opacity-90' : 'text-slate-400'
                    }`}
                  >
                    {spec.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Difficulty Selector */}
        <div className="mb-4">
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

        {/* Real World Google Maps Mode CTA */}
        <button
          type="button"
          onClick={onOpenRealWorld}
          className="w-full mt-2.5 py-2.5 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Globe className="w-4 h-4 text-cyan-400" />
          <span>GERÇEK DÜNYA MODU (GOOGLE MAPS)</span>
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
        WASD / Oklar Sürüş · Shift Turbo · Space El Freni · E Roket İtici (Tesla Hover) · F Far · V Kokpit · C Kamera · Esc Duraklat
      </div>
    </div>
  );
};
