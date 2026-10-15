function initialState() {
  return {
    round: 1,
    score: 0,
    hintUsed: false,
    topics: [
      { title: "最近让你反复想到的一个问题", reason: "适合从真实想法开始，而不是从标签开始。" },
      { title: "三分钟小游戏设计", reason: "适合寻找一起试玩法的人。" },
      { title: "AI 如何成为个人生活入口", reason: "与你当前正在思考的方向相近。" }
    ],
    feedback: "当前返回演示推荐，尚未连接真实用户数据或私信服务。"
  };
}

export default {
  async start() {
    return initialState();
  },

  async handleEvent(_context, state, event) {
    if (event.type === "restart") return { state: initialState(), status: "active", message: "已重新生成话题。" };
    if (event.type === "finish") return { state: { ...state, feedback: "话题浏览已结束。" }, status: "finished", message: "话题浏览已结束。" };
    return { state: { ...state, feedback: "当前演示模块只提供公开话题推荐。" }, status: "active", message: "当前演示模块只提供公开话题推荐。" };
  }
};
