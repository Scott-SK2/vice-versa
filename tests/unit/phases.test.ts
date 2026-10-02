import { describe, expect, it } from "vitest";
import { canTransition, isWriteAllowed, nextPhase, PHASES, scanIsReadOnly } from "@/lib/domain/phases";

describe("phases", () => {
  it("enchaîne les 6 phases dans l'ordre du cahier", () => {
    expect(PHASES).toEqual(["accueil", "parcours", "apres", "discussion", "trace", "cloture"]);
    expect(nextPhase("accueil")).toBe("parcours");
    expect(nextPhase("cloture")).toBeNull();
  });

  it("autorise une phase en avant, refuse un saut", () => {
    expect(canTransition("accueil", "parcours")).toEqual({ ok: true });
    expect(canTransition("accueil", "apres")).toEqual({ ok: false, reason: "skip_forward" });
    expect(canTransition("parcours", "parcours")).toEqual({ ok: false, reason: "same" });
  });

  it("exige une confirmation pour revenir en arrière", () => {
    expect(canTransition("apres", "parcours")).toEqual({ ok: false, reason: "backwards_needs_confirm" });
    expect(canTransition("apres", "parcours", { confirmBackwards: true })).toEqual({ ok: true });
    expect(canTransition("cloture", "accueil", { confirmBackwards: true })).toEqual({ ok: true });
  });

  it("applique la matrice des écritures", () => {
    expect(isWriteAllowed("avant", "accueil")).toBe(true);
    expect(isWriteAllowed("avant", "discussion")).toBe(false);
    expect(isWriteAllowed("station", "accueil")).toBe(false);
    expect(isWriteAllowed("station", "apres")).toBe(true);
    expect(isWriteAllowed("apres", "parcours")).toBe(false);
    expect(isWriteAllowed("apres", "trace")).toBe(true);
    expect(isWriteAllowed("trace", "apres")).toBe(false);
    expect(isWriteAllowed("trace", "trace")).toBe(true);
    expect(isWriteAllowed("create_session", "cloture")).toBe(false);
    expect(scanIsReadOnly("discussion")).toBe(true);
    expect(scanIsReadOnly("parcours")).toBe(false);
  });
});
