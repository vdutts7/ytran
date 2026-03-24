# ytranscript - YouTube Transcript Extractor PWA

## Original Problem Statement
Build ytranscript PWA - a YouTube transcript extractor with:
- Bulletproof URL normalization (all YouTube URL formats)
- Video thumbnail display with oEmbed metadata
- Optimistic loading UX with auto-submit on paste
- Dual backend with fallback (youtube-transcript-api + yt-dlp)
- All export formats (TXT/SRT/VTT/JSON/Markdown)
- Transcript controls (language selector, timestamps toggle, clean mode, search/filter)
- PWA + mobile UX (Web Share Target, drag/drop, global paste)
- UI design - Arc/Linear aesthetic with dark theme, frosted glass, atmospheric gradients

## Architecture
- **Frontend**: React 18 + TailwindCSS + shadcn/ui
- **Backend**: FastAPI + Python
- **Transcript Sources**: youtube-transcript-api (primary), yt-dlp (fallback)
- **Database**: MongoDB (status checks)
- **Styling**: Dark theme, glassmorphism, atmospheric gradients
- **Fonts**: Instrument Serif (headings), Geist Mono (body)

## User Personas
1. **Content Creators** - Need transcripts for subtitles/captions
2. **Researchers** - Extract quotes and references
3. **Students** - Study from educational content
4. **Journalists** - Transcribe interviews

## Core Requirements (Static)
- [x] Bulletproof YouTube URL parsing (all formats)
- [x] Video thumbnail preview (ytimg.com, no API)
- [x] oEmbed metadata (title, channel)
- [x] Dual-source transcript fetching with fallback
- [x] Backend indicator showing which source served
- [x] Language selector from available tracks
- [x] Timestamp display toggle
- [x] Clean mode (strips [Music], [Applause], etc.)
- [x] Search/filter with highlighting
- [x] Click timestamp to open video at that time
- [x] Export: Copy, TXT, SRT, VTT, JSON, Markdown
- [x] Dark theme with atmospheric gradients
- [x] Glassmorphism UI
- [x] Global paste detection
- [x] Drag and drop URLs
- [x] PWA manifest with Web Share Target

## What's Been Implemented (v2.0 - March 24, 2026)
- Complete Arc/Linear-inspired dark UI overhaul
- URL normalization utility handling 10+ YouTube URL formats
- Video card with thumbnail and metadata preview
- All 5 export formats (TXT, SRT, VTT, JSON, MD)
- Clean mode to strip annotations
- Search within transcript with match highlighting
- Clickable timestamps opening video at position
- PWA manifest with Web Share Target
- Drag and drop support
- Backend indicator (youtube-transcript-api vs yt-dlp)

## Prioritized Backlog
### P0 (Critical) - DONE
- [x] URL normalization
- [x] Dark theme redesign
- [x] All export formats
- [x] Clean mode

### P1 (High)
- [ ] Keyboard shortcuts (Cmd+C to copy, Cmd+S to save)
- [ ] Recent URLs history (localStorage)
- [ ] Batch URL processing

### P2 (Medium)
- [ ] AI summarization
- [ ] Share via link (encode transcript in URL)
- [ ] Browser extension

## Next Tasks
1. Add keyboard shortcuts for power users
2. Implement recent URLs history
3. Consider AI summarization feature
