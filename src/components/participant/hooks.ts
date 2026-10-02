"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ParticipantApiError } from "@/lib/participant/client/api";
import { enqueueAnswer } from "@/lib/participant/client/outbox";
import { type Progress, useParticipant } from "@/lib/participant/client/store";
import type { SubmitResult } from "./QuestionForm";

export type AnswerResponse = {
  saved: boolean;
  station: { code: string; state: "in_progress" | "completed" | null } | null;
  progress: Progress;
  aggregate_available: boolean;
  reveal?: { correct: boolean; correct_choice_key: string | null };
};

/** Envoi d'une réponse : succès, mise en file hors-ligne, ou message d'erreur traduit. */
export function useSubmitAnswer() {
  const { t, setProgress } = useParticipant();
  return useCallback(
    async (key: string, value: Record<string, unknown>): Promise<SubmitResult & { response?: AnswerResponse }> => {
      const client_ts = new Date().toISOString();
      try {
        const r = await api<AnswerResponse>(`/api/answers/${key}`, { method: "PUT", body: { value, client_ts } });
        setProgress(r.progress);
        return { ok: true, reveal: r.reveal, response: r };
      } catch (e) {
        if (e instanceof ParticipantApiError) {
          if (e.isNetwork) {
            enqueueAnswer(key, value, client_ts);
            return { ok: true, queued: true };
          }
          if (e.code === "BANNED_WORD") return { ok: false, message: t("question.bannedWord", { words: ((e.details?.words as string[]) ?? []).join(", ") }) };
          if (e.code === "PHASE_LOCKED") return { ok: false, message: t("common.phaseLocked") };
          if (e.code === "VALIDATION") return { ok: false, message: ((e.details?.issues as string[]) ?? [t("common.error")]).join(" ") };
          return { ok: false, message: e.message || t("common.error") };
        }
        return { ok: false, message: t("common.error") };
      }
    },
    [t, setProgress],
  );
}

/** Chargement d'une ressource API avec rafraîchissement périodique optionnel. */
export function useApiData<T>(path: string | null, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ParticipantApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ParticipantApiError) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    const first = setTimeout(load, 0);
    const id = intervalMs ? setInterval(load, intervalMs) : null;
    return () => {
      alive.current = false;
      clearTimeout(first);
      if (id) clearInterval(id);
    };
  }, [load, intervalMs]);

  return { data, error, loading, reload: load, setData };
}
