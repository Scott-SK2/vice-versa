"use client";

import { useRef, useState } from "react";
import type { TFn } from "@/lib/participant/client/i18n";
import { type MediaDto, VideoPlayer } from "./VideoPlayer";

/**
 * Médias d'une station : un seul → lecteur direct ; plusieurs → défilement horizontal
 * par balayage (scroll-snap), avec compteur et points de position.
 */
export function MediaCarousel({ media, lang, langs, t, onProgress }: { media: MediaDto[]; lang: string; langs: string[]; t: TFn; onProgress: (ratio: number, ref: string) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Le média qui compte pour terminer une station sans question : la première vidéo, sinon la première image.
  const tracked = media.find((m) => m.type === "video") ?? media[0];

  if (media.length === 1) return <VideoPlayer media={media[0]} lang={lang} langs={langs} t={t} onProgress={(r) => onProgress(r, media[0].ref)} />;

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(Math.max(0, Math.min(media.length - 1, i)));
  };
  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-roledescription="carousel"
        aria-label={t("station.mediaCount", { i: index + 1, n: media.length })}
      >
        {media.map((m, i) => (
          <div key={m.ref} className="w-full shrink-0 snap-center" aria-hidden={i !== index} role="group" aria-roledescription="slide">
            <VideoPlayer media={m} lang={lang} langs={langs} t={t} onProgress={m.ref === tracked.ref ? (r) => onProgress(r, m.ref) : () => undefined} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="min-h-11 min-w-11 rounded-full text-xl text-muted disabled:opacity-30" aria-label={t("station.mediaPrev")}>
          ‹
        </button>
        <div className="flex items-center gap-2" aria-hidden>
          {media.map((m, i) => (
            <button key={m.ref} type="button" onClick={() => goTo(i)} className={`h-2.5 w-2.5 rounded-full ${i === index ? "bg-green-deep" : "bg-state-locked"}`} tabIndex={-1} />
          ))}
        </div>
        <span className="text-sm text-muted">{t("station.mediaCount", { i: index + 1, n: media.length })}</span>
        <button type="button" onClick={() => goTo(index + 1)} disabled={index === media.length - 1} className="min-h-11 min-w-11 rounded-full text-xl text-muted disabled:opacity-30" aria-label={t("station.mediaNext")}>
          ›
        </button>
      </div>
    </div>
  );
}
