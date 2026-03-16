// ===================================================
// types/simulation.ts — Core domain types
// ===================================================

export type DroneStatus = 'idle' | 'navigating' | 'scanning' | 'returning' | 'charging';

export interface Position {
  x: number;
  y: number;
}

export interface Drone {
  id: string;          // e.g. "UAV-01"
  name: string;
  position: Position;
  battery: number;     // 0-100
  status: DroneStatus;
  sector: number;      // 0-3 quadrant
  detectedSurvivorIds: string[];
  pathQueue: Position[];
  cellsScanned: number;
  color: string;       // CSS color token class
  forceReturn?: boolean; // manual RTB override
}

export interface Survivor {
  id: string;
  position: Position;
  detected: boolean;
  detectedBy?: string;
}

export interface Obstacle {
  position: Position;
}

export interface GridCell {
  position: Position;
  scanned: boolean;
  hasObstacle: boolean;
  survivorId?: string;
  droneId?: string;
}

export type LogLevel = 'info' | 'agent' | 'action' | 'detect' | 'warn' | 'success';

export interface LogEntry {
  id: string;
  tick: number;
  timestamp: number;
  level: LogLevel;
  message: string;
  droneId?: string;
}

export interface MissionStats {
  tick: number;
  coverage: number;          // 0-100%
  survivorsFound: number;
  totalSurvivors: number;
  dronesDeployed: number;
  missionComplete: boolean;
  missionStartTime: number;
}

export interface SimulationConfig {
  gridSize: number;          // default 20, max 30
  totalSurvivors: number;    // randomised 8-15 at init
  maxDrones: number;         // default 10
  droneCount: number;        // initial drones 1-10
  obstacleCount: number;     // random obstacles
  tickIntervalMs: number;    // default 1000
  thermalNoiseChance: number;// 0-1 chance of missed scan
}

export interface SimulationState {
  config: SimulationConfig;
  grid: GridCell[][];
  drones: Drone[];
  survivors: Survivor[];
  obstacles: Obstacle[];
  stats: MissionStats;
  log: LogEntry[];
  running: boolean;
  selectedDroneId: string | null;
}

// MCP-style request/response types
export interface MCPMoveRequest { drone_id: string; x: number; y: number; }
export interface MCPThermalScanRequest { drone_id: string; }
export interface MCPRegisterRequest { drone_id: string; name: string; }
export interface MCPDroneResponse { drone: Drone; success: boolean; message?: string; }
export interface MCPScanResponse {
  survivor_detected: boolean;
  survivor_id?: string;
  obstacle_present: boolean;
  thermal_noise: boolean;
}
