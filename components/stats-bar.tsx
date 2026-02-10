"use client";

import { Zap, Shield, DollarSign, Clock, Layers, Bot } from "lucide-react";

const stats = [
  {
    label: "Launchpads",
    value: "3",
    description: "4claw / Kibu / Clawnch",
    icon: Layers,
  },
  {
    label: "Agents",
    value: "4",
    description: "Moltx / Moltbook / 4claw.org / Clawstr",
    icon: Bot,
  },
  {
    label: "Chains",
    value: "BSC + Base",
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
    value: "1-5%",
    description: "4claw only",
    icon: Shield,
  },
  {
    label: "Rate Limit",
    value: "1-5/24h",
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
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary">
            <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
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
