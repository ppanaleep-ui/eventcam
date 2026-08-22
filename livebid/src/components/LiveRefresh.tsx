"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page (the seller control room) in sync with the live
 * room: any bus event for the show triggers a soft refresh, and a slow poll
 * covers the auction clock running out with no other traffic.
 */
export function LiveRefresh({ showId }: { showId: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/shows/${showId}/stream`);
    const refresh = () => router.refresh();
    for (const name of ["bid", "listing", "show", "chat"]) {
      source.addEventListener(name, refresh);
    }
    const poll = setInterval(refresh, 5_000);

    return () => {
      clearInterval(poll);
      source.close();
    };
  }, [showId, router]);

  return null;
}
