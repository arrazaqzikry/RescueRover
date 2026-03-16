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
  findBestTarget, planPath, makeId
} from './mcpServer';

// ─── Logging helper ──────────────────────────────────────────────────────────

function makeLog(tick: number, level: LogLevel, message: string, droneId?: string): LogEntry {
  return { id: makeId(), tick, timestamp: Date.now(), level, message, droneId };
}

// ─── Main agent tick ─────────────────────────────────────────────────────────

export function commandAgentTick(state: SimulationState): SimulationState {
  if (!state.running) return state;

  // If mission is complete, ensure all drones return to base and stop
  if (state.stats.missionComplete) {
    return handleMissionComplete(state);
  }

  const tick = state.stats.tick + 1;
  const newLogs: LogEntry[] = [];
  let currentState = { ...state, stats: { ...state.stats, tick } };

  // ── STEP 1: Discover drones ─────────────────────────────────────────────
  const drones = mcp_discoverDrones(currentState);

  // ── STEP 2: Process each drone ─────────────────────────────────────────
  for (const drone of drones) {
    const result = processDrone(currentState, drone, tick, newLogs);
    currentState = result.state;
    newLogs.push(...result.logs);
  }

  // ── STEP 3: Periodic agent report (every 15 ticks) ─────────────────────
  if (tick % 15 === 0) {
    const coverage = currentState.stats.coverage;
    const survivors = currentState.stats.survivorsFound;
    const total = currentState.stats.totalSurvivors;
    newLogs.push(makeLog(tick, 'agent',
      `[Command Agent] T${tick} Status — Coverage: ${coverage}% | Survivors: ${survivors}/${total} | ` +
      `Active: ${drones.filter(d => d.status !== 'charging').length}/${drones.length} drones`
    ));
  }

  // ── STEP 4: Check if all non-obstacle cells are now scanned ────────────
  if (currentState.stats.missionComplete) {
    newLogs.push(makeLog(tick, 'success',
      `🎯 MISSION COMPLETE — All ${currentState.config.gridSize}×${currentState.config.gridSize} cells visited in ${tick} ticks! ` +
      `Coverage: ${currentState.stats.coverage}% | Survivors found: ${currentState.stats.survivorsFound}/${currentState.stats.totalSurvivors}. Recalling all drones to base.`
    ));
    // Begin recalling all drones to base
    currentState = recallAllDrones(currentState, tick, newLogs);
  }

  // Keep log to last 400 entries
  const allLogs = [...currentState.log, ...newLogs].slice(-400);

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
    logs.push(makeLog(tick, 'info', `🏠 ${drone.id} recalled to base — mission complete.`, drone.id));
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
    return { ...currentState, running: false, log: [...currentState.log, ...newLogs].slice(-400) };
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

    // Ensure path to base — always keep moving towards base visibly
    let currentDrone = currentState.drones.find(d => d.id === drone.id)!;
    if (currentDrone.pathQueue.length === 0 || currentDrone.status !== 'returning') {
      const returnPath = planPath(currentDrone.position, BASE, currentState.grid, currentState.config.gridSize);
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, status: 'returning', pathQueue: returnPath };
      currentState = { ...currentState, drones: updatedDrones };
    }

    // Move one step per tick — this makes return movement visible on grid
    currentState = moveOneStep(currentState, drone.id, BASE, tick, newLogs, true);
  }

  const allLogs = [...currentState.log, ...newLogs].slice(-400);
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

  // ── Check if manually forced to return ──────────────────────────────────
  const freshDrone = currentState.drones.find(d => d.id === drone.id)!;
  if (freshDrone.forceReturn && freshDrone.status !== 'returning' && freshDrone.status !== 'charging') {
    const returnPath = planPath(freshDrone.position, BASE, currentState.grid, config.gridSize);
    const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
    const updatedDrones = [...currentState.drones];
    updatedDrones[dIdx] = { ...freshDrone, status: 'returning', pathQueue: returnPath, forceReturn: false };
    currentState = { ...currentState, drones: updatedDrones };
    logs.push(makeLog(tick, 'warn',
      `⚠ ${drone.id} MANUAL RECALL — operator ordered return to base.`,
      drone.id
    ));
    return { state: currentState, logs };
  }

  // ── Charging drone at base ──────────────────────────────────────────────
  if (drone.status === 'charging') {
    currentState = mcp_chargeDrone(currentState, drone.id);
    const charged = currentState.drones.find(d => d.id === drone.id)!;
    if (charged.status === 'idle') {
      // Compute uncovered cells for CoT
      const uncovered = currentState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;
      logs.push(makeLog(tick, 'agent',
        `[Command Agent] ${drone.id} fully charged (${charged.battery}%). ` +
        `Deploying to sector ${['NW','NE','SW','SE'][charged.sector % 4]}. Battery 100% → targeting ${uncovered} uncovered cells.`,
        drone.id
      ));
    }
    return { state: currentState, logs };
  }

  // ── Low battery → return to base ───────────────────────────────────────
  if (drone.battery <= 25 && drone.status !== 'returning') {
    logs.push(makeLog(tick, 'warn',
      `⚠ ${drone.id} CRITICAL BATTERY (${Math.round(drone.battery)}%). Aborting mission — returning to base.`,
      drone.id
    ));
    const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
    const returnPath = planPath(drone.position, BASE, currentState.grid, config.gridSize);
    const updatedDrones = [...currentState.drones];
    updatedDrones[dIdx] = { ...drone, status: 'returning', pathQueue: returnPath };
    currentState = { ...currentState, drones: updatedDrones };
  }

  // ── Returning to base ───────────────────────────────────────────────────
  const currentDrone = currentState.drones.find(d => d.id === drone.id)!;

  if (currentDrone.status === 'returning') {
    if (currentDrone.position.x === BASE.x && currentDrone.position.y === BASE.y) {
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, status: 'charging' };
      currentState = { ...currentState, drones: updatedDrones };
      logs.push(makeLog(tick, 'warn',
        `Drone ${drone.id} docked at base. Initiating recharge sequence.`,
        drone.id
      ));
    } else {
      // Move one step — visible on grid
      currentState = moveOneStep(currentState, drone.id, BASE, tick, logs, true);
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

      // CoT reasoning log when planning new route (only occasionally to reduce noise)
      if (Math.random() < 0.35 || drone.battery < 50) {
        const sectorName = ['NW', 'NE', 'SW', 'SE'][currentDrone.sector % 4];
        const uncovered = currentState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;
        logs.push(makeLog(tick, 'agent',
          `[Command Agent] ${drone.id} assigned Sector [${sectorName}]. Battery ${Math.round(drone.battery)}% → targeting ${uncovered} uncovered cells.`,
          drone.id
        ));
      }
    }
    return { state: currentState, logs };
  }

  // ── Move one step (silent movement — no log per step) ──────────────────
  const beforeMove = currentState.drones.find(d => d.id === drone.id)!;
  currentState = moveOneStep(currentState, drone.id, beforeMove.pathQueue[0] ?? BASE, tick, logs, true);

  // ── Thermal scan at new position ────────────────────────────────────────
  const { state: scannedState, response } = mcp_thermalScan(currentState, { drone_id: drone.id });
  currentState = scannedState;

  const afterMove = currentState.drones.find(d => d.id === drone.id)!;
  const pos = afterMove.position;

  if (response.thermal_noise) {
    // Only log thermal noise occasionally to avoid spam
    if (Math.random() < 0.2) {
      logs.push(makeLog(tick, 'warn',
        `📡 ${drone.id} thermal NOISE at (${pos.x},${pos.y}) — scan unreliable.`,
        drone.id
      ));
    }
  } else if (response.survivor_detected && response.survivor_id) {
    logs.push(makeLog(tick, 'detect',
      `🚨 Drone ${drone.id} THERMAL SIGNATURE DETECTED! Survivor ${response.survivor_id} at (${pos.x},${pos.y}). Marking position.`,
      drone.id
    ));
  }

  return { state: currentState, logs };
}

// ─── Move helper ─────────────────────────────────────────────────────────────

function moveOneStep(
  state: SimulationState,
  droneId: string,
  target: Position,
  tick: number,
  logs: LogEntry[],
  silent: boolean
): SimulationState {
  const drone = state.drones.find(d => d.id === droneId)!;
  const nextStep = drone.pathQueue[0] ?? target;

  const { state: movedState, success, message } = mcp_moveTo(state, {
    drone_id: droneId,
    x: nextStep.x,
    y: nextStep.y,
  });

  if (!success) {
    if (!silent) {
      logs.push(makeLog(tick, 'warn',
        `⛔ ${droneId} blocked at (${nextStep.x},${nextStep.y}): ${message}. Re-planning...`,
        droneId
      ));
    }
    // Clear path so next tick re-plans around the obstacle/collision
    const idx = movedState.drones.findIndex(d => d.id === droneId);
    const updatedDrones = [...movedState.drones];
    updatedDrones[idx] = { ...drone, pathQueue: [] };
    return { ...movedState, drones: updatedDrones };
  }

  return movedState;
}
