"use client";

import { useEffect, useRef, useState } from "react";
import type { TFn } from "@/lib/participant/client/i18n";
import { Button, Notice } from "./ui";

export type QuestionDto = {
  key: string;
  type: "single_choice" | "multi_choice" | "tri_state" | "three_words" | "short_text" | "guess_reveal" | "media_only";
  phase: string;
  text: string;
  help: string | null;
  required: boolean;
  min_choices: number | null;
  max_choices: number | null;
  max_length: number | null;
  paired_with: string | null;
  choices: { id: number; key: string; label: string; icon: string | null }[];
  answer: Record<string, unknown> | null;
  locked: boolean;
  aggregate_available: boolean;
};

export type SubmitResult = { ok: true; queued?: boolean; reveal?: { correct: boolean; correct_choice_key: string | null } } | { ok: false; message: string };

const ICONS: Record<string, string> = { photo: "📷", phone: "📱", music: "🎵", pot: "🍲", speech: "💬", diploma: "🎓", candle: "🕯️", shirt: "👕", notebook: "📒" };

export function QuestionForm({
  question,
  t,
  onSubmit,
  submitLabel,
  showAnonymous = true,
  onChange,
  hideSubmit = false,
}: {
  question: QuestionDto;
  t: TFn;
  onSubmit: (value: Record<string, unknown>) => Promise<SubmitResult>;
  submitLabel?: string;
  showAnonymous?: boolean;
  /** Mode groupé : la valeur courante (ou null si incomplète) est remontée à chaque changement. */
  onChange?: (value: Record<string, unknown> | null) => void;
  /** Mode groupé : pas de bouton propre, l'envoi est fait par le parent. */
  hideSubmit?: boolean;
}) {
  const q = question;
  const prev = q.answer;
  const [single, setSingle] = useState<number | null>((prev?.choice_id as number) ?? null);
  const [multi, setMulti] = useState<number[]>((prev?.choice_ids as number[]) ?? []);
  const [comment, setComment] = useState<string>((prev?.comment as string) ?? "");
  const [words, setWords] = useState<string[]>(((prev?.words as string[]) ?? ["", "", ""]).concat(["", "", ""]).slice(0, 3));
  const [text, setText] = useState<string>((prev?.text as string) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ correct: boolean; correct_choice_key: string | null } | undefined>(undefined);

  const max = q.max_length ?? 140;
  const min = q.min_choices ?? 1;
  const maxC = q.max_choices ?? q.choices.length;

  const value = (): Record<string, unknown> | null => {
    switch (q.type) {
      case "single_choice":
      case "guess_reveal":
        return single ? { choice_id: single } : null;
      case "multi_choice":
        return multi.length >= min && multi.length <= maxC ? { choice_ids: multi } : null;
      case "tri_state":
        return single ? (comment.trim() ? { choice_id: single, comment: comment.trim() } : { choice_id: single }) : null;
      case "three_words":
        return words.every((w) => w.trim()) ? { words: words.map((w) => w.trim()) } : null;
      case "short_text":
        return text.trim() ? { text: text.trim() } : null;
      default:
        return null;
    }
  };
  const ready = value() !== null;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const currentJson = JSON.stringify(value());
  useEffect(() => {
    onChangeRef.current?.(currentJson === "null" ? null : (JSON.parse(currentJson) as Record<string, unknown>));
  }, [currentJson]);

  async function submit() {
    const v = value();
    if (!v) return setError(t("common.required"));
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await onSubmit(v);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.queued) setNotice(t("common.queued"));
    if (r.reveal) setReveal(r.reveal);
  }

  const choiceBtn = (c: QuestionDto["choices"][number], selected: boolean, onClick: () => void, extra?: string) => (
    <button
      key={c.id}
      type="button"
      disabled={q.locked || busy || Boolean(reveal)}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-14 w-full items-center gap-3 rounded-button border-2 px-4 text-left text-base font-semibold transition ${
        selected ? "border-green-deep bg-green-deep text-paper" : "border-state-locked bg-white text-ink"
      } ${extra ?? ""}`}
    >
      {c.icon && <span className="text-2xl" aria-hidden>{ICONS[c.icon] ?? "•"}</span>}
      <span className="flex-1">{c.label}</span>
      {selected && <span aria-hidden>✓</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl leading-snug">{q.text}</h2>
        {q.help && <p className="mt-1 text-sm text-muted">{q.help}</p>}
        {q.type === "multi_choice" && (
          <p className="mt-1 text-sm font-semibold text-green-deep">
            {min === maxC ? t("question.multiHint", { n: min }) : t("question.multiRange", { min, max: maxC })} · {multi.length}/{maxC}
          </p>
        )}
      </div>

      {(q.type === "single_choice" || q.type === "guess_reveal" || q.type === "tri_state") && (
        <div className="flex flex-col gap-2" role="radiogroup">
          {q.choices.map((c) => {
            const isCorrect = reveal && reveal.correct_choice_key === c.key;
            return choiceBtn(c, single === c.id, () => setSingle(c.id), isCorrect ? "ring-4 ring-yellow" : undefined);
          })}
        </div>
      )}

      {q.type === "multi_choice" && (
        <div className={`grid gap-2 ${q.choices.some((c) => c.icon) ? "grid-cols-3" : "grid-cols-1"}`}>
          {q.choices.map((c) => {
            const selected = multi.includes(c.id);
            const full = !selected && multi.length >= maxC;
            return (
              <button
                key={c.id}
                type="button"
                disabled={q.locked || busy || full}
                aria-pressed={selected}
                onClick={() => setMulti(selected ? multi.filter((x) => x !== c.id) : [...multi, c.id])}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-button border-2 px-2 py-3 text-center text-sm font-semibold ${
                  selected ? "border-green-deep bg-green-deep text-paper" : "border-state-locked bg-white"
                } ${full ? "opacity-50" : ""}`}
              >
                {c.icon && <span className="text-3xl" aria-hidden>{ICONS[c.icon] ?? "•"}</span>}
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "tri_state" && (
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t("question.comment")}</span>
          <input
            className="block min-h-12 w-full rounded-button border border-state-locked bg-white px-3 text-base"
            value={comment}
            maxLength={140}
            disabled={q.locked}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
      )}

      {q.type === "three_words" && (
        <div className="flex flex-col gap-2">
          {words.map((w, i) => (
            <input
              key={i}
              className="block min-h-14 w-full rounded-button border-2 border-state-locked bg-white px-4 text-lg font-semibold"
              value={w}
              placeholder={t("question.word", { n: i + 1 })}
              aria-label={t("question.word", { n: i + 1 })}
              maxLength={40}
              disabled={q.locked}
              autoCapitalize="none"
              onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </div>
      )}

      {q.type === "short_text" && (
        <label className="block text-sm">
          <textarea
            className="block min-h-28 w-full rounded-button border-2 border-state-locked bg-white px-4 py-3 text-base"
            value={text}
            maxLength={max}
            disabled={q.locked}
            onChange={(e) => setText(e.target.value)}
            aria-label={q.text}
          />
          <span className="mt-1 flex justify-between text-xs text-muted">
            <span>{t("question.noNames")}</span>
            <span>{t("question.textHint", { n: max - text.length })}</span>
          </span>
        </label>
      )}

      {reveal && (
        <Notice kind={reveal.correct ? "success" : "warning"}>
          {reveal.correct
            ? t("question.revealCorrect", { label: q.choices.find((c) => c.key === reveal.correct_choice_key)?.label ?? "" })
            : t("question.revealWrong", { label: q.choices.find((c) => c.key === reveal.correct_choice_key)?.label ?? "" })}
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="warning">{notice}</Notice>}
      {q.locked && <Notice kind="info">{t("common.phaseLocked")}</Notice>}

      {!q.locked && !reveal && !hideSubmit && (
        <Button onClick={submit} disabled={busy || !ready}>
          {busy ? t("common.sending") : (submitLabel ?? t("common.send"))}
        </Button>
      )}
      {showAnonymous && <p className="text-center text-xs text-muted">{t("common.anonymous")}</p>}
    </div>
  );
}

/** Rendu lisible d'une réponse (bilan, résumé). */
export function renderAnswer(q: Pick<QuestionDto, "type" | "choices">, a: Record<string, unknown> | null | undefined, fallback: string): string {
  if (!a) return fallback;
  const label = (id: unknown) => q.choices.find((c) => c.id === Number(id))?.label ?? "";
  switch (q.type) {
    case "single_choice":
    case "tri_state":
    case "guess_reveal":
      return label(a.choice_id);
    case "multi_choice":
      return ((a.choice_ids as number[]) ?? []).map(label).join(", ");
    case "three_words":
      return ((a.words as string[]) ?? []).join(" · ");
    case "short_text":
      return (a.text as string) ?? fallback;
    default:
      return fallback;
  }
}
