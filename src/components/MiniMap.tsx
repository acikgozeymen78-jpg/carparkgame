import React, { useMemo, useState } from 'react';
import { Compass, Map as MapIcon, Minimize2, Maximize2, Radar } from 'lucide-react';
import type { LevelConfig, NearestWallHit, PlayerPose } from '../types/game';
import { computeMiniMapBounds, computeRelativeBayBearing } from '../game/minimap';
import { getMovingGateAABB } from '../game/physics';
import { ARCHETYPE_LABELS } from '../game/difficulty';
import { evaluateTrafficLightState } from '../game/trafficLights';

interface MiniMapProps {
  level: LevelConfig;
  playerPose: PlayerPose;
  nearestWalls: NearestWallHit[];
  collectedTokenIds: string[];
  passedCheckpointIds: string[];
  elapsedTime: number;
  distanceToBay: number;
}

const SVG_SIZE = 160;

export const MiniMap: React.FC<MiniMapProps> = ({
  level,
  playerPose,
  nearestWalls,
  collectedTokenIds,
  passedCheckpointIds,
  elapsedTime,
  distanceToBay,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const bounds = useMemo(() => computeMiniMapBounds(level, 1.2), [level]);

  const scale = SVG_SIZE / bounds.size;
  const toSvgX = (wx: number) => (wx - bounds.minX) * scale;
  const toSvgY = (wz: number) => (wz - bounds.minZ) * scale;

  const nearestMap = useMemo(() => {
    const map = new Map<number, NearestWallHit>();
    for (const hit of nearestWalls) {
      map.set(hit.wallIndex, hit);
    }
    return map;
  }, [nearestWalls]);

  const px = toSvgX(playerPose.x);
  const py = toSvgY(playerPose.z);
  const bayX = toSvgX(level.parking.x);
  const bayY = toSvgY(level.parking.z);

  const bearing = computeRelativeBayBearing(
    playerPose.x,
    playerPose.z,
    playerPose.yaw,
    level.parking.x,
    level.parking.z,
  );

  // Player chevron polygon directly from world forward/right basis (matches physics.ts)
  const fx = Math.sin(playerPose.yaw);
  const fz = Math.cos(playerPose.yaw);
  const rx = Math.cos(playerPose.yaw);
  const rz = -Math.sin(playerPose.yaw);
  const playerPoints = [
    `${(px + fx * 6.8).toFixed(1)},${(py + fz * 6.8).toFixed(1)}`,
    `${(px - fx * 4.6 + rx * 4.4).toFixed(1)},${(py - fz * 4.6 + rz * 4.4).toFixed(1)}`,
    `${(px - fx * 2.2).toFixed(1)},${(py - fz * 2.2).toFixed(1)}`,
    `${(px - fx * 4.6 - rx * 4.4).toFixed(1)},${(py - fz * 4.6 - rz * 4.4).toFixed(1)}`,
  ].join(' ');

  const bayW = Math.max(4, level.parking.width * scale);
  const bayL = Math.max(6, level.parking.length * scale);
  const bayRotDeg = (-level.parking.yaw * 180) / Math.PI;

  const closestWall = nearestWalls[0] ?? null;
  const wallStatusColor = !closestWall
    ? 'text-slate-400'
    : closestWall.distance < 2.6
      ? 'text-rose-400'
      : closestWall.distance < 5.5
        ? 'text-amber-300'
        : 'text-emerald-300';

  const archetypeTitle = level.realWorld
    ? 'Gerçek Sokak'
    : level.archetype
      ? ARCHETYPE_LABELS[level.archetype]
      : 'Labirent';

  return (
    <div
      data-testid="minimap-panel"
      aria-label="Mini Harita ve Yakın Duvar Radarı"
      className="pointer-events-auto self-end bg-[#0b111e]/92 border border-slate-700/85 rounded-2xl shadow-2xl overflow-hidden w-[124px] sm:w-[172px]"
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-slate-800 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 min-w-0">
          <MapIcon className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-200 truncate">
            MİNİ HARİTA
          </span>
        </div>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            setCollapsed((v) => !v);
          }}
          aria-label={collapsed ? 'Mini Haritayı Genişlet' : 'Mini Haritayı Küçült'}
          title={collapsed ? 'Mini Haritayı Aç' : 'Mini Haritayı Küçült'}
          className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
        >
          {collapsed ? (
            <Maximize2 className="w-3 h-3" />
          ) : (
            <Minimize2 className="w-3 h-3" />
          )}
        </button>
      </div>

      {!collapsed ? (
        <>
          {/* SVG Top-Down Map + Nearest Wall Radar */}
          <div className="relative bg-[#070b14] p-1.5">
            <svg
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
              className="w-full h-auto block rounded-lg border border-slate-800/80 bg-[#070b14]"
              data-testid="minimap-svg"
            >
              {/* Subtle radar rings centered on player */}
              <circle
                cx={px}
                cy={py}
                r={11.5 * scale}
                fill="rgba(56, 189, 248, 0.04)"
                stroke="rgba(56, 189, 248, 0.22)"
                strokeWidth="0.7"
                strokeDasharray="2.5 2.5"
              />
              <circle
                cx={px}
                cy={py}
                r={5.0 * scale}
                fill="none"
                stroke="rgba(245, 158, 11, 0.22)"
                strokeWidth="0.6"
              />

              {/* Highway Exit Corridor Strip (when present on % 5 === 0 levels) */}
              {level.highwayExit && (
                <g data-testid="minimap-highway-exit">
                  <rect
                    x={toSvgX(level.highwayExit.startX)}
                    y={toSvgY(level.highwayExit.exitZ - level.highwayExit.halfWidth)}
                    width={Math.max(4, (level.highwayExit.endX - level.highwayExit.startX) * scale)}
                    height={Math.max(3, level.highwayExit.halfWidth * 2 * scale)}
                    fill="rgba(34, 211, 238, 0.14)"
                  />
                  <line
                    x1={toSvgX(level.highwayExit.startX)}
                    y1={toSvgY(level.highwayExit.exitZ)}
                    x2={toSvgX(level.highwayExit.endX - 4)}
                    y2={toSvgY(level.highwayExit.exitZ)}
                    stroke="#38bdf8"
                    strokeWidth="0.9"
                    strokeDasharray="3 2.5"
                    opacity="0.7"
                  />
                </g>
              )}

              {/* All labyrinth walls, highlighting nearest detected walls */}
              {level.walls.map((w, idx) => {
                const hit = nearestMap.get(idx);
                const x = toSvgX(w.x - w.halfW);
                const y = toSvgY(w.z - w.halfD);
                const rw = Math.max(1.2, w.halfW * 2 * scale);
                const rh = Math.max(1.2, w.halfD * 2 * scale);
                const fill = hit
                  ? hit.distance < 2.8
                    ? '#f43f5e'
                    : hit.distance < 6.0
                      ? '#f59e0b'
                      : '#38bdf8'
                  : '#475569';
                return (
                  <rect
                    key={`w-${idx}`}
                    x={x}
                    y={y}
                    width={rw}
                    height={rh}
                    rx={0.5}
                    fill={fill}
                    opacity={hit ? 0.98 : 0.72}
                    data-nearest={hit ? 'true' : undefined}
                  />
                );
              })}

              {/* Nearest-wall radar ping lines & contact dots */}
              {nearestWalls.map((hit) => {
                const hx = toSvgX(hit.closestX);
                const hy = toSvgY(hit.closestZ);
                const stroke =
                  hit.distance < 2.8
                    ? '#fb7185'
                    : hit.distance < 6.0
                      ? '#fbbf24'
                      : '#38bdf8';
                return (
                  <g key={`ping-${hit.wallIndex}`} data-testid="minimap-wall-ping">
                    <line
                      x1={px}
                      y1={py}
                      x2={hx}
                      y2={hy}
                      stroke={stroke}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      opacity="0.88"
                    />
                    <circle cx={hx} cy={hy} r="2.1" fill={stroke} />
                  </g>
                );
              })}

              {/* Roundabouts */}
              {(level.roundabouts ?? []).map((rb, idx) => (
                <circle
                  key={`rb-${idx}`}
                  cx={toSvgX(rb.x)}
                  cy={toSvgY(rb.z)}
                  r={Math.max(2.2, rb.radius * scale)}
                  fill="#1e293b"
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
              ))}

              {/* Live Moving Barrier Gates */}
              {level.movingGates.map((gate) => {
                const box = getMovingGateAABB(gate, elapsedTime);
                return (
                  <rect
                    key={gate.id}
                    x={toSvgX(box.x - box.halfW)}
                    y={toSvgY(box.z - box.halfD)}
                    width={Math.max(1.5, box.halfW * 2 * scale)}
                    height={Math.max(1.5, box.halfD * 2 * scale)}
                    fill="#ef4444"
                  />
                );
              })}

              {/* Boost Pads */}
              {(level.boostPads ?? []).map((bp) => (
                <rect
                  key={bp.id}
                  x={toSvgX(bp.x) - 2.4}
                  y={toSvgY(bp.z) - 2.4}
                  width="4.8"
                  height="4.8"
                  rx="1"
                  fill="#06b6d4"
                  opacity="0.72"
                  transform={`rotate(${((-bp.yaw * 180) / Math.PI).toFixed(1)}, ${toSvgX(bp.x).toFixed(1)}, ${toSvgY(bp.z).toFixed(1)})`}
                />
              ))}

              {/* Checkpoint Arches */}
              {(level.checkpoints ?? []).map((cp) => {
                const passed = passedCheckpointIds.includes(cp.id);
                const cx = toSvgX(cp.x);
                const cy = toSvgY(cp.z);
                return (
                  <rect
                    key={cp.id}
                    x={cx - 3.2}
                    y={cy - 1.4}
                    width="6.4"
                    height="2.8"
                    rx="1"
                    fill={passed ? '#10b981' : '#f59e0b'}
                    stroke="#0f172a"
                    strokeWidth="0.6"
                    transform={`rotate(${((-cp.yaw * 180) / Math.PI).toFixed(1)}, ${cx.toFixed(1)}, ${cy.toFixed(1)})`}
                  />
                );
              })}

              {/* Live Traffic Lights (N-S / E-W Signal Bars) */}
              {(level.trafficLights ?? []).map((tl) => {
                const st = evaluateTrafficLightState(tl, elapsedTime);
                const tx = toSvgX(tl.x);
                const ty = toSvgY(tl.z);
                const colorHex = (c: 'green' | 'yellow' | 'red') =>
                  c === 'green' ? '#10b981' : c === 'yellow' ? '#f59e0b' : '#ef4444';
                return (
                  <g key={tl.id} data-testid="minimap-traffic-light">
                    <circle
                      cx={tx}
                      cy={ty}
                      r="3.2"
                      fill="#0f172a"
                      stroke="#475569"
                      strokeWidth="0.6"
                    />
                    <line
                      x1={tx}
                      y1={ty - 2.6}
                      x2={tx}
                      y2={ty + 2.6}
                      stroke={colorHex(st.ns)}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1={tx - 2.6}
                      y1={ty}
                      x2={tx + 2.6}
                      y2={ty}
                      stroke={colorHex(st.ew)}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {/* Uncollected Bonus Tokens */}
              {(level.tokens ?? []).map((tok) => {
                if (collectedTokenIds.includes(tok.id)) return null;
                return (
                  <circle
                    key={tok.id}
                    cx={toSvgX(tok.x)}
                    cy={toSvgY(tok.z)}
                    r="2"
                    fill={tok.kind === 'time' ? '#38bdf8' : '#facc15'}
                  />
                );
              })}

              {/* Guide vector from player to park bay */}
              <line
                x1={px}
                y1={py}
                x2={bayX}
                y2={bayY}
                stroke="#34d399"
                strokeWidth="1.15"
                strokeDasharray="3 3"
                opacity="0.72"
              />

              {/* Parking Bay Zone ('P') */}
              <g
                transform={`rotate(${bayRotDeg.toFixed(1)}, ${bayX.toFixed(1)}, ${bayY.toFixed(1)})`}
                data-testid="minimap-park-bay"
              >
                <circle
                  cx={bayX}
                  cy={bayY}
                  r={Math.max(bayW, bayL) * 0.78}
                  fill="rgba(16, 185, 129, 0.18)"
                  stroke="#34d399"
                  strokeWidth="0.9"
                />
                <rect
                  x={bayX - bayW * 0.5}
                  y={bayY - bayL * 0.5}
                  width={bayW}
                  height={bayL}
                  rx="1.2"
                  fill="rgba(16, 185, 129, 0.35)"
                  stroke="#10b981"
                  strokeWidth="1.3"
                />
              </g>
              <text
                x={bayX}
                y={bayY + 2.8}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="800"
                fill="#ecfdf5"
              >
                P
              </text>

              {/* Player Car Marker & Heading */}
              <polygon
                points={playerPoints}
                fill="#22d3ee"
                stroke="#ffffff"
                strokeWidth="0.9"
                data-testid="minimap-player"
              />
            </svg>
          </div>

          {/* Nearest Wall + Relative Park Bay Telemetry Footer */}
          <div className="px-2.5 py-1.5 border-t border-slate-800 space-y-1 text-[9px] sm:text-[10px]">
            <div className="flex items-center justify-between gap-1 text-slate-300">
              <span className="truncate text-slate-400" title={archetypeTitle}>
                {archetypeTitle} ({level.cols}×{level.rows})
              </span>
              <span className="font-mono-num font-bold text-emerald-300 flex items-center gap-0.5 shrink-0">
                <Compass
                  className="w-2.5 h-2.5 text-emerald-400"
                  style={{
                    transform: `rotate(${Math.round((bearing.relativeAngle * 180) / Math.PI)}deg)`,
                  }}
                />
                {distanceToBay}m
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Radar className="w-2.5 h-2.5 text-amber-400" />
                <span>DUVAR</span>
              </span>
              <span
                data-testid="minimap-nearest-wall"
                className={`font-mono-num font-bold ${wallStatusColor}`}
              >
                {closestWall ? `${closestWall.distance.toFixed(1)}m (${nearestWalls.length})` : 'Açık'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono-num">
          <span className="text-emerald-300 font-bold">P: {distanceToBay}m</span>
          <span className={`font-bold ${wallStatusColor}`}>
            {closestWall ? `${closestWall.distance.toFixed(1)}m` : 'Açık'}
          </span>
        </div>
      )}
    </div>
  );
};
