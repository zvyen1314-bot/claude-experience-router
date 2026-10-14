import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { launchExperience, listRecommendations } from "./catalog.js";

const server = new McpServer({
  name: "claude-experience-router",
  version: "0.1.0",
});

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
      "根据用户当前明确表达的意图，推荐可立即开始的体验模块。只有在用户同意后才应调用 launch_experience。",
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
      recommendations: listRecommendations(intent, known_interests ?? [], max_results),
      next_step: "向用户展示推荐并询问是否启动其中一个模块。",
    });
  },
);

server.registerTool(
  "launch_experience",
  {
    title: "Launch an experience",
    description:
      "启动一个已被用户选择的体验模块。confirmed 必须为 true 才会启动；false 只返回需要展示给用户的确认信息。",
    inputSchema: {
      experience_id: z.string().min(1).describe("discover_experiences 返回的模块 id"),
      confirmed: z.boolean().describe("用户是否已明确同意启动该模块"),
    },
  },
  async ({ experience_id, confirmed }) => {
    return jsonText(launchExperience(experience_id, confirmed));
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
      safety: {
        execution: "declarative-only",
        review_required_before_sharing: true,
        user_code_execution: false,
      },
      next_step: "先由用户审阅能力、记忆范围和风险等级，再接入签名模块或沙盒运行时。",
    };
    return jsonText(draft);
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
