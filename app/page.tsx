import { Header } from "@/components/header";
import { StatsBar } from "@/components/stats-bar";
import { LaunchForm } from "@/components/launch-form";
import { TokenFeed } from "@/components/token-feed";
import { RecentLaunches } from "@/components/recent-launches";

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {/* Stats */}
        <section className="mb-6">
          <StatsBar />
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Launch Form + Recent Launches */}
          <div className="space-y-6 lg:col-span-5">
            <LaunchForm />
            <RecentLaunches />
          </div>

          {/* Right: Token Feed */}
          <div className="lg:col-span-7">
            <TokenFeed />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-border pt-6 pb-8">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-mono font-bold">
                4C
              </div>
              <span className="text-sm text-muted-foreground">
                4claw Protocol v2.0
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>BSC / Four.Meme / BEP-20</span>
              <span className="hidden sm:inline">|</span>
              <a
                href="https://4claw.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Documentation
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
