import { z } from "zod";

/** Corps de POST /api/scan et POST /api/stations/{code}/scan. */
export const scanSchema = z
  .object({ token: z.string().min(4).max(32).optional(), short_code: z.string().min(3).max(8).optional() })
  .refine((b) => Boolean(b.token) !== Boolean(b.short_code), { message: "token ou short_code, pas les deux" });
