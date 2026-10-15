# Local Experience Modules

Each child directory is a locally installed experience module. The router loads `manifest.json` and `module.mjs` at startup; no core source file needs to be edited.

```text
experiences/
  your-module/
    manifest.json
    module.mjs
    README.md
```

`module.mjs` exports a default object with two functions:

```js
export default {
  async start(context) {
    return { round: 1, score: 0, hintUsed: false };
  },

  async handleEvent(context, state, event) {
    return {
      state: { ...state, feedback: "状态已更新" },
      status: "active",
      message: "状态已更新",
    };
  },
};
```

The current loader supports local `controlled-js` modules. These modules run in the same Node.js process as the MCP server, so only modules the user has reviewed should be installed. Remote GitHub installation, signature verification, and sandboxing are later steps.
