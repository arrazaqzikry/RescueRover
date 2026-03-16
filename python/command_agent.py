# ===================================================
# python/command_agent.py
# Autonomous Command Agent — Chain-of-Thought reasoning
# Run: python command_agent.py  (after starting mcp_server.py)
# ===================================================

import asyncio
import httpx
import random
import time
from collections import deque
from typing import Optional

MCP_BASE = "http://localhost:8000"
GRID_SIZE = 20
BASE = (0, 0)
TICK_INTERVAL = 1.0  # seconds
DRONE_COUNT = 3       # initial drones to register

# ─── CoT Logger ─────────────────────────────────────────────────────────────

def cot(msg: str, level: str = "INFO"):
    ts = time.strftime("%H:%M:%S")
    prefix = {"INFO": "  ", "AGENT": "◈ ", "MOVE": "→ ", "DETECT": "★ ", "WARN": "⚠ ", "OK": "✓ "}.get(level, "  ")
    print(f"[{ts}] {prefix}{msg}")

# ─── MCP Client helpers ───────────────────────────────────────────────────────

async def mcp_get(client: httpx.AsyncClient, path: str):
    r = await client.get(f"{MCP_BASE}{path}")
    r.raise_for_status()
    return r.json()

async def mcp_post(client: httpx.AsyncClient, path: str, body: dict):
    r = await client.post(f"{MCP_BASE}{path}", json=body)
    r.raise_for_status()
    return r.json()

# ─── Path planning (BFS) ────────────────────────────────────────────────────

def plan_path(start, goal, obstacles: set) -> list[tuple]:
    if start == goal:
        return []
    queue = deque([(start, [])])
    visited = {start}
    dirs = [(0,1),(0,-1),(1,0),(-1,0)]
    while queue:
        pos, path = queue.popleft()
        for dx, dy in dirs:
            np = (pos[0]+dx, pos[1]+dy)
            if not (0 <= np[0] < GRID_SIZE and 0 <= np[1] < GRID_SIZE):
                continue
            if np in visited or np in obstacles:
                continue
            new_path = path + [np]
            if np == goal:
                return new_path
            visited.add(np)
            queue.append((np, new_path))
    return []

# ─── Sector assignment ───────────────────────────────────────────────────────

SECTORS = {
    0: {"minX": 0,  "maxX": 9,  "minY": 0,  "maxY": 9,  "name": "NW"},
    1: {"minX": 10, "maxX": 19, "minY": 0,  "maxY": 9,  "name": "NE"},
    2: {"minX": 0,  "maxX": 9,  "minY": 10, "maxY": 19, "name": "SW"},
    3: {"minX": 10, "maxX": 19, "minY": 10, "maxY": 19, "name": "SE"},
}

def find_target(drone: dict, scanned: set, obstacles: set, claimed: set) -> Optional[tuple]:
    battery = drone["battery"]
    sector = drone["sector"]
    pos = (drone["position"]["x"], drone["position"]["y"])
    max_range = GRID_SIZE if battery > 50 else int((battery / 100) * GRID_SIZE * 1.5)
    sb = SECTORS[sector % 4]
    bounds = sb if battery > 25 else {"minX": 0, "maxX": 4, "minY": 0, "maxY": 4}

    best, best_score = None, float("inf")
    for gy in range(bounds["minY"], bounds["maxY"]+1):
        for gx in range(bounds["minX"], bounds["maxX"]+1):
            if (gx, gy) in scanned or (gx, gy) in obstacles or (gx, gy) in claimed:
                continue
            d = abs(pos[0]-gx) + abs(pos[1]-gy)
            if d > max_range:
                continue
            score = d + random.random() * 0.5
            if score < best_score:
                best_score, best = score, (gx, gy)

    # Expand if sector exhausted
    if not best:
        for gy in range(GRID_SIZE):
            for gx in range(GRID_SIZE):
                if (gx, gy) in scanned or (gx, gy) in obstacles or (gx, gy) in claimed:
                    continue
                d = abs(pos[0]-gx) + abs(pos[1]-gy)
                if d > max_range:
                    continue
                score = d + random.random() * 0.5
                if score < best_score:
                    best_score, best = score, (gx, gy)
    return best

# ─── Main agent loop ─────────────────────────────────────────────────────────

async def register_fleet(client: httpx.AsyncClient):
    for i in range(DRONE_COUNT):
        uid = f"UAV-{str(i+1).padStart(2,'0') if False else str(i+1).zfill(2)}"
        try:
            res = await mcp_post(client, "/register_drone", {"drone_id": uid, "name": uid})
            cot(f"Registered {uid}", "OK")
        except Exception as e:
            cot(f"Failed to register {uid}: {e}", "WARN")

