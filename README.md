# JARVIS OS - Automated Software Engineering Platform

JARVIS OS is an evolution of `gpt-engineer`, utilizing the power of **CrewAI** multi-agent orchestration backed by a state-of-the-art **3D Visualization Frontend**.

This tool transforms a simple prompt into a full codebase, employing a team of AI Agents—*Software Architect, Senior Developer, and QA Engineer*—to collaboratively plan, write, and verify the correct structure of your application.

## System Architecture

1. **FastAPI Backend (`server.py`)**: 
   - Exposes a `POST /api/generate` endpoint to accept generation prompts asynchronously.
   - Hosts a robust WebSocket streaming engine (`/ws/agents`) to broadcast the internal "thought process" and output logs of the active CrewAI agents to connected clients.
   - Interfaces directly with `gpt-engineer`'s newly integrated `CrewAIOrchestrator`.

2. **CrewAI Orchestration (`gpt_engineer/core/crewai_interaction.py`)**:
   - Upgraded architecture to intercept standard system output seamlessly.
   - Robust fallback and retry logic when using OpenRouter APIs.

3. **3D Interactive Web UI (`web/`)**:
   - Built with **React, Vite, React Three Fiber, and Three.js**.
   - Features a visually stunning pseudo-office environment, placing the three specialized AI Agents at their own 3D desks.
   - Includes a dynamic intel feed that parses the raw LLM output and renders a clean stream of information tagged to each agent.

## Getting Started

### Prerequisites

Ensure you have Python 3.10+ and Node.js installed. Create a `.env` file in the root directory:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
MODEL_NAME=google/gemini-2.0-flash-lite-preview-02-05:free
```

### Installation

1. Install Python Backend dependencies:
```bash
pip install -r requirements.txt
```
*(Or use `poetry install` natively).*

2. Install Web UI dependencies:
```bash
cd web
npm install
```

### Running the System

Start the architecture using two terminals:

**Terminal 1 (FastAPI Backend)**:
```bash
uvicorn server:app --reload
```

**Terminal 2 (3D Web UI)**:
```bash
cd web
npm run dev
```

Navigate to `http://localhost:5173/` in your browser to access the JARVIS OS interface. Input a prompt, execute, and monitor the Agents working in real-time.
