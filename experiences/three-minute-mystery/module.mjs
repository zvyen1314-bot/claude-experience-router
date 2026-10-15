function initialState() {
  return {
    round: 1,
    score: 0,
    hintUsed: false,
    puzzle: "门外有三盏灯，屋内有三个开关。你只能进屋一次，怎样判断每个开关对应哪盏灯？"
  };
}

function isCorrectAnswer(answer) {
  const normalized = answer.toLocaleLowerCase().replace(/[\\s，。,.！？!?、]/g, "");
  return normalized.includes("开") &&
    normalized.includes("关") &&
    (normalized.includes("热") || normalized.includes("温") || normalized.includes("摸")) &&
    (normalized.includes("灯") || normalized.includes("屋"));
}

export default {
  async start() {
    return initialState();
  },

  async handleEvent(_context, state, event) {
    const next = { ...state };
    if (event.type === "hint") {
      next.hintUsed = true;
      next.hint = "先让一盏灯亮一段时间，再关掉它；进屋后用亮度和温度区分三盏灯。";
      next.feedback = "提示已打开。想好后可以提交你的完整方案。";
      return { state: next, status: "active", message: next.feedback };
    }

    if (event.type === "restart") {
      return { state: initialState(), status: "active", message: "已重新开始。" };
    }

    if (event.type === "finish") {
      next.feedback = "体验已结束，欢迎下次再来。";
      return { state: next, status: "finished", message: next.feedback };
    }

    if (event.type === "answer") {
      const answer = typeof event.payload?.answer === "string" ? event.payload.answer : "";
      if (!answer.trim()) {
        next.feedback = "先写下你的第一步，再提交答案。";
      } else if (isCorrectAnswer(answer)) {
        next.score = next.hintUsed ? 80 : 100;
        next.feedback = `解答正确！本轮得分 ${next.score}。你利用了灯泡的亮度和温度差异。`;
        return { state: next, status: "completed", message: next.feedback };
      } else {
        next.feedback = "思路接近了。记住：你可以利用灯泡的温度，而不只能观察亮灭。";
      }
    }

    return { state: next, status: "active", message: next.feedback };
  }
};
