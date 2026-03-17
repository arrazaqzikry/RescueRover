# Disaster Response Command Center — Setup Guide

## Quick Start (React Dashboard only — no Python needed)

```bash
npm install && npm run dev
```

Open http://localhost:5173 → click **▶ DEPLOY** → watch the simulation live.

---

## Full Stack (Python MCP Server + Agent + Dashboard)

### 1. Install Python deps
```bash
cd python
pip install fastapi uvicorn httpx pydantic
```

### 2. Start MCP Server
```bash
uvicorn mcp_server:app --reload --port 8000
```

### 3. Start Command Agent (new terminal)
```bash
python command_agent.py
```

### 4. Open React Dashboard
```bash
npm run dev
```

---

## MCP Endpoints

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | /register_drone                 | Register a new UAV       |
| GET    | /discover_drones                | List all active drones   |
| GET    | /get_battery_status/{drone_id}  | Get battery & status     |
| POST   | /move_to                        | Move drone to (x,y)      |
| POST   | /thermal_scan                   | Scan current cell        |
| POST   | /charge_drone/{drone_id}        | Charge at base           |
| GET    | /world_state                    | Full world snapshot      |
| POST   | /reset                          | Reset simulation         |

---

## Architecture

```
┌─────────────────┐     MCP HTTP      ┌──────────────────┐
│  Command Agent  │ ◄────────────────► │   FastAPI MCP    │
│  (Python)       │   POST/GET calls   │   Server         │
└─────────────────┘                   └──────────────────┘
                                               ▲
                                               │ REST API
                                       ┌───────┴──────────┐
                                       │  React Dashboard │
                                       │      (Vite)
                                       └──────────────────┘
```
