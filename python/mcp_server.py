# mcp_server.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple, Set
import random
import math
import time
import uuid
from enum import Enum
from datetime import datetime
import uvicorn
from collections import deque
import asyncio

# ===================================================
# Data Models
# ===================================================

class Position(BaseModel):
    x: int
    y: int

    def key(self) -> str:
        return f"{self.x},{self.y}"

class DroneStatus(str, Enum):
    IDLE = "idle"
    NAVIGATING = "navigating"
    SCANNING = "scanning"
    RETURNING = "returning"
    CHARGING = "charging"
    ERROR = "error"

class GridCell(BaseModel):
    position: Position
    scanned: bool = False
    hasObstacle: bool = False
    survivorId: Optional[str] = None

class Survivor(BaseModel):
    id: str
    position: Position
    detected: bool = False
    detectedBy: Optional[str] = None
    detectedAt: Optional[float] = None

class Obstacle(BaseModel):
    position: Position

class Drone(BaseModel):
    id: str
    name: str
    position: Position
    battery: float = 100.0
    status: DroneStatus = DroneStatus.IDLE
    sector: int = 0
    detectedSurvivorIds: List[str] = []
    pathQueue: List[Position] = []
    cellsScanned: int = 0
    color: str = "drone-idle"
    forceReturn: bool = False

class SimulationConfig(BaseModel):
    gridSize: int = 30
    droneCount: int = 4
    obstacleCount: int = 15
    thermalNoiseChance: float = 0.03
    totalSurvivors: Optional[int] = None
    maxDrones: int = 12
    tickIntervalMs: int = 600

class SimulationStats(BaseModel):
    tick: int = 0
    coverage: int = 0
    survivorsFound: int = 0
    totalSurvivors: int = 0
    dronesDeployed: int = 0
    missionComplete: bool = False
    missionStartTime: Optional[float] = None

class SimulationState(BaseModel):
    config: SimulationConfig
    grid: List[List[GridCell]]
    drones: List[Drone]
    survivors: List[Survivor]
    obstacles: List[Obstacle]
    stats: SimulationStats
    log: List[Dict[str, Any]] = []
    running: bool = False
    selectedDroneId: Optional[str] = None

# Request/Response Models
class MCPRegisterRequest(BaseModel):
    drone_id: str
    name: str

class MCPDroneResponse(BaseModel):
    drone: Drone
    success: bool
    message: Optional[str] = None

class MCPMoveRequest(BaseModel):
    drone_id: str
    x: int
    y: int

class MCPThermalScanRequest(BaseModel):
    drone_id: str

class MCPScanResponse(BaseModel):
    survivor_detected: bool = False
    survivor_id: Optional[str] = None
    obstacle_present: bool = False
    thermal_noise: bool = False

class BatteryStatusResponse(BaseModel):
    drone_id: str
    battery: float
    status: DroneStatus

# ===================================================
# MCP Server Implementation
# ===================================================

app = FastAPI(title="Drone MCP Server", description="Mission Control Protocol Server for Drone Simulation")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state (in production, use a database)
simulation_state: Optional[SimulationState] = None

# Constants
BASE = Position(x=0, y=0)

# Battery drain rates
BATTERY_DRAIN_PER_STEP = random.random() * 0.3 + 0.2
BATTERY_DRAIN_PER_SCAN = 0.15

DRONE_COLORS = [
    'drone-navigating', 'drone-scanning', 'drone-returning',
    'drone-idle', 'drone-charging', 'rescue-green', 'alert-amber', 'drone-idle',
    'drone-navigating', 'drone-scanning',
]

# Sector bounds cache
sector_bounds_cache: Dict[str, List[Dict[str, int]]] = {}

# ===================================================
# Command Agent Global Variables
# ===================================================

# Track mission statistics
total_reassignments = 0
total_noise_events = 0
start_tick = 0
last_summary_tick = 0

# Per-drone tracking
drone_cells_scanned: Dict[str, int] = {}
drone_active_ticks: Dict[str, int] = {}

# Sector tracking
sector_coverage_last_checked: Dict[int, float] = {}
drone_last_sector: Dict[str, int] = {}
last_reassignment_tick: Dict[str, int] = {}
completed_sectors_log: Set[int] = set()
reassignment_cooldown = 20

# Battery warnings tracking
logged_battery_warnings: Set[str] = set()
logged_returning: Set[str] = set()
last_logged_sector: Dict[str, str] = {}

# ===================================================
# Utility Functions
# ===================================================

def make_id() -> str:
    """Generate a random ID"""
    return str(uuid.uuid4())[:8]

def pos_key(p: Position) -> str:
    """Convert position to string key"""
    return f"{p.x},{p.y}"

def dist(a: Position, b: Position) -> int:
    """Calculate Manhattan distance"""
    return abs(a.x - b.x) + abs(a.y - b.y)

def random_pos(grid: List[List[GridCell]], exclude: Set[str], size: int) -> Position:
    """Generate random position not in exclude set and not obstacle"""
    while True:
        p = Position(x=random.randint(0, size-1), y=random.randint(0, size-1))
        if pos_key(p) not in exclude and not grid[p.y][p.x].hasObstacle:
            return p

def unscanned_neighbors(x: int, y: int, grid: List[List[GridCell]]) -> int:
    """Count unscanned neighbors around a cell"""
    dirs = [
        (0, 1), (0, -1), (1, 0), (-1, 0),
        (1, 1), (1, -1), (-1, 1), (-1, -1)
    ]

    count = 0
    for dx, dy in dirs:
        nx, ny = x + dx, y + dy
        if 0 <= nx < len(grid) and 0 <= ny < len(grid):
            if not grid[ny][nx].scanned and not grid[ny][nx].hasObstacle:
                count += 1
    return count

