import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ModuleRegistry } from "./registry.js";
import type { ExperienceContext, ExperienceModule } from "./module-api.js";
import type {
  ConsentRequest,
  ExperienceSession,
  LaunchResult,
  SessionEvent,
  SessionSnapshot,
  SessionState,
} from "./types.js";

const CONSENT_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_EVENTS_PER_SESSION = 50;

interface StoredConsent {
  tokenHash: string;
  experienceId: string;
  expiresAt: number;
  used: boolean;
}

export interface SessionActionResult {
  status: "ok" | "invalid" | "expired" | "finished";
  message: string;
  snapshot?: SessionSnapshot;
}

export class ExperienceRuntime {
  private readonly consents = new Map<string, StoredConsent>();
  private readonly sessions = new Map<string, ExperienceSession>();
  private baseUrl = "http://127.0.0.1:4317";

  constructor(private readonly registry: ModuleRegistry) {}

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  prepareLaunch(experienceId: string): ConsentRequest | undefined {
    const experience = this.registry.get(experienceId)?.manifest;
    if (!experience) return undefined;

    this.prune();
    const now = Date.now();
    const expiresAt = now + CONSENT_TTL_MS;
    const token = randomBytes(24).toString("base64url");
    this.consents.set(hashToken(token), {
      tokenHash: hashToken(token),
      experienceId,
      expiresAt,
      used: false,
    });

    return {
      experienceId,
      title: experience.name,
      message: `启动“${experience.name}”前，请确认允许它读取：${experience.memory.reads.join("、") || "无额外数据"}；写入：${experience.memory.writes.join("、") || "无"}。授权将在 5 分钟后失效，且只能使用一次。`,
      scopes: [...experience.memory.reads, ...experience.memory.writes],
      consentToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async launch(experienceId: string, consentToken: string): Promise<LaunchResult> {
    const module = this.registry.get(experienceId);
    if (!module) {
      return {
        status: "not_found",
        experienceId,
        title: "未找到体验模块",
        message: `目录中没有 id 为“${experienceId}”的模块。`,
      };
    }

    const consent = this.consents.get(hashToken(consentToken));
    const valid = consent &&
      !consent.used &&
      consent.experienceId === experienceId &&
      consent.expiresAt > Date.now() &&
      consent.tokenHash === hashToken(consentToken);

    if (!valid) {
      return {
        status: "invalid_consent",
        experienceId,
        title: module.manifest.name,
        message: "授权令牌无效、已过期、已使用，或与当前模块不匹配。请重新请求授权。",
      };
    }

    consent.used = true;
    const session = await this.createSession(module);
    return {
      status: "launched",
      experienceId,
      title: module.manifest.name,
      surface: module.manifest.ui,
      message: `已启动“${module.manifest.name}”。体验会话将在 10 分钟后失效。`,
      sessionId: session.id,
      entrypoint: `${this.baseUrl}/experiences/${experienceId}?session_id=${encodeURIComponent(session.id)}`,
      expiresAt: session.expiresAt,
      nextPrompt: module.manifest.starterPrompt,
      demoData: { mode: "session", state: session.state },
    };
  }

  getSnapshot(sessionId: string): SessionSnapshot | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    this.expireIfNeeded(session);
    const experience = this.registry.get(session.experienceId)?.manifest;
    return {
      id: session.id,
      experienceId: session.experienceId,
      title: experience?.name ?? session.experienceId,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      state: { ...session.state },
      eventCount: session.events.length,
      entrypoint: `${this.baseUrl}/experiences/${session.experienceId}?session_id=${encodeURIComponent(session.id)}`,
    };
  }

  async submitEvent(
    sessionId: string,
    type: SessionEvent["type"],
    payload: Record<string, unknown> = {},
  ): Promise<SessionActionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return { status: "invalid", message: "找不到这个体验会话。" };
    this.expireIfNeeded(session);
    if (session.status === "expired") return { status: "expired", message: "这个体验会话已过期，请重新启动。" };
    if (session.status !== "active") return { status: "finished", message: "这个体验会话已经结束。", snapshot: this.getSnapshot(sessionId) };
    if (session.events.length >= MAX_EVENTS_PER_SESSION) {
      return { status: "invalid", message: "这个体验会话的事件数量已达到上限。" };
    }

    const module = this.registry.get(session.experienceId);
    if (!module) return { status: "invalid", message: "体验模块已从本地注册表中移除。" };
    const event: SessionEvent = { type, payload: sanitizePayload(payload), createdAt: new Date().toISOString() };
    session.events.push(event);

    try {
      const result = await module.handleEvent(this.context(session), session.state, event);
      session.state = normalizeState(result.state);
      if (result.status) session.status = result.status;
      return {
        status: "ok",
        message: result.message ?? session.state.feedback ?? "状态已更新。",
        snapshot: this.getSnapshot(sessionId),
      };
    } catch {
      return { status: "invalid", message: "体验模块处理事件时发生错误，请结束当前会话后重试。", snapshot: this.getSnapshot(sessionId) };
    }
  }

  async finish(sessionId: string): Promise<SessionActionResult> {
    return this.submitEvent(sessionId, "finish");
  }

  private async createSession(module: ExperienceModule): Promise<ExperienceSession> {
    const now = Date.now();
    const id = `session-${randomUUID().slice(0, 8)}`;
    const context: ExperienceContext = {
      sessionId: id,
      experienceId: module.manifest.id,
      approvedContext: {},
      now: new Date(now).toISOString(),
    };
    const state = normalizeState(await module.start(context));
    const session: ExperienceSession = {
      id,
      experienceId: module.manifest.id,
      status: "active",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      state,
      events: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  private context(session: ExperienceSession): ExperienceContext {
    return {
      sessionId: session.id,
      experienceId: session.experienceId,
      approvedContext: {},
      now: new Date().toISOString(),
    };
  }

  private expireIfNeeded(session: ExperienceSession): void {
    if (session.status === "active" && Date.parse(session.expiresAt) <= Date.now()) {
      session.status = "expired";
      session.state.feedback = "这个体验会话已过期。";
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [tokenHash, consent] of this.consents) {
      if (consent.used || consent.expiresAt <= now) this.consents.delete(tokenHash);
    }
    for (const [id, session] of this.sessions) {
      this.expireIfNeeded(session);
      if (session.status === "expired" && Date.parse(session.expiresAt) + SESSION_TTL_MS <= now) this.sessions.delete(id);
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeState(state: SessionState): SessionState {
  return {
    ...state,
    round: typeof state.round === "number" ? state.round : 1,
    score: typeof state.score === "number" ? state.score : 0,
    hintUsed: state.hintUsed === true,
  };
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload).slice(0, 10)) {
    if (typeof value === "string") safe[key] = value.slice(0, 2000);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
  }
  return safe;
}
