import sys
import os
import io
import queue
import traceback

DEFAULT_GROQ_API_BASE = "https://api.groq.com/openai/v1"
DEFAULT_GROQ_MODEL = "openai/llama-3.1-8b-instant"
DEPRECATED_MODELS = {"llama3-8b-8192", "openai/llama3-8b-8192"}

from crewai import Agent, Task, Crew, Process
from gpt_engineer.core.files_dict import FilesDict
from gpt_engineer.core.chat_to_files import chat_to_files_dict
import re

ANSI_RE = re.compile(r'\x1b\[[0-9;]*[mGKHF]')

def strip_ansi(s: str) -> str:
    return ANSI_RE.sub('', s)


def configure_groq_environment() -> str:
    """
    Configure the OpenAI-compatible environment variables for Groq usage.
    Returns the selected model name.
    """
    groq_api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not groq_api_key:
        raise RuntimeError(
            "Missing API key. Set GROQ_API_KEY (preferred) "
            "or OPENAI_API_KEY (legacy), and optionally GROQ_MODEL before running CrewAI."
        )

    # CrewAI/litellm uses OpenAI-compatible env vars. Point them at Groq.
    os.environ["OPENAI_API_BASE"] = os.getenv("GROQ_API_BASE", DEFAULT_GROQ_API_BASE)
    os.environ["OPENAI_API_KEY"] = groq_api_key

    model_name = (
        os.getenv("GROQ_MODEL")
        or os.getenv("OPENAI_MODEL_NAME")
        or DEFAULT_GROQ_MODEL
    ).strip()
    if model_name in DEPRECATED_MODELS:
        model_name = DEFAULT_GROQ_MODEL
    if not model_name:
        raise RuntimeError(
            "GROQ_MODEL is empty. Set GROQ_MODEL to a supported Groq model "
            f"or unset it to use default {DEFAULT_GROQ_MODEL}."
        )
    return model_name


class QueueStdout(io.StringIO):
    """Captures stdout lines and pushes them into a thread-safe queue."""

    def __init__(self, log_queue: queue.Queue = None):
        super().__init__()
        self.queue = log_queue
        self._buf = ""

    def write(self, s):
        self._buf += s
        while '\n' in self._buf:
            line, self._buf = self._buf.split('\n', 1)
            clean = strip_ansi(line).strip()
            if clean and self.queue:
                try:
                    self.queue.put(clean)
                except Exception:
                    pass
        sys.__stdout__.write(s)

    def flush(self):
        sys.__stdout__.flush()


class CrewAIOrchestrator:
    def __init__(self, model_name: str = None, log_queue: queue.Queue = None):
        self.log_queue = log_queue
        self.model_name = model_name or configure_groq_environment()

    # ── internal helpers ──────────────────────────────────────────────────────

    def _log(self, msg: str):
        if self.log_queue:
            self.log_queue.put(strip_ansi(msg))

    def _make_agent(self, role, goal, backstory):
        return Agent(
            role=role,
            goal=goal,
            backstory=backstory,
            allow_delegation=False,
            llm=self.model_name,
            verbose=True,
        )

    def _safe_kickoff(self, crew: Crew):
        old_stdout = sys.stdout
        sys.stdout = QueueStdout(self.log_queue)
        try:
            return crew.kickoff()
        except Exception as e:
            msg = f"Error during CrewAI execution: {e}\n{traceback.format_exc()}"
            self._log(msg)
            return f"```text\n{msg}\n```"
        finally:
            sys.stdout = old_stdout

    # ── public API ────────────────────────────────────────────────────────────

    def run(self, prompt: str) -> FilesDict:
        # ── Build agents ──────────────────────────────────────────────────────
        architect = self._make_agent(
            role='Software Architect',
            goal='Design the high-level architecture and file structure for the project.',
            backstory='A battle-tested systems designer who plans before writing a single line of code.',
        )
        developer = self._make_agent(
            role='Senior Developer',
            goal='Write clean, working code for every file based on the architectural plan.',
            backstory='A prolific full-stack engineer famous for readable, well-structured code.',
        )
        qa = self._make_agent(
            role='QA Engineer',
            goal='Review the generated code, fix all bugs, and produce the final deliverable files.',
            backstory='A meticulous tester who never ships code with known defects.',
        )

        # ── Build tasks ───────────────────────────────────────────────────────
        design_task = Task(
            description=(
                f'Project brief: "{prompt}"\n\n'
                'Produce a concise architectural plan listing every file needed and its purpose. '
                'Include technology choices and folder layout.'
            ),
            agent=architect,
            expected_output='A numbered list of files with a one-line description each.',
        )
        dev_task = Task(
            description=(
                f'Project brief: "{prompt}"\n\n'
                "Using the Architect's plan, implement EVERY file in full.\n"
                "Hard rules:\n"
                "- Your entire reply must be ONLY file blocks. No title, no 'Final Answer', no numbered lists except inside code.\n"
                "- For EACH file repeat this exact pattern:\n"
                "File: relative/path.ext\n"
                "```lang\n"
                "<complete file contents>\n"
                "```\n"
                "- Paths: relative only (e.g. src/main.py). Include dependency files (requirements.txt, package.json) when needed.\n"
                "- Code must be syntactically valid and internally consistent across files."
            ),
            agent=developer,
            context=[design_task],
            expected_output='Only File: lines and fenced code blocks, one block per file.',
        )
        qa_task = Task(
            description=(
                "You receive the Developer's output. Output ONLY the final deliverable.\n"
                "Rules:\n"
                "- Same format as Developer: only `File:` + fenced blocks. No preamble or summary.\n"
                "- Fix bugs, missing imports, and broken paths; preserve working code.\n"
                "Per file:\n"
                "File: path/to/file.ext\n"
                "```lang\n"
                "<code>\n"
                "```"
            ),
            agent=qa,
            context=[dev_task],
            expected_output='Only File: blocks and code fences; complete and runnable.',
        )

        crew = Crew(
            agents=[architect, developer, qa],
            tasks=[design_task, dev_task, qa_task],
            process=Process.sequential,
            verbose=True,
        )

        self._log("[SYSTEM] 🚀 Starting multi-agent collaboration…")
        output_str = str(self._safe_kickoff(crew))
        self._log("[SYSTEM] ✅ Model run finished; parsing files and writing to disk…")

        return chat_to_files_dict(output_str)
