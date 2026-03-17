📋 Overview

Aegis Drone is a sophisticated disaster response simulation system that coordinates autonomous drone swarms for search and rescue missions. The system features intelligent agent-based coordination, real-time grid exploration, thermal scanning for survivor detection, and dynamic path planning with collision avoidance.

Getting Started

Prerequisites

    Node.js 16.x or higher

    npm or yarn package manager

    Modern web browser (Chrome, Firefox, Edge, Safari)

Installation

    Clone the repository

bash

git clone https://github.com/arrazaqzikry/RescueRover
cd rescue-rover-ops

    Install dependencies

bash

npm install
# or
yarn install

    Start the development server

bash

npm run dev
# or
yarn dev

    Open your browser



🏗️ System Architecture

text

┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (UI)                       │
├───────────────┬──────────────────────────────┬──────────────┤
│  MissionHeader│    SimulationGrid            │  DroneFleet  │
│  ActivityLog  │    ConfigPanel               │  Stats Panel │
└───────────────┴──────────────────────────────┴──────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│                 Command Agent (commandAgent.ts)              │
│  • Chain-of-Thought Reasoning    • Drone Coordination        │
│  • Sector Assignment             • Mission Control           │
│  • Battery Monitoring            • Return-to-Base Logic      │
└──────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (mcpServer.ts)                 │
│  • State Management     • Path Planning (BFS)                │
│  • Collision Prevention • Thermal Scanning                   │
│  • Drone Registration   • Sector Calculations                │
└──────────────────────────────────────────────────────────────┘

🚀

🎮 Usage Guide

1. Welcome Page

   Choose between Command Center (Admin) or Drone Contributor (User)

   Overview of system capabilities and statistics

2. Create Disaster Scenario

   Configure disaster parameters:

        Disaster Type: Earthquake, Flood, Wildfire, Building Collapse, Hurricane

        Location: City or coordinates

        Severity: Low to Critical

        Affected Area: Size in km²

        Estimated Survivors: Number of potential survivors

        Situation Report: Detailed description

3. Main Dashboard

4. Control Panel

   Start/Pause: Control simulation execution
   Reset: Reset to initial configuration
   Add Drone: Deploy new drones (up to max limit)
   Config: Adjust simulation parameters
    Grid Visualization
    Drone Status Colors

4. Fleet Management

   View all active drones
   Monitor battery levels
   Track assigned sectors
   Manual Return-to-Base override
   Selected drone details with waypoint preview

5. Activity Log

Real-time mission events with different log levels:

    📝 Info: System events, deployments

    ⚠️ Warning: Low battery, thermal noise

    🚨 Detection: Survivor found

    ✅ Success: Mission complete

    🤖 Agent: Command Agent decisions

🧠 Intelligent Features

Chain-of-Thought Reasoning

The Command Agent continuously evaluates:
Collision Prevention System
typescript

// Multi-layer collision avoidance:
1. Target Selection - Avoids occupied cells
2. Path Planning - BFS avoids future positions
3. Pre-move Validation - Checks before moving
4. Priority System - Critical battery moves first
5. Dynamic Rerouting - Recalculates when blocked

Battery Management

    Normal Operation: >50% battery

    Conservative Mode: 25-50% (reduced range)

    Critical Return: <25% (immediate RTB)

    Charging: +20% per tick at base

🛠️ Configuration
Simulation Parameters
typescript

interface SimulationConfig {
gridSize: number;           // Grid dimensions (default: 20x20)
totalSurvivors: number;     // Random 8-15
maxDrones: number;          // Maximum deployable drones
droneCount: number;         // Initial drone count
obstacleCount: number;      // Number of obstacles
tickIntervalMs: number;     // Update frequency
thermalNoiseChance: number; // False negative probability
}

Keyboard Shortcuts

    Space: Start/Pause simulation

    R: Reset simulation

    D: Add drone

    Esc: Close config panel

    Ctrl + Click: Select drone

📊 Project Structure
text

🔧 Advanced Features
Custom Splitter System

The dashboard features a custom resizable panel system:

    Vertical Splitter: Adjust grid/fleet width (20-70% range)

    Horizontal Splitter: Resize activity log height

    Persistent Layout: Saves preferences to localStorage

    Reset Button: Restore default layout

Mission Complete Detection

The system automatically detects when:

    All non-obstacle cells are scanned

    All survivors are found

    Triggers automated recall sequence

    Generates mission summary report

🧪 Testing

Run the test suite:
bash

npm test
# or
yarn test

Key test scenarios:

    Drone collision prevention

    Battery drain calculations

    Path planning efficiency

    Sector assignment logic

    Thermal detection accuracy

🤝 Contributing

    Fork the repository

    Create a feature branch (git checkout -b feature/AmazingFeature)

    Commit changes (git commit -m 'Add AmazingFeature')

    Push to branch (git push origin feature/AmazingFeature)

    Open a Pull Request

Development Guidelines

    Follow TypeScript strict mode

    Maintain 80%+ test coverage

    Document all public functions

    Use semantic commit messages

📝 License

Distributed under the MIT License. See LICENSE for more information.
🙏 Acknowledgments

    Inspired by real-world drone swarm research

    Built with React and TypeScript

    Uses Tailwind CSS for styling

    Implements MCP-inspired architecture