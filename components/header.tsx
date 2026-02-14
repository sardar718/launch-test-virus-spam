"use client";

import { ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { label: "4claw", url: "https://4claw.fun", desc: "BSC" },
  { label: "Kibu", url: "https://kibu.bot", desc: "BSC/Base" },
  { label: "Clawnch", url: "https://clawn.ch", desc: "Base" },
  { label: "SynthLaunch", url: "https://synthlaunch.fun", desc: "BSC" },
  { label: "Moltx", url: "https://moltx.io", desc: "Agent" },
  { label: "Moltbook", url: "https://www.moltbook.com", desc: "Agent" },
];

export function Header() {
  return (
    <header className="border-b border-border bg-card relative">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-primary/20" />
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-mono font-bold text-sm shadow-sm shadow-primary/20">
            4C
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">
              Token Launchpad
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono">
              6 Launchpads -- 5 Agents -- 3 Chains
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-4 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
              <span className="text-[9px] opacity-50">{link.desc}</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            {[
              { label: "BSC", color: "bg-accent" },
              { label: "Base", color: "bg-[#0052FF]" },
              { label: "SOL", color: "bg-[#9945FF]" },
            ].map((chain) => (
              <div key={chain.label} className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${chain.color} animate-pulse-glow`} />
                <span className="text-[10px] font-mono text-secondary-foreground">{chain.label}</span>
              </div>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
