"use client";

/**
 * État global participant (05 § 2) : séance live, jeton, langue, phase, écran conseillé.
 * Interroge /api/runs/current toutes les 10 s et applique les changements de séance.
 */
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, onSessionEvent, ParticipantApiError } from "./api";
import { type Lang, translate, type TFn } from "./i18n";
import { flushOutbox } from "./outbox";
import { storage } from "./storage";

export type Phase = "accueil" | "parcours" | "apres" | "discussion" | "trace" | "cloture";
export type RunInfo = { id: string; kind: "test" | "repetition" | "live"; phase: Phase; label: string };
export type Progress = { completed: number; required: number; percent: number };
export type Me = {
  session_id: string;
  lang: string;
  run: RunInfo;
  progress: Progress;
  last_station: string | null;
  before_questions_done: boolean;
  suggested_route: string;
};

type Status = "loading" | "none" | "anonymous" | "ready" | "closed";

type Store = {
  status: Status;
  run: RunInfo | null;
  me: Me | null;
  lang: Lang;
  t: TFn;
  start: (lang: Lang) => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  reset: () => void;
  setProgress: (p: Progress) => void;
};

const Ctx = createContext<Store | null>(null);
const FORCE_ROUTES: Partial<Record<Phase, true>> = { discussion: true, trace: true, cloture: true };

export function ParticipantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("loading");
  const [run, setRun] = useState<RunInfo | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [lang, setLangState] = useState<Lang>("fr");
  const etag = useRef<string | null>(null);
  const lastPhase = useRef<Phase | null>(null);

  const t = useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang]);

  const refreshMe = useCallback(async (): Promise<Me | null> => {
    if (!storage.getToken()) return null;
    try {
      const m = await api<Me>("/api/me");
      setMe(m);
      setRun(m.run);
      if (m.lang === "fr" || m.lang === "nl" || m.lang === "en") setLangState(m.lang);
      setStatus("ready");
      return m;
    } catch (e) {
      if (e instanceof ParticipantApiError && e.isNetwork) return null; // garde l'état connu
      return null; // les 401/409 sont traités par les événements de session
    }
  }, []);

  const clearSession = useCallback(() => {
    storage.setToken(null);
    setMe(null);
  }, []);

  // Sondage de la séance live.
  const pollCurrent = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (etag.current) headers["if-none-match"] = etag.current;
      const res = await fetch("/api/runs/current", { headers, cache: "no-store" });
      if (res.status === 304) return;
      etag.current = res.headers.get("etag");
      const data = (await res.json()) as { status: "none" } | ({ status: "live"; run_id: string } & Omit<RunInfo, "id">);
      if (data.status === "none") {
        setRun(null);
        setStatus((s) => (s === "ready" && storage.getToken() ? "closed" : "none"));
        return;
      }
      const current: RunInfo = { id: data.run_id, kind: data.kind, phase: data.phase, label: data.label };
      setRun(current);
      const token = storage.getToken();
      const tokenRun = token ? /^v1\.([0-9a-f-]{36})\./.exec(token)?.[1] : null;
      if (token && tokenRun && tokenRun !== current.id) {
        clearSession();
        setStatus("anonymous");
        router.replace("/vv26");
        return;
      }
      if (!token) {
        setStatus("anonymous");
        return;
      }
      setMe((m) => (m ? { ...m, run: current } : m));
      setStatus((s) => (s === "loading" || s === "none" || s === "closed" ? "ready" : s));
      if (lastPhase.current && lastPhase.current !== current.phase && FORCE_ROUTES[current.phase]) {
        const m = await refreshMe();
        if (m && m.suggested_route !== pathname) router.push(m.suggested_route);
      }
      lastPhase.current = current.phase;
    } catch {
      /* hors ligne : on garde l'état courant */
    }
  }, [clearSession, pathname, refreshMe, router]);

  useEffect(() => {
    const init = setTimeout(async () => {
      const saved = storage.getLang();
      if (saved === "fr" || saved === "nl" || saved === "en") setLangState(saved);
      await pollCurrent();
      if (storage.getToken()) {
        const m = await refreshMe();
        if (m) lastPhase.current = m.run.phase;
      }
      flushOutbox();
    }, 0);
    const interval = setInterval(pollCurrent, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        pollCurrent();
        flushOutbox();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(init);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollCurrent, refreshMe]);

  useEffect(
    () =>
      onSessionEvent((e) => {
        if (e.type === "session_unknown" || e.type === "run_changed") {
          clearSession();
          setStatus("anonymous");
          router.replace("/vv26");
        }
        if (e.type === "run_closed") {
          setStatus("closed");
          router.replace("/vv26/merci");
        }
      }),
    [clearSession, router],
  );

  const start = useCallback(
    async (chosen: Lang) => {
      storage.setLang(chosen);
      setLangState(chosen);
      const r = await api<{ token: string; run: RunInfo; lang: string }>("/api/sessions", { method: "POST", body: { lang: chosen }, auth: false });
      storage.setToken(r.token);
      setRun(r.run);
      lastPhase.current = r.run.phase;
      const m = await refreshMe();
      router.push(m?.suggested_route ?? "/vv26/avant");
    },
    [refreshMe, router],
  );

  const setLang = useCallback(async (chosen: Lang) => {
    storage.setLang(chosen);
    setLangState(chosen);
    if (storage.getToken()) await api("/api/me", { method: "PATCH", body: { lang: chosen } }).catch(() => undefined);
  }, []);

  const reset = useCallback(() => {
    clearSession();
    storage.setJson("vv.outbox", []);
    setStatus(run ? "anonymous" : "none");
  }, [clearSession, run]);

  const setProgress = useCallback((p: Progress) => setMe((m) => (m ? { ...m, progress: p } : m)), []);

  const value = useMemo<Store>(
    () => ({ status, run, me, lang, t, start, setLang, refreshMe, reset, setProgress }),
    [status, run, me, lang, t, start, setLang, refreshMe, reset, setProgress],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParticipant(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useParticipant hors ParticipantProvider");
  return s;
}
