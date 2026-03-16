// ===================================================
// pages/Index.tsx — Main Dashboard
// ===================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Drone, SimulationConfig, SimulationState } from '../types/simulation';
import { createInitialState, mcp_registerDrone, getSectorBounds, makeId } from '../simulation/mcpServer';
import { commandAgentTick } from '../simulation/commandAgent';
import { MissionHeader } from '../components/MissionHeader';
import { SimulationGrid } from '../components/SimulationGrid';
import { DroneFleet } from '../components/DroneFleet';
import { ActivityLog } from '../components/ActivityLog';
import { ConfigPanel } from '../components/ConfigPanel';

const DEFAULT_CONFIG: SimulationConfig = {
  gridSize: 20,
  totalSurvivors: 10,   // overridden at init to random 8-15
  maxDrones: 10,
  droneCount: 3,
  obstacleCount: 15,
  tickIntervalMs: 1000,
  thermalNoiseChance: 0.05,
};

const Index: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<SimulationState>(() => createInitialState(DEFAULT_CONFIG));
  const [showConfig, setShowConfig] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Tick loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.running) {
      tickRef.current = setInterval(() => {
        setState(prev => commandAgentTick(prev));
      }, config.tickIntervalMs);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [state.running, config.tickIntervalMs]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setState(prev => ({ ...prev, running: true }));
  }, []);

  const handleStop = useCallback(() => {
    setState(prev => ({ ...prev, running: false }));
  }, []);

  const handleReset = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setState(createInitialState(config));
  }, [config]);

  const handleAddDrone = useCallback(() => {
    setState(prev => {
      if (prev.drones.length >= prev.config.maxDrones) return prev;
      const idx = prev.drones.length;
      const num = String(idx + 1).padStart(2, '0');
      const id = `UAV-${num}`;
      const { state: newState } = mcp_registerDrone(prev, { drone_id: id, name: id });
      return newState;
    });
  }, []);

  const handleSelectDrone = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedDroneId: id }));
  }, []);

  // ── Manual RTB override ───────────────────────────────────────────────────
  const handleReturnToBase = useCallback((droneId: string) => {
    setState(prev => {
      const idx = prev.drones.findIndex(d => d.id === droneId);
      if (idx === -1) return prev;
      const updatedDrones = [...prev.drones];
      updatedDrones[idx] = { ...updatedDrones[idx], forceReturn: true };
      return { ...prev, drones: updatedDrones };
    });
  }, []);

  const handleConfigChange = useCallback((newConfig: SimulationConfig) => {
    setConfig(newConfig);
  }, []);

  const handleConfigApply = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    setState(createInitialState(config));
    setShowConfig(false);
  }, [config]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <MissionHeader
        stats={state.stats}
        running={state.running}
        onStart={handleStart}
        onStop={handleStop}
        onReset={handleReset}
        onAddDrone={handleAddDrone}
        droneCount={state.drones.length}
        maxDrones={state.config.maxDrones}
      />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Grid area (60%) */}
        <div className="flex flex-col flex-[3] min-w-0 overflow-hidden border-r border-border">
          {/* Grid panel header */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50 bg-card/50 shrink-0">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
              ZONE MAP — {state.config.gridSize}×{state.config.gridSize}
            </span>
            <div className="flex items-center gap-3">
              <Legend color="hsl(220,20%,92%)" label="Unexplored" />
              <Legend color="hsl(196,80%,88%)" border label="Visited" />
              <Legend color="#E91E8C" label="Survivor" />
              <Legend color="#EF4444" label="Obstacle" />
              <button
                onClick={() => setShowConfig(true)}
                className="font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border/50 px-2 py-0.5 rounded transition-colors"
              >
                ⚙ CONFIG
              </button>
            </div>
          </div>

          {/* Scrollable grid container */}
          <div className="flex-1 overflow-auto p-6 flex items-start justify-start">
            <SimulationGrid
              grid={state.grid}
              drones={state.drones}
              survivors={state.survivors}
              obstacles={state.obstacles}
              selectedDroneId={state.selectedDroneId}
              onSelectDrone={handleSelectDrone}
              gridSize={state.config.gridSize}
            />
          </div>

          {/* Bottom — Activity Log */}
          <div className="h-44 border-t border-border shrink-0">
            <ActivityLog entries={state.log} />
          </div>
        </div>

        {/* Right — Fleet sidebar (40%) */}
        <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-card/50 shrink-0">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
              FLEET MANAGEMENT
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {state.drones.length}/{state.config.maxDrones} UAVs
            </span>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-px bg-border/50 shrink-0">
            <StatTile
              label="CELLS SCANNED"
              value={`${state.grid.flat().filter(c => c.scanned).length}`}
              sub={`/ ${state.config.gridSize * state.config.gridSize}`}
            />
            <StatTile
              label="COVERAGE"
              value={`${state.stats.coverage}%`}
              color={state.stats.coverage >= 80 ? '#10B981' : state.stats.coverage >= 40 ? '#F59E0B' : undefined}
            />
            <StatTile
              label="SURVIVORS FOUND"
              value={`${state.stats.survivorsFound}`}
              sub={`/ ${state.stats.totalSurvivors} total`}
              color={state.stats.survivorsFound === state.stats.totalSurvivors ? '#10B981' : undefined}
            />
            <StatTile
              label="CHARGING"
              value={`${state.drones.filter(d => d.status === 'charging').length}`}
              sub="drones at base"
            />
          </div>

          {/* Drone cards */}
          <DroneFleet
            drones={state.drones}
            selectedId={state.selectedDroneId}
            onSelect={handleSelectDrone}
            onReturnToBase={handleReturnToBase}
          />

          {/* Selected drone detail */}
          {state.selectedDroneId && (
            <SelectedDroneDetail
              drone={state.drones.find(d => d.id === state.selectedDroneId)}
            />
          )}
        </div>
      </div>

      {/* Config overlay */}
      {showConfig && (
        <ConfigPanel
          config={config}
          onChange={handleConfigChange}
          onClose={handleConfigApply}
        />
      )}
    </div>
  );
};

