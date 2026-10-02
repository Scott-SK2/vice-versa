import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import nl from "../../../../messages/nl.json";

export type Lang = "fr" | "nl" | "en";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "nl", label: "Nederlands" },
  { code: "en", label: "English" },
];
type Key = keyof typeof fr;
const dict: Record<Lang, Record<string, string>> = { fr, nl, en };

export function translate(lang: string, key: Key, vars: Record<string, string | number> = {}): string {
  const table = dict[(lang as Lang) in dict ? (lang as Lang) : "fr"];
  let s = table[key] ?? fr[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export type TFn = (key: Key, vars?: Record<string, string | number>) => string;
