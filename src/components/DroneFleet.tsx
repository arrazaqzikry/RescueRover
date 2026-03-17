// ===================================================
// components/DroneFleet.tsx — Drone cards sidebar
// ===================================================

import React from 'react';
import { Drone } from '../types/simulation';

interface Props {
  drones: Drone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReturnToBase: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle:        'IDLE',
  navigating:  'MOVING',
  scanning:    'SCANNING',
  returning:   'RETURN',
  charging:    'CHARGING',
};

const STATUS_COLOR: Record<string, string> = {
  idle:        'text-drone-idle bg-drone-idle/10 border-drone-idle/30',
  navigating:  'text-drone-navigating bg-drone-navigating/10 border-drone-navigating/30',
  scanning:    'text-drone-scanning bg-drone-scanning/10 border-drone-scanning/30',
  returning:   'text-drone-returning bg-drone-returning/10 border-drone-returning/30',
  charging:    'text-drone-charging bg-drone-charging/10 border-drone-charging/30',
};

const BATTERY_COLOR = (bat: number): string => {
  if (bat > 75) return '#10B981';
  if (bat > 25) return '#F59E0B';
  return '#EF4444';
};

export const DroneFleet: React.FC<Props> = ({ drones, selectedId, onSelect, onReturnToBase }) => {
  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto terminal-scroll flex-1 p-2">
      {drones.length === 0 && (
        <div className="text-center text-muted-foreground font-mono text-xs py-8">
          No drones registered.<br />Press DEPLOY to start.
        </div>
      )}
      {drones.map(drone => (
        <DroneCard
          key={drone.id}
          drone={drone}
          selected={drone.id === selectedId}
          onSelect={() => onSelect(drone.id === selectedId ? null : drone.id)}
          onReturnToBase={() => onReturnToBase(drone.id)}
        />
      ))}
    </div>
  );
};

const DroneCard: React.FC<{
  drone: Drone;
  selected: boolean;
  onSelect: () => void;
  onReturnToBase: () => void;
}> = ({ drone, selected, onSelect, onReturnToBase }) => {
  const isScanning = drone.status === 'scanning';
  const batColor = BATTERY_COLOR(drone.battery);
  const isCritical = drone.battery <= 25;
  const isAtBase = drone.position.x === 0 && drone.position.y === 0;
  const canRTB = drone.status !== 'charging' && drone.status !== 'returning' && !isAtBase;

  return (
    <div
      onClick={onSelect}
      className={`rounded border cursor-pointer transition-all p-2.5
        ${selected
          ? 'border-drone-navigating bg-drone-navigating/5'
          : 'border-border hover:border-muted-foreground/40 bg-card'
        }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${isScanning ? 'status-active' : ''}`}
            style={{ backgroundColor: isCritical ? '#EF4444' : '#10B981' }}
          />
          <span className="font-mono text-xs font-bold text-foreground">{drone.id}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* RTB override button */}
          {canRTB && (
            <button
              onClick={e => { e.stopPropagation(); onReturnToBase(); }}
              title="Force return to base"
              className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-drone-returning/50 text-drone-returning hover:bg-drone-returning/10 transition-colors"
            >
              RTB ↩
            </button>
          )}
          <span
            className={`font-mono px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider
              ${STATUS_COLOR[drone.status] ?? 'text-muted-foreground'}`}
          >
            {STATUS_LABEL[drone.status] ?? drone.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Battery bar */}
      <div className="mb-1.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className="font-mono text-[9px] text-muted-foreground tracking-wider">BATTERY</span>
          <span
            className={`font-mono text-[10px] font-bold ${isCritical ? 'battery-critical' : ''}`}
            style={{ color: batColor }}
          >
            {Math.round(drone.battery)}%
          </span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${drone.battery}%`,
              backgroundColor: batColor,
              boxShadow: isCritical ? `0 0 4px ${batColor}80` : 'none',
            }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-x-2">
        <MiniStat label="POS" value={`${drone.position.x},${drone.position.y}`} />
        <MiniStat label="SCANNED" value={String(drone.cellsScanned)} />
        <MiniStat label="SECTOR" value={`Sector ${drone.sector + 1}`} />      </div>

      {/* Detected survivors */}
      {drone.detectedSurvivorIds.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {drone.detectedSurvivorIds.map(sid => (
            <span
              key={sid}
              className="font-mono text-[9px] px-1 py-0.5 bg-rescue-green/10 text-rescue-green border border-rescue-green/30 rounded"
            >
              {sid}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="font-mono text-[8px] text-muted-foreground tracking-wider">{label}</div>
    <div className="font-mono text-[10px] text-foreground font-medium">{value}</div>
  </div>
);
