# Conversational Experience Router

一个面向对话式 AI 的开放体验层。它把用户说出的「我很无聊」「帮我整理这个想法」「我想找点话题聊」等意图，路由到可以立即开始的体验模块。

Claude 是首个接入的 AI 宿主，未来可扩展到其他支持 MCP 或类似工具协议的宿主。

## 特性

- **意图到体验**：根据当前意图和用户明确授权的兴趣线索，发现并推荐体验模块。
- **显式授权**：启动体验前，为选定模块生成一次性、限时的授权令牌，用户确认后才启动。
- **有状态会话**：每个体验以短会话运行，支持继续、提交事件、结束。
- **可扩展**：新增模块只需放进 `experiences/` 目录，无需改动核心代码。
- **本地优先**：体验网页只监听本机，不依赖账号。

## 内置模块

- `social-pulse`：公共话题与潜在聊天方向推荐（当前为演示数据，真人匹配与私信属后续阶段）。
- `three-minute-mystery`：三分钟文字推理小游戏。
- `thought-garden`：把散乱想法整理成核心想法、假设和下一步。

## 安装与运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run build
```

构建后运行：

```bash
node dist/index.js
```

MCP 服务通过 stdio 与宿主通信，同时启动一个只监听本机的体验网页服务，默认地址为 `http://127.0.0.1:4317`。端口被占用时会自动选择一个可用端口，并通过 `launch_experience` 的 `entrypoint` 字段返回实际地址；也可用环境变量 `EXPERIENCE_PORT` 指定端口。

## 接入 Claude

### Claude Desktop

把下面的条目加入 Claude Desktop 的 MCP 配置文件，并将路径改为本机项目的绝对路径：

```json
{
  "mcpServers": {
    "experience-router": {
      "command": "node",
      "args": [
        "C:\\path\\to\\conversational-experience-router\\dist\\index.js"
      ]
    }
  }
}
```

### Claude Code

```bash
claude mcp add experience-router -- node C:\\path\\to\\conversational-experience-router\\dist\\index.js
```

重启宿主后即可使用。例如对 Claude 说：

> 我很无聊，只有三分钟，给我找点可以马上开始的东西。

## 使用流程

1. `discover_experiences`：根据意图和兴趣线索推荐模块。
2. `prepare_experience_launch`：为选定模块生成一次性、限时的授权令牌。
3. `launch_experience`：用户确认后，用授权令牌启动体验。
4. 通过 `continue_experience` / `submit_experience_event` / `finish_experience` 继续或结束会话。

## 工具列表

| 工具 | 作用 |
| --- | --- |
| `discover_experiences` | 根据当前意图和用户同意提供的兴趣线索推荐模块 |
| `prepare_experience_launch` | 为已选模块生成一次性、限时授权请求 |
| `launch_experience` | 使用用户确认后的授权令牌启动有状态体验 |
| `continue_experience` | 读取当前体验会话状态 |
| `submit_experience_event` | 提交答案、提示、重启或结束事件 |
| `finish_experience` | 结束一个体验会话 |
| `create_experience_draft` | 用安全模板创建私人模块草稿 |

## 开发者：写一个模块

模块不需要修改核心路由器。把一个模块目录放进 `experiences/`，重启服务后会自动加载：

```text
experiences/
  my-module/
    manifest.json
    module.mjs
```

`manifest.json` 描述模块身份、版本、能力、风险和记忆边界；`module.mjs` 导出两个生命周期函数：

```js
export default {
  async start(context) {
    return { round: 1, score: 0 };
  },
  async handleEvent(context, state, event) {
    return { state: { ...state }, status: "active" };
  }
};
```

本地校验模块：

```bash
npm run validate-module -- ./experiences/my-module
```

运行测试：

```bash
npm test
```

当前支持本地 `controlled-js` 模块，适合开发者审阅后导入；远程 GitHub 安装、签名验证与沙盒运行将在后续版本加入，当前不会自动执行陌生仓库中的代码。

## 安全与边界

- 不会自动读取对话历史，也不会在没有调用参数的情况下获取手机或账户数据；宿主只应传入用户明确同意共享的兴趣线索。
- `prepare_experience_launch` 生成的一次性、限时授权令牌是当前原型的用户控制点。令牌绑定具体模块、使用后立即失效；体验会话默认 10 分钟后过期。
- `create_experience_draft` 只生成声明式草稿，不会执行用户上传的原生代码。
- 本仓库是原型，不是完整社交平台，也不是 AI 手机操作系统。真人匹配、账号体系和开放模块市场属后续阶段。

## 项目结构

```text
src/
  catalog.ts     内置模块 manifest 和匹配逻辑
  index.ts       MCP stdio server 和工具注册
  runtime.ts     授权令牌、体验会话和事件状态
  registry.ts    模块注册与发现
  module-api.ts  模块生命周期 API
  types.ts       共享类型
  web.ts         本地体验网页和会话 API
experiences/     内置模块（manifest + module.mjs）
docs/            路线图
```

## License

[MIT](LICENSE)
