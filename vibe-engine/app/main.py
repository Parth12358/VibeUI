"""FastAPI service: song -> choreography JSON, cached by audio fingerprint.

POST /choreograph       multipart "file" -> analysis + LLM plan/compile -> choreography JSON
GET  /choreography/{fp} fetch a cached choreography
GET  /health            liveness
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from analyze import fingerprint
from choreograph import choreograph, fallback_choreography

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("engine")

app = FastAPI(title="vibe-engine", version="0.1.0")

CACHE_DIR = Path(os.getenv("CACHE_DIR", "./cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
ALLOW_FALLBACK = os.getenv("ALLOW_FALLBACK", "1") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cache_path(fp: str) -> Path:
    return CACHE_DIR / f"{fp}.json"


@app.get("/health")
def health():
    return {"ok": True, "mode": "llm", "fallback": ALLOW_FALLBACK}


@app.get("/choreography/{fp}")
def get_choreography(fp: str):
    p = _cache_path(fp)
    if not p.exists():
        raise HTTPException(status_code=404, detail="not cached")
    return JSONResponse(content=json.loads(p.read_text()))


@app.post("/choreograph")
async def post_choreograph(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")

    fp = fingerprint(raw)
    cached = _cache_path(fp)
    if cached.exists():
        log.info("cache hit %s", fp[:12])
        return JSONResponse(content=json.loads(cached.read_text()))

    title = os.path.splitext(file.filename or "untitled")[0]

    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "x").suffix or ".wav", delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        try:
            doc = choreograph(tmp_path, raw=raw, title=title)
        except Exception as e:  # noqa: BLE001
            if not ALLOW_FALLBACK:
                raise
            log.warning("LLM path failed (%s); using deterministic fallback", e)
            doc = fallback_choreography(tmp_path, raw=raw, title=title)
        cached.write_text(json.dumps(doc))
        log.info("compiled + cached %s", fp[:12])
        return JSONResponse(content=doc)
    finally:
        os.unlink(tmp_path)
