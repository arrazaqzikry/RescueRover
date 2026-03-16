// ===================================================
// components/MissionHeader.tsx — Fixed stats bar
// ===================================================

import React from 'react';
import { MissionStats } from '../types/simulation';

interface Props {
  stats: MissionStats;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onAddDrone: () => void;
  droneCount: number;
  maxDrones: number;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const MissionHeader: React.FC<Props> = ({
  stats, running, onStart, onStop, onReset, onAddDrone, droneCount, maxDrones
}) => {
  const elapsed = Date.now() - stats.missionStartTime;

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0 h-12">
      {/* Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rescue-green animate-pulse" />
          <span className="font-mono text-xs font-bold text-rescue-green tracking-widest uppercase">
            DRCC
          </span>
        </div>
        <span className="text-muted-foreground text-xs font-mono">|</span>
        <span className="font-sans text-xs text-muted-foreground">Disaster Response Command Center</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6">
        <Metric label="TICK" value={`#${stats.tick}`} />
        <Metric
          label="COVERAGE"
          value={`${stats.coverage}%`}
          color={stats.coverage >= 80 ? 'text-rescue-green' : stats.coverage >= 40 ? 'text-alert-amber' : 'text-foreground'}
        />
        <Metric
          label="SURVIVORS"
          value={`${stats.survivorsFound}/${stats.totalSurvivors}`}
          color={stats.survivorsFound === stats.totalSurvivors ? 'text-rescue-green' : 'text-foreground'}
        />
        <Metric label="FLEET" value={`${droneCount}/${maxDrones}`} />
        <Metric label="ELAPSED" value={formatTime(elapsed)} />

        {stats.missionComplete && (
          <span className="font-mono text-xs font-bold text-rescue-green bg-rescue-green/10 border border-rescue-green/30 px-2 py-0.5 rounded">
            MISSION COMPLETE
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAddDrone}
          disabled={droneCount >= maxDrones || !running}
          className="px-2.5 py-1 text-xs font-mono border border-border rounded hover:border-drone-navigating hover:text-drone-navigating disabled:opacity-30 transition-colors"
        >
          + DRONE
        </button>
        {!running ? (
          <button
            onClick={onStart}
            className="px-3 py-1 text-xs font-mono bg-rescue-green text-primary-foreground rounded hover:opacity-90 transition-opacity font-semibold"
          >
            ▶ DEPLOY
          </button>
        ) : (
          <button
            onClick={onStop}
            className="px-3 py-1 text-xs font-mono bg-alert-amber text-accent-foreground rounded hover:opacity-90 transition-opacity font-semibold"
          >
            ⏸ PAUSE
          </button>
        )}
        <button
          onClick={onReset}
          className="px-2.5 py-1 text-xs font-mono border border-border rounded hover:border-critical-red hover:text-critical-red transition-colors"
        >
          ↺ RESET
        </button>
      </div>
    </header>
  );
};

const Metric: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="text-center">
    <div className="text-muted-foreground font-mono" style={{ fontSize: '9px', letterSpacing: '0.1em' }}>{label}</div>
    <div className={`font-mono text-xs font-bold ${color ?? 'text-foreground'}`}>{value}</div>
  </div>
);
