"""Minimal OpenAI-compatible client for DeepSeek (https://api.deepseek.com)."""
from __future__ import annotations

import os
import json
from typing import Any

import requests

BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
PLAN_MODEL = os.getenv("DEEPSEEK_PLAN_MODEL", "deepseek-reasoner")
COMPILE_MODEL = os.getenv("DEEPSEEK_COMPILE_MODEL", "deepseek-chat")


def _post(messages: list[dict], model: str, json_mode: bool = False, temperature: float = 0.7) -> str:
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    url = f"{BASE_URL}/chat/completions"
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"DeepSeek API {resp.status_code}: {resp.text[:400]}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def plan(messages: list[dict]) -> str:
    """Reasoning pass: mood/genre/structure -> plain-language staging plan."""
    return _post(messages, PLAN_MODEL, json_mode=False, temperature=0.9)


def compile_json(messages: list[dict]) -> str:
    """Compilation pass: plan -> schema-valid JSON (returned as a JSON string)."""
    return _post(messages, COMPILE_MODEL, json_mode=True, temperature=0.4)


def parse_json(raw: str) -> dict:
    # DeepSeek may wrap JSON in markdown fences; be tolerant.
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    return json.loads(raw)
