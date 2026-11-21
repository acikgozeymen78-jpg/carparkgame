import React, { useState } from 'react';
import { Trophy, X, User } from 'lucide-react';
import type { DifficultyTier, PlayerProgress } from '../types/game';
import {
  buildGlobalLeaderboard,
  buildLevelLeaderboard,
} from '../game/leaderboard';
import { TIER_LABELS } from '../game/difficulty';

interface LeaderboardModalProps {
  progress: PlayerProgress;
  activeTier: DifficultyTier;
  currentLevel: number;
  onUpdateName: (name: string) => void;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  progress,
  activeTier,
  currentLevel,
  onUpdateName,
  onClose,
}) => {
  const [tab, setTab] = useState<'global' | 'level'>('global');
  const [selectedLvl, setSelectedLvl] = useState<number>(currentLevel);
  const [nameInput, setNameInput] = useState(progress.playerName);

  const entries =
    tab === 'global'
      ? buildGlobalLeaderboard(progress, activeTier)
      : buildLevelLeaderboard(selectedLvl, progress, activeTier);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed) onUpdateName(trimmed.slice(0, 18));
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#050811]/82 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Liderlik Tabloları"
    >
      <div className="w-full max-w-2xl bg-[#0d1424] border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Liderlik Tablosu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Liderlik Tablosunu Kapat"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Player Callsign Editor */}
          <form
            onSubmit={handleSaveName}
            className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl p-3"
          >
            <label
              htmlFor="driver-callsign"
              className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sürücü Adı:</span>
            </label>
            <input
              id="driver-callsign"
              type="text"
              maxLength={18}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="flex-1 min-w-[140px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Kaydet
            </button>
          </form>

          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTab('global')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                  tab === 'global'
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                Genel Sıralama
              </button>
              <button
                type="button"
                onClick={() => setTab('level')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                  tab === 'level'
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                Seviye Bazlı
              </button>
            </div>

            {tab === 'level' && (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLvl(lvl)}
                    className={`font-mono-num w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${
                      selectedLvl === lvl
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Sürücü</th>
                  <th className="py-2.5 px-3">Zorluk</th>
                  <th className="py-2.5 px-3 text-right">Seviye</th>
                  <th className="py-2.5 px-3 text-right">En İyi Süre</th>
                  <th className="py-2.5 px-3 text-right">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={
                      entry.isPlayer
                        ? 'bg-emerald-500/15 text-emerald-200 font-semibold'
                        : 'text-slate-200'
                    }
                  >
                    <td className="py-2.5 px-3 font-mono-num font-bold">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      {entry.name}
                      {entry.isPlayer && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold">
                          SEN
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-amber-300">
                      {TIER_LABELS[entry.tier]}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {entry.levelReached}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-cyan-300">
                      {entry.bestTime > 0 ? `${entry.bestTime.toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-bold text-white">
                      {entry.score.toLocaleString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