def make_log(tick: int, level: str, message: str, drone_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a log entry"""
    return {
        "id": make_id(),
        "tick": tick,
        "timestamp": time.time() * 1000,
        "level": level,
        "message": message,
        "droneId": drone_id
    }

def get_sector_letter(sector_index: int) -> str:
    """Convert sector index to letter (A, B, C, etc.)"""
    return chr(65 + sector_index)

def calculate_sector_coverage(state: SimulationState, sector_index: int) -> float:
    """Calculate coverage percentage for a specific sector"""
    bounds = get_sector_bounds(sector_index, len(state.drones), state.config.gridSize)

    total_cells = 0
    scanned_cells = 0

    for y in range(bounds["minY"], bounds["maxY"] + 1):
        for x in range(bounds["minX"], bounds["maxX"] + 1):
            if not state.grid[y][x].hasObstacle:
                total_cells += 1
                if state.grid[y][x].scanned:
                    scanned_cells += 1

    return round((scanned_cells / total_cells) * 100) if total_cells > 0 else 100

def is_sector_fully_scanned(state: SimulationState, sector_index: int) -> bool:
    """Check if a sector is FULLY scanned"""
    bounds = get_sector_bounds(sector_index, len(state.drones), state.config.gridSize)

    for y in range(bounds["minY"], bounds["maxY"] + 1):
        for x in range(bounds["minX"], bounds["maxX"] + 1):
            if not state.grid[y][x].hasObstacle and not state.grid[y][x].scanned:
                return False

    return True

def get_drone_density(state: SimulationState, sector_index: int) -> int:
    """Calculate drone density in a sector"""
    return len([d for d in state.drones if d.sector == sector_index])

def get_sector_noise_level(state: SimulationState, sector_index: int) -> str:
    """Determine noise level in a sector"""
    noise_levels = ['low', 'medium', 'high']
    return noise_levels[sector_index % 3]

def calculate_sector_score(state: SimulationState, sector_index: int) -> float:
    """Calculate reassignment score for a sector"""
    coverage = calculate_sector_coverage(state, sector_index)
    drone_density = get_drone_density(state, sector_index)
    noise_level = get_sector_noise_level(state, sector_index)

    score = 100 - coverage
    score += (3 - min(drone_density, 3)) * 5

    if noise_level == 'high':
        score -= 10
    elif noise_level == 'medium':
        score -= 5

    return max(0, min(100, score))

def update_drone_stats(drone: Drone, tick: int):
    """Update drone statistics"""
    global drone_active_ticks, drone_cells_scanned

    drone_id = drone.id
    current_ticks = drone_active_ticks.get(drone_id, 0)
    drone_active_ticks[drone_id] = current_ticks + 1
    drone_cells_scanned[drone_id] = drone.cellsScanned

def count_unscanned_neighbors_with_bounds(
        x: int,
        y: int,
        grid: List[List[GridCell]],
        bounds: Dict[str, int]
) -> int:
    """Count unscanned neighbors including diagonals"""
    count = 0
    dirs = [
        (0, 1), (0, -1), (1, 0), (-1, 0),
        (1, 1), (1, -1), (-1, 1), (-1, -1)
    ]

    for dx, dy in dirs:
        nx, ny = x + dx, y + dy

        if nx < bounds["minX"] or nx > bounds["maxX"] or ny < bounds["minY"] or ny > bounds["maxY"]:
            continue
        if nx < 0 or nx >= len(grid) or ny < 0 or ny >= len(grid):
            continue

        if not grid[ny][nx].scanned and not grid[ny][nx].hasObstacle:
            count += 1

    return count

# ===================================================
# Grid Initialization
# ===================================================

def init_grid(size: int) -> List[List[GridCell]]:
    """Initialize empty grid"""
    grid = []
    for y in range(size):
        row = []
        for x in range(size):
            row.append(GridCell(position=Position(x=x, y=y)))
        grid.append(row)
    return grid

# ===================================================
# State Factory
# ===================================================

def create_initial_state(config: SimulationConfig) -> SimulationState:
    """Create initial simulation state"""
    size = config.gridSize
    grid = init_grid(size)

    used_positions = {pos_key(BASE)}
    obstacles = []

    for _ in range(config.obstacleCount):
        p = random_pos(grid, used_positions, size)
        grid[p.y][p.x].hasObstacle = True
        obstacles.append(Obstacle(position=p))
        used_positions.add(pos_key(p))

    survivor_count = config.totalSurvivors or (13 + random.randint(0, 7))

    survivors = []
    for i in range(survivor_count):
        p = random_pos(grid, used_positions, size)
        survivor_id = f"#{i+1}"
        survivors.append(Survivor(id=survivor_id, position=p))
        grid[p.y][p.x].survivorId = survivor_id
        used_positions.add(pos_key(p))

    grid[BASE.y][BASE.x].scanned = True

    drones = []
    for i in range(config.droneCount):
        drones.append(make_drone(i, config.droneCount))

    config.totalSurvivors = survivor_count

    return SimulationState(
        config=config,
        grid=grid,
        drones=drones,
        survivors=survivors,
        obstacles=obstacles,
        stats=SimulationStats(
            totalSurvivors=survivor_count,
            dronesDeployed=config.droneCount,
            missionStartTime=None
        ),
        log=[],
        running=False,
        selectedDroneId=None
    )

def make_drone(index: int, total_drones: int) -> Drone:
    """Create a new drone"""
    num = str(index + 1).zfill(2)
    return Drone(
        id=f"UAV-{num}",
        name=f"UAV-{num}",
        position=BASE,
        battery=random.randint(87, 100),
        status=DroneStatus.IDLE,
        sector=index % total_drones,
        detectedSurvivorIds=[],
        pathQueue=[],
        cellsScanned=0,
        color=DRONE_COLORS[index % len(DRONE_COLORS)],
        forceReturn=False
    )

# ===================================================
# Path Planning
# ===================================================

def calculate_path(
        from_pos: Position,
        to_pos: Position,
        grid: List[List[GridCell]],
        size: int
) -> List[Position]:
    """BFS path planning avoiding obstacles"""
    if from_pos.x == to_pos.x and from_pos.y == to_pos.y:
        return []

    queue = deque()
    queue.append((from_pos, []))
    visited = {pos_key(from_pos)}

    dirs = [
        (0, 1), (0, -1), (1, 0), (-1, 0)
    ]

    while queue:
        pos, path = queue.popleft()

        for dx, dy in dirs:
            nx, ny = pos.x + dx, pos.y + dy

            if nx < 0 or nx >= size or ny < 0 or ny >= size:
                continue

            np = Position(x=nx, y=ny)
            if pos_key(np) in visited:
                continue

            if grid[ny][nx].hasObstacle:
                continue

            new_path = path + [np]

            if nx == to_pos.x and ny == to_pos.y:
                return new_path

            visited.add(pos_key(np))
            queue.append((np, new_path))

    return []

# ===================================================
# Sector Helpers
# ===================================================

def get_sector_bounds(sector: int, num_drones: int, size: int) -> Dict[str, int]:
    """Calculate sector boundaries for a drone"""
    cache_key = f"{num_drones}-{size}"

    if cache_key not in sector_bounds_cache:
        sectors = []

        if num_drones == 1:
            sectors.append({"minX": 0, "maxX": size - 1, "minY": 0, "maxY": size - 1})
        else:
            sqrt = math.sqrt(num_drones)
            is_perfect_square = abs(sqrt - math.floor(sqrt)) < 0.0001

            if is_perfect_square:
                cols = int(math.floor(sqrt))
                rows = cols
            else:
                best_cols = 1
                best_rows = num_drones
                best_empty = float('inf')

                for c in range(1, num_drones + 1):
                    r = math.ceil(num_drones / c)
                    empty = c * r - num_drones

                    if empty < best_empty:
                        best_empty = empty
                        best_cols = c
                        best_rows = r
                    elif empty == best_empty:
                        current_ratio = abs(best_cols - best_rows)
                        new_ratio = abs(c - r)
                        if new_ratio < current_ratio:
                            best_cols = c
                            best_rows = r

                cols = best_cols
                rows = best_rows

            sector_width = size // cols
            sector_height = size // rows

            for i in range(num_drones):
                row = i // cols
                col = i % cols

                min_x = col * sector_width
                max_x = size - 1 if col == cols - 1 else (col + 1) * sector_width - 1

                min_y = row * sector_height
                max_y = size - 1 if row == rows - 1 else (row + 1) * sector_height - 1

                sectors.append({"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y})

        sector_bounds_cache[cache_key] = sectors

    sectors = sector_bounds_cache[cache_key]
    return sectors[sector] if sector < len(sectors) else {"minX": 0, "maxX": size - 1, "minY": 0, "maxY": size - 1}

def find_best_target(
        drone: Drone,
        grid: List[List[GridCell]],
        config: SimulationConfig,
        all_drones: List[Drone]
) -> Optional[Position]:
    """Find the best target cell for a drone to scan next"""
    battery = drone.battery
    position = drone.position
    sector = drone.sector
    size = config.gridSize
    num_drones = len(all_drones)

    bounds = get_sector_bounds(sector, num_drones, size)

    max_range = size if battery > 50 else int(size * 0.7)

    occupied = set()
    for d in all_drones:
        if d.id != drone.id:
            occupied.add(f"{d.position.x},{d.position.y}")

    best_cell = None
    best_score = float('-inf')

    for dy in range(-2, 3):
        for dx in range(-2, 3):
            x = position.x + dx
            y = position.y + dy

            if x < bounds["minX"] or x > bounds["maxX"] or y < bounds["minY"] or y > bounds["maxY"]:
                continue
            if x < 0 or x >= size or y < 0 or y >= size:
                continue

            if grid[y][x].scanned:
                continue
            if grid[y][x].hasObstacle:
                continue
            if f"{x},{y}" in occupied:
                continue

            dist_val = abs(position.x - x) + abs(position.y - y)
            neighbors = count_unscanned_neighbors_with_bounds(x, y, grid, bounds)
            score = (10 - dist_val) + (neighbors * 3) + (random.random() * 2)

            if score > best_score:
                best_score = score
                best_cell = Position(x=x, y=y)

    if best_cell:
        return best_cell

    search_radius = min(max_range, 20)
    for r in range(1, search_radius + 1):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if abs(dx) + abs(dy) != r:
                    continue

                x = position.x + dx
                y = position.y + dy

                if x < bounds["minX"] or x > bounds["maxX"] or y < bounds["minY"] or y > bounds["maxY"]:
                    continue
                if x < 0 or x >= size or y < 0 or y >= size:
                    continue

                if grid[y][x].scanned or grid[y][x].hasObstacle or f"{x},{y}" in occupied:
                    continue

                return Position(x=x, y=y)

    center_x, center_y = position.x, position.y

    for r in range(1, max_range + 1):
        for x in range(max(bounds["minX"], center_x - r), min(bounds["maxX"], center_x + r) + 1):
            y1 = center_y - r
            if bounds["minY"] <= y1 <= bounds["maxY"]:
                if not grid[y1][x].scanned and not grid[y1][x].hasObstacle and f"{x},{y1}" not in occupied:
                    return Position(x=x, y=y1)

            y2 = center_y + r
            if bounds["minY"] <= y2 <= bounds["maxY"]:
                if not grid[y2][x].scanned and not grid[y2][x].hasObstacle and f"{x},{y2}" not in occupied:
                    return Position(x=x, y=y2)

        for y in range(max(bounds["minY"], center_y - r + 1), min(bounds["maxY"], center_y + r)):
            x1 = center_x - r
            if bounds["minX"] <= x1 <= bounds["maxX"]:
                if not grid[y][x1].scanned and not grid[y][x1].hasObstacle and f"{x1},{y}" not in occupied:
                    return Position(x=x1, y=y)

            x2 = center_x + r
            if bounds["minX"] <= x2 <= bounds["maxX"]:
                if not grid[y][x2].scanned and not grid[y][x2].hasObstacle and f"{x2},{y}" not in occupied:
                    return Position(x=x2, y=y)

    for y in range(bounds["minY"], bounds["maxY"] + 1):
        for x in range(bounds["minX"], bounds["maxX"] + 1):
            if not grid[y][x].scanned and not grid[y][x].hasObstacle and f"{x},{y}" not in occupied:
                if abs(position.x - x) + abs(position.y - y) <= max_range:
                    return Position(x=x, y=y)

    return None

# ===================================================
# Command Agent Functions
# ===================================================

def add_mission_analysis(state: SimulationState, tick: int, logs: List[Dict[str, Any]]):
    """Add mission analysis to logs"""
    global last_summary_tick, total_reassignments, total_noise_events

    total_efficiency = 0
    active_drones = 0

    for drone in state.drones:
        cells_scanned = drone_cells_scanned.get(drone.id, 0)
        active_ticks = drone_active_ticks.get(drone.id, 1)
        efficiency = cells_scanned / active_ticks if active_ticks > 0 else 0

        if efficiency > 0:
            total_efficiency += efficiency
            active_drones += 1

    avg_efficiency = round(total_efficiency / active_drones, 1) if active_drones > 0 else 0

    total_scannable = sum(1 for row in state.grid for cell in row if not cell.hasObstacle)
    scanned_non_obstacle = sum(1 for row in state.grid for cell in row if cell.scanned and not cell.hasObstacle)
    true_coverage = round((scanned_non_obstacle / total_scannable) * 100) if total_scannable > 0 else 0

    logs.append(make_log(tick, 'info',
                         f"[Mission Analysis]\n" +
                         f"  Total Coverage: {true_coverage}%\n" +
                         f"  Survivors Found: {state.stats.survivorsFound}\n" +
                         f"  Avg Efficiency: {avg_efficiency} cells/sec/drone\n" +
                         f"  Reassignments: {total_reassignments}\n" +
                         f"  Noise Events Handled: {total_noise_events}"
                         ))

    last_summary_tick = tick

def check_sector_completions(state: SimulationState, tick: int, logs: List[Dict[str, Any]]):
    """Check for sector completions and log them"""
    global completed_sectors_log

    for i in range(len(state.drones)):
        if is_sector_fully_scanned(state, i) and i not in completed_sectors_log:
            completed_sectors_log.add(i)
            sector_letter = get_sector_letter(i)
            coverage = calculate_sector_coverage(state, i)
            logs.append(make_log(tick, 'success',
                                 f"✅ Sector {sector_letter} COMPLETED! ({coverage}% coverage - all cells scanned)"
                                 ))

def monitor_and_reassign_drones(state: SimulationState, tick: int, logs: List[Dict[str, Any]]) -> SimulationState:
    """Monitor and reassign drones when sectors are complete"""
    global total_reassignments, last_reassignment_tick

    current_state = state

    if len(state.drones) <= 1:
        return current_state

    sector_coverages = []
    for i in range(len(state.drones)):
        sector_coverages.append({
            "sector": i,
            "coverage": calculate_sector_coverage(state, i)
        })

    fully_scanned_sectors = []
    for i in range(len(state.drones)):
        if is_sector_fully_scanned(state, i):
            fully_scanned_sectors.append(i)

    if len(fully_scanned_sectors) == 0:
        return current_state

    incomplete_sectors = []
    for i in range(len(state.drones)):
        if i not in fully_scanned_sectors:
            incomplete_sectors.append({
                "sector": i,
                "coverage": sector_coverages[i]["coverage"],
                "score": calculate_sector_score(state, i),
                "noise": get_sector_noise_level(state, i),
                "density": get_drone_density(state, i)
            })

    if len(incomplete_sectors) == 0:
        return current_state

    incomplete_sectors.sort(key=lambda x: x["score"], reverse=True)
    highest_priority_sector = incomplete_sectors[0]

    drones_in_target = len([d for d in state.drones if d.sector == highest_priority_sector["sector"]])
    total_drones = len(state.drones)

    max_drones_per_sector = max(2, int(total_drones * 0.4))

    target_sector = highest_priority_sector
    target_drones_count = drones_in_target

    if target_drones_count >= max_drones_per_sector:
        for candidate in incomplete_sectors[1:]:
            candidate_count = len([d for d in state.drones if d.sector == candidate["sector"]])
            if candidate_count < max_drones_per_sector:
                target_sector = candidate
                target_drones_count = candidate_count
                break

        if target_sector["sector"] == highest_priority_sector["sector"] and target_drones_count >= max_drones_per_sector:
            return current_state

    for drone in state.drones:
        if drone.status in [DroneStatus.CHARGING, DroneStatus.RETURNING]:
            continue

        is_current_sector_fully_scanned = drone.sector in fully_scanned_sectors

        if is_current_sector_fully_scanned and drone.sector != target_sector["sector"]:
            last_tick = last_reassignment_tick.get(drone.id, 0)

            if tick - last_tick > reassignment_cooldown:
                last_reassignment_tick[drone.id] = tick
                drone_last_sector[drone.id] = drone.sector
                total_reassignments += 1

                finished_sector_letter = get_sector_letter(drone.sector)
                logs.append(make_log(tick, 'agent',
                                     f"[Sector Complete] {drone.id} finished Sector {finished_sector_letter}",
                                     drone.id
                                     ))

                drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
                if drone_idx != -1:
                    updated_drones = list(current_state.drones)
                    updated_drones[drone_idx] = Drone(
                        **{**drone.dict(),
                           "sector": target_sector["sector"],
                           "pathQueue": []
                           }
                    )
                    current_state = SimulationState(
                        **{**current_state.dict(), "drones": updated_drones}
                    )

                    sector_letter = get_sector_letter(target_sector["sector"])
                    logs.append(make_log(tick, 'agent',
                                         f"[Agent Decision] {drone.id} reassigned → Sector {sector_letter} "
                                         f"(score: {target_sector['score']} | coverage: {target_sector['coverage']}% | "
                                         f"noise: {target_sector['noise']} | drone density: {target_sector['density']})",
                                         drone.id
                                         ))

                    target_drones_count += 1
                    break

    return current_state

def recall_all_drones(state: SimulationState, tick: int, logs: List[Dict[str, Any]]) -> SimulationState:
    """Recall all drones to base after mission complete"""
    BASE = Position(x=0, y=0)
    current_state = state

    for drone in state.drones:
        if drone.status == DroneStatus.CHARGING:
            continue
        if drone.position.x == BASE.x and drone.position.y == BASE.y:
            continue

        return_path = calculate_path(drone.position, BASE, state.grid, state.config.gridSize)
        drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)

        if drone_idx != -1:
            updated_drones = list(current_state.drones)
            updated_drones[drone_idx] = Drone(
                **{**drone.dict(),
                   "status": DroneStatus.RETURNING,
                   "pathQueue": return_path
                   }
            )
            current_state = SimulationState(
                **{**current_state.dict(), "drones": updated_drones}
            )

            if drone.id not in logged_returning:
                logged_returning.add(drone.id)
                logs.append(make_log(tick, 'info',
                                     f"🏠 {drone.id} en route to base — mission complete.",
                                     drone.id
                                     ))

    return current_state

def move_one_step(
        state: SimulationState,
        drone_id: str,
        target: Position,
        tick: int,
        logs: List[Dict[str, Any]]
) -> SimulationState:
    """Move drone one step along its path"""
    drone = next((d for d in state.drones if d.id == drone_id), None)
    if not drone:
        return state

    next_step = drone.pathQueue[0] if drone.pathQueue else target

    drone_idx = next((i for i, d in enumerate(state.drones) if d.id == drone_id), -1)
    if drone_idx == -1:
        return state

    size = state.config.gridSize
    tx = max(0, min(size - 1, next_step.x))
    ty = max(0, min(size - 1, next_step.y))

    if state.grid[ty][tx].hasObstacle:
        updated_drones = list(state.drones)
        updated_drones[drone_idx] = Drone(
            **{**drone.dict(), "pathQueue": []}
        )
        return SimulationState(
            **{**state.dict(), "drones": updated_drones}
        )

    is_base = tx == BASE.x and ty == BASE.y
    if not is_base:
        occupied = any(
            d.id != drone_id and d.position.x == tx and d.position.y == ty
            for d in state.drones
        )
        if occupied:
            updated_drones = list(state.drones)
            updated_drones[drone_idx] = Drone(
                **{**drone.dict(), "pathQueue": []}
            )
            return SimulationState(
                **{**state.dict(), "drones": updated_drones}
            )

    new_battery = max(0, drone.battery - BATTERY_DRAIN_PER_STEP)

    if tx == BASE.x and ty == BASE.y:
        new_status = DroneStatus.CHARGING
    elif new_battery <= 25:
        new_status = DroneStatus.RETURNING
    else:
        new_status = DroneStatus.NAVIGATING

    updated_drones = list(state.drones)
    updated_drones[drone_idx] = Drone(
        **{**drone.dict(),
           "position": Position(x=tx, y=ty),
           "battery": new_battery,
           "status": new_status,
           "pathQueue": [p for p in drone.pathQueue if not (p.x == tx and p.y == ty)]
           }
    )

    return SimulationState(
        **{**state.dict(), "drones": updated_drones}
    )

def get_sector_label(sector: int, num_drones: int, grid_size: int) -> str:
    """Get sector label for logging"""
    bounds = get_sector_bounds(sector, num_drones, grid_size)
    return f"[col {bounds['minX']}–{bounds['maxX']}, row {bounds['minY']}–{bounds['maxY']}]"

def process_drone(
        state: SimulationState,
        drone: Drone,
        tick: int,
        logs: List[Dict[str, Any]]
) -> Tuple[SimulationState, List[Dict[str, Any]]]:
    """Process individual drone logic"""
    global logged_battery_warnings, logged_returning, last_logged_sector, total_noise_events

    current_state = state
    BASE = Position(x=0, y=0)

    fresh_drone = next((d for d in current_state.drones if d.id == drone.id), drone)

    if fresh_drone.forceReturn and fresh_drone.status not in [DroneStatus.RETURNING, DroneStatus.CHARGING]:
        return_path = calculate_path(fresh_drone.position, BASE, current_state.grid, current_state.config.gridSize)
        drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
        if drone_idx != -1:
            updated_drones = list(current_state.drones)
            updated_drones[drone_idx] = Drone(
                **{**fresh_drone.dict(),
                   "status": DroneStatus.RETURNING,
                   "pathQueue": return_path,
                   "forceReturn": False
                   }
            )
            current_state = SimulationState(
                **{**current_state.dict(), "drones": updated_drones}
            )
            logged_returning.add(drone.id)
            logs.append(make_log(tick, 'warn',
                                 f"⚠ {drone.id} MANUAL RECALL — operator ordered return to base.",
                                 drone.id
                                 ))
        return current_state, logs

    if drone.status == DroneStatus.CHARGING:
        drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
        if drone_idx != -1:
            new_battery = min(100, drone.battery + 20)
            new_status = DroneStatus.IDLE if new_battery >= 90 else DroneStatus.CHARGING

            updated_drones = list(current_state.drones)
            updated_drones[drone_idx] = Drone(
                **{**drone.dict(), "battery": new_battery, "status": new_status}
            )
            current_state = SimulationState(
                **{**current_state.dict(), "drones": updated_drones}
            )

            if new_status == DroneStatus.IDLE:
                keys_to_remove = [k for k in logged_battery_warnings if k.startswith(drone.id)]
                for k in keys_to_remove:
                    logged_battery_warnings.discard(k)
                logged_returning.discard(drone.id)

                sector_name = get_sector_label(drone.sector, len(current_state.drones), current_state.config.gridSize)
                uncovered = sum(1 for row in current_state.grid for cell in row if not cell.scanned and not cell.hasObstacle)
                logs.append(make_log(tick, 'info',
                                     f"🔋 {drone.id} fully charged. Redeploying → Sector {sector_name} | {uncovered} cells remaining.",
                                     drone.id
                                     ))
        return current_state, logs

    bat = round(fresh_drone.battery)

    if bat <= 50 and bat > 30 and fresh_drone.status != DroneStatus.RETURNING:
        key50 = f"{drone.id}-50"
        if key50 not in logged_battery_warnings:
            logged_battery_warnings.add(key50)
            logs.append(make_log(tick, 'warn',
                                 f"⚡ {drone.id} battery at {bat}% — switching to conservative range.",
                                 drone.id
                                 ))

    if fresh_drone.battery <= 30 and fresh_drone.status != DroneStatus.RETURNING:
        key30 = f"{drone.id}-30"
        if key30 not in logged_battery_warnings:
            logged_battery_warnings.add(key30)
            logs.append(make_log(tick, 'warn',
                                 f"⚠ {drone.id} CRITICAL BATTERY ({bat}%) — aborting mission, returning to base.",
                                 drone.id
                                 ))

        drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
        if drone_idx != -1:
            return_path = calculate_path(fresh_drone.position, BASE, current_state.grid, current_state.config.gridSize)
            updated_drones = list(current_state.drones)
            updated_drones[drone_idx] = Drone(
                **{**fresh_drone.dict(),
                   "status": DroneStatus.RETURNING,
                   "pathQueue": return_path
                   }
            )
            current_state = SimulationState(
                **{**current_state.dict(), "drones": updated_drones}
            )

    current_drone = next((d for d in current_state.drones if d.id == drone.id), drone)

    if current_drone.status == DroneStatus.RETURNING:
        if drone.id not in logged_returning:
            logged_returning.add(drone.id)
            logs.append(make_log(tick, 'warn',
                                 f"🛬 {drone.id} en route to base for recharge. Battery: {round(current_drone.battery)}%.",
                                 drone.id
                                 ))

        if current_drone.position.x == BASE.x and current_drone.position.y == BASE.y:
            drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
            if drone_idx != -1:
                updated_drones = list(current_state.drones)
                updated_drones[drone_idx] = Drone(
                    **{**current_drone.dict(), "status": DroneStatus.CHARGING}
                )
                current_state = SimulationState(
                    **{**current_state.dict(), "drones": updated_drones}
                )
                logs.append(make_log(tick, 'info',
                                     f"🔌 {drone.id} docked at base. Initiating recharge sequence.",
                                     drone.id
                                     ))
        else:
            current_state = move_one_step(current_state, drone.id, BASE, tick, logs)
        return current_state, logs

    if len(current_drone.pathQueue) == 0:
        target = find_best_target(current_drone, current_state.grid, current_state.config, current_state.drones)
        if target:
            path = calculate_path(current_drone.position, target, current_state.grid, current_state.config.gridSize)
            drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
            if drone_idx != -1:
                updated_drones = list(current_state.drones)
                updated_drones[drone_idx] = Drone(
                    **{**current_drone.dict(),
                       "pathQueue": path,
                       "status": DroneStatus.NAVIGATING
                       }
                )
                current_state = SimulationState(
                    **{**current_state.dict(), "drones": updated_drones}
                )

                sector_name = get_sector_label(current_drone.sector, len(current_state.drones), current_state.config.gridSize)
                prev_sector = last_logged_sector.get(drone.id)
                if prev_sector != sector_name:
                    last_logged_sector[drone.id] = sector_name
                    uncovered = sum(1 for row in current_state.grid for cell in row if not cell.scanned and not cell.hasObstacle)
                    logs.append(make_log(tick, 'agent',
                                         f"[Command Agent] {drone.id} assigned Sector {sector_name}. Battery {round(current_drone.battery)}% → {uncovered} uncovered cells remaining.",
                                         drone.id
                                         ))
        return current_state, logs

    before_move = next((d for d in current_state.drones if d.id == drone.id), drone)
    current_state = move_one_step(
        current_state,
        drone.id,
        before_move.pathQueue[0] if before_move.pathQueue else BASE,
        tick,
        logs
    )

    after_move = next((d for d in current_state.drones if d.id == drone.id), drone)

    drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
    if drone_idx != -1:
        x, y = after_move.position.x, after_move.position.y
        cell = current_state.grid[y][x]

        thermal_noise = random.random() < current_state.config.thermalNoiseChance

        if thermal_noise:
            total_noise_events += 1
            logs.append(make_log(tick, 'warn',
                                 f"📡 {drone.id} THERMAL NOISE at ({x},{y}) — scan interference, cell may need re-scan.",
                                 drone.id
                                 ))
        elif cell.survivorId and not thermal_noise:
            survivor_idx = next((i for i, s in enumerate(current_state.survivors) if s.id == cell.survivorId), -1)
            if survivor_idx != -1 and not current_state.survivors[survivor_idx].detected:
                updated_survivors = list(current_state.survivors)
                updated_survivors[survivor_idx] = Survivor(
                    **{**current_state.survivors[survivor_idx].dict(),
                       "detected": True,
                       "detectedBy": drone.id,
                       "detectedAt": time.time()
                       }
                )

                updated_drones = list(current_state.drones)
                if cell.survivorId not in updated_drones[drone_idx].detectedSurvivorIds:
                    updated_drones[drone_idx].detectedSurvivorIds.append(cell.survivorId)
                updated_drones[drone_idx].status = DroneStatus.SCANNING

                current_state = SimulationState(
                    **{**current_state.dict(),
                       "survivors": updated_survivors,
                       "drones": updated_drones
                       }
                )

                logs.append(make_log(tick, 'detect',
                                     f"🚨 {drone.id} THERMAL SIGNATURE DETECTED! Survivor {cell.survivorId} at ({x},{y}). Marking position.",
                                     drone.id
                                     ))

        if not cell.scanned:
            updated_grid = list(current_state.grid)
            updated_grid[y][x] = GridCell(
                **{**cell.dict(), "scanned": True}
            )

            updated_drones = list(current_state.drones)
            updated_drones[drone_idx].cellsScanned += 1
            updated_drones[drone_idx].status = DroneStatus.SCANNING

            current_state = SimulationState(
                **{**current_state.dict(),
                   "grid": updated_grid,
                   "drones": updated_drones
                   }
            )

        updated_drones = list(current_state.drones)
        updated_drones[drone_idx].battery = max(0, updated_drones[drone_idx].battery - BATTERY_DRAIN_PER_SCAN)

        total_cells = current_state.config.gridSize ** 2
        scanned_cells = sum(1 for row in current_state.grid for cell in row if cell.scanned)
        coverage = round((scanned_cells / total_cells) * 100)

        survivors_found = sum(1 for s in current_state.survivors if s.detected)

        total_scannable = sum(1 for row in current_state.grid for cell in row if not cell.hasObstacle)
        total_scanned_non_obstacle = sum(1 for row in current_state.grid for cell in row if cell.scanned and not cell.hasObstacle)
        mission_complete = total_scanned_non_obstacle >= total_scannable

        updated_stats = SimulationStats(
            **{**current_state.stats.dict(),
               "coverage": coverage,
               "survivorsFound": survivors_found,
               "missionComplete": mission_complete,
               "tick": current_state.stats.tick,  # Keep the current tick value
               "missionStartTime": current_state.stats.missionStartTime
               }
        )

        current_state = SimulationState(
            **{**current_state.dict(), "stats": updated_stats}
        )

    return current_state, logs

def handle_mission_complete(state: SimulationState) -> SimulationState:
    """Handle ongoing return-to-base after mission"""
    BASE = Position(x=0, y=0)
    tick = state.stats.tick + 1
    new_logs = []
    current_state = SimulationState(
        **{**state.dict(), "stats": {**state.stats.dict(), "tick": tick}}
    )

    all_home = all(
        d.status == DroneStatus.CHARGING or (d.position.x == BASE.x and d.position.y == BASE.y)
        for d in current_state.drones
    )

    if all_home:
        return SimulationState(
            **{**current_state.dict(), "running": False}
        )

    for drone in current_state.drones:
        if drone.status == DroneStatus.CHARGING:
            continue
        if drone.position.x == BASE.x and drone.position.y == BASE.y:
            drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
            if drone_idx != -1:
                updated_drones = list(current_state.drones)
                updated_drones[drone_idx] = Drone(
                    **{**drone.dict(), "status": DroneStatus.CHARGING}
                )
                current_state = SimulationState(
                    **{**current_state.dict(), "drones": updated_drones}
                )
            continue

        current_drone = next((d for d in current_state.drones if d.id == drone.id), drone)

        if len(current_drone.pathQueue) == 0 or current_drone.status != DroneStatus.RETURNING:
            return_path = calculate_path(current_drone.position, BASE, current_state.grid, current_state.config.gridSize)
            drone_idx = next((i for i, d in enumerate(current_state.drones) if d.id == drone.id), -1)
            if drone_idx != -1:
                updated_drones = list(current_state.drones)
                updated_drones[drone_idx] = Drone(
                    **{**current_drone.dict(),
                       "status": DroneStatus.RETURNING,
                       "pathQueue": return_path
                       }
                )
                current_state = SimulationState(
                    **{**current_state.dict(), "drones": updated_drones}
                )

        current_state = move_one_step(current_state, drone.id, BASE, tick, new_logs)

    all_logs = list(current_state.log) + new_logs
    if len(all_logs) > 500:
        all_logs = all_logs[-500:]

    return SimulationState(
        **{**current_state.dict(), "log": all_logs}
    )

async def command_agent_tick(state: SimulationState) -> SimulationState:
    """Main command agent tick function"""
    global start_tick, last_summary_tick

    if not state.running:
        return state

    if start_tick == 0:
        start_tick = state.stats.tick

    if state.stats.missionComplete:
        return handle_mission_complete(state)

    # Increment tick by exactly 1 each time
    tick = state.stats.tick + 1
    new_logs = []
    current_state = SimulationState(
        **{**state.dict(), "stats": {**state.stats.dict(), "tick": tick}}
    )

    # Process all drones
    for drone in current_state.drones:
        update_drone_stats(drone, tick)

    for drone in current_state.drones:
        result_state, drone_logs = process_drone(current_state, drone, tick, [])
        current_state = result_state
        new_logs.extend(drone_logs)

    # Mission analysis and logging
    if tick % 50 == 0 or tick - last_summary_tick > 50:
        add_mission_analysis(current_state, tick, new_logs)

    if tick % 10 == 0:
        check_sector_completions(current_state, tick, new_logs)

    if tick % 15 == 0:
        current_state = monitor_and_reassign_drones(current_state, tick, new_logs)

    if current_state.stats.missionComplete:
        add_mission_analysis(current_state, tick, new_logs)
        new_logs.append(make_log(tick, 'success',
                                 f"🎯 MISSION COMPLETE — All {current_state.config.gridSize}×{current_state.config.gridSize} "
                                 f"scannable cells visited in {tick} ticks! "
                                 f"Coverage: {current_state.stats.coverage}% | Survivors found: {current_state.stats.survivorsFound}. "
                                 f"Recalling all drones to base."
                                 ))
        current_state = recall_all_drones(current_state, tick, new_logs)

    # Update logs
    all_logs = list(current_state.log) + new_logs
    if len(all_logs) > 500:
        all_logs = all_logs[-500:]

    return SimulationState(
        **{**current_state.dict(), "log": all_logs}
    )

# ===================================================
# Background Task for Auto Ticking - FIXED VERSION
# ===================================================

# ===================================================
# Background Task for Auto Ticking - 1 second = 1 tick
# ===================================================

async def auto_tick():
    """Background task to automatically advance the simulation - 1 second = 1 tick"""
    global simulation_state

    while True:
        if simulation_state and simulation_state.running:
            # Get the current tick interval in seconds
            tick_interval_seconds = simulation_state.config.tickIntervalMs / 1000.0

            # Execute one tick
            simulation_state = await command_agent_tick(simulation_state)

            # Sleep for exactly the tick interval
            # If tickIntervalMs = 1000, then 1 second = 1 tick
            await asyncio.sleep(tick_interval_seconds)
        else:
            # Sleep longer when not running
            await asyncio.sleep(0.5)


@app.post("/api/register_drone", response_model=MCPDroneResponse)
async def register_drone(req: MCPRegisterRequest):
    """Register a new drone"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    existing = next((d for d in simulation_state.drones if d.id == req.drone_id), None)
    if existing:
        return MCPDroneResponse(drone=existing, success=False, message="Already registered")

    idx = len(simulation_state.drones)
    drone = Drone(
        id=req.drone_id,
        name=req.name,
        position=BASE,
        battery=100.0,
        status=DroneStatus.IDLE,
        sector=idx,
        detectedSurvivorIds=[],
        pathQueue=[],
        cellsScanned=0,
        color=DRONE_COLORS[idx % len(DRONE_COLORS)],
        forceReturn=False
    )

    simulation_state.drones.append(drone)
    simulation_state.stats.dronesDeployed += 1

    return MCPDroneResponse(drone=drone, success=True)

@app.get("/api/discover_drones")
async def discover_drones():
    """Get all registered drones"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return simulation_state.drones

@app.get("/api/drones")
async def get_all_drones():
    """Get all drones (alias for discover_drones)"""
    return await discover_drones()

@app.get("/api/drones/{drone_id}")
async def get_drone(drone_id: str):
    """Get specific drone by ID"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone = next((d for d in simulation_state.drones if d.id == drone_id), None)
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    return drone

@app.get("/api/get_battery_status/{drone_id}")
async def get_battery_status(drone_id: str):
    """Get battery status for a drone"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone = next((d for d in simulation_state.drones if d.id == drone_id), None)
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    return BatteryStatusResponse(
        drone_id=drone.id,
        battery=drone.battery,
        status=drone.status
    )

@app.post("/api/move_to")
async def move_to(req: MCPMoveRequest):
    """Move drone to specified position"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone_idx = next((i for i, d in enumerate(simulation_state.drones) if d.id == req.drone_id), -1)
    if drone_idx == -1:
        return {"success": False, "message": "Drone not found"}

    drone = simulation_state.drones[drone_idx]

    if drone.battery <= 0:
        return {"success": False, "message": "No battery"}
    if drone.status == DroneStatus.CHARGING:
        return {"success": False, "message": "Charging"}

    size = simulation_state.config.gridSize
    tx = max(0, min(size - 1, req.x))
    ty = max(0, min(size - 1, req.y))

    if simulation_state.grid[ty][tx].hasObstacle:
        return {"success": False, "message": "Obstacle at target"}

    is_base = tx == BASE.x and ty == BASE.y
    if not is_base:
        occupied = any(
            d.id != req.drone_id and d.position.x == tx and d.position.y == ty
            for d in simulation_state.drones
        )
        if occupied:
            return {"success": False, "message": "Cell occupied by another drone"}

    new_battery = max(0, drone.battery - BATTERY_DRAIN_PER_STEP)

    if tx == BASE.x and ty == BASE.y:
        new_status = DroneStatus.CHARGING
    elif new_battery <= 25:
        new_status = DroneStatus.RETURNING
    else:
        new_status = DroneStatus.NAVIGATING

    simulation_state.drones[drone_idx].position = Position(x=tx, y=ty)
    simulation_state.drones[drone_idx].battery = new_battery
    simulation_state.drones[drone_idx].status = new_status
    simulation_state.drones[drone_idx].pathQueue = [
        p for p in drone.pathQueue if not (p.x == tx and p.y == ty)
    ]

    return {"success": True, "message": "Move successful"}

@app.post("/api/thermal_scan")
async def thermal_scan(req: MCPThermalScanRequest) -> MCPScanResponse:
    """Perform thermal scan at current position"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone_idx = next((i for i, d in enumerate(simulation_state.drones) if d.id == req.drone_id), -1)
    if drone_idx == -1:
        return MCPScanResponse()

    drone = simulation_state.drones[drone_idx]
    x, y = drone.position.x, drone.position.y
    cell = simulation_state.grid[y][x]

    thermal_noise = random.random() < simulation_state.config.thermalNoiseChance

    survivor_detected = False
    survivor_id = None

    if cell.survivorId and not thermal_noise:
        survivor_idx = next((i for i, s in enumerate(simulation_state.survivors) if s.id == cell.survivorId), -1)
        if survivor_idx != -1 and not simulation_state.survivors[survivor_idx].detected:
            survivor_detected = True
            survivor_id = cell.survivorId

            simulation_state.survivors[survivor_idx].detected = True
            simulation_state.survivors[survivor_idx].detectedBy = drone.id
            simulation_state.survivors[survivor_idx].detectedAt = time.time()

            if survivor_id not in simulation_state.drones[drone_idx].detectedSurvivorIds:
                simulation_state.drones[drone_idx].detectedSurvivorIds.append(survivor_id)
            simulation_state.drones[drone_idx].status = DroneStatus.SCANNING

    if not cell.scanned:
        simulation_state.grid[y][x].scanned = True
        simulation_state.drones[drone_idx].cellsScanned += 1
        simulation_state.drones[drone_idx].status = DroneStatus.SCANNING

    simulation_state.drones[drone_idx].battery = max(0, drone.battery - BATTERY_DRAIN_PER_SCAN)

    total_cells = simulation_state.config.gridSize ** 2
    scanned_cells = sum(1 for row in simulation_state.grid for cell in row if cell.scanned)
    coverage = round((scanned_cells / total_cells) * 100)

    survivors_found = sum(1 for s in simulation_state.survivors if s.detected)

    total_scannable = sum(1 for row in simulation_state.grid for cell in row if not cell.hasObstacle)
    total_scanned_non_obstacle = sum(
        1 for row in simulation_state.grid for cell in row
        if cell.scanned and not cell.hasObstacle
    )
    mission_complete = total_scanned_non_obstacle >= total_scannable

    # REMOVED ALL TICK CALCULATION LOGIC
    # Ticks are now handled exclusively by command_agent_tick

    # Update stats WITHOUT modifying tick
    simulation_state.stats.coverage = coverage
    simulation_state.stats.survivorsFound = survivors_found
    simulation_state.stats.missionComplete = mission_complete
    # DO NOT update simulation_state.stats.tick here

    return MCPScanResponse(
        survivor_detected=survivor_detected,
        survivor_id=survivor_id,
        obstacle_present=cell.hasObstacle,
        thermal_noise=thermal_noise
    )

@app.post("/api/charge_drone/{drone_id}")
async def charge_drone(drone_id: str):
    """Charge a drone at base"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone_idx = next((i for i, d in enumerate(simulation_state.drones) if d.id == drone_id), -1)
    if drone_idx == -1:
        raise HTTPException(status_code=404, detail="Drone not found")

    drone = simulation_state.drones[drone_idx]

    if drone.position.x != BASE.x or drone.position.y != BASE.y:
        raise HTTPException(status_code=400, detail="Drone not at base")

    new_battery = min(100, drone.battery + 20)
    new_status = DroneStatus.IDLE if new_battery >= 90 else DroneStatus.CHARGING

    simulation_state.drones[drone_idx].battery = new_battery
    simulation_state.drones[drone_idx].status = new_status

    return {"success": True, "message": "Charging initiated"}

@app.post("/api/plan_path")
async def plan_path(drone_id: str, to: Position):
    """Plan path from drone's current position to target"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone = next((d for d in simulation_state.drones if d.id == drone_id), None)
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    path = calculate_path(
        drone.position,
        to,
        simulation_state.grid,
        simulation_state.config.gridSize
    )

    return {"path": [{"x": p.x, "y": p.y} for p in path], "waypoints": len(path)}

@app.get("/api/get_sector_bounds/{sector}")
async def get_sector_bounds_endpoint(sector: int):
    """Get bounds for a specific sector"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    bounds = get_sector_bounds(
        sector,
        len(simulation_state.drones),
        simulation_state.config.gridSize
    )

    return bounds

