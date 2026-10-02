/**
 * Agrégats par question pour une séance : montrés au participant après sa réponse,
 * au tableau de bord, en projection et figés dans runs.summary.
 */
import { and, eq, sql } from "drizzle-orm";
import { type Db, schema } from "@/db/client";
import type { Catalog, QuestionRow } from "@/lib/content/catalog";
import { t } from "@/lib/i18n";

const { answers } = schema;

/** En dessous de ce nombre de réponses, seul le total est montré au participant. */
export const PARTICIPANT_AGGREGATE_MIN = 5;

export type ChoiceCount = { key: string; label: string; count: number; percent: number };

export type Aggregate =
  | { type: "single_choice" | "tri_state" | "multi_choice"; total: number; choices: ChoiceCount[] }
  | { type: "guess_reveal"; total: number; correct: number; correct_percent: number; choices: ChoiceCount[] }
  | { type: "three_words"; total: number; words: { word: string; count: number }[] }
  | { type: "short_text"; total: number; approved: number }
  | { type: "media_only"; total: 0 };

export async function aggregateQuestion(
  db: Db,
  catalog: Catalog,
  runId: string,
  question: QuestionRow,
  lang = "fr",
): Promise<Aggregate> {
  const where = and(eq(answers.runId, runId), eq(answers.questionId, question.id));
  const choicesOf = catalog.choicesByQuestion.get(question.id) ?? [];

  const withCounts = (counts: Map<number, number>, total: number): ChoiceCount[] =>
    choicesOf.map((c) => {
      const count = counts.get(c.id) ?? 0;
      return { key: c.key, label: t(c.labelI18n, lang), count, percent: total ? Math.round((count / total) * 100) : 0 };
    });

  switch (question.type) {
    case "single_choice":
    case "tri_state":
    case "guess_reveal": {
      const rows = await db
        .select({ choiceId: sql<string>`${answers.value}->>'choice_id'`, count: sql<number>`count(*)::int` })
        .from(answers)
        .where(where)
        .groupBy(sql`${answers.value}->>'choice_id'`);
      const counts = new Map(rows.map((r) => [Number(r.choiceId), r.count]));
      const total = rows.reduce((s, r) => s + r.count, 0);
      const list = withCounts(counts, total);
      if (question.type === "guess_reveal") {
        const correctId = choicesOf.find((c) => c.isCorrect)?.id;
        const correct = correctId ? (counts.get(correctId) ?? 0) : 0;
        return { type: "guess_reveal", total, correct, correct_percent: total ? Math.round((correct / total) * 100) : 0, choices: list };
      }
      return { type: question.type, total, choices: list };
    }
    case "multi_choice": {
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(answers).where(where);
      const rows = await db
        .select({
          choiceId: sql<string>`jsonb_array_elements_text(${answers.value}->'choice_ids')`,
          count: sql<number>`count(*)::int`,
        })
        .from(answers)
        .where(where)
        .groupBy(sql`1`);
      const counts = new Map(rows.map((r) => [Number(r.choiceId), r.count]));
      return { type: "multi_choice", total, choices: withCounts(counts, total) };
    }
    case "three_words": {
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(answers).where(where);
      const rows = await db
        .select({
          word: sql<string>`jsonb_array_elements_text(${answers.valueNormalized}->'words')`,
          count: sql<number>`count(*)::int`,
        })
        .from(answers)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`2 desc, 1 asc`)
        .limit(50);
      return { type: "three_words", total, words: rows.map((r) => ({ word: r.word, count: r.count })) };
    }
    case "short_text": {
      const [row] = await db
        .select({
          total: sql<number>`count(*)::int`,
          approved: sql<number>`count(*) filter (where ${answers.moderationStatus} = 'approved')::int`,
        })
        .from(answers)
        .where(where);
      return { type: "short_text", total: row.total, approved: row.approved };
    }
    case "media_only":
      return { type: "media_only", total: 0 };
  }
}

/** Textes validés d'une question (projection, résumé), sans identifiant de session. */
export async function approvedTexts(db: Db, runId: string, questionId: number, limit = 200): Promise<string[]> {
  const rows = await db
    .select({ text: sql<string>`coalesce(${answers.valueNormalized}->>'text', ${answers.valueNormalized}->>'comment')` })
    .from(answers)
    .where(and(eq(answers.runId, runId), eq(answers.questionId, questionId), eq(answers.moderationStatus, "approved")))
    .orderBy(sql`${answers.moderatedAt} desc nulls last`)
    .limit(limit);
  return rows.map((r) => r.text).filter(Boolean);
}
