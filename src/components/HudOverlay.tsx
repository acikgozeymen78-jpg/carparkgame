import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Gauge,
  Lightbulb,
  Moon,
  OctagonAlert,
  Pause,
  Rocket,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Sun,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { HudTelemetry, RearCameraRect } from '../game/ThreeGameEngine';
import type {
  AchievementDef,
  ArenaTheme,
  CameraMode,
  DifficultyTier,
  LevelConfig,
} from '../types/game';
import { TIER_LABELS, TIER_MULTIPLIERS } from '../game/difficulty';
import type { CarInput } from '../game/physics';
import { MiniMap } from './MiniMap';

interface HudOverlayProps {
  levelNumber: number;
  levelConfig: LevelConfig;
  realWorldStreetName?: string;
  tier: DifficultyTier;
  parTime: number;
  telemetry: HudTelemetry;
  cameraMode: CameraMode;
  arenaTheme: ArenaTheme;
  muted: boolean;
  toastAchievement: AchievementDef | null;
  onCycleCamera: () => void;
  onToggleCockpit: () => void;
  onCycleTheme: () => void;
  onToggleHeadlights: () => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onPause: () => void;
  onRearCameraRectChange: (rect: RearCameraRect | null) => void;
  onTouchControl: (key: keyof CarInput, pressed: boolean) => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function sensorSeverity(dist: number): {
  level: 0 | 1 | 2 | 3;
  color: string;
  textClass: string;
} {
  if (dist < 0.9) {
    return { level: 3, color: '#f43f5e', textClass: 'text-rose-400' };
  }
  if (dist < 2.2) {
    return { level: 2, color: '#f59e0b', textClass: 'text-amber-300' };
  }
  if (dist < 4.5) {
    return { level: 1, color: '#10b981', textClass: 'text-emerald-300' };
  }
  return { level: 0, color: '#334155', textClass: 'text-slate-500' };
}

function formatSensorMeters(dist: number): string {
  if (dist >= 5.9) return '>6m';
  return `${dist.toFixed(1)}m`;
}

const THEME_LABELS: Record<ArenaTheme, string> = {
  night: 'Gece',
  sunset: 'Gün Batımı',
  twilight: 'Şafak',
};

export const HudOverlay: React.FC<HudOverlayProps> = ({
  levelNumber,
  levelConfig,
  realWorldStreetName,
  tier,
  parTime,
  telemetry,
  cameraMode,
  arenaTheme,
  muted,
  toastAchievement,
  onCycleCamera,
  onToggleCockpit,
  onCycleTheme,
  onToggleHeadlights,
  onToggleMute,
  onRestart,
  onPause,
  onRearCameraRectChange,
  onTouchControl,
}) => {
  const [rearCamOpen, setRearCamOpen] = useState(true);
  const rearViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rearCamOpen) {
      onRearCameraRectChange(null);
      return;
    }