@app.post("/api/find_best_target/{drone_id}")
async def find_best_target_endpoint(drone_id: str):
    """Find best target cell for a drone"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    drone = next((d for d in simulation_state.drones if d.id == drone_id), None)
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    target = find_best_target(
        drone,
        simulation_state.grid,
        simulation_state.config,
        simulation_state.drones
    )

    return {"target": target}

# ===================================================
# Configuration Endpoints
# ===================================================

@app.post("/api/config")
async def set_config(config: SimulationConfig):
    """Initialize or reset simulation with given config"""
    global simulation_state
    simulation_state = create_initial_state(config)
    return {"success": True, "message": "Simulation configured successfully", "config": config}

@app.get("/api/config")
async def get_config():
    """Get current simulation configuration"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return simulation_state.config

@app.get("/api/simulation/state")
async def get_simulation_state():
    """Get complete simulation state"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return simulation_state

@app.get("/api/survivors")
async def get_survivors():
    """Get all survivors"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return {
        "survivors": simulation_state.survivors,
        "found": simulation_state.stats.survivorsFound,
        "total": simulation_state.stats.totalSurvivors
    }

@app.get("/api/obstacles")
async def get_obstacles():
    """Get all obstacles"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return simulation_state.obstacles

@app.get("/api/grid")
async def get_grid():
    """Get current grid state"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return {
        "grid": simulation_state.grid,
        "size": simulation_state.config.gridSize
    }

