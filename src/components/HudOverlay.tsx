import React from 'react';
import {
  Camera,
  Pause,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
  Award,
} from 'lucide-react';
import type { HudTelemetry } from '../game/ThreeGameEngine';
import type {
  AchievementDef,
  CameraMode,
  DifficultyTier,
} from '../types/game';
import { TIER_LABELS, TIER_MULTIPLIERS } from '../game/difficulty';
import type { CarInput } from '../game/physics';

interface HudOverlayProps {
  levelNumber: number;
  tier: DifficultyTier;
  parTime: number;
  telemetry: HudTelemetry;
  cameraMode: CameraMode;
  muted: boolean;
  toastAchievement: AchievementDef | null;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onPause: () => void;
  onTouchControl: (key: keyof CarInput, pressed: boolean) => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  levelNumber,
  tier,
  parTime,
  telemetry,
  cameraMode,
  muted,
  toastAchievement,
  onCycleCamera,
  onToggleMute,
  onRestart,
  onPause,
  onTouchControl,
}) => {
  const remaining = Math.max(0, telemetry.timeLimit - telemetry.elapsedTime);
  const integrityLeft = Math.max(0, telemetry.maxCollisions - telemetry.collisions);
  const camLabel =
    cameraMode === 'chase' ? 'Takip' : cameraMode === 'top' ? 'Kuşbakışı' : 'Kaput';

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 md:p-6">
      {/* Top Row: Left Status Cluster + Center Achievement Toast + Right Utility Icons */}
      <div className="flex flex-wrap items-start justify-between gap-2 md:gap-4">
        {/* Top-Left Cluster */}
        <div className="bg-[#0b111e]/88 border border-slate-700/75 rounded-xl px-3 py-2 md:px-4 md:py-2.5 shadow-xl flex items-center gap-2.5 md:gap-4">
          <div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.16em] text-slate-400">
              SEVİYE
            </div>
            <div className="font-mono-num text-lg md:text-2xl font-extrabold text-white leading-none">
              {String(levelNumber).padStart(2, '0')}
            </div>
          </div>

          <div className="h-7 md:h-8 w-px bg-slate-700/80" />

          <div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-amber-300">
              {TIER_LABELS[tier]} · {TIER_MULTIPLIERS[tier].toFixed(2)}x
            </div>
            <div className="flex items-baseline gap-1.5 md:gap-2 mt-0.5">
              <span
                className={`font-mono-num text-base md:text-xl font-bold leading-none ${
                  remaining <= 10 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatClock(telemetry.elapsedTime)}
              </span>
              <span className="hidden sm:inline font-mono-num text-xs text-slate-400">
                / Hedef {formatClock(parTime)}
              </span>
            </div>
          </div>

          <div className="h-7 md:h-8 w-px bg-slate-700/80" />

          {/* Integrity Shield Pips */}
          <div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-0.5 md:mb-1">
              HASAR ({integrityLeft}/{telemetry.maxCollisions})
            </div>
            <div className="flex items-center gap-0.5 md:gap-1">
              {Array.from({ length: telemetry.maxCollisions }, (_, idx) => {
                const intact = idx < integrityLeft;
                return (
                  <Shield
                    key={idx}
                    className={`w-3.5 h-3.5 md:w-4 md:h-4 ${
                      intact
                        ? 'text-emerald-400 fill-emerald-400/25'
                        : 'text-slate-600'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Achievement Toast */}
        {toastAchievement && (
          <div className="bg-[#0f1a2d]/95 border border-amber-400/70 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-3">
            <Award className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                BAŞARIM KAZANILDI (+{toastAchievement.points})
              </div>
              <div className="text-sm font-bold text-white">
                {toastAchievement.title}
              </div>
            </div>
          </div>
        )}

        {/* Top-Right Compact Utility Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5 md:gap-2">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            aria-label={`Kamera Değiştir (${camLabel})`}
            title={`Kamera: ${camLabel} [C]`}
            className="h-9 md:h-10 px-2.5 md:px-3 rounded-xl bg-[#0b111e]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-100 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">{camLabel}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Sesi Aç' : 'Sesi Kapat'}
            title="Sesi Aç/Kapat [M]"
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#0b111e]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-100 flex items-center justify-center cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="Seviyeyi Yeniden Başlat"
            title="Yeniden Başlat [R]"
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#0b111e]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-100 flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Oyunu Duraklat"
            title="Duraklat [Esc / P]"
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#0b111e]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-100 flex items-center justify-center cursor-pointer"
          >
            <Pause className="w-4 h-4 text-slate-100" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Mobile Touch Controls (md:hidden) + Bottom-Right Instrument Gauge */}
      <div className="flex flex-col-reverse md:flex-row md:items-end justify-between gap-2.5 md:gap-4">
        {/* Touch Controls visible on touch/mobile viewports */}
        <div className="pointer-events-auto flex md:hidden items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('left', true)}
              onPointerUp={() => onTouchControl('left', false)}
              onPointerLeave={() => onTouchControl('left', false)}
              aria-label="Sola Dön"
              className="w-12 h-12 rounded-xl bg-[#0b111e]/90 border border-slate-600 text-white font-bold text-lg active:bg-emerald-500 active:text-slate-950"
            >
              ◀
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('right', true)}
              onPointerUp={() => onTouchControl('right', false)}
              onPointerLeave={() => onTouchControl('right', false)}
              aria-label="Sağa Dön"
              className="w-12 h-12 rounded-xl bg-[#0b111e]/90 border border-slate-600 text-white font-bold text-lg active:bg-emerald-500 active:text-slate-950"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('brake', true)}
              onPointerUp={() => onTouchControl('brake', false)}
              onPointerLeave={() => onTouchControl('brake', false)}
              aria-label="Fren ve Geri Vites"
              className="w-14 h-12 rounded-xl bg-rose-950/90 border border-rose-500/70 text-rose-200 font-bold text-xs"
            >
              GERİ
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('throttle', true)}
              onPointerUp={() => onTouchControl('throttle', false)}
              onPointerLeave={() => onTouchControl('throttle', false)}
              aria-label="Gaz"
              className="w-14 h-14 rounded-xl bg-emerald-950/90 border border-emerald-500/70 text-emerald-200 font-bold text-xs"
            >
              GAZ
            </button>
          </div>
        </div>

        <div className="hidden md:block" />

        {/* Right Side: Parking Alignment Sensor + Digital Tachometer */}
        <div className="self-end bg-[#0b111e]/90 border border-slate-700/80 rounded-2xl px-3.5 py-2.5 md:px-4 md:py-3 shadow-xl min-w-[190px] md:min-w-[215px]">
          <div className="flex items-center justify-between gap-3 md:gap-4">
            <div className="flex items-baseline gap-2">
              <span
                className={`font-mono-num text-xl md:text-2xl font-extrabold leading-none ${
                  telemetry.gear === 'R'
                    ? 'text-amber-400'
                    : telemetry.gear === 'P'
                      ? 'text-cyan-400'
                      : 'text-emerald-400'
                }`}
              >
                {telemetry.gear}
              </span>
              <span className="font-mono-num text-2xl md:text-3xl font-extrabold text-white leading-none">
                {telemetry.speedKmh}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                KM/S
              </span>
            </div>
            <div className="text-right">
              <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-400">
                MESAFE
              </div>
              <div className="font-mono-num text-xs md:text-sm font-bold text-emerald-300">
                {telemetry.distanceToBay}m
              </div>
            </div>
          </div>

          {/* Parking Hold Progress / Alignment Bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[9px] md:text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              <span>
                {telemetry.parkProgress > 0.05
                  ? 'PARK ONAYLANIYOR...'
                  : 'HİZALAMA SENSÖRÜ'}
              </span>
              <span className="font-mono-num text-cyan-300">
                {Math.round(
                  (telemetry.parkProgress > 0.05
                    ? telemetry.parkProgress
                    : telemetry.parkQuality) * 100,
                )}
                %
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  telemetry.parkProgress > 0.05 ? 'bg-cyan-400' : 'bg-emerald-500'
                }`}
                style={{
                  width: `${Math.round(
                    (telemetry.parkProgress > 0.05
                      ? telemetry.parkProgress
                      : telemetry.parkQuality) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
