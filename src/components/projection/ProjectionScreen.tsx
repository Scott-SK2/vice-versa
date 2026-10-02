"use client";

import { useEffect, useState } from "react";
import { type ProjectionPayload, SlideView } from "./Slides";

export function ProjectionScreen({ runId, projectionKey }: { runId: string; projectionKey: string }) {
  const [payload, setPayload] = useState<(ProjectionPayload & { version: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projection/${runId}/current?key=${encodeURIComponent(projectionKey)}`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(data?.error?.message ?? "Erreur");
          return;
        }
        setError(null);
        setPayload(data);
      } catch {
        if (alive) setError("Connexion perdue, nouvelle tentative…");
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [runId, projectionKey]);

  if (error && !payload) {
    return (
      <div className="flex h-screen items-center justify-center bg-green-deep p-16 text-center text-paper">
        <p className="text-3xl">{error}</p>
      </div>
    );
  }
  if (!payload) return <div className="h-screen bg-green-deep" />;
  return (
    <div className="h-screen w-screen overflow-hidden">
      <SlideView payload={payload} scale="screen" />
      {error && <p className="fixed bottom-2 right-4 text-sm text-muted">{error}</p>}
    </div>
  );
}
