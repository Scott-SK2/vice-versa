"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TFn } from "@/lib/participant/client/i18n";
import { Button, Notice } from "./ui";

/** Résultat d'un QR VICE VERSA : station avec jeton, ou page d'entrée. */
export type QrTarget = { kind: "station"; code: string; token: string } | { kind: "entry" };

/** Reconnaît les URL portées par nos QR (…/vv26/s/<code>?k=<jeton>, …/vv26) quelle que soit l'origine. */
export function parseQrText(text: string): QrTarget | null {
  const t = text.trim();
  let path = t;
  let search = "";
  try {
    const u = new URL(t);
    path = u.pathname;
    search = u.search;
  } catch {
    const i = t.indexOf("?");
    if (i >= 0) {
      path = t.slice(0, i);
      search = t.slice(i);
    }
  }
  const station = /\/vv26\/s\/([A-Z0-9]{1,2})\/?$/i.exec(path);
  if (station) {
    const token = new URLSearchParams(search).get("k");
    if (token && /^[A-Z0-9]{6,12}$/i.test(token)) return { kind: "station", code: station[1].toUpperCase(), token };
    return null;
  }
  if (/\/vv26\/?$/.test(path)) return { kind: "entry" };
  return null;
}

type Detector = { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/**
 * Scanner de QR dans l'application : caméra arrière, décodage par BarcodeDetector quand le
 * navigateur l'offre (Chrome/Android), sinon par jsQR sur un canvas. Le flux est coupé dès
 * qu'un QR est reconnu ou que l'écran se ferme.
 */
export function QrScanner({ t, onDetect }: { t: TFn; onDetect: (target: QrTarget) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const done = useRef(false);
  const [state, setState] = useState<"idle" | "starting" | "scanning" | "denied" | "unsupported">("idle");
  const [unknown, setUnknown] = useState(false);

  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback(
    (text: string) => {
      const target = parseQrText(text);
      if (!target) {
        setUnknown(true);
        return;
      }
      if (done.current) return;
      done.current = true;
      stop();
      onDetect(target);
    },
    [onDetect, stop],
  );

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("starting");
    setUnknown(false);
    done.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      stream.current = s;
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play();
      setState("scanning");

      const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const native = DetectorClass ? new DetectorClass({ formats: ["qr_code"] }) : null;
      const jsqr = native ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (done.current || !stream.current) return;
        const vid = video.current;
        if (vid && vid.readyState >= 2 && vid.videoWidth) {
          try {
            if (native) {
              const found = await native.detect(vid);
              if (found[0]?.rawValue) handle(found[0].rawValue);
            } else if (jsqr && canvas.current) {
              const c = canvas.current;
              const scale = Math.min(1, 640 / vid.videoWidth);
              c.width = Math.round(vid.videoWidth * scale);
              c.height = Math.round(vid.videoHeight * scale);
              const ctx = c.getContext("2d", { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(vid, 0, 0, c.width, c.height);
                const img = ctx.getImageData(0, 0, c.width, c.height);
                const qr = jsqr(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
                if (qr?.data) handle(qr.data);
              }
            }
          } catch {
            /* image non prête : on réessaie */
          }
        }
        if (!done.current) timer.current = window.setTimeout(tick, native ? 200 : 150);
      };
      tick();
    } catch {
      stop();
      setState("denied");
    }
  }, [handle, stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-card bg-ink">
        <video ref={video} className="h-full w-full object-cover" playsInline muted autoPlay aria-label={t("scanner.cameraHint")} />
        <canvas ref={canvas} className="hidden" aria-hidden />
        {state === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="h-[62%] w-[62%] rounded-xl border-4 border-yellow/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {state !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-paper">
            <span className="text-5xl" aria-hidden>📷</span>
            <Button onClick={start} disabled={state === "starting"}>
              {state === "starting" ? t("common.loading") : t("scanner.cameraStart")}
            </Button>
          </div>
        )}
      </div>
      {state === "scanning" && <p className="text-center text-sm text-muted">{t("scanner.cameraHint")}</p>}
      {state === "scanning" && (
        <Button variant="ghost" onClick={() => { stop(); setState("idle"); }}>{t("scanner.cameraStop")}</Button>
      )}
      {unknown && <Notice kind="warning">{t("scanner.unknownQr")}</Notice>}
      {state === "denied" && <Notice kind="info">{t("scanner.cameraDenied")}</Notice>}
      {state === "unsupported" && <Notice kind="info">{t("scanner.cameraDenied")}</Notice>}
    </div>
  );
}
