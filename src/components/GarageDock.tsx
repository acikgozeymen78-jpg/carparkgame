import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import type {
  DecalStyleId,
  PaintFinishId,
  RimStyleId,
  SpoilerStyleId,
  UnderglowColorId,
  VehicleCustomization,
} from '../types/game';
import {
  DECAL_LABELS,
  PAINT_PRESETS,
  RIM_LABELS,
  SPOILER_LABELS,
  UNDERGLOW_PRESETS,
} from '../game/carBuilder';

interface GarageDockProps {
  customization: VehicleCustomization;
  onChange: (next: VehicleCustomization) => void;
  onClose: () => void;
}

type GarageTab = 'paint' | 'rim' | 'spoiler' | 'underglow' | 'decal';

const TABS: Array<{ id: GarageTab; label: string }> = [
  { id: 'paint', label: 'Boya' },
  { id: 'rim', label: 'Jant' },
  { id: 'spoiler', label: 'Kanat' },
  { id: 'underglow', label: 'Neon' },
  { id: 'decal', label: 'Desen' },
];

export const GarageDock: React.FC<GarageDockProps> = ({
  customization,
  onChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<GarageTab>('paint');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Minimal Top-Left Back Button (Unobstructed Center Viewport) */}
      <div className="fixed top-5 left-5 z-30 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-[#0b111e]/92 hover:bg-slate-800 border border-slate-700 text-white text-sm font-semibold flex items-center gap-2 shadow-xl cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          <span>MENÜYE DÖN</span>
        </button>
        <div className="bg-[#0b111e]/88 border border-slate-700/80 rounded-xl px-4 py-2 text-xs uppercase tracking-widest text-slate-300">
          3D ARAÇ ÖZELLEŞTİRME GARAJI
        </div>
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-30 w-[min(920px,94vw)] transition-transform duration-200 ${
          collapsed ? 'translate-y-[calc(100%-36px)] bottom-3' : 'bottom-5'
        }`}
      >
        {/* Collapse Toggle Handle */}
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="px-3.5 py-1 rounded-t-xl bg-[#0b111e]/92 border border-b-0 border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Paneli Aç</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Paneli Gizle</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#0b111e]/94 border border-slate-700/85 rounded-2xl p-4 shadow-2xl">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Options Row */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'paint' &&
              (Object.keys(PAINT_PRESETS) as PaintFinishId[]).map((id) => {
                const preset = PAINT_PRESETS[id];
                const selected = customization.paint === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...customization, paint: id })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-slate-800 border-emerald-400 text-white'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/30"
                      style={{ backgroundColor: preset.css }}
                    />
                    <span>{preset.name}</span>
                  </button>
                );
              })}

            {activeTab === 'rim' &&
              (Object.keys(RIM_LABELS) as RimStyleId[]).map((id) => {
                const selected = customization.rim === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...customization, rim: id })}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {RIM_LABELS[id]}
                  </button>
                );
              })}

            {activeTab === 'spoiler' &&
              (Object.keys(SPOILER_LABELS) as SpoilerStyleId[]).map((id) => {
                const selected = customization.spoiler === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...customization, spoiler: id })}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {SPOILER_LABELS[id]}
                  </button>
                );
              })}

            {activeTab === 'underglow' &&
              (Object.keys(UNDERGLOW_PRESETS) as UnderglowColorId[]).map((id) => {
                const preset = UNDERGLOW_PRESETS[id];
                const selected = customization.underglow === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...customization, underglow: id })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-slate-800 border-cyan-400 text-white'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/25"
                      style={{ backgroundColor: preset.css }}
                    />
                    <span>{preset.name}</span>
                  </button>
                );
              })}

            {activeTab === 'decal' &&
              (Object.keys(DECAL_LABELS) as DecalStyleId[]).map((id) => {
                const selected = customization.decal === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...customization, decal: id })}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {DECAL_LABELS[id]}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
};
