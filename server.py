import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import asyncio
import os
import json
import queue
import sys
import traceback
from dotenv import load_dotenv

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from gpt_engineer.core.crewai_interaction import CrewAIOrchestrator
from gpt_engineer.core.safe_project_write import sanitize_project_name, write_files_dict
from gpt_engineer.core.files_validation import validate_files_dict

load_dotenv()

# POST /api/transcribe sends user audio to Groq Whisper (same key as LLM). Privacy: audio leaves your server to Groq.
GROQ_TRANSCRIBE_URL = os.getenv(
    "GROQ_TRANSCRIBE_URL", "https://api.groq.com/openai/v1/audio/transcriptions"
)
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")

app = FastAPI(title="JARVIS OS - GPT Engineer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=200_000)
    project_name: str = Field(default="example-app", max_length=120)
    clarification_context: str = Field(default="", max_length=100_000)


class ClarifyRequest(BaseModel):
    prompt: str = Field(default="", max_length=100_000)

# Global pubsub channels
log_queues = []

def _compose_prompt(user_prompt: str, clarification_context: str) -> str:
    user_prompt = (user_prompt or "").strip()
    ctx = (clarification_context or "").strip()
    if not ctx:
        return user_prompt
    return (
        f"{user_prompt}\n\n"
        "Authoritative clarifications from the user (use these to resolve ambiguity):\n"
        f"{ctx}"
    )


def run_crewai_sync(prompt: str, q: queue.Queue, project_name: str):
    orchestrator = CrewAIOrchestrator(log_queue=q)
    try:
        files_dict = orchestrator.run(prompt)

        validation_errors = validate_files_dict(files_dict)
        if validation_errors:
            q.put("[SYSTEM] Validation failed for generated Python files; retrying once with strict fix instructions.")
            strict_prompt = (
                f"{prompt}\n\n"
                "Your previously generated files failed validation.\n"
                "Fix the output so that all `*.py` files are syntactically valid Python.\n"
                "Validation errors:\n"
                + "\n".join(f"- {e}" for e in validation_errors)
            )
            files_dict = orchestrator.run(strict_prompt)
            validation_errors = validate_files_dict(files_dict)
            if validation_errors:
                raise ValueError("Generated files did not pass validation after retry: " + "; ".join(validation_errors))

        safe_name = sanitize_project_name(project_name)
        project_dir = os.path.join(os.getcwd(), "projects", safe_name)

        written = write_files_dict(project_dir, dict(files_dict))
        q.put(
            f"[SYSTEM] Wrote {len(written)} file(s) to projects/{safe_name}/ — syncing UI."
        )

        # Send files JSON to frontend (must arrive before __CLOSE__ so the stream processes it)
        payload = json.dumps(dict(files_dict), ensure_ascii=False)
        q.put(f"__FILES__:{payload}")
        q.put("__CLOSE__")
    except Exception as e:
        traceback.print_exc()
        q.put(f"[SYSTEM] ERROR: {str(e)}")
        q.put("__CLOSE__")

async def stream_logs_to_queues(q: queue.Queue):
    current_agent = "System"
    while True:
        try:
            msg = await asyncio.to_thread(q.get)

            # Process file payloads before close so a mis-ordered queue cannot skip files.
            if isinstance(msg, str) and msg.startswith("__FILES__:"):
                files_json = msg.replace("__FILES__:", "", 1)
                try:
                    parsed = json.loads(files_json)
                except json.JSONDecodeError as e:
                    print(f"Invalid __FILES__ JSON: {e}")
                    continue
                payload = json.dumps({"type": "files", "data": parsed}, ensure_ascii=False)
                for sq in log_queues:
                    await sq.put(payload)
                continue

            if msg == "__CLOSE__":
                for sq in log_queues:
                    await sq.put(json.dumps({"type": "close"}))
                break
            
            # ── Agent detection: track state from CrewAI verbose headers ──
            # CrewAI prints lines like "# Agent: Software Architect" when switching agents
            if "Agent: Software Architect" in msg or "Working Agent: Software Architect" in msg:
                current_agent = "Architect"
            elif "Agent: Senior Developer" in msg or "Working Agent: Senior Developer" in msg:
                current_agent = "Developer"
            elif "Agent: QA Engineer" in msg or "Working Agent: QA Engineer" in msg:
                current_agent = "QA"
            # Also catch role mentions in task/thought lines
            elif "[SYSTEM]" in msg or "🚀" in msg or "✅" in msg:
                current_agent = "System"
            elif "Software Architect" in msg and current_agent == "System":
                current_agent = "Architect"
            elif "Senior Developer" in msg and current_agent == "System":
                current_agent = "Developer"
            elif "QA Engineer" in msg and current_agent == "System":
                current_agent = "QA"

            payload = json.dumps({
                "type": "log",
                "message": msg,
                "agent": current_agent
            })
            
            for sq in log_queues:
                await sq.put(payload)
                
        except Exception as e:
            print(f"Log streaming error: {e}")
            break


@app.get("/api/transcribe/status")
async def transcribe_status():
    key = os.getenv("GROQ_API_KEY", "").strip()
    return {"groq_configured": bool(key)}


@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Forward audio to Groq OpenAI-compatible transcription API.
    Expects multipart field name `file` (OpenAI-compatible).
    """
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set; configure .env for server-side transcription.",
        )

    import httpx

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read upload: {e}") from e

    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")

    filename = file.filename or "audio.webm"
    mime = file.content_type or "application/octet-stream"

    files = {"file": (filename, content, mime)}
    data = {"model": GROQ_STT_MODEL}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files=files,
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Transcription request failed: {e}") from e

    if r.status_code != 200:
        detail = r.text[:500] if r.text else r.status_code
        raise HTTPException(status_code=502, detail=f"Groq error: {detail}")

    try:
        body = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Invalid JSON from transcription API")

    text = (body.get("text") or "").strip()
    return {"text": text}


@app.post("/api/clarify")
async def clarify(req: ClarifyRequest):
    from gpt_engineer.core.voice_clarify import clarify_questions

    questions = clarify_questions(req.prompt)
    return {"questions": questions}


@app.post("/api/generate")
async def generate_code(req: GenerateRequest):
    # Use standard thread-safe queue
    internal_queue = queue.Queue()
    full_prompt = _compose_prompt(req.prompt, req.clarification_context)
    safe_project = sanitize_project_name(req.project_name)

    # Start the log distributor task
    asyncio.create_task(stream_logs_to_queues(internal_queue))

    # Run the Heavy AI generation in a separate thread
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, run_crewai_sync, full_prompt, internal_queue, safe_project)

    return {"status": "started", "project": safe_project}

@app.websocket("/ws/agents")
async def websocket_agents(websocket: WebSocket):
    await websocket.accept()
    q = asyncio.Queue()
    log_queues.append(q)
    try:
        while True:
            msg = await q.get()
            await websocket.send_text(msg)
    except WebSocketDisconnect:
        log_queues.remove(q)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
