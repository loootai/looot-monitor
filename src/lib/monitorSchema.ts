import { z } from "zod";
import type { MonitorConfig } from "./types";

const list = z.array(z.string().trim().min(1).max(200)).max(50).default([]);
const httpUrl = z
  .string()
  .trim()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a full http or https URL");

const base = {
  name: z.string().trim().min(1, "Give the monitor a name").max(120),
  ownerTag: z.enum(["mine", "competitor"]),
  competitorName: z.string().trim().max(80).nullish(),
  schedule: z.enum(["hourly", "every_6h", "daily", "weekly"]),
  runHour: z.number().int().min(0).max(23).default(8),
  maxCostPerRunMicros: z.number().int().positive("Set a max cost per run"),
  monthlyCapMicros: z.number().int().positive("Set a monthly cap"),
};

const mention = z.object({
  ...base,
  kind: z.literal("mention"),
  config: z.object({
    query: z.string().trim().min(1, "Enter a query").max(300),
    sources: z.array(z.enum(["news", "x", "reddit", "linkedin"])).min(1, "Pick at least one source"),
    country: z.string().trim().max(5).optional(),
    language: z.string().trim().max(5).optional(),
  }),
});
const serp = z.object({
  ...base,
  kind: z.literal("serp"),
  config: z.object({
    query: z.string().trim().min(1, "Enter a query").max(300),
    country: z.string().trim().max(5).optional(),
    language: z.string().trim().max(5).optional(),
    depth: z.union([z.literal(10), z.literal(20)]).default(10),
    myDomain: z.string().trim().max(120).optional(),
    competitorDomains: list,
  }),
});
const page = z.object({
  ...base,
  kind: z.literal("page"),
  config: z.object({
    url: httpUrl,
    reader: z.enum(["jina-reader", "serper-webpage"]).default("jina-reader"),
    ignore: list,
    watchFor: list,
    screenshotOnChange: z.boolean().default(false),
  }),
});
const reviews = z.object({
  ...base,
  kind: z.literal("reviews"),
  config: z
    .object({
      platform: z.enum(["maps", "appstore"]),
      placeId: z.string().trim().max(200).optional(),
      productId: z.string().trim().max(40).optional(),
      country: z.string().trim().max(5).optional(),
    })
    .refine((c) => (c.platform === "maps" ? Boolean(c.placeId) : /^\d+$/.test(c.productId ?? "")), "Enter the place id, or the numeric App Store product id"),
});

/** A monitor as the form sends it. The config is checked per kind. */
export const monitorInput = z
  .discriminatedUnion("kind", [mention, serp, page, reviews])
  .refine((m) => m.monthlyCapMicros >= m.maxCostPerRunMicros, { message: "The monthly cap cannot be below the cost of one run", path: ["monthlyCapMicros"] });

export type MonitorInput = z.infer<typeof monitorInput> & { config: MonitorConfig };

/** Field errors as { "config.url": "message" }, for showing under each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