@app.get("/api/stats")
async def get_stats():
    """Get simulation statistics"""
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")
    return simulation_state.stats

@app.post("/api/simulation/reset")
async def reset_simulation():
    """Reset simulation to initial state"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    simulation_state = create_initial_state(simulation_state.config)
    return {"success": True, "message": "Simulation reset successfully"}

@app.post("/api/simulation/start")
async def start_simulation():
    """Start the simulation"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    simulation_state.running = True
    if simulation_state.stats.missionStartTime is None:
        simulation_state.stats.missionStartTime = time.time()
    return {"success": True, "message": "Simulation started"}

@app.post("/api/simulation/stop")
async def stop_simulation():
    """Stop the simulation"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    simulation_state.running = False
    return {"success": True, "message": "Simulation stopped"}

@app.post("/api/simulation/tick")
async def manual_tick():
    """Manually advance one tick (for debugging)"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    simulation_state = await command_agent_tick(simulation_state)
    return {"success": True, "message": "Tick executed"}

@app.post("/api/simulation/set_tick_interval/{interval_ms}")
async def set_tick_interval(interval_ms: int):
    """Set the tick interval in milliseconds"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    if interval_ms < 100:
        raise HTTPException(status_code=400, detail="Interval too low (minimum 100ms)")
    if interval_ms > 5000:
        raise HTTPException(status_code=400, detail="Interval too high (maximum 5000ms)")

    simulation_state.config.tickIntervalMs = interval_ms
    return {
        "success": True,
        "message": f"Tick interval set to {interval_ms}ms",
        "tick_interval_ms": interval_ms
    }

# ===================================================
# Bulk Operations
# ===================================================

@app.post("/api/drones/bulk/move")
async def bulk_move(commands: List[MCPMoveRequest]):
    """Execute multiple move commands"""
    global simulation_state
    if not simulation_state:
        raise HTTPException(status_code=404, detail="No simulation configured")

    results = []
    for cmd in commands:
        drone_idx = next((i for i, d in enumerate(simulation_state.drones) if d.id == cmd.drone_id), -1)
        if drone_idx == -1:
            results.append({"drone_id": cmd.drone_id, "success": False, "message": "Drone not found"})
            continue

        results.append({"drone_id": cmd.drone_id, "success": True, "message": "Move queued"})

    return {"results": results}

# ===================================================
# Health Check
# ===================================================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "simulation_active": simulation_state is not None
    }

# ===================================================
# Main Entry Point
# ===================================================

@app.on_event("startup")
async def startup_event():
    """Start background task on server startup"""
    asyncio.create_task(auto_tick())

if __name__ == "__main__":
    print("=" * 50)
    print("🚁 Drone MCP Server")
    print("=" * 50)
    print(f"Starting server on http://localhost:8000")
    print(f"API endpoints available at http://localhost:8000/api")
    print("\nEndpoints:")
    print("  POST   /api/config              - Initialize simulation")
    print("  GET    /api/simulation/state    - Get simulation state")
    print("  POST   /api/register_drone      - Register new drone")
    print("  POST   /api/simulation/start     - Start simulation")
    print("  POST   /api/simulation/stop      - Stop simulation")
    print("  POST   /api/simulation/tick      - Manual tick")
    print("  POST   /api/simulation/set_tick_interval - Set tick speed")
    print("  GET    /api/discover_drones      - List all drones")
    print("  POST   /api/move_to              - Move drone")
    print("  POST   /api/thermal_scan         - Scan for survivors")
    print("  POST   /api/charge_drone/{id}    - Charge drone")
    print("  POST   /api/plan_path            - Plan path")
    print("  GET    /api/get_sector_bounds/{sector} - Get sector bounds")
    print("  POST   /api/find_best_target/{id} - Find best target")
    print("\n" + "=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)