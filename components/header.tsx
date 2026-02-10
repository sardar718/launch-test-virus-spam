"use client";

import { ExternalLink } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-mono font-bold text-lg">
            4C
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              4claw
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              BSC Token Launchpad
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-6 md:flex">
          <a
            href="https://4claw.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://moltx.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Moltx
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://www.moltbook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Moltbook
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://four.meme"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Four.Meme
            <ExternalLink className="h-3 w-3" />
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-chart-3 animate-pulse-glow" />
            <span className="text-xs font-mono text-secondary-foreground">BSC</span>
          </div>
        </div>
      </div>
    </header>
  );
}
