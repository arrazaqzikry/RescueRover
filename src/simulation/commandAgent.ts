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

// ─── Statistics tracking ────────────────────────────────────────────────────

// Track mission statistics
let totalReassignments = 0;
let totalNoiseEvents = 0;
let startTick = 0;
let lastSummaryTick = 0;

// Track per-drone efficiency
const droneCellsScanned = new Map<string, number>();
const droneActiveTicks = new Map<string, number>();

// ─── Sector coverage monitoring ─────────────────────────────────────────────

// Track sector coverage and reassignments
const sectorCoverageLastChecked = new Map<number, number>();
const droneLastSector = new Map<string, number>();
const lastReassignmentTick = new Map<string, number>();
const completedSectorsLog = new Set<number>(); // Track which sectors we've logged as completed
const reassignmentCooldown = 20; // Ticks before a drone can be reassigned again

// Convert sector index to letter (A, B, C, D, etc.)
function getSectorLetter(sectorIndex: number): string {
  return String.fromCharCode(65 + sectorIndex); // 65 is 'A'
}

// Calculate coverage percentage for a specific sector (for display only)
function calculateSectorCoverage(state: SimulationState, sectorIndex: number): number {
  const { grid, config, drones } = state;
  const bounds = getSectorBounds(sectorIndex, drones.length, config.gridSize);

  let totalCells = 0;
  let scannedCells = 0;

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!grid[y][x].hasObstacle) {
        totalCells++;
        if (grid[y][x].scanned) {
          scannedCells++;
        }
      }
    }
  }

  return totalCells > 0 ? Math.round((scannedCells / totalCells) * 100) : 100;
}

// Check if a sector is FULLY scanned (all non-obstacle cells done)
function isSectorFullyScanned(state: SimulationState, sectorIndex: number): boolean {
  const { grid, config, drones } = state;
  const bounds = getSectorBounds(sectorIndex, drones.length, config.gridSize);

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      // Skip obstacles - they don't need to be scanned
      if (!grid[y][x].hasObstacle && !grid[y][x].scanned) {
        return false; // Found an unscanned non-obstacle cell
      }
    }
  }

  return true; // All non-obstacle cells are scanned
}

// Calculate drone density in a sector
function getDroneDensity(state: SimulationState, sectorIndex: number): number {
  const { drones } = state;
  return drones.filter(d => d.sector === sectorIndex).length;
}

// Determine noise level in a sector (simplified - would need actual tracking)
function getSectorNoiseLevel(state: SimulationState, sectorIndex: number): string {
  // This is a placeholder - you'd need to track noise events per sector
  // For now, return random but deterministic based on sector index
  const noiseLevels = ['low', 'medium', 'high'];
  return noiseLevels[sectorIndex % 3];
}

