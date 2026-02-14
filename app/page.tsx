"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/header";
import { StatsBar } from "@/components/stats-bar";
import { TrendingMemecoins, type TrendingToken } from "@/components/trending-memecoins";
import { LaunchForm } from "@/components/launch-form";
import { RecentLaunches } from "@/components/recent-launches";
import { AutoLaunchPanel } from "@/components/auto-launch";
import { DeployedTokensBox } from "@/components/deployed-tokens-box";
import { HealthCheck } from "@/components/health-check";
import { AgentPostsFeed } from "@/components/agent-posts-feed";
import { TrendingAutoLaunch } from "@/components/trending-auto-launch";

export interface TokenPrefill {
  name: string;
  symbol: string;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  description?: string;
}

export default function Page() {
  const [prefill, setPrefill] = useState<TokenPrefill | null>(null);

  const handleSelectToken = useCallback((token: TrendingToken) => {
    const cleanName = token.name.replace(/\s*\/\s*.*$/, "").trim();
    const cleanSymbol = token.symbol.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    setPrefill({
      name: cleanName,
      symbol: cleanSymbol,
      imageUrl: token.imageUrl || undefined,
      website: token.website || undefined,
      twitter: token.twitter || undefined,
      description: token.tokenDescription || undefined,
    });

    document
      .getElementById("launch-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-4 lg:px-8">
        {/* Stats */}
        <section className="mb-4">
          <StatsBar />
        </section>

        {/* Trending Memecoins */}
        <section className="mb-4">
          <TrendingMemecoins onSelectToken={handleSelectToken} />
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Launch Form + Recent Launches */}
          <div id="launch-form" className="space-y-4 lg:col-span-5">
            <LaunchForm prefill={prefill} />
            <RecentLaunches />
          </div>

          {/* Right: Auto Launch (x3) + Deployed Tokens */}
          <div className="space-y-4 lg:col-span-7">
            <AutoLaunchPanel instanceId={1} instanceLabel="Auto-Launch #1" />
            <AutoLaunchPanel instanceId={2} instanceLabel="Auto-Launch #2" />
            <AutoLaunchPanel instanceId={3} instanceLabel="Auto-Launch #3" />
            <TrendingAutoLaunch />
            <DeployedTokensBox />
          </div>
        </div>

        {/* System Status / Health Check -- Separate section */}
        <section className="mt-8 border-t border-border pt-6">
          <HealthCheck />
        </section>

        {/* Live Launch Posts -- Agent feed scanner */}
        <section className="mt-6">
          <AgentPostsFeed />
        </section>

        {/* Footer */}
        <footer className="mt-10 border-t border-border pt-5 pb-6">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[8px] font-mono font-bold">
                4C
              </div>
              <span className="text-xs text-muted-foreground">
                Multi-Platform Launchpad v4.0
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span>4claw | Kibu | Clawnch | Molaunch | FourClaw.Fun | SynthLaunch</span>
              <span className="hidden sm:inline">|</span>
              {[
                { label: "4claw Docs", url: "https://4claw.fun" },
                { label: "Kibu Docs", url: "https://kibu.bot" },
                { label: "Clawnch Docs", url: "https://clawn.ch" },
                { label: "Molaunch Docs", url: "https://bags.fourclaw.fun" },
                { label: "FourClaw.Fun", url: "https://fourclaw.fun" },
                { label: "SynthLaunch", url: "https://synthlaunch.fun" },
                { label: "BapBook", url: "https://bapbook.com" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
