export type ExperienceCategory = "social" | "game" | "reflection";
export type RiskLevel = "low" | "medium";
export type UiSurface = "inline" | "web" | "native";

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
  sessionId?: string;
  entrypoint?: string;
  expiresAt?: string;
  nextPrompt?: string;
  demoData?: Record<string, unknown>;
}

export interface ConsentRequest {
  experienceId: string;
  title: string;
  message: string;
  scopes: string[];
  consentToken: string;
  expiresAt: string;
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
