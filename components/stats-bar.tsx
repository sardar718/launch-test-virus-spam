"use client";

import { Zap, Shield, DollarSign, Clock } from "lucide-react";

const stats = [
  {
    label: "Deploy Cost",
    value: "0 BNB",
    description: "Free deployment",
    icon: DollarSign,
  },
  {
    label: "Network",
    value: "BSC",
    description: "Binance Smart Chain",
    icon: Zap,
  },
  {
    label: "Tax Range",
    value: "1-5%",
    description: "Four.Meme limit",
    icon: Shield,
  },
  {
    label: "Rate Limit",
    value: "1/24h",
    description: "Per account",
    icon: Clock,
  },
];

export function StatsBar() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-card-foreground font-mono">
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
