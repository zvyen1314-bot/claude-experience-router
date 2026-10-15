import type { ExperienceManifest, ExperienceRecommendation } from "./types.js";

const categoryTerms: Record<ExperienceManifest["category"], string[]> = {
  social: ["社交", "朋友", "真人", "聊天", "帖子", "话题", "认识", "community", "social"],
  game: ["无聊", "游戏", "玩", "娱乐", "谜题", "挑战", "fun", "game"],
  reflection: ["想法", "整理", "思路", "点子", "记录", "计划", "总结", "idea", "reflect"],
};

export function listRecommendations(
  experiences: ExperienceManifest[],
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

function scoreExperience(experience: ExperienceManifest, input: string): number {
  const haystack = normalize(input);
  const terms = [...experience.triggers, ...categoryTerms[experience.category]];
  const hits = terms.filter((term) => haystack.includes(normalize(term))).length;
  return Math.min(0.99, hits === 0 ? 0.2 : 0.45 + hits * 0.11);
}

function buildReason(experience: ExperienceManifest, input: string): string {
  const matchingTerm = [...experience.triggers, ...categoryTerms[experience.category]].find((term) =>
    normalize(input).includes(normalize(term)),
  );
  return matchingTerm
    ? `你的表达与“${matchingTerm}”有关，${experience.name}可以马上接住这个意图。`
    : `它适合把“${experience.tagline}”变成一次短暂、可控的体验。`;
}

function normalize(input: string): string {
  return input.trim().toLocaleLowerCase();
}
