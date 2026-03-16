# ===================================================
# python/mcp_server.py
# FastAPI MCP Server — Authoritative Drone State
# Run: uvicorn mcp_server:app --reload --port 8000
# ===================================================

import asyncio
import math
import random
from collections import deque
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Disaster Response MCP Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Config ──────────────────────────────────────────────────────────────────

GRID_SIZE = 20
TOTAL_SURVIVORS = 5
OBSTACLE_COUNT = 15
THERMAL_NOISE_CHANCE = 0.05
BASE = (0, 0)

# ─── State ───────────────────────────────────────────────────────────────────

drones: dict[str, dict] = {}
grid_scanned: set[tuple[int,int]] = set()
obstacles: set[tuple[int,int]] = set()
survivors: dict[str, dict] = {}

def initialize_world():
    global obstacles, survivors, grid_scanned
    grid_scanned = {BASE}
    obstacles = set()
    used = {BASE}

    # Place obstacles
    while len(obstacles) < OBSTACLE_COUNT:
        p = (random.randint(0, GRID_SIZE-1), random.randint(0, GRID_SIZE-1))
        if p not in used:
            obstacles.add(p)
            used.add(p)

    # Place survivors
    survivors = {}
    for i in range(TOTAL_SURVIVORS):
        while True:
            p = (random.randint(0, GRID_SIZE-1), random.randint(0, GRID_SIZE-1))
            if p not in used:
                sid = f"S{i+1}"
                survivors[sid] = {"id": sid, "position": {"x": p[0], "y": p[1]},
                                   "detected": False, "detected_by": None}
                used.add(p)
                break

initialize_world()

# ─── Request Models ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    drone_id: str
    name: str

class MoveRequest(BaseModel):
    drone_id: str
    x: int
    y: int

class ScanRequest(BaseModel):
    drone_id: str

# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_drone_or_404(drone_id: str):
    if drone_id not in drones:
        raise HTTPException(404, f"Drone {drone_id} not found")
    return drones[drone_id]

def manhattan(a, b):
    return abs(a[0]-b[0]) + abs(a[1]-b[1])

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.post("/register_drone")
def register_drone(req: RegisterRequest):
    if req.drone_id in drones:
        return {"success": False, "message": "Already registered", "drone": drones[req.drone_id]}
    drones[req.drone_id] = {
        "id": req.drone_id, "name": req.name,
        "position": {"x": 0, "y": 0},
        "battery": 100, "status": "idle",
        "sector": len(drones) % 4,
        "detected_survivor_ids": [],
        "path_queue": [],
        "cells_scanned": 0,
    }
    return {"success": True, "drone": drones[req.drone_id]}

@app.get("/discover_drones")
def discover_drones():
    return {"drones": list(drones.values()), "count": len(drones)}

@app.get("/get_battery_status/{drone_id}")
def get_battery_status(drone_id: str):
    d = get_drone_or_404(drone_id)
    return {"drone_id": drone_id, "battery": d["battery"], "status": d["status"]}

@app.post("/move_to")
def move_to(req: MoveRequest):
    d = get_drone_or_404(req.drone_id)
    if d["battery"] <= 0:
        return {"success": False, "message": "No battery remaining"}
    tx, ty = max(0, min(GRID_SIZE-1, req.x)), max(0, min(GRID_SIZE-1, req.y))
    if (tx, ty) in obstacles:
        return {"success": False, "message": "Obstacle at target position"}

    dist = manhattan((d["position"]["x"], d["position"]["y"]), (tx, ty))
    drain = min(dist * 2, d["battery"])
    d["battery"] = max(0, d["battery"] - drain)
    d["position"] = {"x": tx, "y": ty}

    if tx == 0 and ty == 0:
        d["status"] = "charging"
    elif d["battery"] <= 25:
        d["status"] = "returning"
    else:
        d["status"] = "navigating"

    return {"success": True, "drone": d}

@app.post("/thermal_scan")
def thermal_scan(req: ScanRequest):
    d = get_drone_or_404(req.drone_id)
    x, y = d["position"]["x"], d["position"]["y"]
    pos = (x, y)

    noise = random.random() < THERMAL_NOISE_CHANCE
    survivor_detected = False
    survivor_id = None

    if not noise:
        for sid, s in survivors.items():
            if s["position"]["x"] == x and s["position"]["y"] == y and not s["detected"]:
                s["detected"] = True
                s["detected_by"] = req.drone_id
                d["detected_survivor_ids"].append(sid)
                survivor_detected = True
                survivor_id = sid
                break

    if pos not in grid_scanned:
        grid_scanned.add(pos)
        d["cells_scanned"] += 1

    d["battery"] = max(0, d["battery"] - 1)
    d["status"] = "scanning"

    coverage = round(len(grid_scanned) / (GRID_SIZE * GRID_SIZE) * 100, 1)
    survivors_found = sum(1 for s in survivors.values() if s["detected"])

    return {
        "survivor_detected": survivor_detected,
        "survivor_id": survivor_id,
        "obstacle_present": pos in obstacles,
        "thermal_noise": noise,
        "coverage": coverage,
        "survivors_found": survivors_found,
        "total_survivors": TOTAL_SURVIVORS,
        "mission_complete": survivors_found >= TOTAL_SURVIVORS,
    }

@app.post("/charge_drone/{drone_id}")
def charge_drone(drone_id: str):
    d = get_drone_or_404(drone_id)
    if d["position"]["x"] != 0 or d["position"]["y"] != 0:
        return {"success": False, "message": "Drone not at base"}
    d["battery"] = min(100, d["battery"] + 20)
    if d["battery"] >= 90:
        d["status"] = "idle"
    return {"success": True, "drone": d}

@app.get("/world_state")
def world_state():
    return {
        "drones": list(drones.values()),
        "survivors": list(survivors.values()),
        "obstacles": [{"x": p[0], "y": p[1]} for p in obstacles],
        "scanned_cells": [{"x": p[0], "y": p[1]} for p in grid_scanned],
        "coverage": round(len(grid_scanned) / (GRID_SIZE * GRID_SIZE) * 100, 1),
    }

@app.post("/reset")
def reset_world():
    drones.clear()
    initialize_world()
    return {"success": True, "message": "World reset"}
