function initialState() {
  return {
    round: 1,
    score: 0,
    hintUsed: false,
    prompt: "请提供一段你想整理的文字，或者直接说出刚刚冒出的想法。",
    feedback: "当前模块只会处理你明确选中的内容。"
  };
}

export default {
  async start() {
    return initialState();
  },

  async handleEvent(_context, state, event) {
    if (event.type === "restart") return { state: initialState(), status: "active", message: "已重新开始整理。" };
    if (event.type === "finish") return { state: { ...state, feedback: "想法整理已结束。" }, status: "finished", message: "想法整理已结束。" };
    if (event.type === "answer") {
      const answer = typeof event.payload?.answer === "string" ? event.payload.answer.trim() : "";
      if (!answer) return { state: { ...state, feedback: "请先提供一段你明确选择的内容。" }, status: "active", message: "请先提供一段你明确选择的内容。" };
      return { state: { ...state, feedback: "已收到内容。下一步由宿主 AI 整理成核心想法、假设和最小行动。" }, status: "active", message: "已收到内容。" };
    }
    return { state, status: "active", message: "等待你提供想法。" };
  }
};
