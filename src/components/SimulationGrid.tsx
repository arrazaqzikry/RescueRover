// ===================================================
// components/SimulationGrid.tsx — 20×20 tactical grid
// ===================================================

import React from 'react';
import { GridCell, Drone, Survivor, Obstacle, Position } from '../types/simulation';

interface Props {
  grid: GridCell[][];
  drones: Drone[];
  survivors: Survivor[];
  obstacles: Obstacle[];
  selectedDroneId: string | null;
  onSelectDrone: (id: string | null) => void;
  gridSize: number;
}

const STATUS_COLORS: Record<string, string> = {
  idle:        '#4A9EF8',
  navigating:  '#22D3EE',
  scanning:    '#10B981',
  returning:   '#F59E0B',
  charging:    '#A78BFA',
};

const STATUS_BORDER: Record<string, string> = {
  idle:        '#2563EB',
  navigating:  '#0891B2',
  scanning:    '#059669',
  returning:   '#D97706',
  charging:    '#7C3AED',
};

export const SimulationGrid: React.FC<Props> = ({
  grid, drones, survivors, obstacles, selectedDroneId, onSelectDrone, gridSize
}) => {
  // Build lookup maps for fast rendering
  const droneMap = new Map<string, Drone>();
  drones.forEach(d => droneMap.set(`${d.position.x},${d.position.y}`, d));

  const selectedDrone = selectedDroneId ? drones.find(d => d.id === selectedDroneId) : null;
  const pathSet = new Set<string>();
  if (selectedDrone) {
    selectedDrone.pathQueue.forEach(p => pathSet.add(`${p.x},${p.y}`));
  }

  const CELL_SIZE = Math.floor(580 / gridSize); // dynamic cell size

  return (
    <div
      className="relative select-none"
      style={{
        width: CELL_SIZE * gridSize,
        height: CELL_SIZE * gridSize,
        minWidth: CELL_SIZE * gridSize,
      }}
    >
      {/* Coordinate labels — X axis */}
      <div
        className="absolute -top-4 left-0 flex"
        style={{ width: CELL_SIZE * gridSize }}
      >
        {Array.from({ length: gridSize }, (_, i) => (
          <div
            key={i}
            style={{ width: CELL_SIZE, fontSize: 7 }}
            className="text-center font-mono text-muted-foreground"
          >
            {i % 5 === 0 ? i : ''}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      {grid.map((row, gy) =>
        row.map((cell, gx) => {
          const key = `${gx},${gy}`;
          const drone = droneMap.get(key);
          const survivor = survivors.find(s => s.position.x === gx && s.position.y === gy && s.detected);
          const isPath = pathSet.has(key);
          const isBase = gx === 0 && gy === 0;
          const isScanning = drone?.status === 'scanning';

          let bg = cell.scanned
            ? (cell.hasObstacle ? '#3B1C1C' : '#FFFFFF')
            : '#F1F5F9';
          if (isBase) bg = '#1E293B';
          if (isPath) bg = 'rgba(34,211,238,0.15)';

          return (
            <div
              key={key}
              className={`absolute border border-gray-200/50 ${isScanning ? 'cell-scanning' : ''}`}
              style={{
                left: gx * CELL_SIZE,
                top: gy * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: bg,
                borderColor: cell.scanned ? '#CBD5E1' : '#E2E8F0',
                boxSizing: 'border-box',
                transition: 'background-color 0.15s',
              }}
              onClick={() => drone ? onSelectDrone(drone.id === selectedDroneId ? null : drone.id) : undefined}
            >
              {/* Obstacle marker */}
              {cell.hasObstacle && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ fontSize: CELL_SIZE * 0.45 }}
                >
                  <span style={{ color: '#EF4444', fontWeight: 900, lineHeight: 1 }}>✕</span>
                </div>
              )}

              {/* Base marker */}
              {isBase && !drone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="font-mono font-bold text-rescue-green"
                    style={{ fontSize: CELL_SIZE * 0.38 }}
                  >
                    ⌂
                  </span>
                </div>
              )}

              {/* Detected survivor */}
              {survivor && !drone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="survivor-glow rounded-full flex items-center justify-center"
                    style={{
                      width: CELL_SIZE * 0.7,
                      height: CELL_SIZE * 0.7,
                      backgroundColor: '#10B981',
                      fontSize: CELL_SIZE * 0.32,
                      fontWeight: 700,
                      color: '#fff',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {survivor.id}
                  </div>
                </div>
              )}

              {/* Drone */}
              {drone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className={`rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110
                      ${drone.id === selectedDroneId ? 'ring-1 ring-offset-0' : ''}
                      ${isScanning ? 'status-active' : ''}`}
                    style={{
                      width: CELL_SIZE * 0.82,
                      height: CELL_SIZE * 0.82,
                      backgroundColor: STATUS_COLORS[drone.status] ?? '#4A9EF8',
                      border: `2px solid ${STATUS_BORDER[drone.status] ?? '#2563EB'}`,
                      boxShadow: drone.id === selectedDroneId
                        ? `0 0 6px ${STATUS_COLORS[drone.status]}80`
                        : 'none',
                    }}
                  >
                    <span
                      className="font-mono font-bold text-white"
                      style={{ fontSize: CELL_SIZE * 0.26, letterSpacing: -0.5 }}
                    >
                      {drone.id.replace('UAV-', 'U')}
                    </span>
                  </div>
                </div>
              )}

              {/* Path queue dot (selected drone) */}
              {isPath && !drone && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="rounded-full opacity-50"
                    style={{
                      width: CELL_SIZE * 0.2,
                      height: CELL_SIZE * 0.2,
                      backgroundColor: '#22D3EE',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Y axis labels */}
      <div
        className="absolute -left-5 top-0"
        style={{ height: CELL_SIZE * gridSize }}
      >
        {Array.from({ length: gridSize }, (_, i) => (
          <div
            key={i}
            style={{ height: CELL_SIZE, fontSize: 7, width: 16 }}
            className="flex items-center justify-end font-mono text-muted-foreground pr-1"
          >
            {i % 5 === 0 ? i : ''}
          </div>
        ))}
      </div>
    </div>
  );
};