// Calculate reassignment score for a sector
function calculateSectorScore(state: SimulationState, sectorIndex: number): number {
  const coverage = calculateSectorCoverage(state, sectorIndex);
  const droneDensity = getDroneDensity(state, sectorIndex);
  const noiseLevel = getSectorNoiseLevel(state, sectorIndex);

  // Base score is inverse of coverage (lower coverage = higher priority)
  let score = 100 - coverage;

  // Adjust for drone density (fewer drones = higher priority)
  score += (3 - droneDensity) * 5;

  // Adjust for noise (high noise = lower priority because it's harder)
  if (noiseLevel === 'high') score -= 10;
  if (noiseLevel === 'medium') score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Mission Analysis ───────────────────────────────────────────────────────

function addMissionAnalysis(state: SimulationState, tick: number, logs: LogEntry[]): void {
  const { stats, drones, grid } = state;

  // Calculate average efficiency (cells scanned per tick per drone)
  let totalEfficiency = 0;
  let activeDrones = 0;

  for (const drone of drones) {
    const cellsScanned = droneCellsScanned.get(drone.id) || 0;
    const activeTicks = droneActiveTicks.get(drone.id) || 1;
    const efficiency = cellsScanned / activeTicks;

    if (efficiency > 0) {
      totalEfficiency += efficiency;
      activeDrones++;
    }
  }

  const avgEfficiency = activeDrones > 0 ? (totalEfficiency / activeDrones).toFixed(1) : "0.0";

  // Calculate total scannable cells
  const totalScannable = grid.flat().filter(c => !c.hasObstacle).length;
  const scannedNonObstacle = grid.flat().filter(c => c.scanned && !c.hasObstacle).length;
  const trueCoverage = Math.round((scannedNonObstacle / totalScannable) * 100);

  // Show sector distribution info
  const sectorInfo = drones.map((_, i) => {
    const bounds = getSectorBounds(i, drones.length, state.config.gridSize);
    return `${getSectorLetter(i)}:${bounds.minX}-${bounds.maxX},${bounds.minY}-${bounds.maxY}`;
  }).join(' | ');

  // Only show found survivors, not the total (realistic - you don't know total)
  logs.push(makeLog(tick, 'info',
      `[Mission Analysis]\n` +
      `  Total Coverage: ${trueCoverage}%\n` +
      `  Survivors Found: ${stats.survivorsFound}\n` +
      `  Avg Efficiency: ${avgEfficiency} cells/sec/drone\n` +
      `  Reassignments: ${totalReassignments}\n` +
      `  Noise Events Handled: ${totalNoiseEvents}`,
      undefined
  ));

  // Occasionally log sector boundaries for debugging
  if (tick % 100 === 0) {
    logs.push(makeLog(tick, 'agent',
        `[Sector Boundaries] ${sectorInfo}`,
        undefined
    ));
  }

  lastSummaryTick = tick;
}

// Update drone statistics
function updateDroneStats(drone: Drone, tick: number): void {
  const droneId = drone.id;
  const currentTicks = droneActiveTicks.get(droneId) || 0;
  droneActiveTicks.set(droneId, currentTicks + 1);

  // cellsScanned is tracked in mcp_thermalScan, we just read it here
  droneCellsScanned.set(droneId, drone.cellsScanned);
}

// ─── Sector Completion Check ────────────────────────────────────────────────

function checkSectorCompletions(
    state: SimulationState,
    tick: number,
    logs: LogEntry[]
): void {
  const { drones } = state;

  // Check each sector for full completion (all non-obstacle cells scanned)
  for (let i = 0; i < drones.length; i++) {
    if (isSectorFullyScanned(state, i) && !completedSectorsLog.has(i)) {
      completedSectorsLog.add(i);
      const sectorLetter = getSectorLetter(i);
      const coverage = calculateSectorCoverage(state, i);
      logs.push(makeLog(tick, 'success',
          `✅ Sector ${sectorLetter} COMPLETED! (${coverage}% coverage - all cells scanned)`,
          undefined
      ));
    }
  }
}

// Monitor and reassign drones ONLY when their current sector is fully finished
function monitorAndReassignDrones(
    state: SimulationState,
    tick: number,
    logs: LogEntry[]
): SimulationState {
  let currentState = state;
  const { drones } = state;

  // If only one drone, no need to reassign
  if (drones.length <= 1) {
    return currentState;
  }

  // Calculate coverage for all sectors (for logging)
  const sectorCoverages = drones.map((_, i) => ({
    sector: i,
    coverage: calculateSectorCoverage(state, i)
  }));

  // Find sectors that are FULLY SCANNED (all non-obstacle cells done)
  const fullyScannedSectors: number[] = [];
  for (let i = 0; i < drones.length; i++) {
    if (isSectorFullyScanned(state, i)) {
      fullyScannedSectors.push(i);
    }
  }

  // If no sectors are fully scanned, no reassignments needed
  if (fullyScannedSectors.length === 0) {
    return currentState;
  }

  // Find sectors that still need work (not fully scanned)
  const incompleteSectors: { sector: number; coverage: number; score: number; noise: string; density: number }[] = [];
  for (let i = 0; i < drones.length; i++) {
    if (!fullyScannedSectors.includes(i)) {
      incompleteSectors.push({
        sector: i,
        coverage: sectorCoverages[i].coverage,
        score: calculateSectorScore(state, i),
        noise: getSectorNoiseLevel(state, i),
        density: getDroneDensity(state, i)
      });
    }
  }

  if (incompleteSectors.length === 0) return currentState;

  // Sort incomplete sectors by score (highest priority first)
  const sortedIncomplete = [...incompleteSectors].sort((a, b) => b.score - a.score);
  const highestPrioritySector = sortedIncomplete[0];

  // Count how many drones are already assigned to the highest priority sector
  const dronesInTargetSector = drones.filter(d => d.sector === highestPrioritySector.sector).length;
  const totalDrones = drones.length;

  // Allow up to 40% of drones in one sector
  const maxDronesPerSector = Math.max(2, Math.floor(totalDrones * 0.4));

  // If the highest priority sector already has enough drones, look for the next highest
  let targetSector = highestPrioritySector;
  let targetDronesCount = dronesInTargetSector;

  if (targetDronesCount >= maxDronesPerSector) {
    // Find the next highest priority sector that has room
    for (let i = 1; i < sortedIncomplete.length; i++) {
      const candidate = sortedIncomplete[i];
      const candidateDroneCount = drones.filter(d => d.sector === candidate.sector).length;

      if (candidateDroneCount < maxDronesPerSector) {
        targetSector = candidate;
        targetDronesCount = candidateDroneCount;
        break;
      }
    }

    // If all sectors are at max capacity, can't reassign
    if (targetSector.sector === highestPrioritySector.sector && targetDronesCount >= maxDronesPerSector) {
      return currentState;
    }
  }

  // For each drone in a fully scanned sector, reassign it to the highest priority sector
  for (const drone of drones) {
    // Skip drones that are charging or returning
    if (drone.status === 'charging' || drone.status === 'returning') continue;

    // Check if drone's current sector is fully scanned
    const isCurrentSectorFullyScanned = fullyScannedSectors.includes(drone.sector);

    if (isCurrentSectorFullyScanned && drone.sector !== targetSector.sector) {
      const lastTick = lastReassignmentTick.get(drone.id) || 0;

      // Only reassign if we haven't reassigned this drone recently
      if (tick - lastTick > reassignmentCooldown) {
        lastReassignmentTick.set(drone.id, tick);
        droneLastSector.set(drone.id, drone.sector);
        totalReassignments++;

        // Log which sector this drone finished
        const finishedSectorLetter = getSectorLetter(drone.sector);
        logs.push(makeLog(tick, 'agent',
            `[Sector Complete] ${drone.id} finished Sector ${finishedSectorLetter}`,
            drone.id
        ));

        // Update the drone's sector to the target sector
        const dIdx = currentState.drones.findIndex(d => d.id === drone.id);
        const updatedDrones = [...currentState.drones];
        updatedDrones[dIdx] = {
          ...drone,
          sector: targetSector.sector,
          pathQueue: [] // Clear path so it will plan a new route in the new sector
        };
        currentState = { ...currentState, drones: updatedDrones };

        // Log the enhanced reassignment with detailed metrics
        const sectorLetter = getSectorLetter(targetSector.sector);
        logs.push(makeLog(tick, 'agent',
            `[Agent Decision] ${drone.id} reassigned → Sector ${sectorLetter} ` +
            `(score: ${targetSector.score} | coverage: ${targetSector.coverage}% | ` +
            `noise: ${targetSector.noise} | drone density: ${targetSector.density})`,
            drone.id
        ));

        // Update the count for the next iteration
        targetDronesCount++;

        // Only reassign one drone per tick to avoid mass reassignments
        break;
      }
    }
  }

  return currentState;
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

  // Initialize start tick if this is the first run
  if (startTick === 0) {
    startTick = state.stats.tick;
  }

  if (state.stats.missionComplete) {
    return handleMissionComplete(state);
  }

  const tick = state.stats.tick + 1;
  const newLogs: LogEntry[] = [];
  let currentState = { ...state, stats: { ...state.stats, tick } };

  const drones = mcp_discoverDrones(currentState);

  for (const drone of drones) {
    // Update drone statistics
    updateDroneStats(drone, tick);

    const result = processDrone(currentState, drone, tick, newLogs);
    currentState = result.state;
    newLogs.push(...result.logs);
  }

  // Add mission analysis every 50 ticks
  if (tick % 50 === 0 || tick - lastSummaryTick > 50) {
    addMissionAnalysis(currentState, tick, newLogs);
  }

  // Check for sector completions every 10 ticks
  if (tick % 10 === 0) {
    checkSectorCompletions(currentState, tick, newLogs);
  }

  // Add sector reassignment monitoring every 15 ticks
  if (tick % 15 === 0) {
    currentState = monitorAndReassignDrones(currentState, tick, newLogs);
  }

  // Check mission complete
  if (currentState.stats.missionComplete) {
    const gs = currentState.config.gridSize;

    // Final mission analysis
    addMissionAnalysis(currentState, tick, newLogs);

    // Don't show total survivors in mission complete either
    newLogs.push(makeLog(tick, 'success',
        `🎯 MISSION COMPLETE — All ${gs}×${gs} scannable cells visited in ${tick} ticks! ` +
        `Coverage: ${currentState.stats.coverage}% | Survivors found: ${currentState.stats.survivorsFound}. Recalling all drones to base.`
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

function getAllSectors(numDrones: number, gridSize: number) {
  return Array.from({ length: numDrones }, (_, i) => {
    const bounds = getSectorBounds(i, numDrones, gridSize);
    return { sector: i, bounds };
  });
}

function sectorDistanceFromBase(sectorBounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  // Use center of sector
  const cx = (sectorBounds.minX + sectorBounds.maxX) / 2;
  const cy = (sectorBounds.minY + sectorBounds.maxY) / 2;
  return Math.sqrt(cx*cx + cy*cy);
}

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

      const sectorName = getSectorLabel(charged.sector, currentState.drones.length, config.gridSize);
      const uncovered = currentState.grid.flat().filter(c => !c.scanned && !c.hasObstacle).length;
      logs.push(makeLog(tick, 'info',
          `🔋 ${drone.id} fully charged. Redeploying → Sector ${sectorName} | ${uncovered} cells remaining.`,
          drone.id
      ));
    }
    return { state: currentState, logs };
  }

  // ── Battery threshold warnings (50%, 30%) ──────────────────────────────
  const bat = Math.round(freshDrone.battery);

  if (bat <= 50 && bat > 30 && freshDrone.status !== 'returning') {
    const key50 = `${drone.id}-50`;
    if (!loggedBatteryWarnings.has(key50)) {
      loggedBatteryWarnings.add(key50);
      logs.push(makeLog(tick, 'warn',
          `⚡ ${drone.id} battery at ${bat}% — switching to conservative range.`,
          drone.id
      ));
    }
  }

  // ── Critical battery → returning (prevents drones from dropping to 0) ──
  if (freshDrone.battery <= 30 && freshDrone.status !== 'returning') {
    const key30 = `${drone.id}-30`;
    if (!loggedBatteryWarnings.has(key30)) {
      loggedBatteryWarnings.add(key30);
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
      const sectorName = getSectorLabel(currentDrone.sector, currentState.drones.length, config.gridSize);
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
    totalNoiseEvents++;
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

function getSectorLabel(sector: number, numDrones: number, gridSize: number): string {
  const bounds = getSectorBounds(sector, numDrones, gridSize);
  return `[col ${bounds.minX}–${bounds.maxX}, row ${bounds.minY}–${bounds.maxY}]`;
}