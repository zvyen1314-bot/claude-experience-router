import test from "node:test";
import assert from "node:assert/strict";
import { ExperienceRuntime } from "../dist/runtime.js";
import { loadDefaultModuleRegistry } from "../dist/registry.js";
import { startExperienceWebServer } from "../dist/web.js";

async function createRuntime() {
  return new ExperienceRuntime(await loadDefaultModuleRegistry());
}

test("consent tokens are scoped and single use", async () => {
  const runtime = await createRuntime();
  const request = runtime.prepareLaunch("three-minute-mystery");

  assert.ok(request);
  assert.equal(request.experienceId, "three-minute-mystery");
  assert.match(request.consentToken, /^[A-Za-z0-9_-]+$/);

  const launch = await runtime.launch(request.experienceId, request.consentToken);
  assert.equal(launch.status, "launched");
  assert.ok(launch.sessionId);
  assert.ok(launch.entrypoint?.includes("session_id="));

  const replay = await runtime.launch(request.experienceId, request.consentToken);
  assert.equal(replay.status, "invalid_consent");
});

test("a mystery session can complete through events", async () => {
  const runtime = await createRuntime();
  const request = runtime.prepareLaunch("three-minute-mystery");
  assert.ok(request);
  const launch = await runtime.launch(request.experienceId, request.consentToken);
  assert.equal(launch.status, "launched");

  const sessionId = launch.sessionId;
  assert.ok(sessionId);
  const hint = await runtime.submitEvent(sessionId, "hint");
  assert.equal(hint.status, "ok");
  assert.equal(hint.snapshot?.state.hintUsed, true);

  const answer = await runtime.submitEvent(sessionId, "answer", {
    answer: "先打开一个开关一会儿，再关掉它，打开第二个开关，进屋后通过亮、灭和灯泡的温度判断。",
  });
  assert.equal(answer.status, "ok");
  assert.equal(answer.snapshot?.status, "completed");
  assert.equal(answer.snapshot?.state.score, 80);

  const afterCompletion = await runtime.submitEvent(sessionId, "answer", { answer: "再试一次" });
  assert.equal(afterCompletion.status, "finished");
});

test("the local web runtime exposes a usable experience session", async () => {
  const runtime = await createRuntime();
  const web = await startExperienceWebServer(runtime, 0);
  try {
    const health = await fetch(`${web.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: "experience-runtime" });

    const request = runtime.prepareLaunch("three-minute-mystery");
    assert.ok(request);
    const launch = await runtime.launch(request.experienceId, request.consentToken);
    assert.equal(launch.status, "launched");
    assert.ok(launch.sessionId);
    assert.ok(launch.entrypoint);

    const page = await fetch(launch.entrypoint);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Three Minute Mystery/);

    const snapshot = await fetch(`${web.baseUrl}/api/sessions/${launch.sessionId}`);
    assert.equal(snapshot.status, 200);
    assert.equal((await snapshot.json()).status, "active");

    const event = await fetch(`${web.baseUrl}/api/sessions/${launch.sessionId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "hint" }),
    });
    assert.equal(event.status, 200);
    assert.equal((await event.json()).snapshot.state.hintUsed, true);
  } finally {
    await new Promise((resolve) => web.server.close(resolve));
  }
});
