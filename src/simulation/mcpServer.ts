// ===================================================
// simulation/mcpServer.ts
// In-browser MCP server simulation — authoritative state
// ===================================================

import {
  Drone, DroneStatus, GridCell, MCPDroneResponse,
  MCPMoveRequest, MCPRegisterRequest, MCPScanResponse,
  MCPThermalScanRequest, Obstacle, Position, SimulationConfig,
  SimulationState, Survivor,
} from '../types/simulation';

const BASE: Position = { x: 0, y: 0 };

// Battery drain per move step — very low so drones can cover the full grid
const BATTERY_DRAIN_PER_STEP = 0.4;   // 0.4% per move step
const BATTERY_DRAIN_PER_SCAN = 0.15;  // 0.15% per scan

const DRONE_COLORS = [
  'drone-navigating', 'drone-scanning', 'drone-returning',
  'drone-idle', 'drone-charging', 'rescue-green', 'alert-amber', 'drone-idle',
  'drone-navigating', 'drone-scanning',
];

// ─── Utility helpers ────────────────────────────────────────────────────────

export function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function posKey(p: Position): string {
  return `${p.x},${p.y}`;
}

function dist(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function randomPos(grid: GridCell[][], exclude: Set<string>, size: number): Position {
  let p: Position;
  do {
    p = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
  } while (exclude.has(posKey(p)) || grid[p.y][p.x].hasObstacle);
  return p;
}

// ─── Grid initializer ───────────────────────────────────────────────────────

export function initGrid(size: number): GridCell[][] {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({
      position: { x, y },
      scanned: false,
      hasObstacle: false,
    }))
  );
}

// ─── State factory ──────────────────────────────────────────────────────────

export function createInitialState(config: SimulationConfig): SimulationState {
  const size = config.gridSize;
  const grid = initGrid(size);

  // Place obstacles (avoid base)
  const usedPositions = new Set<string>([posKey(BASE)]);
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < config.obstacleCount; i++) {
    const p = randomPos(grid, usedPositions, size);
    grid[p.y][p.x].hasObstacle = true;
    obstacles.push({ position: p });
    usedPositions.add(posKey(p));
  }

  // Randomise survivor count between 8 and 15 (unknown to user until discovered)
  const survivorCount = 8 + Math.floor(Math.random() * 8); // 8-15

  // Place survivors (avoid base + obstacles)
  const survivors: Survivor[] = [];
  for (let i = 0; i < survivorCount; i++) {
    const p = randomPos(grid, usedPositions, size);
    const id = `#${i + 1}`;
    survivors.push({ id, position: p, detected: false });
    grid[p.y][p.x].survivorId = id;
    usedPositions.add(posKey(p));
  }

  // Mark base as scanned
  grid[BASE.y][BASE.x].scanned = true;

  // Create initial drones
  const drones: Drone[] = [];
  for (let i = 0; i < config.droneCount; i++) {
    drones.push(makeDrone(i, config.droneCount));
  }

  return {
    config: { ...config, totalSurvivors: survivorCount },
    grid,
    drones,
    survivors,
    obstacles,
    stats: {
      tick: 0,
      coverage: 0,
      survivorsFound: 0,
      totalSurvivors: survivorCount,
      dronesDeployed: config.droneCount,
      missionComplete: false,
      missionStartTime: Date.now(),
    },
    log: [],
    running: false,
    selectedDroneId: null,
  };
}

function makeDrone(index: number, _total: number): Drone {
  const num = String(index + 1).padStart(2, '0');
  return {
    id: `UAV-${num}`,
    name: `UAV-${num}`,
    position: { ...BASE },
    battery: 100,
    status: 'idle',
    sector: index % 4,
    detectedSurvivorIds: [],
    pathQueue: [],
    cellsScanned: 0,
    color: DRONE_COLORS[index % DRONE_COLORS.length],
    forceReturn: false,
  };
}

// ─── MCP Endpoints (pure functions on state) ────────────────────────────────

/** POST /register_drone */
export function mcp_registerDrone(
  state: SimulationState,
  req: MCPRegisterRequest
): { state: SimulationState; response: MCPDroneResponse } {
  const existing = state.drones.find(d => d.id === req.drone_id);
  if (existing) {
    return { state, response: { drone: existing, success: false, message: 'Already registered' } };
  }
  const idx = state.drones.length;
  const drone: Drone = {
    id: req.drone_id,
    name: req.name,
    position: { ...BASE },
    battery: 100,
    status: 'idle',
    sector: idx % 4,
    detectedSurvivorIds: [],
    pathQueue: [],
    cellsScanned: 0,
    color: DRONE_COLORS[idx % DRONE_COLORS.length],
    forceReturn: false,
  };
  const newState = {
    ...state,
    drones: [...state.drones, drone],
    stats: { ...state.stats, dronesDeployed: state.stats.dronesDeployed + 1 },
  };
  return { state: newState, response: { drone, success: true } };
}

