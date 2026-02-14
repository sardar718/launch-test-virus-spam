"use client";

import { Zap, Shield, DollarSign, Clock, Layers, Bot } from "lucide-react";

const stats = [
  {
    label: "Launchpads",
    value: "6",
    description: "4claw / Kibu / Clawnch / Molaunch / FourClaw / SynthLaunch",
    icon: Layers,
  },
  {
    label: "Agents",
    value: "6",
    description: "Moltx / Moltbook / 4claw.org / Clawstr / BapBook / Direct API",
    icon: Bot,
  },
  {
    label: "Chains",
    value: "BSC + Base + SOL",
    description: "Multi-chain",
    icon: Zap,
  },
  {
    label: "Deploy Cost",
    value: "Free",
    description: "Zero fees",
    icon: DollarSign,
  },
  {
    label: "Tax Range",
    value: "1-10%",
    description: "4claw / SynthLaunch",
    icon: Shield,
  },
  {
    label: "Rate Limit",
    value: "1-10/day",
    description: "Per platform",
    icon: Clock,
  },
];

export function StatsBar() {
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/20"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/5 border border-primary/10">
            <stat.icon className="h-3.5 w-3.5 text-primary/70" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-card-foreground font-mono truncate">
              {stat.value}
            </p>
            <p className="text-[9px] text-muted-foreground truncate">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
