import { useState, useMemo } from 'react';
import { Download, FileText, Copy, Check, Clock, ChevronDown } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
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
  downloadFile,
} from '../lib/api';

export const TranscriptViewer = ({
  transcript,
  title,
  videoId,
  availableLanguages,
  selectedLanguage,
  onLanguageChange,
  isLoadingLanguage,
}) => {
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [copied, setCopied] = useState(false);

  const sanitizedTitle = useMemo(() => {
    return title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50);
  }, [title]);

  const handleCopyAll = async () => {
    const content = generateTxtContent(transcript, showTimestamps);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const handleDownloadTxt = () => {
    const content = generateTxtContent(transcript, showTimestamps);
    downloadFile(content, `${sanitizedTitle}_transcript.txt`, 'text/plain');
    toast.success('Downloaded TXT file');
  };

  const handleDownloadSrt = () => {
    const content = generateSrtContent(transcript);
    downloadFile(content, `${sanitizedTitle}_transcript.srt`, 'text/srt');
    toast.success('Downloaded SRT file');
  };

  const currentLanguageLabel = useMemo(() => {
    const lang = availableLanguages.find((l) => l.code === selectedLanguage);
    return lang ? lang.name : selectedLanguage;
  }, [availableLanguages, selectedLanguage]);

  return (
    <div
      data-testid="transcript-viewer"
      className="glass-surface rounded-3xl overflow-hidden flex flex-col h-[600px] max-h-[80vh] animate-slide-up stagger-3"
    >
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 border-b border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-foreground line-clamp-1 text-sm sm:text-base">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {transcript.length} segments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Language Selector */}
          <Select
            value={selectedLanguage}
            onValueChange={onLanguageChange}
            disabled={isLoadingLanguage}
          >
            <SelectTrigger
              data-testid="language-selector"
              className="w-[140px] h-9 text-xs glass-input rounded-xl"
            >
              <SelectValue placeholder="Language">
                {isLoadingLanguage ? 'Loading...' : currentLanguageLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="glass-dropdown rounded-xl">
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

          {/* Timestamp Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Switch
                    data-testid="timestamp-toggle"
                    checked={showTimestamps}
                    onCheckedChange={setShowTimestamps}
                    aria-label="Toggle timestamps"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showTimestamps ? 'Hide' : 'Show'} timestamps</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-black/5 dark:border-white/10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="copy-button"
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                className="h-8 px-3 text-xs rounded-lg btn-lift"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                Copy
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy full transcript</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="download-txt-button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTxt}
                className="h-8 px-3 text-xs rounded-lg btn-lift"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                TXT
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download as TXT</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="download-srt-button"
                variant="outline"
                size="sm"
                onClick={handleDownloadSrt}
                className="h-8 px-3 text-xs rounded-lg btn-lift"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                SRT
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download as SRT</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Transcript Content */}
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="p-4 sm:p-5 space-y-0.5">
          {transcript.map((line, index) => (
            <div
              key={index}
              data-testid={`transcript-line-${index}`}
              className="transcript-line flex gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.03] group cursor-default"
            >
              {showTimestamps && (
                <span className="timestamp-badge flex-shrink-0 text-xs font-mono text-muted-foreground w-14 pt-0.5">
                  {formatTimestamp(line.start)}
                </span>
              )}
              <p className="text-sm leading-relaxed text-foreground/90">
                {line.text}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranscriptViewer;
