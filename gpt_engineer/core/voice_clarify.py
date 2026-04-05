"""
Optional LLM step: produce 0–3 short clarifying questions before code generation.
Uses the same Groq / LiteLLM env wiring as CrewAI.
"""
from __future__ import annotations

import json
import os
import re
from typing import List

try:
    import litellm
except ImportError:  # pragma: no cover
    litellm = None


def _configure_env() -> tuple[str, str, str]:
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
    base = os.getenv("GROQ_API_BASE", "https://api.groq.com/openai/v1")
    model = (
        os.getenv("GROQ_MODEL")
        or os.getenv("OPENAI_MODEL_NAME")
        or "openai/llama-3.1-8b-instant"
    ).strip()
    if model in {"llama3-8b-8192", "openai/llama3-8b-8192"}:
        model = "openai/llama-3.1-8b-instant"
    return api_key or "", base, model


def _parse_questions_json(raw: str) -> List[str]:
    raw = raw.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)```$", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    qs = data.get("questions")
    if not isinstance(qs, list):
        return []
    out = []
    for q in qs[:4]:
        if isinstance(q, str) and q.strip():
            out.append(q.strip())
    return out[:3]


def clarify_questions(user_prompt: str) -> List[str]:
    """
    Returns up to 3 short questions. Empty list if the model thinks the brief is enough,
    or if LLM is unavailable.
    """
    if not litellm or not (user_prompt or "").strip():
        return []

    api_key, base, model = _configure_env()
    if not api_key:
        return []

    os.environ["OPENAI_API_BASE"] = base
    os.environ["OPENAI_API_KEY"] = api_key

    system = (
        'You scope software projects. Reply with ONLY valid JSON (no markdown fences, no prose). '
        'Schema: {"questions":["..."]} — 0 to 3 short, specific questions. '
        "Ask only when ambiguity would change architecture or behavior. "
        'If the brief is actionable, return {"questions":[]}.'
    )
    user = f"Project brief:\n{user_prompt.strip()}"

    try:
        resp = litellm.completion(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        content = resp.choices[0].message.content or ""
        return _parse_questions_json(content)
    except Exception:
        return []
