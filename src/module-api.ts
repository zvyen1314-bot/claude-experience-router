import type { ExperienceManifest, SessionEvent, SessionState } from "./types.js";
import type { ConsentPolicy } from "./protocol.js";

export interface ExperienceContext {
  sessionId: string;
  experienceId: string;
  approvedContext: Readonly<Record<string, unknown>>;
  consentPolicy: ConsentPolicy;
  now: string;
}

export interface ExperienceModuleResult {
  state: SessionState;
  status?: "active" | "completed" | "finished";
  message?: string;
}

export interface ExperienceModuleImplementation {
  start(context: ExperienceContext): Promise<SessionState> | SessionState;
  handleEvent(
    context: ExperienceContext,
    state: SessionState,
    event: SessionEvent,
  ): Promise<ExperienceModuleResult> | ExperienceModuleResult;
}

export interface ExperienceModule extends ExperienceModuleImplementation {
  manifest: ExperienceManifest;
}
