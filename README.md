# Rescue Rover Ops – Disaster Response Drone Simulation

Simulation Link : https://rescue-rover-n9n9.vercel.app/

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


## Overview

**Rescue Rover Ops** is an interactive drone simulation 
platform designed for **disaster response planning**. 
Users can create disaster scenarios 
(earthquake, flood, wildfire, etc.) and 
deploy autonomous drones to **search for survivors**, 
**scan affected areas**, and **monitor hazards** in real-time.

This project was built for educational purposes and 
hackathon competitions, demonstrating a 
**real-time multi-agent system** with an intuitive UI 
and flexible configuration.

---

## Features

- **Dynamic Disaster Creation**
    - Select disaster type, location, severity, affected area, and estimated survivors.
    - Redirects to the main dashboard after creating a disaster.

- **Interactive Drone Dashboard**
    - Deploy drones to cover the affected area.
    - Track drone positions, battery levels, and sector assignments.
    - Force drones to return to base manually.

- **Simulation Grid**
    - Visualize drone movement and scanned areas.
    - Detect survivors and obstacles.
    - Adjustable grid size and obstacles.

- **Activity Log**
    - Live logs showing drone actions and system messages.
    - Scrollable and adjustable size for better monitoring.

- **Fleet Management**
    - Track all drones in a sidebar with stats.
    - Select individual drones to see detailed info and next waypoints.

- **Customizable Simulation**
    - Adjust tick intervals, number of drones, total survivors, and obstacles.
    - Configuration panel allows quick experimentation.

---

## Installation

1. **Clone the repository:**

```bash
git clone https://github.com/arrazaqzikry/RescueRover.git
cd RescueRover
