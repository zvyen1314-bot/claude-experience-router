import type {
  ExperienceCategory,
  ExperienceManifest,
  ExperienceRecommendation,
  LaunchResult,
} from "./types.js";

const experiences: ExperienceManifest[] = [
  {
    id: "social-pulse",
    name: "Social Pulse",
    tagline: "从你此刻的兴趣出发，找到值得认识的人和话题",
    description: "根据当前对话中明确表达的兴趣，推荐公开帖子、讨论主题和可能聊得来的人。",
    category: "social",
    triggers: ["想找真人社交", "想认识新朋友", "想看看别人都在聊什么", "推荐帖子"],
    capabilities: ["topic_recommendation", "people_discovery", "private_messaging"],
    riskLevel: "medium",
    ui: "web",
    memory: { reads: ["user-approved interests"], writes: ["saved topics", "conversation preferences"] },
    status: "ready",
    starterPrompt: "先展示 3 个与你此刻兴趣相近的公开话题，并说明每个话题适合怎样开始聊天。",
  },
  {
    id: "three-minute-mystery",
    name: "Three Minute Mystery",
    tagline: "三分钟，玩一个刚好适合现在的小游戏",
    description: "根据心情和可用时间生成一个轻量的文字推理小游戏，适合在当前对话里立即开始。",
    category: "game",
    triggers: ["我很无聊", "想玩个小游戏", "来点有趣的", "只有几分钟"],
    capabilities: ["text_game", "adaptive_difficulty", "session_scoring"],
    riskLevel: "low",
    ui: "inline",
    memory: { reads: ["available time", "game preferences"], writes: ["game score"] },
    status: "ready",
    starterPrompt: "给我一个 3 分钟内能完成的文字推理谜题，只展示第一条线索，等我回答后再推进。",
  },
  {
    id: "thought-garden",
    name: "Thought Garden",
    tagline: "把刚刚冒出的想法整理成下一步",
    description: "将散乱的想法整理为主题、假设和可执行的下一步，保留用户对内容的控制权。",
    category: "reflection",
    triggers: ["帮我整理想法", "我有个模糊的点子", "想理清思路", "把这些记录下来"],
    capabilities: ["idea_clustering", "reflection", "next_step_generation"],
    riskLevel: "low",
    ui: "inline",
    memory: { reads: ["user-selected conversation excerpts"], writes: ["user-approved notes"] },
    status: "ready",
    starterPrompt: "把我刚才说的内容整理成：核心想法、尚未确认的假设、一个最小下一步。先让我确认再保存。",
  },
];

const categoryTerms: Record<ExperienceCategory, string[]> = {
  social: ["社交", "朋友", "真人", "聊天", "帖子", "话题", "认识", "community", "social"],
  game: ["无聊", "游戏", "玩", "娱乐", "谜题", "挑战", "fun", "game"],
  reflection: ["想法", "整理", "思路", "点子", "记录", "计划", "总结", "idea", "reflect"],
};

function normalize(input: string): string {
  return input.trim().toLocaleLowerCase();
}

function scoreExperience(experience: ExperienceManifest, input: string): number {
  const haystack = normalize(input);
  const terms = [...experience.triggers, ...categoryTerms[experience.category]];
  const hits = terms.filter((term) => haystack.includes(normalize(term))).length;
  return Math.min(0.99, hits === 0 ? 0.2 : 0.45 + hits * 0.11);
}

export function listRecommendations(
  intent: string,
  knownInterests: string[] = [],
  maxResults = 3,
): ExperienceRecommendation[] {
  const signalText = [intent, ...knownInterests].join(" ");
  return experiences
    .map((experience) => ({
      experience,
      matchScore: scoreExperience(experience, signalText),
      reason: buildReason(experience, signalText),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxResults);
}

function buildReason(experience: ExperienceManifest, input: string): string {
  const matchingTerm = [...experience.triggers, ...categoryTerms[experience.category]].find((term) =>
    normalize(input).includes(normalize(term)),
  );
  return matchingTerm
    ? `你的表达与“${matchingTerm}”有关，${experience.name}可以马上接住这个意图。`
    : `它适合把“${experience.tagline}”变成一次短暂、可控的体验。`;
}

export function getExperience(id: string): ExperienceManifest | undefined {
  return experiences.find((experience) => experience.id === id);
}

export function launchExperience(id: string, confirmed: boolean): LaunchResult {
  const experience = getExperience(id);
  if (!experience) {
    return {
      status: "not_found",
      experienceId: id,
      title: "未找到体验模块",
      message: `目录中没有 id 为“${id}”的模块。`,
    };
  }

  if (!confirmed) {
    return {
      status: "confirmation_required",
      experienceId: id,
      title: experience.name,
      surface: experience.ui,
      message: `启动“${experience.name}”前需要你的明确确认。它会使用：${experience.memory.reads.join("、")}。`,
    };
  }

  const result: LaunchResult = {
    status: "launched",
    experienceId: id,
    title: experience.name,
    surface: experience.ui,
    message: `已启动“${experience.name}”。这是首版的可运行体验入口，后续可以接入真实服务或独立前端。`,
    nextPrompt: experience.starterPrompt,
  };

  if (id === "social-pulse") {
    result.demoData = {
      mode: "demo",
      notice: "当前返回演示推荐，尚未连接真实用户数据或私信服务。",
      topics: [
        { title: "最近让你反复想到的一个问题", reason: "适合从真实想法开始，而不是从标签开始。" },
        { title: "三分钟小游戏设计", reason: "适合寻找一起试玩法的人。" },
        { title: "AI 如何成为个人生活入口", reason: "与你当前正在思考的方向相近。" },
      ],
    };
  }

  if (id === "three-minute-mystery") {
    result.demoData = {
      mode: "demo",
      round: 1,
      puzzle: "门外有三盏灯，屋内有三个开关。你只能进屋一次，怎样判断每个开关对应哪盏灯？",
      instruction: "先说说你的第一步，系统会根据你的回答继续游戏。",
    };
  }

  return result;
}

export function allExperiences(): ExperienceManifest[] {
  return experiences.map((experience) => ({ ...experience }));
}
