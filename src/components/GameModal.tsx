import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Car,
  Home,
  Play,
  RotateCcw,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { GamePhase, RunResult } from '../types/game';
import { TIER_LABELS } from '../game/difficulty';
import { ACHIEVEMENTS } from '../game/achievements';

interface GameModalProps {
  phase: GamePhase;
  levelNumber: number;
  realWorldStreetName?: string;
  lastRun: RunResult | null;
  onResume: () => void;
  onRetry: () => void;
  onNextLevel: () => void;
  onPickNewStreet?: () => void;
  onOpenGarage: () => void;
  onReturnTitle: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  phase,
  levelNumber,
  realWorldStreetName,
  lastRun,
  onResume,
  onRetry,
  onNextLevel,
  onPickNewStreet,
  onOpenGarage,
  onReturnTitle,
}) => {
  if (phase !== 'paused' && phase !== 'gameover') return null;

  if (phase === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 bg-[#050811]/78 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Oyun Duraklatıldı"
      >
        <div className="w-full max-w-sm bg-[#0d1424] border border-slate-700 rounded-2xl p-6 shadow-2xl text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-400 font-bold mb-1 truncate">
            {realWorldStreetName ? `GERÇEK SOKAK · ${realWorldStreetName}` : `SEVİYE ${levelNumber}`}
          </div>
          <h2 className="text-2xl font-bold text-white mb-6">Oyun Duraklatıldı</h2>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>DEVAM ET</span>
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>YENİDEN BAŞLAT</span>
            </button>
            <button
              type="button"
              onClick={onOpenGarage}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Car className="w-4 h-4 text-cyan-400" />
              <span>GARAJ</span>
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>ANA MENÜ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!lastRun) return null;

  const isVictory = lastRun.victory;
  const achMap = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

  return (
    <div
      className="fixed inset-0 z-30 bg-[#050811]/82 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Park Başarılı' : 'Park Başarısız'}
    >
      <div className="w-full max-w-md bg-[#0d1424] border border-slate-700 rounded-2xl p-6 shadow-2xl">
        <div className="text-center">
          <div
            className={`text-xs uppercase tracking-[0.22em] font-bold mb-1 ${
              isVictory ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {lastRun.isRealWorld
              ? `${lastRun.realWorldStreetName ?? 'Gerçek Sokak'} · ${TIER_LABELS[lastRun.tier]}`
              : `SEVİYE ${lastRun.levelNumber} · ${TIER_LABELS[lastRun.tier]}`}
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            {isVictory
              ? 'KUSURSUZ PARK!'
              : lastRun.reason === 'penalty_limit'
                ? 'CEZA LİMİTİ AŞILDI'
                : lastRun.reason === 'wrecked'
                  ? 'ARAÇ HASAR ALDI'
                  : 'SÜRE DOLDU'}
          </h2>
          {lastRun.reason === 'penalty_limit' && (
            <p className="text-xs text-rose-300 mt-1">
              100 ceza puanı dolduğu için sürüş sonlandırıldı.
            </p>
          )}

          {/* Star Rating */}
          {isVictory && (
            <div className="flex items-center justify-center gap-2 my-3">
              {[1, 2, 3].map((idx) => (
                <Star
                  key={idx}
                  className={`w-8 h-8 ${
                    idx <= lastRun.stars
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-700'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mastery Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              SÜRE
            </div>
            <div className="font-mono-num text-xl font-bold text-white mt-0.5">
              {lastRun.elapsedTime.toFixed(1)}s
            </div>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              ÇARPIŞMA
            </div>
            <div className="font-mono-num text-xl font-bold text-amber-300 mt-0.5">
              {lastRun.collisions}
            </div>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              SKOR
            </div>
            <div className="font-mono-num text-xl font-bold text-emerald-400 mt-0.5">
              {isVictory ? lastRun.score.toLocaleString('tr-TR') : 0}
            </div>
          </div>
        </div>

        {(lastRun.totalTokens ?? 0) > 0 && (
          <div className="mb-3 rounded-xl px-3.5 py-2 border border-amber-500/35 bg-amber-500/10 flex items-center justify-between text-xs font-semibold text-amber-200">
            <span className="inline-flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Toplanan Kristal &amp; Yıldız</span>
            </span>
            <span className="font-mono-num">
              {lastRun.tokensCollected ?? 0}/{lastRun.totalTokens}
              {(lastRun.bonusScore ?? 0) > 0 ? ` (+${lastRun.bonusScore} puan)` : ''}
            </span>
          </div>
        )}

        {(lastRun.violationCount ?? 0) > 0 && (
          <div
            data-testid="penalty-summary-card"
            className="mb-4 rounded-xl px-3.5 py-2.5 border border-rose-500/40 bg-rose-950/35 text-xs"
          >
            <div className="flex items-center justify-between font-bold text-rose-200 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Trafik &amp; Sürüş Cezaları ({lastRun.violationCount})</span>
              </span>
              <span className="font-mono-num text-rose-300">
                {lastRun.penaltyPoints ?? 0}/100 Puan
              </span>
            </div>
            <div className="font-mono-num text-[11px] text-rose-200/90 flex items-center justify-between">
              <span>Kesilen Skor: -{lastRun.penaltyScore ?? 0}</span>
              {(lastRun.penaltyTimeSec ?? 0) > 0 && (
                <span>Ek Süre Cezası: +{lastRun.penaltyTimeSec}sn</span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Difficulty Shift Notice */}
        {lastRun.difficultyShift !== 'steady' && (
          <div
            className={`mb-4 rounded-xl px-3.5 py-2.5 border flex items-center gap-2.5 text-xs font-semibold ${
              lastRun.difficultyShift === 'up'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
            }`}
          >
            {lastRun.difficultyShift === 'up' ? (
              <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span>
              Dinamik Zorluk{' '}
              {lastRun.difficultyShift === 'up' ? 'Yükseldi' : 'Dengelendi'}:{' '}
              <strong>{TIER_LABELS[lastRun.newTier]}</strong>
            </span>
          </div>
        )}

        {/* Newly Unlocked Achievements */}
        {lastRun.newlyUnlockedAchievements.length > 0 && (
          <div className="mb-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold mb-1.5 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />
              <span>Yeni Başarımlar</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lastRun.newlyUnlockedAchievements.map((id) => {
                const def = achMap.get(id);
                if (!def) return null;
                return (
                  <span
                    key={id}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                  >
                    {def.title} (+{def.points})
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary CTA + Secondary Actions */}
        <div className="space-y-2.5">
          {isVictory ? (
            lastRun.isRealWorld && onPickNewStreet ? (
              <button
                type="button"
                data-start="true"
                onClick={onPickNewStreet}
                className="w-full py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>YENİ GERÇEK SOKAK SEÇ</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                data-start="true"
                onClick={onNextLevel}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>SONRAKİ SEVİYE ({lastRun.levelNumber + 1})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRetry}
              className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>TEKRAR DENE</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenGarage}
              className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Car className="w-4 h-4 text-cyan-400" />
              <span>Garaj</span>
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Ana Menü</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
