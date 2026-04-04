from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import shutil
import subprocess
import json
import tempfile
import re
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ===== Models =====
class TranscriptRequest(BaseModel):
    url: str
    language: Optional[str] = None

class TranscriptLine(BaseModel):
    text: str
    start: float
    duration: float

class TranscriptResponse(BaseModel):
    video_id: str
    title: str
    transcript: List[TranscriptLine]
    available_languages: List[dict]
    selected_language: str
    backend: Optional[str] = None

class LanguagesResponse(BaseModel):
    video_id: str
    title: str
    available_languages: List[dict]

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


# ===== Helpers =====
def _ytdlp() -> str:
    return shutil.which('yt-dlp') or 'yt-dlp'

def extract_video_id(url: str) -> str:
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    raise ValueError("Invalid YouTube URL or video ID")


def ytdlp_get_info(video_id: str) -> dict:
    """Get video metadata + subtitle info via yt-dlp --dump-json. Single call, all data."""
    cmd = [
        _ytdlp(),
        '--dump-json',
        '--skip-download',
        '--no-warnings',
        '--extractor-args', 'youtube:player_client=default,web_creator',
        f'https://www.youtube.com/watch?v={video_id}'
    ]
    logger.info(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        logger.error(f"yt-dlp --dump-json failed: {result.stderr}")
        raise Exception(f"yt-dlp metadata failed: {result.stderr[:200]}")
    return json.loads(result.stdout)


def ytdlp_extract_languages(info: dict) -> List[dict]:
    """Extract available subtitle languages from yt-dlp info dict."""
    languages = []
    # Manual subtitles
    for code, tracks in (info.get('subtitles') or {}).items():
        if code == 'live_chat':
            continue
        name = code
        for t in tracks:
            if t.get('name'):
                name = t['name']
                break
        languages.append({
            'code': code,
            'name': name,
            'is_generated': False,
            'is_translatable': True,
        })
    # Auto-generated subtitles
    for code, tracks in (info.get('automatic_captions') or {}).items():
        if code == 'live_chat':
            continue
        # Skip if we already have manual for this language
        if any(l['code'] == code for l in languages):
            continue
        name = code
        for t in tracks:
            if t.get('name'):
                name = t['name']
                break
        languages.append({
            'code': code,
            'name': name,
            'is_generated': True,
            'is_translatable': True,
        })
    return languages


def ytdlp_download_subs(video_id: str, language: str, is_generated: bool) -> List[dict]:
    """Download subtitles as json3 via yt-dlp, parse into segments."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, 'sub')
        cmd = [
            _ytdlp(),
            '--skip-download',
            '--no-warnings',
            '--extractor-args', 'youtube:player_client=default,web_creator',
            '--sub-format', 'json3',
            '-o', output_path,
            f'https://www.youtube.com/watch?v={video_id}'
        ]
        if is_generated:
            cmd += ['--write-auto-sub', '--sub-lang', language]
        else:
            cmd += ['--write-sub', '--sub-lang', language]

        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            logger.error(f"yt-dlp sub download failed: {result.stderr}")

        # Find the subtitle file
        sub_file = None
        for f in os.listdir(tmpdir):
            if f.endswith('.json3') or f.endswith('.json') or f.endswith('.vtt') or f.endswith('.srv3'):
                sub_file = os.path.join(tmpdir, f)
                break

        if not sub_file:
            raise Exception("No subtitle file generated")

        # Parse based on format
        with open(sub_file, 'r', encoding='utf-8') as fh:
            content = fh.read()

        if sub_file.endswith('.json3') or sub_file.endswith('.json'):
            return parse_json3(json.loads(content))
        elif sub_file.endswith('.vtt'):
            return parse_vtt(content)
        else:
            return parse_json3(json.loads(content))


def parse_json3(data: dict) -> List[dict]:
    """Parse json3 subtitle format into transcript segments."""
    segments = []
    for event in data.get('events', []):
        if 'segs' not in event:
            continue
        text = ''.join(seg.get('utf8', '') for seg in event['segs']).strip()
        if not text or text == '\n':
            continue
        segments.append({
            'text': text,
            'start': (event.get('tStartMs', 0)) / 1000,
            'duration': (event.get('dDurationMs', 0) or 1000) / 1000,
        })
    return segments


def parse_vtt(content: str) -> List[dict]:
    """Parse VTT subtitle format into transcript segments."""
    segments = []
    blocks = content.strip().split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        for i, line in enumerate(lines):
            if '-->' in line:
                times = line.split('-->')
                start = vtt_time_to_seconds(times[0].strip())
                end = vtt_time_to_seconds(times[1].strip().split(' ')[0])
                text = ' '.join(lines[i+1:]).strip()
                # Remove VTT formatting tags
                text = re.sub(r'<[^>]+>', '', text)
                if text:
                    segments.append({
                        'text': text,
                        'start': start,
                        'duration': end - start if end > start else 1.0,
                    })
                break
    return segments


def vtt_time_to_seconds(time_str: str) -> float:
    parts = time_str.replace(',', '.').split(':')
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    return 0.0


# ===== API Routes =====
@api_router.get("/")
async def root():
    return {"message": "ytranscript API is running", "backend": "yt-dlp"}


@api_router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(request: TranscriptRequest):
    try:
        video_id = extract_video_id(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Step 1: Get video info (title + available subs)
    try:
        info = ytdlp_get_info(video_id)
    except Exception as e:
        logger.error(f"yt-dlp info failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch video info: {str(e)[:200]}")

    title = info.get('title', f'Video {video_id}')
    languages = ytdlp_extract_languages(info)

    if not languages:
        raise HTTPException(status_code=404, detail="No captions available for this video")

    # Step 2: Select language
    selected = None
    is_generated = False
    if request.language:
        selected = next((l for l in languages if l['code'] == request.language), None)
        if not selected:
            selected = next((l for l in languages if l['code'].startswith(request.language)), None)
    if not selected:
        # Prefer manual English > any manual > first auto-generated
        selected = next((l for l in languages if l['code'].startswith('en') and not l['is_generated']), None)
        if not selected:
            selected = next((l for l in languages if not l['is_generated']), None)
        if not selected:
            selected = languages[0]

    is_generated = selected['is_generated']

    # Step 3: Download subtitle
    try:
        transcript = ytdlp_download_subs(video_id, selected['code'], is_generated)
    except Exception as e:
        logger.error(f"yt-dlp sub download failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch transcript: {str(e)[:200]}")

    if not transcript:
        raise HTTPException(status_code=502, detail="Transcript was empty")

    return TranscriptResponse(
        video_id=video_id,
        title=title,
        transcript=[TranscriptLine(**line) for line in transcript],
        available_languages=languages,
        selected_language=selected['code'],
        backend='yt-dlp',
    )


@api_router.get("/languages/{video_id}", response_model=LanguagesResponse)
async def get_available_languages(video_id: str):
    if not re.match(r'^[a-zA-Z0-9_-]{11}$', video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID")

    try:
        info = ytdlp_get_info(video_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch video info: {str(e)[:200]}")

    title = info.get('title', f'Video {video_id}')
    languages = ytdlp_extract_languages(info)

    return LanguagesResponse(
        video_id=video_id,
        title=title,
        available_languages=languages,
    )


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    return []


# Include router + middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
