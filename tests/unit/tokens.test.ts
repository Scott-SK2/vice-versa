import { describe, expect, it } from "vitest";
import {
  canonicalizeCode,
  isValidToken,
  newParticipantToken,
  newQrToken,
  newShortCode,
  parseParticipantToken,
  TOKEN_ALPHABET,
} from "@/lib/domain/tokens";

describe("jetons", () => {
  it("n'utilise jamais de caractères ambigus", () => {
    expect(TOKEN_ALPHABET).not.toMatch(/[0OIL1]/);
    for (let i = 0; i < 50; i++) {
      expect(isValidToken(newQrToken(), 8)).toBe(true);
      expect(isValidToken(newShortCode(), 4)).toBe(true);
    }
  });

  it("canonise un code saisi", () => {
    expect(canonicalizeCode(" 7q2m ")).toBe("7Q2M");
    expect(canonicalizeCode("7Q-2M")).toBe("7Q2M");
  });

  it("encode l'identifiant de séance dans le jeton participant", () => {
    const runId = "0a3f1c2e-7b8d-4e9f-a1b2-c3d4e5f60718";
    const t = newParticipantToken(runId);
    expect(parseParticipantToken(t)).toEqual({ runId });
    expect(parseParticipantToken("n'importe quoi")).toBeNull();
  });
});