    const updateRect = () => {
      const el = rearViewportRef.current;
      if (!el) {
        onRearCameraRectChange(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width > 12 && r.height > 12) {
        onRearCameraRectChange({
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        });
      }
    };

    updateRect();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateRect)
        : null;
    if (ro && rearViewportRef.current) {
      ro.observe(rearViewportRef.current);
    }
    window.addEventListener('resize', updateRect);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateRect);
      onRearCameraRectChange(null);
    };
  }, [rearCamOpen, onRearCameraRectChange]);

  const remaining = Math.max(
    0,
    telemetry.timeLimit +
      telemetry.bonusTimeSec -
      telemetry.penaltyTimeSec -
      telemetry.elapsedTime,
  );
  const integrityLeft = Math.max(0, telemetry.maxCollisions - telemetry.collisions);
  const camLabel =
    cameraMode === 'chase'
      ? 'Takip'
      : cameraMode === 'cockpit'
        ? 'Kamera'
        : cameraMode === 'top'
          ? 'Kuşbakışı'
          : 'Kaput';

  const us = telemetry.ultrasonic;
  const sevFront = sensorSeverity(us.front);
  const sevRear = sensorSeverity(us.rear);
  const sevLeft = sensorSeverity(us.left);
  const sevRight = sensorSeverity(us.right);

  // Subtle curve offset for backup camera SVG trajectory lines based on wheel steerAngle
  const curveShift = Math.max(-28, Math.min(28, -telemetry.steerAngle * 42));
  const turboPct = Math.max(0, Math.min(100, Math.round(telemetry.turboEnergy)));

  const penaltyBadgeClass =
    telemetry.penaltyPoints >= 70
      ? 'text-rose-400'
      : telemetry.penaltyPoints > 0
        ? 'text-amber-300'
        : 'text-emerald-300';

  const sig = telemetry.approachingSignal;
  const alert = telemetry.activeTrafficAlert;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* Brief EDS Radar Camera Flash Overlay */}
      {telemetry.edsFlashActive && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 pointer-events-none bg-white/30"
        />
      )}

      {/* Top Row: Left Status Cluster + Center Traffic/Alert Cluster + Right Utility Controls */}
      <div className="flex flex-wrap items-start justify-between gap-2 md:gap-4">
        {/* Top-Left Cluster */}
        <div className="bg-[#0b111e]/90 border border-slate-700/80 rounded-xl px-3 py-2 md:px-4 md:py-2.5 shadow-xl flex items-center gap-2.5 md:gap-4">
          <div>
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {realWorldStreetName
                ? 'GERÇEK SOKAK'
                : levelConfig.highwayExit
                  ? 'OTOBAN ÇIKIŞI'
                  : levelConfig.archetype === 'grand_prix_arena'
                    ? 'ÖZEL PİST'
                    : 'SEVİYE'}
            </div>
            <div className="font-mono-num text-sm md:text-lg font-extrabold text-white leading-tight max-w-[115px] md:max-w-[175px] truncate">
              {realWorldStreetName ?? String(levelNumber).padStart(2, '0')}
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
              {telemetry.bonusTimeSec > 0 && (
                <span className="font-mono-num text-[10px] font-bold text-cyan-300">
                  +{telemetry.bonusTimeSec}s
                </span>
              )}
              {telemetry.penaltyTimeSec > 0 && (
                <span className="font-mono-num text-[10px] font-bold text-rose-400">
                  -{telemetry.penaltyTimeSec}s
                </span>
              )}
              <span className="hidden sm:inline font-mono-num text-xs text-slate-400">
                / Hedef {formatClock(parTime)}
              </span>
            </div>
          </div>

          {telemetry.totalCheckpoints > 0 && (
            <>
              <div className="h-7 md:h-8 w-px bg-slate-700/80" />
              <div data-testid="checkpoint-counter">
                <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  KAPI
                </div>
                <div className="font-mono-num text-sm md:text-base font-extrabold text-emerald-300 flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {telemetry.checkpointsPassed}/{telemetry.totalCheckpoints}
                  </span>
                </div>
              </div>
            </>
          )}

          {telemetry.totalTokens > 0 && (
            <>
              <div className="h-7 md:h-8 w-px bg-slate-700/80" />
              <div data-testid="token-counter">
                <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  KRİSTAL
                </div>
                <div className="font-mono-num text-sm md:text-base font-extrabold text-amber-300 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>
                    {telemetry.tokensCollected}/{telemetry.totalTokens}
                  </span>
                </div>
              </div>
            </>
          )}

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

          <div className="h-7 md:h-8 w-px bg-slate-700/80" />

          {/* Traffic Penalty Points Limit */}
          <div data-testid="penalty-points-hud">
            <div className="text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-400">
              CEZA PUAN
            </div>
            <div className={`font-mono-num text-sm md:text-base font-extrabold ${penaltyBadgeClass}`}>
              {telemetry.penaltyPoints}/{telemetry.maxPenaltyPoints}
            </div>
          </div>
        </div>

        {/* Mobile Compact 4-Way Ultrasonic Strip (visible < sm so center car stays unobstructed) */}
        <div className="flex sm:hidden items-center justify-between gap-2 w-full bg-[#0b111e]/88 border border-slate-700/75 rounded-xl px-3 py-1.5 text-[10px]">
          <span className="text-slate-400 font-bold tracking-wider">SENSÖR</span>
          <div className="flex items-center gap-2.5 font-mono-num font-bold">
            <span className={sevFront.textClass}>ÖN {formatSensorMeters(us.front)}</span>
            <span className={sevRear.textClass}>ARKA {formatSensorMeters(us.rear)}</span>
            <span className={sevLeft.textClass}>SOL {formatSensorMeters(us.left)}</span>
            <span className={sevRight.textClass}>SAĞ {formatSensorMeters(us.right)}</span>
          </div>
        </div>

        {/* Center Traffic Signal Approach + Situational Penalty/Bonus Banner + Achievement Toast */}
        <div className="flex flex-col items-center gap-2 mx-auto">
          {sig && (
            <div
              data-testid="traffic-signal-hud"
              className={`bg-[#0b111e]/92 border rounded-xl px-3 py-2 shadow-xl flex items-center gap-2.5 ${
                sig.color === 'red'
                  ? 'border-rose-500/80'
                  : sig.color === 'yellow'
                    ? 'border-amber-400/80'
                    : 'border-emerald-500/75'
              }`}
            >
              {/* 3-Lens Traffic Lamp Icon */}
              <div className="bg-slate-950 border border-slate-700 rounded-md px-1 py-1 flex flex-col gap-1">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    sig.color === 'red' ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-slate-800'
                  }`}
                />
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    sig.color === 'yellow' ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-800'
                  }`}
                />
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    sig.color === 'green' ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-800'
                  }`}
                />
              </div>
              <div className="leading-tight">
                <div
                  className={`text-xs font-extrabold tracking-wide ${
                    sig.color === 'red'
                      ? 'text-rose-400'
                      : sig.color === 'yellow'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                  }`}
                >
                  {sig.color === 'red'
                    ? 'KIRMIZI · DUR'
                    : sig.color === 'yellow'
                      ? 'SARI · YAVAŞLA'
                      : 'YEŞİL · GEÇ'}
                </div>
                <div className="font-mono-num text-[10px] text-slate-300">
                  {sig.remainingSec.toFixed(1)}s · {sig.distanceMeters}m
                </div>
              </div>
            </div>
          )}

          {alert && (
            <div
              data-testid="traffic-alert-banner"
              className={`rounded-xl px-4 py-2.5 shadow-2xl border flex items-center gap-3 ${
                alert.isBonus
                  ? 'bg-emerald-950/95 border-emerald-400/80 text-emerald-100'
                  : alert.severity === 'severe'
                    ? 'bg-rose-950/95 border-rose-500/85 text-rose-100'
                    : alert.severity === 'medium'
                      ? 'bg-amber-950/95 border-amber-500/85 text-amber-100'
                      : 'bg-slate-900/95 border-amber-400/60 text-amber-100'
              }`}
            >
              {alert.isBonus ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : alert.severity === 'severe' ? (
                <OctagonAlert className="w-5 h-5 text-rose-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider">
                  {alert.title}
                </div>
                <div className="text-[11px] font-mono-num opacity-95">
                  {alert.isBonus
                    ? `+${alert.scoreDelta} Puan · Kurala Uyum`
                    : `-${alert.scoreDelta} Puan${
                        alert.timePenaltySec > 0 ? ` · +${alert.timePenaltySec}sn Süre Cezası` : ''
                      } · +${alert.penaltyPoints} Ceza Puanı`}
                </div>
              </div>
            </div>
          )}

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
        </div>

        {/* Top-Right Compact Utility Buttons + Live Mini-Map Radar */}
        <div className="flex flex-col items-end gap-2 ml-auto">
          <div className="pointer-events-auto flex items-center gap-1.5 md:gap-2">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleHeadlights();
              }}
              aria-label={telemetry.headlightsOn ? 'Farları Kapat' : 'Farları Aç'}
              title={`LED Farlar: ${telemetry.headlightsOn ? 'Açık' : 'Kapalı'} [F]`}
              className={`h-9 md:h-10 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                telemetry.headlightsOn
                  ? 'bg-amber-400/18 border-amber-400/60 text-amber-200'
                  : 'bg-[#0b111e]/88 border-slate-700/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Lightbulb
                className={`w-4 h-4 ${
                  telemetry.headlightsOn ? 'text-amber-300' : 'text-slate-400'
                }`}
              />
              <span className="hidden xl:inline">Far</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleTheme();
              }}
              aria-label={`Atmosfer Değiştir (${THEME_LABELS[arenaTheme]})`}
              title={`Atmosfer: ${THEME_LABELS[arenaTheme]} [T]`}
              className="h-9 md:h-10 px-2.5 rounded-xl bg-[#0b111e]/88 hover:bg-slate-800 border border-slate-700/80 text-slate-100 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              {arenaTheme === 'night' ? (
                <Moon className="w-4 h-4 text-indigo-300" />
              ) : arenaTheme === 'sunset' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-cyan-300" />
              )}
              <span className="hidden lg:inline">{THEME_LABELS[arenaTheme]}</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setRearCamOpen((v) => !v);
              }}
              aria-label={rearCamOpen ? 'Geri Kamerayı Gizle' : 'Geri Kamerayı Göster'}
              title="Geri Görüş Kamerası Aç/Kapat"
              className={`h-9 md:h-10 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                rearCamOpen
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
                  : 'bg-[#0b111e]/88 border-slate-700/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {rearCamOpen ? (
                <Eye className="w-4 h-4 text-cyan-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-slate-400" />
              )}
              <span className="hidden lg:inline">Geri Kam</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-testid="cockpit-toggle"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleCockpit();
              }}
              aria-label={cameraMode === 'cockpit' ? 'Kokpit Görünümünden Çık' : 'Kokpit Görünümü'}
              title="İç Mekan Kokpit Görünümü [V]"
              className={`h-9 md:h-10 px-2.5 md:px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                cameraMode === 'cockpit'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-[#0b111e]/88 hover:bg-slate-800 border-slate-700/80 text-slate-200'
              }`}
            >
              <Gauge
                className={`w-4 h-4 ${
                  cameraMode === 'cockpit' ? 'text-emerald-300' : 'text-emerald-400'
                }`}
              />
              <span className="hidden sm:inline">Kokpit</span>
            </button>

            <button
              type="button"
              tabIndex={-1}
              data-testid="camera-cycle"
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

          <MiniMap
            level={levelConfig}
            playerPose={telemetry.playerPose}
            nearestWalls={telemetry.nearestWalls}
            collectedTokenIds={telemetry.collectedTokenIds}
            passedCheckpointIds={telemetry.passedCheckpointIds}
            elapsedTime={telemetry.elapsedTime}
            distanceToBay={telemetry.distanceToBay}
          />
        </div>
      </div>

      {/* Bottom Row: Rear-View Camera PiP (Bottom-Left) + Touch Controls (Mobile) + Ultrasonic & Turbo Tachometer (Bottom-Right) */}
      <div className="flex flex-col-reverse md:flex-row md:items-end justify-between gap-2 md:gap-4">
        {/* Left Slot: Rear-View Backup Camera Frame + Mobile Touch Controls */}
        <div className="flex items-end justify-between md:justify-start gap-2 w-full md:w-auto">
          {rearCamOpen && (
            <div
              data-testid="rear-camera-panel"
              className={`pointer-events-auto shrink-0 rounded-xl overflow-hidden border-2 shadow-2xl bg-transparent flex flex-col ${
                telemetry.gear === 'R'
                  ? 'border-amber-400'
                  : 'border-slate-600/90'
              }`}
            >
              {/* Camera Header Bar */}
              <div className="bg-[#0b111e]/92 px-2 py-1 flex items-center justify-between gap-2 border-b border-slate-700/80">
                <div className="flex items-center gap-1 text-[9px] md:text-[10px] font-bold tracking-wider text-slate-200 whitespace-nowrap">
                  <Video
                    className={`w-3 h-3 shrink-0 ${
                      telemetry.gear === 'R' ? 'text-rose-400' : 'text-cyan-400'
                    }`}
                  />
                  <span>GERİ GÖRÜŞ</span>
                </div>
                <span
                  className={`font-mono-num text-[9px] md:text-[10px] font-bold whitespace-nowrap ${sevRear.textClass}`}
                >
                  {formatSensorMeters(us.rear)}
                </span>
              </div>

              {/* Transparent WebGL Scissor Cutout + Reversing Trajectory SVG */}
              <div
                ref={rearViewportRef}
                className="relative w-[136px] h-[82px] md:w-[228px] md:h-[136px] bg-transparent"
              >
                <svg
                  viewBox="0 0 220 130"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  aria-hidden="true"
                >
                  <path
                    d={`M 48 128 Q ${64 + curveShift * 0.55} 72 ${82 + curveShift} 28`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.4"
                    strokeDasharray="7 5"
                    opacity="0.88"
                  />
                  <path
                    d={`M 172 128 Q ${156 + curveShift * 0.55} 72 ${138 + curveShift} 28`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.4"
                    strokeDasharray="7 5"
                    opacity="0.88"
                  />
                  <line
                    x1={70 + curveShift * 0.5}
                    y1="72"
                    x2={150 + curveShift * 0.5}
                    y2="72"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    opacity="0.85"
                  />
                  <line
                    x1={56 + curveShift * 0.2}
                    y1="104"
                    x2={164 + curveShift * 0.2}
                    y2="104"
                    stroke="#f43f5e"
                    strokeWidth="2.5"
                    opacity="0.92"
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Mobile Touch Controls (md:hidden) */}
          <div className="pointer-events-auto flex md:hidden items-center gap-1 ml-auto">
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('left', true)}
              onPointerUp={() => onTouchControl('left', false)}
              onPointerLeave={() => onTouchControl('left', false)}
              onPointerCancel={() => onTouchControl('left', false)}
              aria-label="Sola Dön"
              className="w-10 h-11 rounded-xl bg-[#0b111e]/90 border border-slate-600 text-white font-bold text-base active:bg-emerald-500 active:text-slate-950"
            >
              ◀
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('right', true)}
              onPointerUp={() => onTouchControl('right', false)}
              onPointerLeave={() => onTouchControl('right', false)}
              onPointerCancel={() => onTouchControl('right', false)}
              aria-label="Sağa Dön"
              className="w-10 h-11 rounded-xl bg-[#0b111e]/90 border border-slate-600 text-white font-bold text-base active:bg-emerald-500 active:text-slate-950"
            >
              ▶
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('brake', true)}
              onPointerUp={() => onTouchControl('brake', false)}
              onPointerLeave={() => onTouchControl('brake', false)}
              onPointerCancel={() => onTouchControl('brake', false)}
              aria-label="Fren ve Geri"
              className="w-10 h-11 rounded-xl bg-rose-950/90 border border-rose-500/70 text-rose-200 font-bold text-[10px]"
            >
              FREN
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('throttle', true)}
              onPointerUp={() => onTouchControl('throttle', false)}
              onPointerLeave={() => onTouchControl('throttle', false)}
              onPointerCancel={() => onTouchControl('throttle', false)}
              aria-label="Gaz"
              className="w-10 h-11 rounded-xl bg-emerald-950/90 border border-emerald-500/70 text-emerald-200 font-bold text-[10px]"
            >
              GAZ
            </button>
            <button
              type="button"
              tabIndex={-1}
              onPointerDown={() => onTouchControl('turbo', true)}
              onPointerUp={() => onTouchControl('turbo', false)}
              onPointerLeave={() => onTouchControl('turbo', false)}
              onPointerCancel={() => onTouchControl('turbo', false)}
              aria-label="Turbo NOS"
              className="w-10 h-11 rounded-xl bg-cyan-950/90 border border-cyan-400/70 text-cyan-200 font-bold text-[10px] flex items-center justify-center"
            >
              NOS
            </button>
            {telemetry.vehicleModel === 'hover_thruster' && (
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={() => onTouchControl('hover', true)}
                onPointerUp={() => onTouchControl('hover', false)}
                onPointerLeave={() => onTouchControl('hover', false)}
                onPointerCancel={() => onTouchControl('hover', false)}
                aria-label="Roket İtici Yüksel"
                className="w-11 h-11 rounded-xl bg-sky-950/90 border border-sky-400/80 text-sky-200 font-bold text-[10px] flex items-center justify-center"
              >
                ROKET
              </button>
            )}
          </div>
        </div>

        {/* Right Side: 4-Way Ultrasonic Proximity Radar (sm+) + Digital Speedometer & Turbo Bar */}
        <div className="w-full md:w-auto self-end flex flex-col sm:flex-row items-stretch sm:items-end justify-end gap-2 md:gap-3">
          {/* 4-Way Ultrasonic Distance Sensor Panel (Desktop/Tablet) */}
          <div
            data-testid="ultrasonic-radar"
            className="hidden sm:flex bg-[#0b111e]/90 border border-slate-700/80 rounded-2xl px-3 py-2.5 shadow-xl items-center gap-3"
          >
            <svg
              viewBox="0 0 88 96"
              className="w-[74px] h-[82px] shrink-0"
              aria-label="4 Yönlü Ultrasonik Mesafe Sensörü"
            >
              {[0, 1, 2].map((ring) => (
                <path
                  key={`f-${ring}`}
                  d={`M ${30 - ring * 5} ${22 - ring * 6} Q 44 ${15 - ring * 7} ${58 + ring * 5} ${22 - ring * 6}`}
                  fill="none"
                  stroke={sevFront.level >= 3 - ring ? sevFront.color : '#1e293b'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
              {[0, 1, 2].map((ring) => (
                <path
                  key={`r-${ring}`}
                  d={`M ${30 - ring * 5} ${74 + ring * 6} Q 44 ${81 + ring * 7} ${58 + ring * 5} ${74 + ring * 6}`}
                  fill="none"
                  stroke={sevRear.level >= 3 - ring ? sevRear.color : '#1e293b'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
              {[0, 1, 2].map((ring) => (
                <path
                  key={`l-${ring}`}
                  d={`M ${25 - ring * 6} ${34 - ring * 4} Q ${18 - ring * 7} 48 ${25 - ring * 6} ${62 + ring * 4}`}
                  fill="none"
                  stroke={sevLeft.level >= 3 - ring ? sevLeft.color : '#1e293b'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
              {[0, 1, 2].map((ring) => (
                <path
                  key={`rg-${ring}`}
                  d={`M ${63 + ring * 6} ${34 - ring * 4} Q ${70 + ring * 7} 48 ${63 + ring * 6} ${62 + ring * 4}`}
                  fill="none"
                  stroke={sevRight.level >= 3 - ring ? sevRight.color : '#1e293b'}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}

              <rect
                x="32"
                y="26"
                width="24"
                height="44"
                rx="6"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <rect x="35" y="34" width="18" height="10" rx="2" fill="#38bdf8" opacity="0.55" />
              <rect x="36" y="54" width="16" height="8" rx="2" fill="#38bdf8" opacity="0.35" />
            </svg>

            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-[10px]">
              <div>
                <div className="text-slate-400 uppercase tracking-wider">ÖN</div>
                <div className={`font-mono-num font-bold ${sevFront.textClass}`}>
                  {formatSensorMeters(us.front)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 uppercase tracking-wider">ARKA</div>
                <div className={`font-mono-num font-bold ${sevRear.textClass}`}>
                  {formatSensorMeters(us.rear)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 uppercase tracking-wider">SOL</div>
                <div className={`font-mono-num font-bold ${sevLeft.textClass}`}>
                  {formatSensorMeters(us.left)}
                </div>
              </div>
              <div>
                <div className="text-slate-400 uppercase tracking-wider">SAĞ</div>
                <div className={`font-mono-num font-bold ${sevRight.textClass}`}>
                  {formatSensorMeters(us.right)}
                </div>
              </div>
            </div>
          </div>

          {/* Speedometer + Turbo NOS Boost + Parking Alignment */}
          <div className="bg-[#0b111e]/92 border border-slate-700/80 rounded-2xl px-3 py-2 md:px-4 md:py-3 shadow-xl w-full md:w-auto md:min-w-[244px]">
            <div className="flex items-center justify-between gap-3 md:gap-4">
              <div className="flex items-baseline gap-1.5 md:gap-2">
                <span
                  className={`font-mono-num text-lg md:text-2xl font-extrabold leading-none ${
                    telemetry.gear === 'R'
                      ? 'text-rose-400'
                      : telemetry.gear === 'P'
                        ? 'text-cyan-400'
                        : telemetry.gear === 'N'
                          ? 'text-slate-300'
                          : 'text-emerald-400'
                  }`}
                >
                  {telemetry.gear}
                </span>
                <span className="font-mono-num text-xl md:text-3xl font-extrabold text-white leading-none">
                  {telemetry.speedKmh}
                </span>
                <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-400">
                  KM/S
                </span>
                {(telemetry.boostPadActive ||
                  telemetry.isDrifting ||
                  telemetry.comboCount > 1 ||
                  telemetry.vehicleModel === 'drift_pro' ||
                  telemetry.vehicleModel === 'apex_hyper') && (
                  <span className="font-mono-num text-[10px] font-extrabold text-amber-300 ml-1">
                    {telemetry.boostPadActive
                      ? 'HIZ+'
                      : telemetry.vehicleModel === 'apex_hyper' && telemetry.turboActive
                        ? 'DRS+'
                        : telemetry.isDrifting
                          ? 'DRİFT'
                          : telemetry.comboCount > 1
                            ? `x${telemetry.comboCount}`
                            : telemetry.vehicleModel === 'apex_hyper'
                              ? 'APEX 4WS'
                              : 'DRİFT PRO'}
                  </span>
                )}
              </div>

              {/* Inline Mobile Turbo Bar (< md) */}
              <div className="flex md:hidden items-center gap-2 flex-1 max-w-[130px]">
                <Flame
                  className={`w-3.5 h-3.5 shrink-0 ${
                    telemetry.turboActive ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                />
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      telemetry.turboActive ? 'bg-amber-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${turboPct}%` }}
                  />
                </div>
                <span className="font-mono-num text-[10px] font-bold text-cyan-200">
                  {turboPct}%
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

            {/* Desktop Turbo NOS Bar + Hold Button (md+) */}
            <div className="hidden md:flex mt-2 items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                  <span className="inline-flex items-center gap-1 font-bold text-cyan-300">
                    <Flame
                      className={`w-3 h-3 ${
                        telemetry.turboActive ? 'text-amber-400' : 'text-cyan-400'
                      }`}
                    />
                    TURBO (NOS)
                  </span>
                  <span className="font-mono-num text-cyan-200">{turboPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      telemetry.turboActive ? 'bg-amber-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${turboPct}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={() => onTouchControl('turbo', true)}
                onPointerUp={() => onTouchControl('turbo', false)}
                onPointerLeave={() => onTouchControl('turbo', false)}
                onPointerCancel={() => onTouchControl('turbo', false)}
                title="Turbo Hızlandırma [Shift]"
                className={`pointer-events-auto px-2 py-1 rounded-lg border text-[10px] font-extrabold tracking-wide cursor-pointer select-none ${
                  telemetry.turboActive
                    ? 'bg-amber-400 border-amber-300 text-slate-950'
                    : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/25'
                }`}
              >
                SHIFT
              </button>
            </div>

            {/* Hover Thruster Altitude & Charge Bar (Tesla Hover Roadster only) */}
            {telemetry.vehicleModel === 'hover_thruster' && (
              <div data-testid="hover-thruster-hud" className="mt-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                    <span className="inline-flex items-center gap-1 font-bold text-sky-300 whitespace-nowrap">
                      <Rocket
                        className={`w-3 h-3 shrink-0 ${
                          telemetry.hoverActive ? 'text-sky-200' : 'text-sky-400'
                        }`}
                      />
                      ROKET · {telemetry.hoverY.toFixed(1)}m
                    </span>
                    <span className="font-mono-num text-sky-200 whitespace-nowrap">
                      {telemetry.hoverY >= 1.72 ? 'DUVAR ÜSTÜ' : `${telemetry.hoverEnergy}%`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 ${
                        telemetry.hoverY >= 1.72 ? 'bg-emerald-400' : 'bg-sky-400'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, telemetry.hoverEnergy))}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onPointerDown={() => onTouchControl('hover', true)}
                  onPointerUp={() => onTouchControl('hover', false)}
                  onPointerLeave={() => onTouchControl('hover', false)}
                  onPointerCancel={() => onTouchControl('hover', false)}
                  title="Alttan Roket İticiyle Duvarların Üzerinden Geç [E]"
                  className={`pointer-events-auto px-2 py-1 rounded-lg border text-[10px] font-extrabold tracking-wide cursor-pointer select-none ${
                    telemetry.hoverActive
                      ? 'bg-sky-400 border-sky-200 text-slate-950'
                      : 'bg-sky-500/15 border-sky-400/50 text-sky-200 hover:bg-sky-500/25'
                  }`}
                >
                  E İTİCİ
                </button>
              </div>
            )}

            {/* Parking Hold Progress / Alignment Bar */}
            <div className="mt-1.5 md:mt-2">
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
              <div className="h-1.5 md:h-2 rounded-full bg-slate-800 overflow-hidden">
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
    </div>
  );
};

