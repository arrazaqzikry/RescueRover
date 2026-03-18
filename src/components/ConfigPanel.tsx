// ===================================================
// components/ConfigPanel.tsx — Mission settings overlay
// ===================================================

import React from 'react';
import { SimulationConfig } from '../types/simulation';

interface Props {
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  onClose: () => void;
}

export const ConfigPanel: React.FC<Props> = ({ config, onChange, onClose }) => {
  const update = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded p-5 w-72 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs font-bold text-foreground tracking-wider">MISSION PARAMETERS</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground font-mono text-sm">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          <ConfigSlider
            label="INITIAL DRONES"
            value={config.droneCount}
            min={1} max={10}
            onChange={v => update('droneCount', v)}
          />
          <ConfigSlider
            label="GRID SIZE"
            value={config.gridSize}
            min={30} max={50}
            onChange={v => update('gridSize', v)}
          />
          <ConfigSlider
            label="OBSTACLES"
            value={config.obstacleCount}
            min={0} max={40}
            onChange={v => update('obstacleCount', v)}
          />
          <ConfigSlider
            label="THERMAL NOISE %"
            value={Math.round(config.thermalNoiseChance * 100)}
            min={0} max={20}
            onChange={v => update('thermalNoiseChance', v / 100)}
          />
          <ConfigSlider
            label="TICK SPEED (ms)"
            value={config.tickIntervalMs}
            min={200} max={3000} step={100}
            onChange={v => update('tickIntervalMs', v)}
          />
        </div>

        <div className="mt-3 p-2 bg-secondary/40 rounded border border-border/40">
          <p className="font-mono text-[9px] text-muted-foreground leading-relaxed">
            ℹ Survivor count is randomised (8–15) at each reset — unknown until discovered.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-1.5 font-mono text-xs bg-rescue-green text-primary-foreground rounded hover:opacity-90 transition-opacity"
        >
          APPLY & RESET SIMULATION
        </button>
      </div>
    </div>
  );
};

const ConfigSlider: React.FC<{
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <div>
    <div className="flex justify-between mb-1">
      <span className="font-mono text-[9px] text-muted-foreground tracking-wider">{label}</span>
      <span className="font-mono text-[10px] text-foreground font-bold">{value}</span>
    </div>
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-1 bg-secondary rounded-full appearance-none cursor-pointer accent-rescue-green"
    />
  </div>
);
