from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import re
import subprocess
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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


# ===== Helper Functions =====
def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    # Check if it's already a valid video ID (11 characters, alphanumeric + _ -)
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    
    raise ValueError("Invalid YouTube URL or video ID")


def get_video_title_with_ytdlp(video_id: str) -> str:
    """Get video title using yt-dlp"""
    try:
        # Use full path to yt-dlp
        ytdlp_path = '/root/.venv/bin/yt-dlp'
        result = subprocess.run(
            [ytdlp_path, '--get-title', f'https://www.youtube.com/watch?v={video_id}'],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return f"Video {video_id}"
    except Exception as e:
        logger.warning(f"yt-dlp title fetch failed: {e}")
        return f"Video {video_id}"


def get_transcript_with_youtube_transcript_api(video_id: str, language: Optional[str] = None):
    """Get transcript using youtube-transcript-api (primary method)"""
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
    
    try:
        # Create API instance and get list of available transcripts
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        available_languages = []
        
        for transcript in transcript_list:
            available_languages.append({
                'code': transcript.language_code,
                'name': transcript.language,
                'is_generated': transcript.is_generated,
                'is_translatable': hasattr(transcript, 'translation_languages') and len(transcript.translation_languages) > 0
            })
        
        # If language specified, try to get that language
        if language:
            try:
                transcript = transcript_list.find_transcript([language])
            except NoTranscriptFound:
                # Try to translate from another language
                for t in transcript_list:
                    if hasattr(t, 'translation_languages') and language in [lang['language_code'] for lang in t.translation_languages]:
                        transcript = t.translate(language)
                        break
                else:
                    # Fall back to first available
                    transcript = next(iter(transcript_list))
        else:
            # Get first available (prefer manual over auto-generated)
            try:
                transcript = transcript_list.find_manually_created_transcript(['en', 'en-US', 'en-GB'])
            except NoTranscriptFound:
                transcript = next(iter(transcript_list))
        
        transcript_data = transcript.fetch()
        selected_lang = transcript.language_code
        
        # Convert FetchedTranscriptSnippet objects to dictionaries
        transcript_dict_list = []
        for snippet in transcript_data:
            transcript_dict_list.append({
                'text': snippet.text,
                'start': snippet.start,
                'duration': snippet.duration
            })
        
        return {
            'transcript': transcript_dict_list,
            'available_languages': available_languages,
            'selected_language': selected_lang
        }
    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Transcripts are disabled for this video")
    except NoTranscriptFound:
        raise HTTPException(status_code=404, detail="No transcript found for this video")
    except Exception as e:
        logger.error(f"youtube-transcript-api error: {e}")
        raise


def get_transcript_with_ytdlp(video_id: str, language: Optional[str] = None):
    """Get transcript using yt-dlp (fallback method)"""
    try:
        url = f'https://www.youtube.com/watch?v={video_id}'
        ytdlp_path = '/root/.venv/bin/yt-dlp'
        
        # First get available subtitles
        result = subprocess.run(
            [ytdlp_path, '--list-subs', '--skip-download', url],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        available_languages = []
        if result.returncode == 0:
            lines = result.stdout.split('\n')
            for line in lines:
                if line.strip() and not line.startswith('[') and 'Language' not in line:
                    parts = line.split()
                    if len(parts) >= 2:
                        code = parts[0]
                        name = ' '.join(parts[1:])
                        available_languages.append({
                            'code': code,
                            'name': name,
                            'is_generated': 'auto' in name.lower(),
                            'is_translatable': True
                        })
        
        # Download subtitle
        lang_opt = language if language else 'en'
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = os.path.join(tmpdir, 'subtitle')
            
            cmd = [
                ytdlp_path,
                '--write-auto-sub' if not language else '--write-sub',
                '--sub-lang', lang_opt,
                '--sub-format', 'json3',
                '--skip-download',
                '-o', output_path,
                url
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            # Look for subtitle file
            subtitle_file = None
            for f in os.listdir(tmpdir):
                if f.endswith('.json3') or f.endswith('.json'):
                    subtitle_file = os.path.join(tmpdir, f)
                    break
            
            if not subtitle_file:
                raise Exception("No subtitle file generated")
            
            with open(subtitle_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            transcript = []
            if 'events' in data:
                for event in data['events']:
                    if 'segs' in event:
                        text = ''.join([seg.get('utf8', '') for seg in event['segs']])
                        if text.strip():
                            transcript.append({
                                'text': text.strip(),
                                'start': event.get('tStartMs', 0) / 1000,
                                'duration': (event.get('dDurationMs', 0) or 1000) / 1000
                            })
            
            return {
                'transcript': transcript,
                'available_languages': available_languages if available_languages else [{'code': lang_opt, 'name': lang_opt, 'is_generated': True, 'is_translatable': True}],
                'selected_language': lang_opt
            }
    except Exception as e:
        logger.error(f"yt-dlp transcript error: {e}")
        raise


# ===== API Routes =====
@api_router.get("/")
async def root():
    return {"message": "ytranscript API is running"}


@api_router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(request: TranscriptRequest):
    """
    Get transcript for a YouTube video.
    Uses youtube-transcript-api as primary, yt-dlp as fallback.
    """
    try:
        video_id = extract_video_id(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Get video title
    title = get_video_title_with_ytdlp(video_id)
    
    # Try youtube-transcript-api first
    try:
        result = get_transcript_with_youtube_transcript_api(video_id, request.language)
        return TranscriptResponse(
            video_id=video_id,
            title=title,
            transcript=[TranscriptLine(**line) for line in result['transcript']],
            available_languages=result['available_languages'],
            selected_language=result['selected_language'],
            backend='youtube-transcript-api'
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"youtube-transcript-api failed, trying yt-dlp: {e}")
    
    # Fallback to yt-dlp
    try:
        result = get_transcript_with_ytdlp(video_id, request.language)
        return TranscriptResponse(
            video_id=video_id,
            title=title,
            transcript=[TranscriptLine(**line) for line in result['transcript']],
            available_languages=result['available_languages'],
            selected_language=result['selected_language'],
            backend='yt-dlp'
        )
    except Exception as e:
        logger.error(f"Both transcript methods failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch transcript. The video may not have captions available.")


@api_router.get("/languages/{video_id}", response_model=LanguagesResponse)
async def get_available_languages(video_id: str):
    """Get available languages for a video"""
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
    
    title = get_video_title_with_ytdlp(video_id)
    
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        available_languages = []
        
        for transcript in transcript_list:
            available_languages.append({
                'code': transcript.language_code,
                'name': transcript.language,
                'is_generated': transcript.is_generated,
                'is_translatable': hasattr(transcript, 'translation_languages') and len(transcript.translation_languages) > 0
            })
        
        return LanguagesResponse(
            video_id=video_id,
            title=title,
            available_languages=available_languages
        )
    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Transcripts are disabled for this video")
    except NoTranscriptFound:
        raise HTTPException(status_code=404, detail="No transcript found for this video")
    except Exception as e:
        logger.error(f"Error fetching languages: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch available languages")


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
