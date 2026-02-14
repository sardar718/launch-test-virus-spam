"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    if (stored) {
      setTheme(stored);
      document.documentElement.classList.toggle("light", stored === "light");
    }
  }, []);

  function select(mode: "dark" | "light") {
    setTheme(mode);
    localStorage.setItem("theme", mode);
    document.documentElement.classList.toggle("light", mode === "light");
  }

  return (
    <div className="flex items-center rounded-lg border border-border bg-secondary p-0.5">
      <button
        type="button"
        onClick={() => select("light")}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
          theme === "light"
            ? "bg-card text-card-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Day mode"
      >
        <Sun className="h-3 w-3" />
        Day
      </button>
      <button
        type="button"
        onClick={() => select("dark")}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
          theme === "dark"
            ? "bg-card text-card-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Night mode"
      >
        <Moon className="h-3 w-3" />
        Night
      </button>
    </div>
  );
}
