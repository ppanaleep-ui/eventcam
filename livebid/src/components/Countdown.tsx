"use client";

import { useEffect, useState } from "react";

/** Live "0:07" style countdown to an ISO timestamp. */
export function Countdown({ endsAt, className = "" }: { endsAt: string | null; className?: string }) {
  const [remaining, setRemaining] = useState(() => remainingMs(endsAt));

  useEffect(() => {
    setRemaining(remainingMs(endsAt));
    if (!endsAt) return;
    const timer = setInterval(() => setRemaining(remainingMs(endsAt)), 100);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (!endsAt) return null;

  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const urgent = seconds <= 10;

  return (
    <span
      className={`money font-black tabular-nums ${urgent ? "text-hot-400" : "text-slate-100"} ${className}`}
    >
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

function remainingMs(endsAt: string | null): number {
  if (!endsAt) return 0;
  return new Date(endsAt).getTime() - Date.now();
}
