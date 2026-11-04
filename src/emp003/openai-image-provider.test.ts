import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAIImageProvider } from "./openai-image-provider";

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const base64 = Buffer.from(png).toString("base64");

test("sends image generation to OpenAI without leaking the API key into payload", async () => {
  let count = 0;
  const provider = createOpenAIImageProvider({
    apiKey: "test-secret", model: "gpt-image-1",
    fetchImpl: async (url, init) => {
      count++;
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      const headers = init?.headers as Record<string,string>;
      assert.equal(headers.Authorization, "Bearer test-secret");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-image-1");
      assert.equal(body.size, "1024x1536");
      assert.equal(body.prompt, "A chair");
      assert.ok(!JSON.stringify(body).includes("test-secret"));
      return new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), { status: 200 });
    },
  });
  const result = await provider.generate({prompt:"A chair",aspectRatio:"4:5"});
  assert.equal(result.mimeType,"image/png");
  assert.deepEqual(result.bytes,png);
  assert.equal(count,1);
});

test("rejects editing references until a real editing adapter is implemented", async () => {
  let called = false;
  const provider = createOpenAIImageProvider({
    apiKey:"test", model:"gpt-image-1",
    fetchImpl: async () => { called = true; throw new Error("unexpected network"); },
  });
  await assert.rejects(provider.generate({
    prompt:"Edit",aspectRatio:"1:1",
    reference:{bytes:png,mimeType:"image/png"},
  }), /OPENAI_IMAGE_EDIT_NOT_CONFIGURED/);
  assert.equal(called,false);
});

test("fails closed on HTTP errors and malformed responses", async () => {
  for (const response of [
    new Response("sensitive", {status:429}),
    new Response(JSON.stringify({data:[{}]}), {status:200}),
  ]) {
    const provider = createOpenAIImageProvider({
      apiKey:"test",model:"gpt-image-1",fetchImpl:async()=>response,
    });
    await assert.rejects(provider.generate({prompt:"test",aspectRatio:"1:1"}));
  }
});
