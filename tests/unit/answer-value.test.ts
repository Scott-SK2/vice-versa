import { describe, expect, it } from "vitest";
import { AnswerValidationError, validateAnswer, type QuestionShape } from "@/lib/domain/answer-value";

const q = (over: Partial<QuestionShape>): QuestionShape => ({
  type: "single_choice",
  minChoices: null,
  maxChoices: null,
  maxLength: null,
  choiceIds: [1, 2, 3],
  ...over,
});

describe("validation des réponses", () => {
  it("single_choice : choix connu uniquement", () => {
    expect(validateAnswer(q({}), { choice_id: 2 }).moderationStatus).toBe("not_required");
    expect(() => validateAnswer(q({}), { choice_id: 9 })).toThrow(AnswerValidationError);
    expect(() => validateAnswer(q({}), { choice_ids: [1] })).toThrow(AnswerValidationError);
  });

  it("multi_choice : respecte min et max, dédoublonne", () => {
    const shape = q({ type: "multi_choice", minChoices: 2, maxChoices: 2 });
    expect(validateAnswer(shape, { choice_ids: [1, 3, 3] }).value).toEqual({ choice_ids: [1, 3] });
    expect(() => validateAnswer(shape, { choice_ids: [1] })).toThrow(/entre 2 et 2/);
    expect(() => validateAnswer(shape, { choice_ids: [1, 2, 3] })).toThrow(AnswerValidationError);
  });

  it("tri_state : commentaire → modération", () => {
    const shape = q({ type: "tri_state" });
    expect(validateAnswer(shape, { choice_id: 3 }).moderationStatus).toBe("not_required");
    const r = validateAnswer(shape, { choice_id: 3, comment: "  Parce que… " });
    expect(r.moderationStatus).toBe("pending");
    expect(r.value).toEqual({ choice_id: 3, comment: "Parce que…" });
  });

  it("three_words : exactement 3 mots, normalisés", () => {
    const shape = q({ type: "three_words", choiceIds: [] });
    const r = validateAnswer(shape, { words: ["Chaleur", "Famille", "famille"] });
    expect(r.valueNormalized).toEqual({ words: ["chaleur", "famille"] });
    expect(() => validateAnswer(shape, { words: ["a", "b"] })).toThrow(AnswerValidationError);
  });

  it("short_text : borne la longueur, toujours en attente de modération", () => {
    const shape = q({ type: "short_text", maxLength: 10, choiceIds: [] });
    expect(validateAnswer(shape, { text: "Bonjour  à " }).value).toEqual({ text: "Bonjour à" });
    expect(() => validateAnswer(shape, { text: "Beaucoup trop long" })).toThrow(/Maximum 10/);
    expect(validateAnswer(shape, { text: "ok" }).moderationStatus).toBe("pending");
  });

  it("guess_reveal : recalcule correct côté serveur", () => {
    const shape = q({ type: "guess_reveal", correctChoiceId: 1 });
    const r = validateAnswer(shape, { choice_id: 2 });
    expect(r.value).toEqual({ choice_id: 2, correct: false });
    expect(r.reveal).toEqual({ correct: false, correctChoiceId: 1 });
    expect(validateAnswer(shape, { choice_id: 1 }).reveal?.correct).toBe(true);
  });

  it("media_only : pas de réponse possible", () => {
    expect(() => validateAnswer(q({ type: "media_only", choiceIds: [] }), {})).toThrow(AnswerValidationError);
  });
});
