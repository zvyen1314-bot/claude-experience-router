export type ExperienceCategory = "social" | "game" | "reflection";
export type RiskLevel = "low" | "medium";
export type UiSurface = "inline" | "web" | "native";
export type ModuleSignatureStatus = "trusted" | "signed" | "unsigned" | "invalid";

export interface MemoryBoundary {
  reads: string[];
  writes: string[];
}

export interface ExperienceManifest {
  id: string;
  version: string;
  name: string;
  tagline: string;
  description: string;
  category: ExperienceCategory;
  triggers: string[];
  capabilities: string[];
  riskLevel: RiskLevel;
  ui: UiSurface;
  memory: MemoryBoundary;
  status: "ready" | "draft";
  runtime: "controlled-js";
  publisher?: { name: string; url?: string };
  starterPrompt: string;
}

export interface ModuleSignature {
  protocol: "experience-signature/v1";
  algorithm: "ed25519";
  key_id: string;
  public_key: string;
  module_id: string;
  module_version: string;
  manifest_sha256: string;
  entry_sha256: string;
  signature: string;
  signed_at: string;
}

export interface ModuleVersionRecord {
  version: string;
  published_at: string;
  signature_status: ModuleSignatureStatus;
  manifest_sha256: string;
  entry_sha256: string;
}

export interface ExperienceRegistryEntry {
  manifest: ExperienceManifest;
  source: "local";
  signature_status: ModuleSignatureStatus;
  signature?: ModuleSignature;
  versions: ModuleVersionRecord[];
}

export interface ExperienceRecommendation {
  experience: ExperienceManifest;
  matchScore: number;
  reason: string;
}

export interface LaunchResult {
  status: "launched" | "consent_required" | "invalid_consent" | "not_found";
  experienceId: string;
  title: string;
  surface?: UiSurface;
  message: string;
  consentToken?: string;
  consentExpiresAt?: string;
  consentReceiptId?: string;
  consentPolicy?: import("./protocol.js").ConsentPolicy;
  sessionId?: string;
  entrypoint?: string;
  expiresAt?: string;
  nextPrompt?: string;
  demoData?: Record<string, unknown>;
}

export interface ConsentRequest {
  experienceId: string;
  consentReceiptId: string;
  title: string;
  message: string;
  scopes: string[];
  consentToken: string;
  expiresAt: string;
  policy: import("./protocol.js").ConsentPolicy;
  contextFields: string[];
}

export type SessionStatus = "active" | "completed" | "finished" | "expired";

export interface SessionEvent {
  type: "answer" | "hint" | "restart" | "finish";
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface SessionState {
  [key: string]: unknown;
  round: number;
  score: number;
  hintUsed: boolean;
  puzzle?: string;
  hint?: string;
  feedback?: string;
}

export interface ExperienceSession {
  id: string;
  experienceId: string;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  state: SessionState;
  events: SessionEvent[];
  contextEnvelope?: import("./protocol.js").ContextEnvelope;
  consentPolicy: import("./protocol.js").ConsentPolicy;
}

export interface SessionSnapshot {
  id: string;
  experienceId: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;
  state: SessionState;
  eventCount: number;
  entrypoint?: string;
}