async def agent_loop():
    drone_paths: dict[str, list] = {}
    tick = 0
    obstacles_cache: set = set()

    async with httpx.AsyncClient(timeout=5.0) as client:
        # Register initial fleet
        cot("Command Agent initializing...", "AGENT")
        await register_fleet(client)
        await asyncio.sleep(0.5)

        # Fetch obstacles from world state
        try:
            ws = await mcp_get(client, "/world_state")
            obstacles_cache = {(o["x"], o["y"]) for o in ws.get("obstacles", [])}
            cot(f"World loaded: {len(obstacles_cache)} obstacles", "AGENT")
        except Exception as e:
            cot(f"Could not fetch world state: {e}", "WARN")

        while True:
            tick += 1
            cot(f"[TICK {tick}] Polling fleet via MCP /discover_drones", "AGENT")

            try:
                res = await mcp_get(client, "/discover_drones")
                drones = res["drones"]
            except Exception as e:
                cot(f"Fleet discovery failed: {e}", "WARN")
                await asyncio.sleep(TICK_INTERVAL)
                continue

            # Fetch scanned cells
            try:
                ws = await mcp_get(client, "/world_state")
                scanned = {(c["x"], c["y"]) for c in ws.get("scanned_cells", [])}
                coverage = ws["coverage"]
                survivors_found = sum(1 for s in ws.get("survivors", []) if s["detected"])
                total_survivors = 5
            except Exception:
                scanned = set()
                coverage, survivors_found, total_survivors = 0, 0, 5

            cot(f"[REPORT] Coverage: {coverage}% | Survivors: {survivors_found}/{total_survivors}", "AGENT")

            if survivors_found >= total_survivors:
                cot(f"🎯 MISSION COMPLETE — All {total_survivors} survivors found in {tick} ticks!", "OK")
                break

            claimed = set()
            for drone in drones:
                path = drone_paths.get(drone["id"], [])
                for p in path:
                    claimed.add(p)

            for drone in drones:
                did = drone["id"]
                battery = drone["battery"]
                status = drone["status"]
                pos = (drone["position"]["x"], drone["position"]["y"])
                sector_name = SECTORS[drone["sector"] % 4]["name"]

                # Charging
                if status == "charging":
                    try:
                        res = await mcp_post(client, f"/charge_drone/{did}", {})
                        new_bat = res["drone"]["battery"]
                        cot(f"⚡ {did} charging: {battery}% → {new_bat}%", "INFO")
                    except Exception as e:
                        cot(f"Charge failed for {did}: {e}", "WARN")
                    continue

                # Low battery recall
                if battery <= 25 and status != "returning":
                    cot(f"[COT] {did} battery critical ({battery}%). Recalling to base.", "WARN")
                    drone_paths[did] = plan_path(pos, BASE, obstacles_cache)

                # Returning
                if status == "returning" or (battery <= 25):
                    path = drone_paths.get(did, [])
                    if not path:
                        path = plan_path(pos, BASE, obstacles_cache)
                        drone_paths[did] = path
                    if pos == BASE:
                        try:
                            await mcp_post(client, f"/charge_drone/{did}", {})
                            cot(f"🏠 {did} arrived at base. Charging.", "OK")
                        except Exception:
                            pass
                        continue
                    if path:
                        nx, ny = path[0]
                        try:
                            await mcp_post(client, "/move_to", {"drone_id": did, "x": nx, "y": ny})
                            drone_paths[did] = path[1:]
                            cot(f"→ {did} returning: moved to ({nx},{ny}), bat:{battery}%", "MOVE")
                        except Exception as e:
                            cot(f"Move failed for {did}: {e}", "WARN")
                    continue

                # Plan path if empty
                path = drone_paths.get(did, [])
                if not path:
                    target = find_target(drone, scanned, obstacles_cache, claimed)
                    if target:
                        path = plan_path(pos, target, obstacles_cache)
                        drone_paths[did] = path
                        cot(
                            f"[COT] {did} bat:{battery}% → target ({target[0]},{target[1]}) "
                            f"sector {sector_name}. Path: {len(path)} steps. "
                            f"{'High bat → distant range.' if battery > 50 else 'Medium bat → moderate range.'}",
                            "AGENT"
                        )
                        for p in path:
                            claimed.add(p)
                    else:
                        cot(f"[COT] {did} no target found. Holding.", "INFO")
                        continue

                # Move one step
                if path:
                    nx, ny = path[0]
                    try:
                        res = await mcp_post(client, "/move_to", {"drone_id": did, "x": nx, "y": ny})
                        drone_paths[did] = path[1:]
                        new_bat = res["drone"]["battery"]
                        cot(f"✈  {did} → ({nx},{ny}) bat:{new_bat}%", "MOVE")

                        # Thermal scan
                        scan_res = await mcp_post(client, "/thermal_scan", {"drone_id": did})
                        if scan_res.get("thermal_noise"):
                            cot(f"📡 {did} thermal NOISE at ({nx},{ny})", "WARN")
                        elif scan_res.get("survivor_detected"):
                            sid = scan_res.get("survivor_id")
                            cot(f"★ SURVIVOR {sid} DETECTED by {did} at ({nx},{ny})!", "DETECT")
                        else:
                            cot(f"  {did} scanned ({nx},{ny}) — clear", "INFO")
                    except Exception as e:
                        cot(f"Step failed for {did}: {e}", "WARN")
                        drone_paths[did] = []

            await asyncio.sleep(TICK_INTERVAL)

if __name__ == "__main__":
    print("=" * 60)
    print("  DISASTER RESPONSE COMMAND AGENT")
    print("  Connecting to MCP Server at", MCP_BASE)
    print("=" * 60)
    asyncio.run(agent_loop())
