import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import type { ExperienceManifest, ModuleSignature } from "./types.js";

export const moduleSignatureSchema = z.object({
  protocol: z.literal("experience-signature/v1"),
  algorithm: z.literal("ed25519"),
  key_id: z.string().min(1).max(160),
  public_key: z.string().min(1),
  module_id: z.string().min(1),
  module_version: z.string().min(1),
  manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  entry_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  signed_at: z.string().datetime(),
}).strict();

export function canonicalize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

export function moduleDigests(manifest: ExperienceManifest, entrySource: string): {
  manifestSha256: string;
  entrySha256: string;
} {
  return {
    manifestSha256: sha256(canonicalize(manifest)),
    entrySha256: sha256(entrySource),
  };
}

export function publicKeyFromPrivate(privateKey: KeyObject | string | Buffer): string {
  return createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64url");
}

export function createModuleSignature(
  manifest: ExperienceManifest,
  entrySource: string,
  privateKey: KeyObject | string | Buffer,
  keyId: string,
  signedAt = new Date(),
): ModuleSignature {
  const digests = moduleDigests(manifest, entrySource);
  const base = {
    protocol: "experience-signature/v1" as const,
    algorithm: "ed25519" as const,
    key_id: keyId,
    public_key: publicKeyFromPrivate(privateKey),
    module_id: manifest.id,
    module_version: manifest.version,
    manifest_sha256: digests.manifestSha256,
    entry_sha256: digests.entrySha256,
    signed_at: signedAt.toISOString(),
  };
  const signature = sign(null, Buffer.from(canonicalize(base), "utf8"), privateKey).toString("base64url");
  return moduleSignatureSchema.parse({ ...base, signature });
}

export function verifyModuleSignature(
  manifest: ExperienceManifest,
  entrySource: string,
  signatureInput: unknown,
): ModuleSignature | undefined {
  const parsed = moduleSignatureSchema.safeParse(signatureInput);
  if (!parsed.success) return undefined;
  const signature = parsed.data;
  const digests = moduleDigests(manifest, entrySource);
  if (
    signature.module_id !== manifest.id ||
    signature.module_version !== manifest.version ||
    signature.manifest_sha256 !== digests.manifestSha256 ||
    signature.entry_sha256 !== digests.entrySha256
  ) return undefined;

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(signature.public_key, "base64url"),
      format: "der",
      type: "spki",
    });
    const { signature: _signature, ...signedFields } = signature;
    const valid = verify(
      null,
      Buffer.from(canonicalize(signedFields), "utf8"),
      publicKey,
      Buffer.from(signature.signature, "base64url"),
    );
    return valid ? signature : undefined;
  } catch {
    return undefined;
  }
}

export function isTrustedPublicKey(signature: ModuleSignature, trustedKey?: string): boolean {
  if (!trustedKey) return false;
  return trustedKey === signature.public_key;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
