// ===================================================
// simulation/commandAgent.ts
// Central Command Agent — Chain-of-Thought reasoning,
// sector assignment, drone coordination via "MCP calls"
// ===================================================

import {
  SimulationState, LogEntry, LogLevel, Drone, Position
} from '../types/simulation';
import {
  mcp_discoverDrones, mcp_moveTo, mcp_thermalScan, mcp_chargeDrone,
  findBestTarget, planPath, makeId, getSectorBounds
} from './mcpServer';

// ─── Logging helper ──────────────────────────────────────────────────────────

function makeLog(tick: number, level: LogLevel, message: string, droneId?: string): LogEntry {
  return { id: makeId(), tick, timestamp: Date.now(), level, message, droneId };
}

// ─── Tracks which battery-threshold warnings have already fired ──────────────
// Key: `${droneId}-${threshold}` — cleared on redeploy so they fire again
const loggedBatteryWarnings = new Set<string>();

// ─── Tracks drones that already logged "on the way to base" ─────────────────
const loggedReturning = new Set<string>();

// ─── Tracks sector assigned last time (to log only on change) ────────────────
const lastLoggedSector = new Map<string, string>();

// ─── Main agent tick ─────────────────────────────────────────────────────────

export function commandAgentTick(state: SimulationState): SimulationState {
  if (!state.running) return state;

  if (state.stats.missionComplete) {
    return handleMissionComplete(state);
  }

  const tick = state.stats.tick + 1;
  const newLogs: LogEntry[] = [];
  let currentState = { ...state, stats: { ...state.stats, tick } };

  const drones = mcp_discoverDrones(currentState);

  for (const drone of drones) {
    const result = processDrone(currentState, drone, tick, newLogs);
    currentState = result.state;
    newLogs.push(...result.logs);
  }

  // Check mission complete
  if (currentState.stats.missionComplete) {
    const gs = currentState.config.gridSize;
    newLogs.push(makeLog(tick, 'success',
      `🎯 MISSION COMPLETE — All ${gs}×${gs} scannable cells visited in ${tick} ticks! ` +
      `Coverage: ${currentState.stats.coverage}% | Survivors found: ${currentState.stats.survivorsFound}/${currentState.stats.totalSurvivors}. Recalling all drones to base.`
    ));
    currentState = recallAllDrones(currentState, tick, newLogs);
  }

  const allLogs = [...currentState.log, ...newLogs].slice(-500);
  return { ...currentState, log: allLogs };
}

// ─── Recall all drones to base after mission complete ───────────────────────

function recallAllDrones(state: SimulationState, tick: number, logs: LogEntry[]): SimulationState {
  const BASE: Position = { x: 0, y: 0 };
  let currentState = state;

  currentState.drones.forEach(drone => {
    if (drone.status === 'charging') return;
    if (drone.position.x === BASE.x && drone.position.y === BASE.y) return;

    const returnPath = planPath(drone.position, BASE, currentState.grid, currentState.config.gridSize);
    const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
    const updatedDrones = [...currentState.drones];
    updatedDrones[dIdx] = { ...drone, status: 'returning', pathQueue: returnPath };
    currentState = { ...currentState, drones: updatedDrones };

    if (!loggedReturning.has(drone.id)) {
      loggedReturning.add(drone.id);
      logs.push(makeLog(tick, 'info', `🏠 ${drone.id} en route to base — mission complete.`, drone.id));
    }
  });

  return currentState;
}

// ─── Handle ongoing return-to-base after mission ────────────────────────────

function handleMissionComplete(state: SimulationState): SimulationState {
  const BASE: Position = { x: 0, y: 0 };
  const tick = state.stats.tick + 1;
  const newLogs: LogEntry[] = [];
  let currentState = { ...state, stats: { ...state.stats, tick } };

  const allHome = currentState.drones.every(
    d => d.status === 'charging' || (d.position.x === BASE.x && d.position.y === BASE.y)
  );
  if (allHome) {
    return { ...currentState, running: false, log: [...currentState.log, ...newLogs].slice(-500) };
  }

  for (const drone of currentState.drones) {
    if (drone.status === 'charging') continue;
    if (drone.position.x === BASE.x && drone.position.y === BASE.y) {
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...drone, status: 'charging' };
      currentState = { ...currentState, drones: updatedDrones };
      continue;
    }

    let currentDrone = currentState.drones.find(d => d.id === drone.id)!;
    if (currentDrone.pathQueue.length === 0 || currentDrone.status !== 'returning') {
      const returnPath = planPath(currentDrone.position, BASE, currentState.grid, currentState.config.gridSize);
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, status: 'returning', pathQueue: returnPath };
      currentState = { ...currentState, drones: updatedDrones };
    }

    currentState = moveOneStep(currentState, drone.id, BASE, tick, newLogs);
  }

  const allLogs = [...currentState.log, ...newLogs].slice(-500);
  return { ...currentState, log: allLogs };
}

