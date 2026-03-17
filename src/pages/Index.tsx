// ===================================================
// pages/Index.tsx — Main Dashboard with Adjustable Panels
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
  totalSurvivors: 10,
  maxDrones: 10,
  droneCount: 3,
  obstacleCount: 15,
  tickIntervalMs: 1000,
  thermalNoiseChance: 0.05,
};

// Splitter storage keys
const STORAGE_KEYS = {
  ACTIVITY_LOG_HEIGHT: 'dashboard-activity-log-height',
  FLEET_WIDTH: 'dashboard-fleet-width',
};

const DEFAULT_ACTIVITY_LOG_HEIGHT = 176; // 44 * 4 (h-44 = 11rem = 176px)
const DEFAULT_FLEET_WIDTH_PERCENT = 40; // 40% of available space

const Index: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<SimulationState>(() => createInitialState(DEFAULT_CONFIG));
  const [showConfig, setShowConfig] = useState(false);

  // Resizable panel states
  const [activityLogHeight, setActivityLogHeight] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG_HEIGHT);
    return saved ? parseInt(saved, 10) : DEFAULT_ACTIVITY_LOG_HEIGHT;
  });

  const [fleetWidthPercent, setFleetWidthPercent] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.FLEET_WIDTH);
    return saved ? parseInt(saved, 10) : DEFAULT_FLEET_WIDTH_PERCENT;
  });

  // Splitter drag states
  const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false);
  const [isDraggingVertical, setIsDraggingVertical] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalSplitterRef = useRef<HTMLDivElement>(null);
  const verticalSplitterRef = useRef<HTMLDivElement>(null);

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

  // ── Horizontal splitter drag (Activity Log) ───────────────────────────────
  useEffect(() => {
    const handleHorizontalDrag = (e: MouseEvent) => {
      if (!isDraggingHorizontal || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const mouseY = e.clientY;
      const relativeY = mouseY - containerRect.top;
      const maxHeight = containerRect.height - 100; // Leave some minimum space
      const minHeight = 100; // Minimum height for activity log

      let newHeight = Math.min(Math.max(relativeY, minHeight), maxHeight);
      newHeight = containerRect.height - newHeight; // Invert because we're dragging from bottom

      setActivityLogHeight(prev => {
        const clampedHeight = Math.min(Math.max(newHeight, 100), maxHeight);
        localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG_HEIGHT, clampedHeight.toString());
        return clampedHeight;
      });
    };

    const stopHorizontalDrag = () => {
      setIsDraggingHorizontal(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDraggingHorizontal) {
      document.addEventListener('mousemove', handleHorizontalDrag);
      document.addEventListener('mouseup', stopHorizontalDrag);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleHorizontalDrag);
      document.removeEventListener('mouseup', stopHorizontalDrag);
    };
  }, [isDraggingHorizontal]);

  // ── Vertical splitter drag (Fleet width) ─────────────────────────────────
  useEffect(() => {
    const handleVerticalDrag = (e: MouseEvent) => {
      if (!isDraggingVertical || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX;
      const relativeX = mouseX - containerRect.left;
      const percent = 100 - (relativeX / containerRect.width) * 100;

      const minFleetPercent = 20;
      const maxFleetPercent = 70;

      const newFleetPercent = Math.min(
          Math.max(percent, minFleetPercent),
          maxFleetPercent
      );

      setFleetWidthPercent(prev => {
        localStorage.setItem(STORAGE_KEYS.FLEET_WIDTH, newFleetPercent.toString());
        return newFleetPercent;
      });
    };

    const stopVerticalDrag = () => {
      setIsDraggingVertical(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isDraggingVertical) {
      document.addEventListener('mousemove', handleVerticalDrag);
      document.addEventListener('mouseup', stopVerticalDrag);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleVerticalDrag);
      document.removeEventListener('mouseup', stopVerticalDrag);
    };
  }, [isDraggingVertical]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setState(prev => {
      const ts = Date.now();
      const initLog = {
        id: makeId(), tick: 0, timestamp: ts, level: 'info' as const,
        message: 'System initialized. Command Agent online. Awaiting drone deployment.',
      };
      return { ...prev, running: true, log: [...prev.log, initLog] };
    });
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
      const { state: newState, response } = mcp_registerDrone(prev, { drone_id: id, name: id });
      if (!response.success) return prev;

      const tick = prev.stats.tick;
      const ts = Date.now();
      const newCount = newState.drones.length;
      const bounds = getSectorBounds(response.drone.sector, prev.config.gridSize);
      const sectorLabel = `[col ${bounds.minX}–${bounds.maxX}, row ${bounds.minY}–${bounds.maxY}]`;
      const uncovered = newState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;

      const deployLog = {
        id: makeId(), tick, timestamp: ts, level: 'agent' as const,
        message: `[Command Agent] ${id} detected on network. Rebalancing sector assignments across ${newCount} drone${newCount > 1 ? 's' : ''}.`,
        droneId: id,
      };
      const sectorLog = {
        id: makeId(), tick, timestamp: ts + 1, level: 'info' as const,
        message: `${id} deployed to base (0,0). Assigned Sector ${sectorLabel}. Battery 100% → ${uncovered} uncovered cells.`,
        droneId: id,
      };
      return { ...newState, log: [...newState.log, deployLog, sectorLog] };
    });
  }, []);

  const handleSelectDrone = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedDroneId: id }));
  }, []);

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

  // Reset to default sizes
  const handleResetSizes = useCallback(() => {
    setActivityLogHeight(DEFAULT_ACTIVITY_LOG_HEIGHT);
    setFleetWidthPercent(DEFAULT_FLEET_WIDTH_PERCENT);
    localStorage.removeItem(STORAGE_KEYS.ACTIVITY_LOG_HEIGHT);
    localStorage.removeItem(STORAGE_KEYS.FLEET_WIDTH);
  }, []);

  return (
      <div ref={containerRef} className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
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

        {/* Reset sizes button (small utility) */}
        <div className="absolute bottom-4 right-4 z-50">
          <button
              onClick={handleResetSizes}
              className="bg-card border border-border/50 rounded-full p-2 opacity-30 hover:opacity-100 transition-opacity"
              title="Reset panel sizes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
          </button>
        </div>

        {/* Main workspace with resizable panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — Grid area (resizable width) */}
          <div
              className="flex flex-col min-w-0 overflow-hidden border-r border-border"
              style={{ flex: `${100 - fleetWidthPercent}` }}
          >
            {/* Grid panel header */}
            <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50 bg-card/50 shrink-0">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest">
              ZONE MAP — {state.config.gridSize}×{state.config.gridSize}
            </span>
              <div className="flex items-center gap-3">
                <Legend color="hsl(220,20%,92%)" label="Unexplored" />
                <Legend color="hsl(196,80%,38%)" border label="Visited" />
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
            <div className="flex-1 overflow-x-auto p-7 flex justify-items-start justify-center">
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

            {/* Resizable Activity Log */}
            <div
                className="border-t border-border shrink-0 relative"
                style={{ height: activityLogHeight }}
            >
              {/* Horizontal splitter handle */}
              <div
                  ref={horizontalSplitterRef}
                  className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/50 active:bg-primary z-10 -translate-y-1/2"
                  onMouseDown={() => setIsDraggingHorizontal(true)}
              >
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-border rounded-full opacity-0 group-hover:opacity-100" />
              </div>

              <ActivityLog entries={state.log} />
            </div>
          </div>

          {/* Vertical splitter handle */}
          <div
              ref={verticalSplitterRef}
              className="w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary shrink-0 relative group"
              onMouseDown={() => setIsDraggingVertical(true)}
          >
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-border rounded-full opacity-0 group-hover:opacity-100" />
          </div>

          {/* Right — Fleet sidebar (resizable width) */}
          <div
              className="flex flex-col min-w-0 overflow-hidden"
              style={{ flex: `${fleetWidthPercent}` }}
          >
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

            {/* Drone cards - scrollable area */}
            <div className="flex-1 overflow-y-auto">
              <DroneFleet
                  drones={state.drones}
                  selectedId={state.selectedDroneId}
                  onSelect={handleSelectDrone}
                  onReturnToBase={handleReturnToBase}
              />
            </div>

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