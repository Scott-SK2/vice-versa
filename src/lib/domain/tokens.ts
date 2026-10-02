import { randomBytes, randomInt } from "node:crypto";

/** Alphabet sans caractères ambigus (0/O, 1/I/L). */
export const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const QR_TOKEN_LENGTH = 8;
export const SHORT_CODE_LENGTH = 4;
export const PROJECTION_KEY_LENGTH = 24;

export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  return out;
}

export const newQrToken = () => randomCode(QR_TOKEN_LENGTH);
export const newShortCode = () => randomCode(SHORT_CODE_LENGTH);
export const newProjectionKey = () => randomCode(PROJECTION_KEY_LENGTH);

/** Code saisi par le participant : majuscules, caractères parasites retirés (espaces, tirets). */
export function canonicalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidToken(value: string, length: number): boolean {
  return value.length === length && [...value].every((c) => TOKEN_ALPHABET.includes(c));
}

/** Jeton de session participant : v1.<run_id>.<aléa 128 bits en base64url>. */
export function newParticipantToken(runId: string): string {
  return `v1.${runId}.${randomBytes(16).toString("base64url")}`;
}

export function parseParticipantToken(token: string): { runId: string } | null {
  const m = /^v1\.([0-9a-f-]{36})\.[A-Za-z0-9_-]{20,}$/.exec(token);
  return m ? { runId: m[1] } : null;
}