// ─── Helper sub-components ────────────────────────────────────────────────────

const Legend: React.FC<{ color: string; label: string; border?: boolean }> = ({ color, label, border }) => (
  <div className="flex items-center gap-1">
    <div
      className="w-2.5 h-2.5 rounded-sm"
      style={{
        backgroundColor: color,
        border: border ? '1px solid #CBD5E1' : '1px solid transparent',
      }}
    />
    <span className="font-mono text-[9px] text-muted-foreground">{label}</span>
  </div>
);

const StatTile: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({
  label, value, sub, color
}) => (
  <div className="bg-card/70 px-3 py-2">
    <div className="font-mono text-[8px] text-muted-foreground tracking-widest mb-0.5">{label}</div>
    <div className="font-mono text-sm font-bold" style={{ color: color ?? 'hsl(var(--foreground))' }}>
      {value}
      {sub && <span className="text-[10px] text-muted-foreground font-normal ml-1">{sub}</span>}
    </div>
  </div>
);

const SelectedDroneDetail: React.FC<{ drone: Drone | undefined }> = ({ drone }) => {
  if (!drone) return null;
  return (
    <div className="border-t border-border bg-secondary/30 p-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-bold text-foreground">{drone.id} — DETAIL</span>
        <span className="font-mono text-[9px] text-muted-foreground">
          Queue: {drone.pathQueue.length} steps
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat2 label="POSITION" value={`(${drone.position.x}, ${drone.position.y})`} />
        <MiniStat2 label="BATTERY" value={`${Math.round(drone.battery)}%`} />
        <MiniStat2 label="SECTOR" value={['NW','NE','SW','SE'][drone.sector % 4]} />
        <MiniStat2 label="DETECTIONS" value={String(drone.detectedSurvivorIds.length)} />
      </div>
      {drone.pathQueue.length > 0 && (
        <div className="mt-2">
          <div className="font-mono text-[8px] text-muted-foreground mb-1">NEXT WAYPOINTS</div>
          <div className="flex flex-wrap gap-1">
            {drone.pathQueue.slice(0, 6).map((p, i) => (
              <span key={i} className="font-mono text-[9px] px-1 py-0.5 bg-drone-navigating/10 text-drone-navigating border border-drone-navigating/20 rounded">
                ({p.x},{p.y})
              </span>
            ))}
            {drone.pathQueue.length > 6 && (
              <span className="font-mono text-[9px] text-muted-foreground">+{drone.pathQueue.length - 6}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MiniStat2: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="font-mono text-[8px] text-muted-foreground tracking-wider">{label}</div>
    <div className="font-mono text-[10px] text-foreground font-medium">{value}</div>
  </div>
);

export default Index;