/** GET /discover_drones */
export function mcp_discoverDrones(state: SimulationState): Drone[] {
  return state.drones;
}

/** GET /get_battery_status/:drone_id */
export function mcp_getBattery(state: SimulationState, droneId: string) {
  const d = state.drones.find(d => d.id === droneId);
  if (!d) return null;
  return { drone_id: d.id, battery: d.battery, status: d.status };
}

/** POST /move_to — with collision prevention */
export function mcp_moveTo(
  state: SimulationState,
  req: MCPMoveRequest
): { state: SimulationState; success: boolean; message?: string } {
  const idx = state.drones.findIndex(d => d.id === req.drone_id);
  if (idx === -1) return { state, success: false, message: 'Drone not found' };

  const drone = state.drones[idx];
  if (drone.battery <= 0) return { state, success: false, message: 'No battery' };
  if (drone.status === 'charging') return { state, success: false, message: 'Charging' };

  const size = state.config.gridSize;
  const tx = Math.max(0, Math.min(size - 1, req.x));
  const ty = Math.max(0, Math.min(size - 1, req.y));

  if (state.grid[ty][tx].hasObstacle) {
    return { state, success: false, message: 'Obstacle at target' };
  }

  // ── Collision prevention: block if another drone is already at target ──
  const isBase = tx === BASE.x && ty === BASE.y;
  if (!isBase) {
    const occupiedByOther = state.drones.some(
      d => d.id !== req.drone_id && d.position.x === tx && d.position.y === ty
    );
    if (occupiedByOther) {
      return { state, success: false, message: 'Cell occupied by another drone' };
    }
  }

  const newBattery = Math.max(0, drone.battery - BATTERY_DRAIN_PER_STEP);

  const newStatus: DroneStatus =
    tx === BASE.x && ty === BASE.y ? 'charging' :
    newBattery <= 25 ? 'returning' : 'navigating';

  const updatedDrone: Drone = {
    ...drone,
    position: { x: tx, y: ty },
    battery: newBattery,
    status: newStatus,
    pathQueue: drone.pathQueue.filter(p => !(p.x === tx && p.y === ty)),
  };

  const newDrones = [...state.drones];
  newDrones[idx] = updatedDrone;
  return { state: { ...state, drones: newDrones }, success: true };
}

/** POST /thermal_scan */
export function mcp_thermalScan(
  state: SimulationState,
  req: MCPThermalScanRequest
): { state: SimulationState; response: MCPScanResponse } {
  const idx = state.drones.findIndex(d => d.id === req.drone_id);
  if (idx === -1) {
    return {
      state,
      response: { survivor_detected: false, obstacle_present: false, thermal_noise: false },
    };
  }

  const drone = state.drones[idx];
  const { x, y } = drone.position;
  const cell = state.grid[y][x];

  // Thermal noise: small chance of missed detection
  const noiseRoll = Math.random();
  const thermalNoise = noiseRoll < state.config.thermalNoiseChance;

  let survivorDetected = false;
  let survivorId: string | undefined;
  let newSurvivors = state.survivors;
  let updatedDrone = drone;

  if (cell.survivorId && !thermalNoise) {
    const sIdx = state.survivors.findIndex(s => s.id === cell.survivorId);
    if (sIdx !== -1 && !state.survivors[sIdx].detected) {
      survivorDetected = true;
      survivorId = cell.survivorId;
      newSurvivors = [...state.survivors];
      newSurvivors[sIdx] = { ...newSurvivors[sIdx], detected: true, detectedBy: drone.id };

      updatedDrone = {
        ...drone,
        detectedSurvivorIds: [...drone.detectedSurvivorIds, survivorId!],
        status: 'scanning',
      };
    }
  }

  // Mark cell as scanned
  const newGrid = state.grid.map((row, gy) =>
    row.map((c, gx) => (gx === x && gy === y ? { ...c, scanned: true } : c))
  );

  if (!cell.scanned) {
    updatedDrone = { ...updatedDrone, cellsScanned: updatedDrone.cellsScanned + 1, status: 'scanning' };
  }

  // Drain minimal amount for scan
  updatedDrone = { ...updatedDrone, battery: Math.max(0, updatedDrone.battery - BATTERY_DRAIN_PER_SCAN) };

  const newDrones = [...state.drones];
  newDrones[idx] = updatedDrone;

  // Recalculate coverage
  const totalCells = state.config.gridSize * state.config.gridSize;
  const scannedCells = newGrid.flat().filter(c => c.scanned).length;
  const coverage = Math.round((scannedCells / totalCells) * 100);
  const survivorsFound = newSurvivors.filter(s => s.detected).length;

  // Mission complete = ALL non-obstacle cells scanned
  const totalScannable = newGrid.flat().filter(c => !c.hasObstacle).length;
  const totalScannedNonObstacle = newGrid.flat().filter(c => c.scanned && !c.hasObstacle).length;
  const allCellsVisited = totalScannedNonObstacle >= totalScannable;

  const newState: SimulationState = {
    ...state,
    grid: newGrid,
    drones: newDrones,
    survivors: newSurvivors,
    stats: {
      ...state.stats,
      coverage,
      survivorsFound,
      missionComplete: allCellsVisited,
    },
  };

  return {
    state: newState,
    response: { survivor_detected: survivorDetected, survivor_id: survivorId, obstacle_present: cell.hasObstacle, thermal_noise: thermalNoise },
  };
}

