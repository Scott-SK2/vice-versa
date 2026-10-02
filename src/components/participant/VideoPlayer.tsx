"use client";

import { useCallback, useRef, useState } from "react";
import type { TFn } from "@/lib/participant/client/i18n";
import { CaptionsOverlay } from "./CaptionsOverlay";

export type MediaDto = {
  ref: string;
  type: "video" | "image" | "audio";
  url: string;
  poster_url: string | null;
  duration_s: number | null;
  captions: Record<string, { words: string; vtt: string }>;
};

/**
 * Lecteur portrait 9:16 (05 § 5) : jamais d'autoplay, gros bouton jaune, barre de 4 px,
 * sous-titres façon TikTok par-dessus l'image, <track> VTT en repli, sélecteur de langue.
 */
export function VideoPlayer({ media, lang, langs, t, onProgress }: { media: MediaDto; lang: string; langs: string[]; t: TFn; onProgress?: (ratio: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const [progress, setProgress] = useState(0);
  const [chosenLang, setCapLang] = useState<string | null>(null);
  const capLang = chosenLang ?? lang;
  const reported = useRef(new Set<number>());

  const report = useCallback(
    (ratio: number) => {
      for (const th of [0.25, 0.5, 0.8, 1]) {
        if (ratio >= th && !reported.current.has(th)) {
          reported.current.add(th);
          onProgress?.(th);
        }
      }
    },
    [onProgress],
  );

  const play = () => {
    video.current?.play().catch(() => undefined);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  };
  const replay = () => {
    const v = video.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => undefined);
  };

  const captions = media.captions[capLang] ?? media.captions[lang] ?? media.captions.fr;
  const available = langs.filter((l) => media.captions[l]);

  if (media.type === "image") {
    return (
      <figure className="overflow-hidden rounded-card bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.url} alt="" className="mx-auto max-h-[70vh] w-auto" onLoad={() => report(1)} />
      </figure>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-card bg-black">
        <video
          ref={video}
          className="h-full w-full object-contain"
          src={media.url}
          poster={media.poster_url ?? undefined}
          playsInline
          preload="metadata"
          controls={state !== "idle"}
          onPlay={() => setState("playing")}
          onPause={() => setState((s) => (s === "ended" ? s : "paused"))}
          onEnded={() => {
            setState("ended");
            report(1);
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) {
              const r = v.currentTime / v.duration;
              setProgress(r);
              report(r);
            }
          }}
          crossOrigin="anonymous"
        >
          {captions && <track kind="subtitles" src={captions.vtt} srcLang={capLang} label={capLang.toUpperCase()} default />}
        </video>
        {captions && state !== "idle" && <CaptionsOverlay videoRef={video} src={captions.words} />}
        {state === "idle" && (
          <button
            onClick={play}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
            aria-label={t("station.play")}
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow text-4xl text-ink shadow-lg" aria-hidden>▶</span>
          </button>
        )}
        {state === "ended" && (
          <button onClick={replay} className="absolute inset-x-0 bottom-10 mx-auto w-max rounded-button bg-yellow px-5 py-3 text-base font-bold text-ink shadow">
            {t("station.replay")}
          </button>
        )}
        {state === "paused" && (
          <button onClick={toggle} className="absolute inset-0" aria-label={t("station.play")} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden>
          <div className="h-full bg-yellow" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
      {available.length > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-muted">{t("station.subtitles")}</span>
          {available.map((l) => (
            <button
              key={l}
              onClick={() => setCapLang(l)}
              className={`min-h-9 rounded-full px-3 font-bold uppercase ${capLang === l ? "bg-green-deep text-paper" : "border border-state-locked text-ink"}`}
              aria-pressed={capLang === l}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
