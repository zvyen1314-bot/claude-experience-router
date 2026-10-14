export type ExperienceCategory = "social" | "game" | "reflection";
export type RiskLevel = "low" | "medium";
export type UiSurface = "inline" | "web" | "native";

export interface MemoryBoundary {
  reads: string[];
  writes: string[];
}

export interface ExperienceManifest {
  id: string;
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
  starterPrompt: string;
}

export interface ExperienceRecommendation {
  experience: ExperienceManifest;
  matchScore: number;
  reason: string;
}

export interface LaunchResult {
  status: "launched" | "confirmation_required" | "not_found";
  experienceId: string;
  title: string;
  surface?: UiSurface;
  message: string;
  nextPrompt?: string;
  demoData?: Record<string, unknown>;
}
