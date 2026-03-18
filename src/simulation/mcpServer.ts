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
const BATTERY_DRAIN_PER_STEP = Math.random() * 0.3 + 0.2;
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

function unscannedNeighbors(x: number, y: number, grid: GridCell[][]): number {
  const dirs = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];

  let count = 0;
  for (const d of dirs) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (nx >= 0 && ny >= 0 && ny < grid.length && nx < grid.length) {
      if (!grid[ny][nx].scanned && !grid[ny][nx].hasObstacle) {
        count++;
      }
    }
  }
  return count;
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
  const survivorCount = 13 + Math.floor(Math.random() * 8); // 8-15

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

function makeDrone(index: number, totalDrones: number): Drone {
  const num = String(index + 1).padStart(2, '0');
  return {
    id: `UAV-${num}`,
    name: `UAV-${num}`,
    position: { ...BASE },
    battery: Math.floor(Math.random() * 14) + 87,
    status: 'idle',
    sector: index % totalDrones,
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
    sector: idx ,
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


// Cache for sector calculations
const sectorBoundsCache = new Map<string, Array<{ minX: number; maxX: number; minY: number; maxY: number }>>();

export function getSectorBounds(sector: number, numDrones: number, size: number) {
  // Check cache
  const cacheKey = `${numDrones}-${size}`;
  if (!sectorBoundsCache.has(cacheKey)) {
    // Calculate all sector bounds once and cache them
    const sectors: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

    // Special case: 1 drone gets whole grid
    if (numDrones === 1) {
      sectors.push({ minX: 0, maxX: size - 1, minY: 0, maxY: size - 1 });
    } else {
      // For perfect squares (4, 9, 16, etc.), use square grid
      const sqrt = Math.sqrt(numDrones);
      const isPerfectSquare = Math.abs(sqrt - Math.floor(sqrt)) < 0.0001;

      let cols: number;
      let rows: number;

      if (isPerfectSquare) {
        // Perfect square: use sqrt × sqrt grid
        cols = Math.floor(sqrt);
        rows = cols;
      } else {
        // Find best rectangle that minimizes empty sectors
        let bestCols = 1;
        let bestRows = numDrones;
        let bestEmpty = Infinity;

        for (let c = 1; c <= numDrones; c++) {
          const r = Math.ceil(numDrones / c);
          const empty = c * r - numDrones;

          if (empty < bestEmpty) {
            bestEmpty = empty;
            bestCols = c;
            bestRows = r;
          } else if (empty === bestEmpty) {
            // Prefer more square-like
            const currentRatio = Math.abs(bestCols - bestRows);
            const newRatio = Math.abs(c - r);
            if (newRatio < currentRatio) {
              bestCols = c;
              bestRows = r;
            }
          }
        }

        cols = bestCols;
        rows = bestRows;
      }

      // Calculate sector dimensions
      const sectorWidth = Math.floor(size / cols);
      const sectorHeight = Math.floor(size / rows);

      // Create sectors for all drones
      for (let i = 0; i < numDrones; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Calculate bounds with proper edge handling
        const minX = col * sectorWidth;
        const maxX = col === cols - 1 ? size - 1 : (col + 1) * sectorWidth - 1;

        const minY = row * sectorHeight;
        const maxY = row === rows - 1 ? size - 1 : (row + 1) * sectorHeight - 1;

        sectors.push({ minX, maxX, minY, maxY });
      }
    }

    sectorBoundsCache.set(cacheKey, sectors);
  }

  const sectors = sectorBoundsCache.get(cacheKey)!;
  return sectors[sector] || { minX: 0, maxX: size - 1, minY: 0, maxY: size - 1 };
}

export function findBestTarget(
    drone: Drone,
    grid: GridCell[][],
    config: SimulationConfig,
    allDrones: Drone[]
): Position | null {
  const { battery, position, sector } = drone;
  const size = config.gridSize;
  const numDrones = allDrones.length;

  // Get sector boundaries
  const bounds = getSectorBounds(sector, numDrones, size);

  // Calculate effective search range based on battery
  const maxRange = battery > 50 ? size : Math.floor(size * 0.7);

  // Cells occupied by other drones (avoid collisions)
  const occupied = new Set<string>();
  allDrones.forEach(d => {
    if (d.id !== drone.id) {
      occupied.add(`${d.position.x},${d.position.y}`);
    }
  });

  let bestCell: Position | null = null;
  let bestScore = -Infinity;

  // Priority 1: Check immediate surroundings first (8-neighbor grid)
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = position.x + dx;
      const y = position.y + dy;

      // Check bounds and sector
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;

      // Skip if already scanned, obstacle, or occupied
      if (grid[y][x].scanned) continue;
      if (grid[y][x].hasObstacle) continue;
      if (occupied.has(`${x},${y}`)) continue;

      // Calculate score based on:
      // 1. Distance (closer is better)
      // 2. Number of unscanned neighbors (cluster scanning)
      // 3. Random factor to break ties
      const dist = Math.abs(position.x - x) + Math.abs(position.y - y);
      const neighbors = countUnscannedNeighbors(x, y, grid, bounds);
      const score = (10 - dist) + (neighbors * 3) + (Math.random() * 2);

      if (score > bestScore) {
        bestScore = score;
        bestCell = { x, y };
      }
    }
  }

  // If found a good nearby cell, return it immediately
  if (bestCell) return bestCell;

  // Priority 2: Search entire sector using spiral pattern from current position
  const searchRadius = Math.min(maxRange, 20);
  for (let r = 1; r <= searchRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only check cells at Manhattan distance ≈ r
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;

        const x = position.x + dx;
        const y = position.y + dy;

        // Check bounds and sector
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;

        if (grid[y][x].scanned) continue;
        if (grid[y][x].hasObstacle) continue;
        if (occupied.has(`${x},${y}`)) continue;

        // Found the closest unscanned cell
        return { x, y };
      }
    }
  }

  // Priority 3: Search entire sector systematically
  // Start from current position and expand outward in a spiral
  const centerX = position.x;
  const centerY = position.y;

  for (let r = 1; r <= maxRange; r++) {
    // Top and bottom rows
    for (let x = Math.max(bounds.minX, centerX - r); x <= Math.min(bounds.maxX, centerX + r); x++) {
      // Check top row
      const y1 = centerY - r;
      if (y1 >= bounds.minY && y1 <= bounds.maxY) {
        if (!grid[y1][x].scanned && !grid[y1][x].hasObstacle && !occupied.has(`${x},${y1}`)) {
          return { x, y: y1 };
        }
      }

      // Check bottom row
      const y2 = centerY + r;
      if (y2 >= bounds.minY && y2 <= bounds.maxY) {
        if (!grid[y2][x].scanned && !grid[y2][x].hasObstacle && !occupied.has(`${x},${y2}`)) {
          return { x, y: y2 };
        }
      }
    }

    // Left and right columns (excluding corners already checked)
    for (let y = Math.max(bounds.minY, centerY - r + 1); y <= Math.min(bounds.maxY, centerY + r - 1); y++) {
      // Check left column
      const x1 = centerX - r;
      if (x1 >= bounds.minX && x1 <= bounds.maxX) {
        if (!grid[y][x1].scanned && !grid[y][x1].hasObstacle && !occupied.has(`${x1},${y}`)) {
          return { x: x1, y };
        }
      }

      // Check right column
      const x2 = centerX + r;
      if (x2 >= bounds.minX && x2 <= bounds.maxX) {
        if (!grid[y][x2].scanned && !grid[y][x2].hasObstacle && !occupied.has(`${x2},${y}`)) {
          return { x: x2, y };
        }
      }
    }
  }

  // Priority 4: Last resort - any unscanned cell in sector
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!grid[y][x].scanned && !grid[y][x].hasObstacle && !occupied.has(`${x},${y}`)) {
        const dist = Math.abs(position.x - x) + Math.abs(position.y - y);
        if (dist <= maxRange) {
          return { x, y };
        }
      }
    }
  }

  return null;
}

// Helper function to count unscanned neighbors
function countUnscannedNeighbors(x: number, y: number, grid: GridCell[][], bounds: { minX: number; maxX: number; minY: number; maxY: number }): number {
  let count = 0;
  const dirs = [
    [0, 1], [0, -1], [1, 0], [-1, 0],  // 4-directional
    [1, 1], [1, -1], [-1, 1], [-1, -1]  // Diagonals
  ];

  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
    if (nx < 0 || nx >= grid.length || ny < 0 || ny >= grid.length) continue;

    if (!grid[ny][nx].scanned && !grid[ny][nx].hasObstacle) {
      count++;
    }
  }

  return count;
}