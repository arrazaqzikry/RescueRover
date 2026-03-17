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
      <div ref={containerRef} className="relative flex flex-col h-screen overflow-hidden bg-background text-foreground">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse animation-delay-2000" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse animation-delay-1000" />

          {/* Grid overlay */}
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
        </div>

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

        {/* Reset sizes button with improved design */}
        <div className="absolute bottom-6 right-6 z-50">
          <button
              onClick={handleResetSizes}
              className="group bg-card/80 backdrop-blur-sm border border-border/50 hover:border-primary/30
                       rounded-xl p-3 opacity-40 hover:opacity-100 transition-all duration-300
                       shadow-lg hover:shadow-primary/5"
              title="Reset panel sizes"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="group-hover:rotate-90 transition-transform duration-500">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
          </button>
        </div>

        {/* Main workspace with resizable panels */}
        <div className="relative flex flex-1 overflow-hidden z-10">
          {/* Left — Grid area (resizable width) */}
          <div
              className="flex flex-col min-w-0 overflow-hidden border-r border-border/50 bg-gradient-to-br from-background via-background to-background/95"
              style={{ flex: `${100 - fleetWidthPercent}` }}
          >
            {/* Grid panel header with glass effect */}
            <div className="flex items-center justify-between px-5 py-2 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-pulse" />
                <span className="font-mono text-[10px] text-muted-foreground tracking-[0.15em]">
                  ZONE MAP — {state.config.gridSize}×{state.config.gridSize}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <Legend color="hsl(220,20%,92%)" label="Unexplored" />
                <Legend color="hsl(196,80%,38%)" border label="Visited" />
                <Legend color="#E91E8C" label="Survivor" />
                <Legend color="#EF4444" label="Obstacle" />

                <div className="w-px h-4 bg-border/50 mx-1" />

                <button
                    onClick={() => setShowConfig(true)}
                    className="group flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground
                             hover:text-foreground border border-border/50 hover:border-primary/30
                             px-3 py-1 rounded-md transition-all duration-300
                             bg-background/50 hover:bg-background/80"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       className="group-hover:rotate-90 transition-transform duration-500">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  CONFIG
                </button>
              </div>
            </div>

            {/* Scrollable grid container with subtle shadow */}
            <div className="flex-1 overflow-auto p-6 flex justify-center bg-gradient-to-b from-transparent to-background/50">
              <div className="relative">
                {/* Grid glow effect */}
                <div className="absolute -inset-4 bg-primary/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
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
            </div>

            {/* Resizable Activity Log with glass effect */}
            <div
                className="border-t border-border/50 shrink-0 relative bg-gradient-to-t from-card/30 to-transparent backdrop-blur-sm"
                style={{ height: activityLogHeight }}
            >
              {/* Horizontal splitter handle with improved design */}
              <div
                  ref={horizontalSplitterRef}
                  className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-20 -translate-y-1/2 group"
                  onMouseDown={() => setIsDraggingHorizontal(true)}
              >
                <div className="relative h-full flex items-center justify-center">
                  <div className="w-16 h-1 bg-border/50 rounded-full group-hover:bg-primary/50 group-hover:w-24 transition-all duration-300" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary/5 rounded-full opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />
                </div>
              </div>

              <ActivityLog entries={state.log} />
            </div>
          </div>

          {/* Vertical splitter handle with improved design */}
          <div
              ref={verticalSplitterRef}
              className="w-2 cursor-col-resize shrink-0 relative group z-20"
              onMouseDown={() => setIsDraggingVertical(true)}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 group-hover:w-1.5 bg-border/50
                          group-hover:bg-primary/50 rounded-full transition-all duration-300" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary/5
                          rounded-full opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />
          </div>

          {/* Right — Fleet sidebar (resizable width) with glass effect */}
          <div
              className="flex flex-col min-w-0 overflow-hidden bg-gradient-to-bl from-background via-background to-background/95"
              style={{ flex: `${fleetWidthPercent}` }}
          >
            {/* Sidebar header with glass effect */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-pulse" />
                <span className="font-mono text-[10px] text-muted-foreground tracking-[0.15em]">
                  FLEET MANAGEMENT
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {state.drones.length}/{state.config.maxDrones}
                </span>
                <span className="text-[8px] font-mono text-muted-foreground/50">UAVs</span>
              </div>
            </div>

            {/* Stats strip with improved design */}
            <div className="grid grid-cols-2 gap-px bg-border/30 shrink-0 p-px">
              <StatTile
                  label="CELLS SCANNED"
                  value={`${state.grid.flat().filter(c => c.scanned).length}`}
                  sub={`/ ${state.config.gridSize * state.config.gridSize}`}
                  icon={<ScanIcon />}
              />
              <StatTile
                  label="COVERAGE"
                  value={`${state.stats.coverage}%`}
                  color={state.stats.coverage >= 80 ? '#10B981' : state.stats.coverage >= 40 ? '#F59E0B' : undefined}
                  icon={<CoverageIcon />}
              />
              <StatTile
                  label="SURVIVORS FOUND"
                  value={`${state.stats.survivorsFound}`}
                  sub={`/ ${state.stats.totalSurvivors}`}
                  color={state.stats.survivorsFound === state.stats.totalSurvivors ? '#10B981' : undefined}
                  icon={<SurvivorIcon />}
              />
              <StatTile
                  label="CHARGING"
                  value={`${state.drones.filter(d => d.status === 'charging').length}`}
                  sub="at base"
                  icon={<BatteryIcon />}
              />
            </div>

            {/* Drone cards - scrollable area with custom scrollbar */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-primary/30">
              <DroneFleet
                  drones={state.drones}
                  selectedId={state.selectedDroneId}
                  onSelect={handleSelectDrone}
                  onReturnToBase={handleReturnToBase}
              />
            </div>

            {/* Selected drone detail with glass effect */}
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

        {/* Custom animations and scrollbar styles */}
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          
          .animation-delay-1000 {
            animation-delay: 1000ms;
          }
          
          .animation-delay-2000 {
            animation-delay: 2000ms;
          }
          
          .bg-grid-pattern {
            background-image: 
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 50px 50px;
          }
          
          /* Custom scrollbar */
          .scrollbar-thin::-webkit-scrollbar {
            width: 4px;
          }
          
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .scrollbar-thin::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            transition: all 0.3s;
          }
          
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background: rgba(99, 102, 241, 0.3);
          }
        `}</style>
      </div>
  );
};

// ─── Helper sub-components with icons ─────────────────────────────────────────

const Legend: React.FC<{ color: string; label: string; border?: boolean }> = ({ color, label, border }) => (
    <div className="flex items-center gap-1.5 group">
      <div
          className="w-2.5 h-2.5 rounded-sm transition-transform group-hover:scale-110"
          style={{
            backgroundColor: color,
            border: border ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
            boxShadow: border ? '0 0 8px rgba(255,255,255,0.1)' : 'none'
          }}
      />
      <span className="font-mono text-[9px] text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
        {label}
      </span>
    </div>
);

// Icon components
const ScanIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
      <rect x="2" y="2" width="20" height="20" rx="2.18"/>
      <line x1="8" y1="2" x2="8" y2="22"/>
      <line x1="16" y1="2" x2="16" y2="22"/>
      <line x1="2" y1="8" x2="22" y2="8"/>
      <line x1="2" y1="16" x2="22" y2="16"/>
    </svg>
);

const CoverageIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a15 15 0 0 0 0 20 15 15 0 0 0 0-20z"/>
    </svg>
);

const SurvivorIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
);

const BatteryIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2"/>
      <line x1="22" x2="22" y1="11" y2="13"/>
    </svg>
);

const StatTile: React.FC<{ label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }> = ({
                                                                                                                      label, value, sub, color, icon
                                                                                                                    }) => (
    <div className="bg-card/40 backdrop-blur-sm px-3 py-2.5 hover:bg-card/60 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[8px] text-muted-foreground/50 tracking-widest">{label}</div>
        {icon && <div className="text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors">{icon}</div>}
      </div>
      <div className="font-mono text-sm font-bold" style={{ color: color ?? 'hsl(var(--foreground))' }}>
        {value}
        {sub && <span className="text-[9px] text-muted-foreground/50 font-normal ml-1">{sub}</span>}
      </div>
    </div>
);

const SelectedDroneDetail: React.FC<{ drone: Drone | undefined }> = ({ drone }) => {
  if (!drone) return null;
  return (
      <div className="border-t border-border/50 bg-gradient-to-t from-card/40 to-transparent backdrop-blur-sm p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-primary/50 rounded-full animate-pulse" />
            <span className="font-mono text-[10px] font-bold text-foreground">{drone.id}</span>
          </div>
          <span className="font-mono text-[8px] text-muted-foreground/50 bg-background/50 px-2 py-1 rounded-full border border-border/30">
            Queue: {drone.pathQueue.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat2 label="POSITION" value={`(${drone.position.x}, ${drone.position.y})`} />
          <MiniStat2 label="BATTERY" value={`${Math.round(drone.battery)}%`}
                     battery={drone.battery} />
          <MiniStat2 label="SECTOR" value={['NORTH-WEST','NORTH-EAST','SOUTH-WEST','SOUTH-EAST'][drone.sector % 4]} />
          <MiniStat2 label="DETECTIONS" value={String(drone.detectedSurvivorIds.length)} />
        </div>

        {drone.pathQueue.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[7px] text-muted-foreground/50 tracking-wider mb-2">NEXT WAYPOINTS</div>
              <div className="flex flex-wrap gap-1">
                {drone.pathQueue.slice(0, 6).map((p, i) => (
                    <span key={i} className="font-mono text-[8px] px-1.5 py-1 bg-primary/10 text-primary
                                           border border-primary/20 rounded-md hover:bg-primary/20
                                           transition-colors cursor-default">
                      {p.x},{p.y}
                    </span>
                ))}
                {drone.pathQueue.length > 6 && (
                    <span className="font-mono text-[8px] text-muted-foreground/50 px-1.5 py-1">
                      +{drone.pathQueue.length - 6}
                    </span>
                )}
              </div>
            </div>
        )}
      </div>
  );
};

const MiniStat2: React.FC<{ label: string; value: string; battery?: number }> = ({ label, value, battery }) => (
    <div className="group">
      <div className="font-mono text-[7px] text-muted-foreground/50 tracking-wider mb-1">{label}</div>
      <div className="font-mono text-[10px] text-foreground font-medium flex items-center gap-1">
        {battery !== undefined && (
            <div className="w-12 h-1.5 bg-border/50 rounded-full overflow-hidden">
              <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${battery}%`,
                    backgroundColor: battery > 80 ? '#10B981' : battery > 50 ? '#F59E0B' : battery > 20 ? '#F97316' : '#EF4444'
                  }}
              />
            </div>
        )}
        <span className={battery !== undefined ? 'text-[8px]' : ''}>{value}</span>
      </div>
    </div>
);

export default Index;