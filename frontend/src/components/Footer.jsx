import { Github } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-black/5 dark:border-white/10 py-8 mt-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              data-testid="github-link"
              className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors duration-200 active:scale-95"
              onClick={() => window.open('https://github.com/vdutts7', '_blank')}
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </button>
            <button
              data-testid="twitter-link"
              className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors duration-200 active:scale-95"
              onClick={() => window.open('https://x.com/vdutts7', '_blank')}
              aria-label="X (Twitter)"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Built with yt-dlp & youtube-transcript-api
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
