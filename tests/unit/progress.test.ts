import { describe, expect, it } from "vitest";
import { computeProgress, isMediaOnlyCompleted } from "@/lib/domain/progress";

const s = (code: string, state: "locked" | "in_progress" | "completed", counts = true) => ({
  code,
  countsInProgress: counts,
  state,
});

describe("progression", () => {
  it("compte 3/8 = 38 % et ignore A et Z", () => {
    const r = computeProgress(
      [s("A", "completed", false), s("1", "completed"), s("2", "completed"), s("3", "completed"), s("4", "in_progress"), s("Z", "completed", false)],
      8,
    );
    expect(r).toEqual({ completed: 3, required: 8, percent: 38 });
  });

  it("donne 0 % sans station terminée et 100 % à 8/8", () => {
    expect(computeProgress([], 8).percent).toBe(0);
    const all = Array.from({ length: 8 }, (_, i) => s(String(i + 1), "completed"));
    expect(computeProgress(all, 8).percent).toBe(100);
  });

  it("termine une station media_only à 80 %", () => {
    expect(isMediaOnlyCompleted(0.79)).toBe(false);
    expect(isMediaOnlyCompleted(0.8)).toBe(true);
  });
});
