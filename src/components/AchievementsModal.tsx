import React from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  Crown,
  Flame,
  Lock,
  Palette,
  RotateCcw,
  Shield,
  Star,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { ACHIEVEMENTS } from '../game/achievements';
import type { AchievementDef, PlayerProgress } from '../types/game';

interface AchievementsModalProps {
  progress: PlayerProgress;
  onClose: () => void;
}

function renderIcon(icon: AchievementDef['icon'], unlocked: boolean) {
  const cls = `w-5 h-5 ${unlocked ? 'text-amber-300' : 'text-slate-500'}`;
  switch (icon) {
    case 'trophy':
      return <Trophy className={cls} />;
    case 'shield':
      return <Shield className={cls} />;
    case 'zap':
      return <Zap className={cls} />;
    case 'compass':
      return <Compass className={cls} />;
    case 'reverse':
      return <RotateCcw className={cls} />;
    case 'palette':
      return <Palette className={cls} />;
    case 'flame':
      return <Flame className={cls} />;
    case 'star':
      return <Star className={cls} />;
    case 'target':
      return <Target className={cls} />;
    case 'crown':
      return <Crown className={cls} />;
  }
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  progress,
  onClose,
}) => {
  const unlockedSet = new Set(progress.unlockedAchievements);
  const totalPoints = ACHIEVEMENTS.reduce(
    (sum, a) => sum + (unlockedSet.has(a.id) ? a.points : 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-40 bg-[#050811]/82 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Başarımlar"
    >
      <div className="w-full max-w-3xl bg-[#0d1424] border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Başarımlar</h2>
            <span className="font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300">
              {unlockedSet.size} / {ACHIEVEMENTS.length} · {totalPoints} Puan
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Başarımları Kapat"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ACHIEVEMENTS.map((ach) => {
            const unlocked = unlockedSet.has(ach.id);
            return (
              <div
                key={ach.id}
                className={`rounded-xl border p-4 flex items-start gap-3.5 ${
                  unlocked
                    ? 'bg-emerald-950/35 border-emerald-500/50'
                    : 'bg-slate-900/75 border-slate-800'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    unlocked ? 'bg-amber-500/20' : 'bg-slate-800'
                  }`}
                >
                  {renderIcon(ach.icon, unlocked)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-sm font-bold ${
                        unlocked ? 'text-white' : 'text-slate-400'
                      }`}
                    >
                      {ach.title}
                    </h3>
                    {unlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{ach.description}</p>
                  <div className="font-mono-num text-[11px] font-bold text-amber-400 mt-1.5">
                    +{ach.points} Puan
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