// ─── Charging logic ─────────────────────────────────────────────────────────

export function mcp_chargeDrone(
  state: SimulationState,
  droneId: string
): SimulationState {
  const idx = state.drones.findIndex(d => d.id === droneId);
  if (idx === -1) return state;
  const drone = state.drones[idx];
  if (drone.position.x !== BASE.x || drone.position.y !== BASE.y) return state;

  const newBattery = Math.min(100, drone.battery + 20); // charge 20% per tick
  const newStatus: DroneStatus = newBattery >= 90 ? 'idle' : 'charging';

  const newDrones = [...state.drones];
  newDrones[idx] = { ...drone, battery: newBattery, status: newStatus };
  return { ...state, drones: newDrones };
}

// ─── Path planning helper (BFS to target avoiding obstacles) ────────────────

export function planPath(
  from: Position,
  to: Position,
  grid: GridCell[][],
  size: number
): Position[] {
  if (from.x === to.x && from.y === to.y) return [];
  const queue: Array<{ pos: Position; path: Position[] }> = [{ pos: from, path: [] }];
  const visited = new Set<string>([posKey(from)]);
  const dirs = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;
    for (const d of dirs) {
      const np = { x: pos.x + d.x, y: pos.y + d.y };
      if (np.x < 0 || np.x >= size || np.y < 0 || np.y >= size) continue;
      if (visited.has(posKey(np))) continue;
      if (grid[np.y][np.x].hasObstacle) continue;
      const newPath = [...path, np];
      if (np.x === to.x && np.y === to.y) return newPath;
      visited.add(posKey(np));
      queue.push({ pos: np, path: newPath });
    }
  }
  return [];
}

// ─── Sector helpers ──────────────────────────────────────────────────────────

export function getSectorBounds(sector: number, size: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const half = Math.floor(size / 2);
  switch (sector % 4) {
    case 0: return { minX: 0, maxX: half - 1, minY: 0, maxY: half - 1 };
    case 1: return { minX: half, maxX: size - 1, minY: 0, maxY: half - 1 };
    case 2: return { minX: 0, maxX: half - 1, minY: half, maxY: size - 1 };
    case 3: return { minX: half, maxX: size - 1, minY: half, maxY: size - 1 };
    default: return { minX: 0, maxX: size - 1, minY: 0, maxY: size - 1 };
  }
}

export function findBestTarget(
  drone: Drone,
  grid: GridCell[][],
  config: SimulationConfig,
  allDrones: Drone[]
): Position | null {
  const { battery } = drone;
  const size = config.gridSize;

  const maxRange = battery > 50 ? size * 2 : size;

  const sb = getSectorBounds(drone.sector, size);
  const effectiveBounds = battery <= 25
    ? { minX: 0, maxX: 4, minY: 0, maxY: 4 }
    : sb;

  // Cells occupied by other drones' current positions (avoid collocating)
  const occupiedByDrones = new Set<string>();
  allDrones.forEach(d => {
    if (d.id !== drone.id) {
      occupiedByDrones.add(posKey(d.position));
      if (d.pathQueue.length > 0) {
        occupiedByDrones.add(posKey(d.pathQueue[0]));
      }
    }
  });

  let bestCell: Position | null = null;
  let bestScore = Infinity;

  for (let gy = effectiveBounds.minY; gy <= effectiveBounds.maxY; gy++) {
    for (let gx = effectiveBounds.minX; gx <= effectiveBounds.maxX; gx++) {
      if (grid[gy][gx].scanned) continue;
      if (grid[gy][gx].hasObstacle) continue;
      if (occupiedByDrones.has(posKey({ x: gx, y: gy }))) continue;

      const d = dist(drone.position, { x: gx, y: gy });
      if (d > maxRange) continue;

      const score = d + (Math.random() * 0.5);
      if (score < bestScore) {
        bestScore = score;
        bestCell = { x: gx, y: gy };
      }
    }
  }

  // If sector is fully covered, expand to any unscanned cell
  if (!bestCell) {
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (grid[gy][gx].scanned) continue;
        if (grid[gy][gx].hasObstacle) continue;
        if (occupiedByDrones.has(posKey({ x: gx, y: gy }))) continue;
        const d = dist(drone.position, { x: gx, y: gy });
        if (d > maxRange) continue;
        const score = d + (Math.random() * 0.5);
        if (score < bestScore) {
          bestScore = score;
          bestCell = { x: gx, y: gy };
        }
      }
    }
  }

  return bestCell;
}
