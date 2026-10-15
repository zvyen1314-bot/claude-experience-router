import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listRecommendations } from "./catalog.js";
import { ExperienceRuntime } from "./runtime.js";
import { ModuleRegistry, defaultModulesDirectory } from "./registry.js";
import { startExperienceWebServer } from "./web.js";

const server = new McpServer({
  name: "conversational-experience-router",
  version: "0.1.0",
});
const registry = new ModuleRegistry();
const runtime = new ExperienceRuntime(registry);

function jsonText(value: unknown): { content: [{ type: "text"; text: string }] } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

server.registerTool(
  "discover_experiences",
  {
    title: "Discover experiences",
    description:
      "根据用户当前明确表达的意图，推荐可立即开始的体验模块。宿主应先准备授权并获得用户同意，再启动体验。",
    inputSchema: {
      intent: z.string().min(1).describe("用户当前表达的需求或心情"),
      known_interests: z
        .array(z.string())
        .max(12)
        .optional()
        .describe("用户已经明确同意传给插件的兴趣线索"),
      max_results: z.number().int().min(1).max(5).optional().default(3),
    },
  },
  async ({ intent, known_interests, max_results }) => {
    return jsonText({
      kind: "experience_recommendations",
      privacy: "仅使用本次调用中传入的意图和用户已同意的兴趣线索。",
      recommendations: listRecommendations(registry.list(), intent, known_interests ?? [], max_results),
      next_step: "向用户展示推荐并询问是否启动其中一个模块。",
    });
  },
);

server.registerTool(
  "prepare_experience_launch",
  {
    title: "Prepare an experience launch",
    description:
      "为用户选择的体验模块生成一次性、限时授权请求。宿主应先向用户展示权限范围，得到明确同意后再调用 launch_experience。",
    inputSchema: {
      experience_id: z.string().min(1).describe("discover_experiences 返回的模块 id"),
    },
  },
  async ({ experience_id }) => {
    const request = runtime.prepareLaunch(experience_id);
    return jsonText(request
      ? { status: "consent_required", ...request }
      : { status: "not_found", experience_id, message: "找不到这个体验模块。" });
  },
);

server.registerTool(
  "launch_experience",
  {
    title: "Launch an experience",
    description:
      "使用 prepare_experience_launch 返回的一次性授权令牌启动体验，并创建一个有状态的本地会话。",
    inputSchema: {
      experience_id: z.string().min(1).describe("准备授权时使用的模块 id"),
      consent_token: z.string().min(1).describe("用户确认后允许使用的授权令牌"),
    },
  },
  async ({ experience_id, consent_token }) => {
    return jsonText(await runtime.launch(experience_id, consent_token));
  },
);

server.registerTool(
  "continue_experience",
  {
    title: "Continue an experience",
    description: "读取体验会话的当前状态，用于在对话或网页之间继续一次体验。",
    inputSchema: {
      session_id: z.string().min(1).describe("launch_experience 返回的会话 id"),
    },
  },
  async ({ session_id }) => {
    const snapshot = runtime.getSnapshot(session_id);
    return jsonText(snapshot
      ? { status: "ok", snapshot }
      : { status: "not_found", message: "找不到这个体验会话。" });
  },
);

server.registerTool(
  "submit_experience_event",
  {
    title: "Submit an experience event",
    description: "向有状态的体验提交一个受限事件，例如答案、提示请求或重新开始。",
    inputSchema: {
      session_id: z.string().min(1),
      event_type: z.enum(["answer", "hint", "restart", "finish"]),
      payload: z.record(z.unknown()).optional(),
    },
  },
  async ({ session_id, event_type, payload }) => {
    return jsonText(await runtime.submitEvent(session_id, event_type, payload ?? {}));
  },
);

server.registerTool(
  "finish_experience",
  {
    title: "Finish an experience",
    description: "结束一个体验会话并返回最终状态。",
    inputSchema: {
      session_id: z.string().min(1),
    },
  },
  async ({ session_id }) => {
    return jsonText(await runtime.finish(session_id));
  },
);

server.registerTool(
  "create_experience_draft",
  {
    title: "Create an experience draft",
    description:
      "用安全的声明式模板生成一个私人体验草稿。草稿只描述能力和边界，不执行用户提供的代码。",
    inputSchema: {
      name: z.string().min(2).max(60).describe("体验名称"),
      purpose: z.string().min(8).max(300).describe("体验要帮助用户完成什么"),
      category: z.enum(["social", "game", "reflection"]).describe("体验类别"),
      interaction_style: z
        .enum(["inline", "web", "native"])
        .describe("体验希望以哪种界面承载"),
      requested_capabilities: z
        .array(z.string().min(1).max(50))
        .max(8)
        .default([])
        .describe("希望使用的能力名称，而不是可执行代码"),
    },
  },
  async ({ name, purpose, category, interaction_style, requested_capabilities }) => {
    const id = `draft-${randomUUID().slice(0, 8)}`;
    const draft = {
      id,
      version: "0.1.0",
      name,
      tagline: purpose,
      description: purpose,
      category,
      triggers: [],
      capabilities: requested_capabilities,
      riskLevel: "low",
      ui: interaction_style,
      memory: { reads: [], writes: [] },
      status: "draft",
      runtime: "controlled-js",
      publisher: { name: "local-draft" },
      safety: {
        execution: "declarative-only",
        review_required_before_sharing: true,
        user_code_execution: false,
      },
      module_template: {
        entry: "module.mjs",
        exports: ["start(context)", "handleEvent(context, state, event)"],
      },
      next_step: "先由用户审阅能力、记忆范围和风险等级，再接入签名模块或沙盒运行时。",
    };
    return jsonText(draft);
  },
);

async function main(): Promise<void> {
  const modulesDirectory = process.env.EXPERIENCE_MODULES_DIR ?? defaultModulesDirectory();
  await registry.loadFromDirectory(modulesDirectory);
  const requestedPort = Number.parseInt(process.env.EXPERIENCE_PORT ?? "4317", 10);
  const web = await startExperienceWebServer(runtime, Number.isFinite(requestedPort) ? requestedPort : 4317);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const close = () => {
    web.server.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
