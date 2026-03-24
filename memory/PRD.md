# ytranscript - YouTube Transcript Extractor

## Original Problem Statement
Build a yt-dlp powered, pytube (youtube-transcript-api) powered YouTube transcript creator given a link. Simple web app with:
- Both yt-dlp and youtube-transcript-api with fallback
- Download transcript as TXT/SRT
- Timestamp toggle
- Multiple language support
- System adaptive theme
- Modern minimal, sleek, Apple-like UI with frosted glass effects

## Architecture
- **Frontend**: React 18 + TailwindCSS + shadcn/ui
- **Backend**: FastAPI + Python
- **Transcript Sources**: youtube-transcript-api (primary), yt-dlp (fallback)
- **Database**: MongoDB (for status checks)

## User Personas
1. **Content Creators** - Need transcripts for subtitles/captions
2. **Researchers** - Extract quotes and references from videos
3. **Students** - Study from educational video content
4. **Journalists** - Transcribe interviews and source material

## Core Requirements (Static)
- [x] YouTube URL input with validation
- [x] Transcript fetching with dual-source fallback
- [x] Timestamp display toggle
- [x] Multiple language support
- [x] Download as TXT file
- [x] Download as SRT file
- [x] Copy to clipboard
- [x] Error handling for unavailable transcripts
- [x] System theme detection (light/dark)
- [x] Glassmorphism UI design

## What's Been Implemented (v1.0 - March 24, 2026)
- Complete frontend with Apple/Linear-inspired design
- Glassmorphism effects throughout
- URL input with embedded action button
- Transcript viewer with scrollable area
- Language selector dropdown
- Timestamp toggle switch
- Copy, TXT download, SRT download buttons
- Loading skeleton states
- Error display component
- Footer with social links
- Backend API with youtube-transcript-api and yt-dlp fallback
- Video title fetching
- Multi-language transcript support

## Prioritized Backlog
### P0 (Critical) - DONE
- [x] Core transcript fetching
- [x] UI implementation
- [x] Download functionality

### P1 (High)
- [ ] Video thumbnail preview
- [ ] Search within transcript
- [ ] Jump to timestamp in video

### P2 (Medium)
- [ ] Batch URL processing
- [ ] Transcript history (localStorage)
- [ ] Share transcript via link

### P3 (Low)
- [ ] AI-powered transcript summarization
- [ ] Keyword extraction
- [ ] Export to Google Docs

## Next Tasks
1. Add video thumbnail preview in transcript viewer
2. Implement search/filter within transcript
3. Add transcript history using localStorage
