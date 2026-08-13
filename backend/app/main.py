from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

DATA_DIR = Path(os.getenv("ACESSOMAP_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
VIDEO_DIR = DATA_DIR / "videos"
DB_PATH = DATA_DIR / "acessomap.db"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

CATEGORIES = {
    "missing_ramp": "Ausência de rampa",
    "bad_slope": "Inclinação inadequada",
    "blocked_sidewalk": "Calçada obstruída",
    "uneven_surface": "Pavimento irregular",
    "unsafe_crossing": "Travessia insegura",
    "missing_tactile": "Ausência de sinalização tátil",
    "blocked_access": "Acesso bloqueado",
}

app = FastAPI(title="AcessoMap Video API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                location_precision_m INTEGER NOT NULL DEFAULT 50,
                video_filename TEXT NOT NULL,
                video_mime TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                privacy_reviewed INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'published'
            );

            CREATE TABLE IF NOT EXISTS validations (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL,
                voter_token TEXT NOT NULL,
                vote TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(report_id, voter_token),
                FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
            );
            """
        )


init_db()


def serialize_report(row: sqlite3.Row, confirms: int = 0, disputes: int = 0) -> dict:
    total = confirms + disputes
    confidence = confirms / total if total else None
    return {
        "id": row["id"],
        "category": row["category"],
        "category_label": CATEGORIES.get(row["category"], row["category"]),
        "description": row["description"],
        "start_ms": row["start_ms"],
        "end_ms": row["end_ms"],
        "lat": row["lat"],
        "lon": row["lon"],
        "location_precision_m": row["location_precision_m"],
        "duration_ms": row["duration_ms"],
        "privacy_reviewed": bool(row["privacy_reviewed"]),
        "created_at": row["created_at"],
        "status": row["status"],
        "video_url": f"/api/reports/{row['id']}/video",
        "validations": {
            "confirms": confirms,
            "disputes": disputes,
            "confidence": confidence,
        },
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/categories")
def categories() -> dict:
    return {"items": [{"id": k, "label": v} for k, v in CATEGORIES.items()]}


@app.post("/api/reports", status_code=201)
async def create_report(
    category: str = Form(...),
    description: str = Form(""),
    start_ms: int = Form(...),
    end_ms: int = Form(...),
    lat: float = Form(...),
    lon: float = Form(...),
    location_precision_m: int = Form(50),
    duration_ms: int = Form(0),
    privacy_reviewed: bool = Form(True),
    video: UploadFile = File(...),
) -> dict:
    if category not in CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    if end_ms < start_ms:
        raise HTTPException(400, "Intervalo temporal inválido")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "Coordenadas inválidas")
    if not privacy_reviewed:
        raise HTTPException(400, "A revisão de privacidade é obrigatória")
    if video.content_type not in {"video/webm", "video/mp4", "video/quicktime", "application/octet-stream"}:
        raise HTTPException(415, f"Formato de vídeo não suportado: {video.content_type}")

    report_id = str(uuid.uuid4())
    ext = ".webm" if video.content_type == "video/webm" else ".mp4"
    filename = f"{report_id}{ext}"
    target = VIDEO_DIR / filename

    max_bytes = 25 * 1024 * 1024
    written = 0
    with target.open("wb") as output:
        while chunk := await video.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                target.unlink(missing_ok=True)
                raise HTTPException(413, "Vídeo excede o limite de 25 MB")
            output.write(chunk)

    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO reports (
              id, category, description, start_ms, end_ms, lat, lon,
              location_precision_m, video_filename, video_mime, duration_ms,
              privacy_reviewed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                category,
                description.strip(),
                start_ms,
                end_ms,
                lat,
                lon,
                location_precision_m,
                filename,
                video.content_type or "video/webm",
                duration_ms,
                int(privacy_reviewed),
                now,
            ),
        )
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return serialize_report(row)


@app.get("/api/reports")
def list_reports(
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
) -> dict:
    clauses = ["r.status = 'published'"]
    params: list[float] = []
    if min_lat is not None:
        clauses.append("r.lat >= ?")
        params.append(min_lat)
    if max_lat is not None:
        clauses.append("r.lat <= ?")
        params.append(max_lat)
    if min_lon is not None:
        clauses.append("r.lon >= ?")
        params.append(min_lon)
    if max_lon is not None:
        clauses.append("r.lon <= ?")
        params.append(max_lon)

    query = f"""
        SELECT r.*,
               SUM(CASE WHEN v.vote = 'confirm' THEN 1 ELSE 0 END) AS confirms,
               SUM(CASE WHEN v.vote = 'dispute' THEN 1 ELSE 0 END) AS disputes
        FROM reports r
        LEFT JOIN validations v ON v.report_id = r.id
        WHERE {' AND '.join(clauses)}
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT 500
    """
    with db() as conn:
        rows = conn.execute(query, params).fetchall()
    return {
        "items": [serialize_report(r, int(r["confirms"] or 0), int(r["disputes"] or 0)) for r in rows]
    }


@app.get("/api/reports/{report_id}/video")
def report_video(report_id: str):
    with db() as conn:
        row = conn.execute("SELECT video_filename, video_mime FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Ocorrência não encontrada")
    path = VIDEO_DIR / row["video_filename"]
    if not path.exists():
        raise HTTPException(404, "Vídeo não encontrado")
    return FileResponse(path, media_type=row["video_mime"], filename=row["video_filename"])


class ValidationIn(BaseModel):
    vote: Literal["confirm", "dispute"]
    voter_token: str


@app.post("/api/reports/{report_id}/validate")
def validate_report(report_id: str, body: ValidationIn) -> dict:
    if len(body.voter_token) < 8:
        raise HTTPException(400, "Token do dispositivo inválido")
    with db() as conn:
        exists = conn.execute("SELECT 1 FROM reports WHERE id = ?", (report_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Ocorrência não encontrada")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO validations (id, report_id, voter_token, vote, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(report_id, voter_token)
            DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at
            """,
            (str(uuid.uuid4()), report_id, body.voter_token, body.vote, now),
        )
        counts = conn.execute(
            """
            SELECT
              SUM(CASE WHEN vote='confirm' THEN 1 ELSE 0 END) AS confirms,
              SUM(CASE WHEN vote='dispute' THEN 1 ELSE 0 END) AS disputes
            FROM validations WHERE report_id = ?
            """,
            (report_id,),
        ).fetchone()
    confirms = int(counts["confirms"] or 0)
    disputes = int(counts["disputes"] or 0)
    return {
        "report_id": report_id,
        "confirms": confirms,
        "disputes": disputes,
        "confidence": confirms / (confirms + disputes) if confirms + disputes else None,
    }


@app.get("/api/exports/geojson")
def export_geojson():
    data = list_reports()["items"]
    features = []
    for item in data:
        properties = {k: v for k, v in item.items() if k not in {"lat", "lon", "video_url"}}
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [item["lon"], item["lat"]]},
                "properties": properties,
            }
        )
    return JSONResponse({"type": "FeatureCollection", "features": features})


@app.get("/api/exports/csv")
def export_csv():
    data = list_reports()["items"]
    output = io.StringIO()
    fields = [
        "id", "category", "category_label", "description", "start_ms", "end_ms",
        "lat", "lon", "location_precision_m", "duration_ms", "created_at",
        "confirms", "disputes", "confidence",
    ]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for item in data:
        writer.writerow(
            {
                **{k: item.get(k) for k in fields if k not in {"confirms", "disputes", "confidence"}},
                "confirms": item["validations"]["confirms"],
                "disputes": item["validations"]["disputes"],
                "confidence": item["validations"]["confidence"],
            }
        )
    raw = output.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([raw]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="acessomap-video.csv"'},
    )