// ─── Per-drone processing ────────────────────────────────────────────────────

function processDrone(
  state: SimulationState,
  drone: Drone,
  tick: number,
  _parentLogs: LogEntry[]
): { state: SimulationState; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  let currentState = state;
  const { config } = state;
  const BASE: Position = { x: 0, y: 0 };

  const freshDrone = currentState.drones.find(d => d.id === drone.id)!;

  // ── Manual RTB override ────────────────────────────────────────────────
  if (freshDrone.forceReturn && freshDrone.status !== 'returning' && freshDrone.status !== 'charging') {
    const returnPath = planPath(freshDrone.position, BASE, currentState.grid, config.gridSize);
    const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
    const updatedDrones = [...currentState.drones];
    updatedDrones[dIdx] = { ...freshDrone, status: 'returning', pathQueue: returnPath, forceReturn: false };
    currentState = { ...currentState, drones: updatedDrones };
    loggedReturning.add(drone.id);
    logs.push(makeLog(tick, 'warn', `⚠ ${drone.id} MANUAL RECALL — operator ordered return to base.`, drone.id));
    return { state: currentState, logs };
  }

  // ── Charging at base ────────────────────────────────────────────────────
  if (drone.status === 'charging') {
    currentState = mcp_chargeDrone(currentState, drone.id);
    const charged = currentState.drones.find(d => d.id === drone.id)!;

    if (charged.status === 'idle') {
      // Drone just finished charging → redeploy log
      // Clear battery warning keys so they fire again next sortie
      loggedBatteryWarnings.forEach(k => { if (k.startsWith(drone.id)) loggedBatteryWarnings.delete(k); });
      loggedReturning.delete(drone.id);

      const sectorName = getSectorLabel(charged.sector, config.gridSize);
      const uncovered = currentState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;
      logs.push(makeLog(tick, 'info',
        `🔋 ${drone.id} fully charged. Redeploying → Sector ${sectorName} | ${uncovered} cells remaining.`,
        drone.id
      ));
    }
    return { state: currentState, logs };
  }

  // ── Battery threshold warnings (50%, 25%) ──────────────────────────────
  const bat = Math.round(freshDrone.battery);

  if (bat <= 50 && bat > 25 && freshDrone.status !== 'returning') {
    const key50 = `${drone.id}-50`;
    if (!loggedBatteryWarnings.has(key50)) {
      loggedBatteryWarnings.add(key50);
      logs.push(makeLog(tick, 'warn',
        `⚡ ${drone.id} battery at ${bat}% — switching to conservative range.`,
        drone.id
      ));
    }
  }

  // ── Critical battery → returning ───────────────────────────────────────
  if (freshDrone.battery <= 25 && freshDrone.status !== 'returning') {
    const key25 = `${drone.id}-25`;
    if (!loggedBatteryWarnings.has(key25)) {
      loggedBatteryWarnings.add(key25);
      logs.push(makeLog(tick, 'warn',
        `⚠ ${drone.id} CRITICAL BATTERY (${bat}%) — aborting mission, returning to base.`,
        drone.id
      ));
    }
    const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
    const returnPath = planPath(freshDrone.position, BASE, currentState.grid, config.gridSize);
    const updatedDrones = [...currentState.drones];
    updatedDrones[dIdx] = { ...freshDrone, status: 'returning', pathQueue: returnPath };
    currentState = { ...currentState, drones: updatedDrones };
  }

  // ── Returning to base ───────────────────────────────────────────────────
  const currentDrone = currentState.drones.find(d => d.id === drone.id)!;

  if (currentDrone.status === 'returning') {
    // Log "on the way to base" only once per return trip
    if (!loggedReturning.has(drone.id)) {
      loggedReturning.add(drone.id);
      logs.push(makeLog(tick, 'warn',
        `🛬 ${drone.id} en route to base for recharge. Battery: ${Math.round(currentDrone.battery)}%.`,
        drone.id
      ));
    }

    if (currentDrone.position.x === BASE.x && currentDrone.position.y === BASE.y) {
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, status: 'charging' };
      currentState = { ...currentState, drones: updatedDrones };
      logs.push(makeLog(tick, 'info',
        `🔌 ${drone.id} docked at base. Initiating recharge sequence.`,
        drone.id
      ));
    } else {
      currentState = moveOneStep(currentState, drone.id, BASE, tick, logs);
    }
    return { state: currentState, logs };
  }

  // ── Plan new path if queue empty ────────────────────────────────────────
  if (currentDrone.pathQueue.length === 0) {
    const target = findBestTarget(currentDrone, currentState.grid, config, currentState.drones);
    if (target) {
      const path = planPath(currentDrone.position, target, currentState.grid, config.gridSize);
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, pathQueue: path, status: 'navigating' };
      currentState = { ...currentState, drones: updatedDrones };

      // Log sector assignment only when the sector actually changes
      const sectorName = getSectorLabel(currentDrone.sector, config.gridSize);
      const prevSector = lastLoggedSector.get(drone.id);
      if (prevSector !== sectorName) {
        lastLoggedSector.set(drone.id, sectorName);
        const uncovered = currentState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;
        logs.push(makeLog(tick, 'agent',
          `[Command Agent] ${drone.id} assigned Sector ${sectorName}. Battery ${Math.round(currentDrone.battery)}% → ${uncovered} uncovered cells remaining.`,
          drone.id
        ));
      }
    }
    return { state: currentState, logs };
  }

  // ── Move one step (silent) ──────────────────────────────────────────────
  const beforeMove = currentState.drones.find(d => d.id === drone.id)!;
  currentState = moveOneStep(currentState, drone.id, beforeMove.pathQueue[0] ?? BASE, tick, logs);

  // ── Thermal scan ─────────────────────────────────────────────────────────
  const { state: scannedState, response } = mcp_thermalScan(currentState, { drone_id: drone.id });
  currentState = scannedState;

  const afterMove = currentState.drones.find(d => d.id === drone.id)!;
  const pos = afterMove.position;

  if (response.thermal_noise) {
    // Log every thermal noise event (they are already infrequent by config)
    logs.push(makeLog(tick, 'warn',
      `📡 ${drone.id} THERMAL NOISE at (${pos.x},${pos.y}) — scan interference, cell may need re-scan.`,
      drone.id
    ));
  } else if (response.survivor_detected && response.survivor_id) {
    logs.push(makeLog(tick, 'detect',
      `🚨 ${drone.id} THERMAL SIGNATURE DETECTED! Survivor ${response.survivor_id} at (${pos.x},${pos.y}). Marking position.`,
      drone.id
    ));
  }

  return { state: currentState, logs };
}

// ─── Move helper (always silent — no per-step log) ───────────────────────────

function moveOneStep(
  state: SimulationState,
  droneId: string,
  target: Position,
  tick: number,
  logs: LogEntry[]
): SimulationState {
  const drone = state.drones.find(d => d.id === droneId)!;
  const nextStep = drone.pathQueue[0] ?? target;

  const { state: movedState, success } = mcp_moveTo(state, {
    drone_id: droneId,
    x: nextStep.x,
    y: nextStep.y,
  });

  if (!success) {
    // Clear path so next tick re-plans — no log (routine replanning is noise)
    const idx = movedState.drones.findIndex(d => d.id === droneId);
    const updatedDrones = [...movedState.drones];
    updatedDrones[idx] = { ...drone, pathQueue: [] };
    return { ...movedState, drones: updatedDrones };
  }

  return movedState;
}

// ─── Sector label helper ─────────────────────────────────────────────────────

function getSectorLabel(sector: number, gridSize: number): string {
  const bounds = getSectorBounds(sector, gridSize);
  return `[col ${bounds.minX}–${bounds.maxX}, row ${bounds.minY}–${bounds.maxY}]`;
}
