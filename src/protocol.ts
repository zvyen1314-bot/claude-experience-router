import { z } from "zod";
import type { ExperienceManifest } from "./types.js";

export const contextFieldsSchema = z.object({
  intent: z.string().min(1).max(500).optional(),
  interests: z.array(z.string().min(1).max(100)).max(50).optional(),
  available_time_minutes: z.number().int().min(1).max(1440).optional(),
  social_preference: z.enum(["private", "public_topics", "open_to_people"]).optional(),
  selected_excerpts: z.array(z.string().min(1).max(4000)).max(10).optional(),
  game_preferences: z.array(z.string().min(1).max(80)).max(20).optional(),
  locale: z.string().min(2).max(20).optional(),
}).strict();

export const contextEnvelopeSchema = z.object({
  protocol: z.literal("experience-context/v1"),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  source: z.enum(["user-selected", "host-derived"]),
  fields: contextFieldsSchema,
}).strict().superRefine((value, context) => {
  if (value.expires_at && Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expires_at"], message: "expires_at must be later than issued_at" });
  }
});

export const consentPolicySchema = z.object({
  protocol: z.literal("experience-consent/v1"),
  experience_id: z.string().min(1),
  allowed_reads: z.array(z.string().min(1).max(100)).max(30),
  allowed_writes: z.array(z.string().min(1).max(100)).max(30),
  purpose: z.string().min(1).max(500),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  token_portability: z.literal("reissue-only"),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expires_at"], message: "expires_at must be later than issued_at" });
  }
});

export const experienceManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  version: z.string().min(1),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  category: z.enum(["social", "game", "reflection"]),
  triggers: z.array(z.string().min(1).max(80)).max(20),
  capabilities: z.array(z.string().min(1).max(80)).max(20),
  riskLevel: z.enum(["low", "medium"]),
  ui: z.enum(["inline", "web", "native"]),
  memory: z.object({
    reads: z.array(z.string().min(1).max(100)).max(20),
    writes: z.array(z.string().min(1).max(100)).max(20),
  }).strict(),
  status: z.literal("ready"),
  runtime: z.literal("controlled-js"),
  publisher: z.object({ name: z.string().min(1).max(100), url: z.string().url().optional() }).optional(),
  starterPrompt: z.string().min(1).max(500),
}).strict();

export type ContextEnvelope = z.infer<typeof contextEnvelopeSchema>;
export type ConsentPolicy = z.infer<typeof consentPolicySchema>;

export function createContextEnvelope(input: {
  intent?: string;
  interests?: string[];
  availableTimeMinutes?: number;
  socialPreference?: ContextEnvelope["fields"]["social_preference"];
  selectedExcerpts?: string[];
  gamePreferences?: string[];
  locale?: string;
  expiresInMinutes?: number;
  source?: ContextEnvelope["source"];
}): ContextEnvelope {
  const issuedAt = new Date();
  const expiresInMinutes = input.expiresInMinutes ?? 60;
  const expiresAt = new Date(issuedAt.getTime() + expiresInMinutes * 60 * 1000);
  return contextEnvelopeSchema.parse({
    protocol: "experience-context/v1",
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    source: input.source ?? "user-selected",
    fields: {
      intent: input.intent,
      interests: input.interests,
      available_time_minutes: input.availableTimeMinutes,
      social_preference: input.socialPreference,
      selected_excerpts: input.selectedExcerpts,
      game_preferences: input.gamePreferences,
      locale: input.locale,
    },
  });
}

export function buildConsentPolicy(
  manifest: ExperienceManifest,
  requestedScopes: string[] = [],
  now = new Date(),
): ConsentPolicy {
  const requested = new Set(requestedScopes);
  const allReads = manifest.memory.reads;
  const allWrites = manifest.memory.writes;
  const unknown = requestedScopes.filter((scope) => !allReads.includes(scope) && !allWrites.includes(scope));
  if (unknown.length > 0) throw new Error(`Unsupported consent scope: ${unknown.join(", ")}`);

  const allowedReads = requestedScopes.length === 0 ? allReads : allReads.filter((scope) => requested.has(scope));
  const allowedWrites = requestedScopes.length === 0 ? allWrites : allWrites.filter((scope) => requested.has(scope));
  const issuedAt = now.toISOString();
  return consentPolicySchema.parse({
    protocol: "experience-consent/v1",
    experience_id: manifest.id,
    allowed_reads: allowedReads,
    allowed_writes: allowedWrites,
    purpose: `运行体验“${manifest.name}”`,
    issued_at: issuedAt,
    expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    token_portability: "reissue-only",
  });
}

export function scopeContext(
  envelope: ContextEnvelope | undefined,
  policy: ConsentPolicy,
): Record<string, unknown> {
  if (!envelope || (envelope.expires_at && Date.parse(envelope.expires_at) <= Date.now())) return {};
  const fields = envelope.fields as Record<string, unknown>;
  const allowed = new Set(policy.allowed_reads);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (allowed.has(key) && value !== undefined) result[key] = value;
  }
  return result;
}
