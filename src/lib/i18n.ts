import type { I18nText } from "@/db/schema/content";
import type { Lang } from "@/lib/content/schema";

export const DEFAULT_LANG: Lang = "fr";

/** Résout un texte multilingue dans la langue demandée, repli sur le français. */
export function t(text: I18nText | null | undefined, lang: string): string {
  if (!text) return "";
  return (text as Record<string, string | undefined>)[lang] ?? text.fr;
}

export function isLang(value: unknown): value is Lang {
  return value === "fr" || value === "nl" || value === "en";
}
