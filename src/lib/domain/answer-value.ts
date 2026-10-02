/**
 * Format de answers.value par type de question (cahier v3, 03 § 5) et validation serveur.
 */
import { z } from "zod";
import type { ModerationStatus, QuestionType } from "@/db/schema/enums";
import { normalizeWords } from "./words";

export const SHORT_TEXT_DEFAULT_MAX = 140;
export const THREE_WORDS_COUNT = 3;

export const answerValueSchemas = {
  single_choice: z.object({ choice_id: z.number().int().positive() }),
  multi_choice: z.object({ choice_ids: z.array(z.number().int().positive()).min(1) }),
  tri_state: z.object({
    choice_id: z.number().int().positive(),
    comment: z.string().trim().max(SHORT_TEXT_DEFAULT_MAX).optional(),
  }),
  three_words: z.object({
    words: z.array(z.string().trim().min(1).max(40)).length(THREE_WORDS_COUNT),
  }),
  short_text: z.object({ text: z.string().trim().min(1).max(SHORT_TEXT_DEFAULT_MAX) }),
  guess_reveal: z.object({ choice_id: z.number().int().positive() }),
} as const;

export type AnswerValue = {
  [K in keyof typeof answerValueSchemas]: z.infer<(typeof answerValueSchemas)[K]>;
};

export type QuestionShape = {
  type: QuestionType;
  minChoices: number | null;
  maxChoices: number | null;
  maxLength: number | null;
  /** Identifiants des choix actifs de la question. */
  choiceIds: readonly number[];
  /** guess_reveal : identifiant du bon choix. */
  correctChoiceId?: number | null;
};

export type ValidatedAnswer = {
  value: Record<string, unknown>;
  valueNormalized: Record<string, unknown> | null;
  moderationStatus: ModerationStatus;
  /** guess_reveal : résultat à renvoyer au participant. */
  reveal?: { correct: boolean; correctChoiceId: number | null };
};

export class AnswerValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

/**
 * Valide et prépare une réponse pour l'insertion.
 * Lance AnswerValidationError si la valeur ne correspond pas au type de question.
 */
export function validateAnswer(question: QuestionShape, raw: unknown): ValidatedAnswer {
  if (question.type === "media_only") {
    throw new AnswerValidationError("Cette station n'a pas de question.");
  }
  const schema = answerValueSchemas[question.type];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AnswerValidationError(
      "Réponse invalide.",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const allowed = new Set(question.choiceIds);
  const assertChoice = (id: number) => {
    if (!allowed.has(id)) throw new AnswerValidationError("Choix inconnu pour cette question.");
  };

  switch (question.type) {
    case "single_choice": {
      const v = parsed.data as AnswerValue["single_choice"];
      assertChoice(v.choice_id);
      return { value: v, valueNormalized: null, moderationStatus: "not_required" };
    }
    case "multi_choice": {
      const v = parsed.data as AnswerValue["multi_choice"];
      const ids = Array.from(new Set(v.choice_ids));
      ids.forEach(assertChoice);
      const min = question.minChoices ?? 1;
      const max = question.maxChoices ?? ids.length;
      if (ids.length < min || ids.length > max) {
        throw new AnswerValidationError(`Choisis entre ${min} et ${max} réponses.`);
      }
      return { value: { choice_ids: ids }, valueNormalized: null, moderationStatus: "not_required" };
    }
    case "tri_state": {
      const v = parsed.data as AnswerValue["tri_state"];
      assertChoice(v.choice_id);
      const comment = v.comment?.trim() || undefined;
      return {
        value: comment ? { choice_id: v.choice_id, comment } : { choice_id: v.choice_id },
        valueNormalized: comment ? { comment } : null,
        moderationStatus: comment ? "pending" : "not_required",
      };
    }
    case "three_words": {
      const v = parsed.data as AnswerValue["three_words"];
      const words = normalizeWords(v.words);
      if (words.length === 0) throw new AnswerValidationError("Indique au moins un mot.");
      return { value: v, valueNormalized: { words }, moderationStatus: "not_required" };
    }
    case "short_text": {
      const v = parsed.data as AnswerValue["short_text"];
      const max = question.maxLength ?? SHORT_TEXT_DEFAULT_MAX;
      const text = v.text.replace(/\s+/g, " ").trim();
      if (text.length > max) throw new AnswerValidationError(`Maximum ${max} caractères.`);
      return { value: { text }, valueNormalized: { text }, moderationStatus: "pending" };
    }
    case "guess_reveal": {
      const v = parsed.data as AnswerValue["guess_reveal"];
      assertChoice(v.choice_id);
      const correctChoiceId = question.correctChoiceId ?? null;
      const correct = correctChoiceId !== null && v.choice_id === correctChoiceId;
      return {
        value: { choice_id: v.choice_id, correct },
        valueNormalized: null,
        moderationStatus: "not_required",
        reveal: { correct, correctChoiceId },
      };
    }
  }
}

/** Types de questions dont l'agrégat simple peut être montré au participant après sa réponse. */
export const AGGREGATABLE_TYPES: readonly QuestionType[] = [
  "single_choice",
  "multi_choice",
  "tri_state",
  "guess_reveal",
];
