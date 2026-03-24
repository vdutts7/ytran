import { useState, useMemo, useCallback } from 'react';
import { 
  Download, FileText, Copy, Check, Clock, Search, X,
  FileJson, FileCode, Hash, Sparkles, ExternalLink
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { toast } from 'sonner';
import {
  formatTimestamp,
  generateTxtContent,
  generateSrtContent,
  generateVttContent,
  generateJsonContent,
  generateMarkdownContent,
  downloadFile,
  sanitizeFilename,
  copyToClipboard,
  cleanTranscriptText,
} from '../lib/api';
import { buildTimestampUrl } from '../lib/youtube';

export const TranscriptViewer = ({
  transcript,
  title,
  videoId,
  availableLanguages,
  selectedLanguage,
  onLanguageChange,
  isLoadingLanguage,
  backend,
  author,
}) => {
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [cleanMode, setCleanMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const sanitizedTitle = useMemo(() => {
    return sanitizeFilename(title || 'transcript');
  }, [title]);

  // Filter and highlight transcript based on search
  const { filteredTranscript, matchCount } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredTranscript: transcript, matchCount: 0 };
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = transcript.filter((line) => 
      line.text.toLowerCase().includes(query)
    );
    
    return { filteredTranscript: filtered, matchCount: filtered.length };
  }, [transcript, searchQuery]);

  // Process transcript text (clean mode)
  const processText = useCallback((text) => {
    return cleanMode ? cleanTranscriptText(text) : text;
  }, [cleanMode]);

  // Highlight search matches
  const highlightText = useCallback((text) => {
    if (!searchQuery.trim()) return text;
    
    const query = searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <span className="highlight-match">{text.slice(index, index + query.length)}</span>
        {text.slice(index + query.length)}
      </>
    );
  }, [searchQuery]);

  const handleCopyAll = async () => {
    const content = generateTxtContent(transcript, { showTimestamps, cleanMode });
    const success = await copyToClipboard(content);
    
    if (success) {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = (format) => {
    const metadata = { videoId, title, author, language: selectedLanguage };
    
    switch (format) {
      case 'txt':
        downloadFile(
          generateTxtContent(transcript, { showTimestamps, cleanMode }),
          `${sanitizedTitle}.txt`,
          'text/plain'
        );
        break;
      case 'srt':
        downloadFile(
          generateSrtContent(transcript, cleanMode),
          `${sanitizedTitle}.srt`,
          'text/srt'
        );
        break;
      case 'vtt':
        downloadFile(
          generateVttContent(transcript, cleanMode),
          `${sanitizedTitle}.vtt`,
          'text/vtt'
        );
        break;
      case 'json':
        downloadFile(
          generateJsonContent(transcript, metadata),
          `${sanitizedTitle}.json`,
          'application/json'
        );
        break;
      case 'md':
        downloadFile(
          generateMarkdownContent(transcript, metadata, cleanMode),
          `${sanitizedTitle}.md`,
          'text/markdown'
        );
        break;
    }
    
    toast.success(`Downloaded ${format.toUpperCase()} file`);
  };

  const handleTimestampClick = (seconds) => {
    const url = buildTimestampUrl(videoId, seconds);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const currentLanguageLabel = useMemo(() => {
    const lang = availableLanguages.find((l) => l.code === selectedLanguage);
    return lang ? lang.name : selectedLanguage;
  }, [availableLanguages, selectedLanguage]);

  return (
    <div
      data-testid="transcript-viewer"
      className="glass rounded-2xl overflow-hidden flex flex-col h-[500px] sm:h-[600px] max-h-[75vh] animate-slide-up stagger-3"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-sans font-medium text-foreground line-clamp-1 text-sm sm:text-base">
              {title}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{transcript.length} segments</span>
              {backend && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="text-primary/70">{backend}</span>
                </>
              )}
            </div>
          </div>
          
          {/* Language selector */}
          <Select
            value={selectedLanguage}
            onValueChange={onLanguageChange}
            disabled={isLoadingLanguage}
          >
            <SelectTrigger
              data-testid="language-selector"
              className="w-[120px] sm:w-[140px] h-8 text-xs glass rounded-lg border-white/10"
            >
              <SelectValue>
                {isLoadingLanguage ? 'Loading...' : currentLanguageLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-strong rounded-xl border-white/10">
              {availableLanguages.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  className="text-xs"
                >
                  {lang.name}
                  {lang.is_generated && (
                    <span className="ml-1 text-muted-foreground">(auto)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              data-testid="transcript-search"
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-8 text-xs glass rounded-lg border-white/10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          
          {searchQuery && matchCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          
          {/* Toggles */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <Switch
                    data-testid="timestamp-toggle"
                    checked={showTimestamps}
                    onCheckedChange={setShowTimestamps}
                    className="scale-90"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Timestamps</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <Switch
                    data-testid="clean-mode-toggle"
                    checked={cleanMode}
                    onCheckedChange={setCleanMode}
                    className="scale-90"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Clean mode (remove [Music], etc.)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.01]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="copy-button"
                variant="ghost"
                size="sm"
                onClick={handleCopyAll}
                className="h-7 px-2.5 text-xs rounded-lg hover:bg-white/5"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                Copy
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy full transcript</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Download dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              data-testid="download-button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs rounded-lg hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="glass-strong rounded-xl border-white/10 min-w-[140px]">
            <DropdownMenuItem onClick={() => handleDownload('txt')} className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-2" />
              Plain Text (.txt)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('srt')} className="text-xs">
              <Hash className="h-3.5 w-3.5 mr-2" />
              Subtitles (.srt)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('vtt')} className="text-xs">
              <FileCode className="h-3.5 w-3.5 mr-2" />
              WebVTT (.vtt)
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem onClick={() => handleDownload('json')} className="text-xs">
              <FileJson className="h-3.5 w-3.5 mr-2" />
              JSON (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('md')} className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-2" />
              Markdown (.md)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Transcript content */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="p-4 space-y-0.5">
          {filteredTranscript.map((line, index) => {
            const processedText = processText(line.text);
            if (!processedText) return null;
            
            return (
              <div
                key={index}
                data-testid={`transcript-line-${index}`}
                className="flex gap-3 py-2 px-2.5 rounded-lg hover:bg-white/[0.03] group transition-colors duration-150"
              >
                {showTimestamps && (
                  <button
                    onClick={() => handleTimestampClick(line.start)}
                    className="flex-shrink-0 text-xs font-mono text-primary/70 hover:text-primary w-14 pt-0.5 text-left transition-colors group-hover:underline"
                    title="Open video at this time"
                  >
                    {formatTimestamp(line.start)}
                  </button>
                )}
                <p className="text-sm leading-relaxed text-foreground/85 font-sans">
                  {highlightText(processedText)}
                </p>
              </div>
            );
          })}
          
          {filteredTranscript.length === 0 && searchQuery && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No matches found for "{searchQuery}"
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranscriptViewer;
