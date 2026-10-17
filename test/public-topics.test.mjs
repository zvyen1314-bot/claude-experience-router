import test from "node:test";
import assert from "node:assert/strict";
import { ExperienceRuntime } from "../dist/runtime.js";
import { loadDefaultModuleRegistry } from "../dist/registry.js";
import { PublicTopicService } from "../dist/public-topics.js";
import { startExperienceWebServer } from "../dist/web.js";

test("public topics support discovery, rooms, moderation, and blocking", () => {
  const topics = new PublicTopicService();
  const discovered = topics.discover({ actorId: "alice", interests: ["ai"] });
  assert.equal(discovered[0].id, "topic-seed-1");

  const topic = topics.createTopic({
    actorId: "alice",
    title: "一个公开的产品想法",
    body: "只讨论公开内容，不交换私人联系方式。",
    tags: ["product", "community"],
  });
  const room = topics.joinRoom(topic.id, "bob");
  const posted = topics.postMessage(room.id, "bob", "我愿意从一个具体问题开始聊。");
  assert.equal(posted.messages.length, 1);
  assert.equal(posted.messages[0].author_id, "bob");

  const report = topics.report({
    reporterId: "carol",
    targetType: "message",
    targetId: posted.messages[0].id,
    reason: "这条内容需要人工审核",
  });
  assert.equal(topics.listReports("queued").length, 1);
  topics.reviewReport(report.id, "moderator", "hide");
  assert.equal(topics.getRoom(room.id, "carol").messages.length, 0);

  topics.blockActor("alice", "bob");
  assert.throws(() => topics.getRoom(room.id, "bob"), /当前不可访问/);
  topics.unblockActor("alice", "bob");
  assert.doesNotThrow(() => topics.getRoom(room.id, "bob"));
});

test("public topic HTTP endpoints share the local topic service", async () => {
  const runtime = new ExperienceRuntime(await loadDefaultModuleRegistry());
  const web = await startExperienceWebServer(runtime, 0);
  try {
    const list = await fetch(`${web.baseUrl}/api/topics?interest=ai`);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).protocol, "public-topics/v1");

    const created = await fetch(`${web.baseUrl}/api/topics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor_id: "alice", title: "HTTP 公开话题", body: "测试公开话题接口。", tags: ["test"] }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.topic.author_id, "alice");

    const joined = await fetch(`${web.baseUrl}/api/topics/${createdBody.topic.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor_id: "bob" }),
    });
    const joinedBody = await joined.json();
    assert.equal(joined.status, 200);

    const message = await fetch(`${web.baseUrl}/api/rooms/${joinedBody.room.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor_id: "bob", body: "一条公开发言" }),
    });
    const messageBody = await message.json();
    assert.equal(message.status, 201);

    const report = await fetch(`${web.baseUrl}/api/moderation/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reporter_id: "carol", target_type: "message", target_id: messageBody.room.messages[0].id, reason: "需要审核" }),
    });
    const reportBody = await report.json();
    assert.equal(report.status, 201);

    const review = await fetch(`${web.baseUrl}/api/moderation/reports/${reportBody.report.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer_id: "moderator", decision: "hide" }),
    });
    assert.equal(review.status, 200);
    assert.equal((await review.json()).report.status, "hidden");
  } finally {
    await new Promise((resolve) => web.server.close(resolve));
  }
});
