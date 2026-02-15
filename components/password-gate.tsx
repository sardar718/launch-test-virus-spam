"use client";

import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const COOKIE_NAME = "xp_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};samesite=strict`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface PasswordGateProps {
  children: ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getCookie(COOKIE_NAME);
    if (token === "granted") {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password === "xppage") {
      setCookie(COOKIE_NAME, "granted", COOKIE_MAX_AGE);
      setAuthenticated(true);
      setError("");
    } else {
      setError("Wrong password. Try again.");
      setPassword("");
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-lg font-semibold text-card-foreground">
            Access Protected
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Enter the password to access the launchpad interface.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="h-10 bg-secondary border-border text-sm"
              autoFocus
              autoComplete="off"
            />
            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}
            <Button type="submit" className="w-full h-9 text-sm font-semibold">
              Unlock
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
