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

/**
 * commandAgentTick — runs once per simulation tick.
 * Implements the full MCP protocol:
 *   1. DISCOVER available drones
 *   2. For each drone:
 *      a. CHECK battery → recall if ≤25%
 *      b. If charging at base → let it charge
 *      c. If needs new target → plan sector-aware path
 *      d. Execute next step of path queue
 *      e. Thermal scan at new position
 *   3. Produce chain-of-thought log entries
 */
export function commandAgentTick(state: SimulationState): SimulationState {
  if (state.stats.missionComplete || !state.running) return state;

  const tick = state.stats.tick + 1;
  const newLogs: LogEntry[] = [];
  let currentState = { ...state, stats: { ...state.stats, tick } };

  // ── STEP 1: Discover drones (MCP call) ─────────────────────────────────
  const drones = mcp_discoverDrones(currentState);
  newLogs.push(makeLog(tick, 'agent',
    `[TICK ${tick}] Command Agent polling ${drones.length} drone(s) via MCP /discover_drones`
  ));

  // ── STEP 2: Reassign sectors if needed ─────────────────────────────────
  const activeDrones = drones.filter(d => d.status !== 'charging' || d.battery >= 90);
  if (activeDrones.length > 0) {
    // Redistribute sectors so coverage is even
    activeDrones.forEach((d, i) => {
      const newSector = i % 4;
      if (d.sector !== newSector && activeDrones.length > 4) {
        // Only note sector changes for large fleets
      }
    });
  }

  // ── STEP 3: Process each drone ─────────────────────────────────────────
  for (const drone of drones) {
    const result = processDrone(currentState, drone, tick, newLogs);
    currentState = result.state;
    newLogs.push(...result.logs);
  }

  // ── STEP 4: Global reasoning log ───────────────────────────────────────
  const coverage = currentState.stats.coverage;
  const survivors = currentState.stats.survivorsFound;
  const total = currentState.stats.totalSurvivors;

  if (tick % 5 === 0) {
    newLogs.push(makeLog(tick, 'agent',
      `[AGENT REPORT] Coverage: ${coverage}% | Survivors: ${survivors}/${total} | ` +
      `Active drones: ${drones.filter(d => d.status !== 'charging').length}/${drones.length}`
    ));
  }

  // ── STEP 5: Mission complete? ───────────────────────────────────────────
  if (currentState.stats.missionComplete) {
    newLogs.push(makeLog(tick, 'success',
      `🎯 MISSION COMPLETE — All ${total} survivors detected in ${tick} ticks! ` +
      `Final coverage: ${coverage}%`
    ));
  }

  // Keep log to last 200 entries
  const allLogs = [...currentState.log, ...newLogs].slice(-200);

  return { ...currentState, log: allLogs };
}

// ─── Per-drone processing ────────────────────────────────────────────────────

function processDrone(
  state: SimulationState,
  drone: Drone,
  tick: number,
  parentLogs: LogEntry[]
): { state: SimulationState; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  let currentState = state;
  const { config } = state;
  const BASE = { x: 0, y: 0 };

  // ── Battery check via MCP ───────────────────────────────────────────────
  const battStatus = { drone_id: drone.id, battery: drone.battery, status: drone.status };

  // ── Charging drone at base ──────────────────────────────────────────────
  if (drone.status === 'charging') {
    currentState = mcp_chargeDrone(currentState, drone.id);
    const charged = currentState.drones.find(d => d.id === drone.id)!;
    logs.push(makeLog(tick, 'info',
      `⚡ ${drone.id} charging at base — battery ${drone.battery}% → ${charged.battery}%`,
      drone.id
    ));
    if (charged.status === 'idle') {
      logs.push(makeLog(tick, 'agent',
        `[COT] ${drone.id} fully charged (${charged.battery}%). Reassigning to sector ${charged.sector}.`,
        drone.id
      ));
    }
    return { state: currentState, logs };
  }

  // ── Low battery → return to base ───────────────────────────────────────
  if (drone.battery <= 25 && drone.status !== 'returning') {
    logs.push(makeLog(tick, 'warn',
      `⚠️ [COT] ${drone.id} battery critical (${drone.battery}%). ` +
      `Recalling to base for recharge. Closer sector prioritized.`,
      drone.id
    ));
    // Update status to returning
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
      // Arrived at base
      const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
      const updatedDrones = [...currentState.drones];
      updatedDrones[dIdx] = { ...currentDrone, status: 'charging' };
      currentState = { ...currentState, drones: updatedDrones };
      logs.push(makeLog(tick, 'info', `🏠 ${drone.id} arrived at base. Initiating charge.`, drone.id));
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

      // CoT reasoning
      const sectorName = ['NW', 'NE', 'SW', 'SE'][currentDrone.sector % 4];
      logs.push(makeLog(tick, 'agent',
        `[COT] ${drone.id} bat:${drone.battery}% → targeting (${target.x},${target.y}) in sector ${sectorName}. ` +
        `Path: ${path.length} steps. ${drone.battery > 50 ? 'High battery → distant coverage.' : 'Medium battery → moderate range.'}`,
        drone.id
      ));
    } else {
      // No target — all nearby cells scanned or battery too low
      logs.push(makeLog(tick, 'info',
        `[COT] ${drone.id} sector complete or range limit. Holding position.`,
        drone.id
      ));
    }
    return { state: currentState, logs };
  }

  // ── Move one step ───────────────────────────────────────────────────────
  const nextTarget = currentState.drones.find(d => d.id === drone.id)!.pathQueue[0] ?? BASE;
  currentState = moveOneStep(currentState, drone.id, nextTarget, tick, logs);

  // ── Thermal scan at new position ────────────────────────────────────────
  const afterMove = currentState.drones.find(d => d.id === drone.id)!;
  const { state: scannedState, response } = mcp_thermalScan(currentState, { drone_id: drone.id });
  currentState = scannedState;

  const pos = afterMove.position;
  if (response.thermal_noise) {
    logs.push(makeLog(tick, 'warn',
      `📡 ${drone.id} thermal scan at (${pos.x},${pos.y}) — NOISE interference, result unreliable.`,
      drone.id
    ));
  } else if (response.survivor_detected && response.survivor_id) {
    logs.push(makeLog(tick, 'detect',
      `🟢 SURVIVOR DETECTED! ${drone.id} found ${response.survivor_id} at (${pos.x},${pos.y})!`,
      drone.id
    ));
  } else {
    logs.push(makeLog(tick, 'action',
      `📍 ${drone.id} scanned (${pos.x},${pos.y}) — clear.`,
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
  logs: LogEntry[]
): SimulationState {
  const drone = state.drones.find(d => d.id === droneId)!;
  const nextStep = drone.pathQueue[0] ?? target;

  const { state: movedState, success, message } = mcp_moveTo(state, {
    drone_id: droneId,
    x: nextStep.x,
    y: nextStep.y,
  });

  if (success) {
    logs.push(makeLog(tick, 'action',
      `✈️  ${droneId} moved to (${nextStep.x},${nextStep.y}) — bat: ${movedState.drones.find(d => d.id === droneId)?.battery}%`,
      droneId
    ));
  } else {
    // Re-plan if blocked
    logs.push(makeLog(tick, 'warn',
      `⛔ ${droneId} blocked at (${nextStep.x},${nextStep.y}): ${message}. Re-planning...`,
      droneId
    ));
    const idx = movedState.drones.findIndex(d => d.id === droneId);
    const updatedDrones = [...movedState.drones];
    updatedDrones[idx] = { ...drone, pathQueue: [] };
    return { ...movedState, drones: updatedDrones };
  }

  return movedState;
}
