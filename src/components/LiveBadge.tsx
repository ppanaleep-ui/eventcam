"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Small live indicator for the dashboard. Subscribes to the event SSE stream and
// refreshes server components when new activity arrives, so stats stay current
// without a manual reload.
export default function LiveBadge({ slug }: { slug: string }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/e/${slug}/stream`);

    es.addEventListener("hello", () => setConnected(true));

    const onActivity = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
      router.refresh();
    };
    es.addEventListener("wish", onActivity);
    es.addEventListener("envelope", onActivity);

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [slug, router]);

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          connected ? "bg-green-500" : "bg-gray-300"
        } ${pulse ? "animate-ping" : ""}`}
      />
      {connected ? "อัปเดตสด" : "ออฟไลน์"}
    </span>
  );
}
