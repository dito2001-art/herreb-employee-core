import test from "node:test";
import assert from "node:assert/strict";
import { parseEMP003CopyOutput } from "./emp003-copy-generator";

test("provider JSON becomes editable copy only with allowed claim IDs", () => {
  const draft = parseEMP003CopyOutput(
    JSON.stringify({
      headline: "Probá HerreB",
      body: "Consultá por el servicio.",
      claimIds: ["claim"]
    }),
    ["claim"]
  );
  assert.equal(draft.headline, "Probá HerreB");
  assert.deepEqual(draft.claimIds, ["claim"]);
});
test("malformed, empty, oversized and fabricated-claim output is rejected", () => {
  for (const raw of [
    "not JSON",
    "```json {} ```",
    "x".repeat(20001),
    JSON.stringify({ headline: "", body: "copy", claimIds: ["claim"] }),
    JSON.stringify({ headline: "h", body: "b", claimIds: [], published: true })
  ]) {
    assert.throws(
      () => parseEMP003CopyOutput(raw, ["claim"]),
      /CONTENT_GENERATION_OUTPUT_INVALID/
    );
  }
  assert.throws(
    () =>
      parseEMP003CopyOutput(
        JSON.stringify({ headline: "h", body: "b", claimIds: ["invented"] }),
        ["claim"]
      ),
    /CONTENT_GENERATION_UNVERIFIED_CLAIM/
  );
});

import { createEMP003CopyGenerator } from "./emp003-copy-generator";
import type { ContentGeneratorInput } from "../core/marketing-content-orchestrator";
const input: ContentGeneratorInput = {
  tenantId: "tenant-private",
  brandName: "Private brand",
  brandVoice: ["vos"],
  prohibitedThemes: [],
  audience: { id: "a", name: "Internal", description: "Test", needs: [] },
  offering: { id: "o", name: "Service" },
  objective: {
    id: "obj",
    name: "Copy",
    outcome: "Test",
    targetMetric: "copies",
    targetValue: 1
  },
  campaign: { id: "campaign", name: "Private campaign" },
  channel: "internal",
  allowedClaims: [{ id: "claim", text: "Verified private claim" }]
};
test("real adapter accepts valid output and preserves one bounded invocation", async () => {
  let calls = 0;
  const generator = createEMP003CopyGenerator({
    async run(
      _model: unknown,
      args: {
        max_tokens: number;
        stream: boolean;
        response_format: {
          type: string;
          json_schema: {
            properties: Record<string, unknown>;
            additionalProperties: boolean;
            required: string[];
          };
        };
      }
    ) {
      calls++;
      assert.equal(args.max_tokens, 2048);
      assert.equal(args.stream, true);
      assert.equal(args.response_format.type, "json_schema");
      assert.deepEqual(
        Object.keys(args.response_format.json_schema.properties).sort(),
        ["body", "claimIds", "headline"]
      );
      assert.equal(
        args.response_format.json_schema.additionalProperties,
        false
      );
      assert.deepEqual([...args.response_format.json_schema.required].sort(), [
        "body",
        "claimIds",
        "headline"
      ]);
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: "Probá",
                body: "Copy",
                claimIds: ["claim"]
              })
            },
            finish_reason: "stop"
          }
        ]
      };
    }
  } as unknown as Ai);
  assert.equal((await generator.generate(input)).body, "Copy");
  assert.equal(calls, 1);
});
test("adapter classifies failures without leaking content or retrying", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => warnings.push(message));
  const cases = [
    { code: "PROVIDER_FAILED", throws: true, text: "" },
    { code: "OUTPUT_EMPTY", text: "", reason: "stop" },
    {
      code: "OUTPUT_TRUNCATED",
      text: '{"headline":"h","body":"b","claimIds":["claim"]}',
      reason: "length"
    },
    {
      code: "OUTPUT_INVALID",
      text: "private malformed response",
      reason: "stop"
    },
    {
      code: "UNVERIFIED_CLAIM",
      text: '{"headline":"h","body":"b","claimIds":["invented"]}',
      reason: "stop"
    }
  ];
  for (const example of cases) {
    let calls = 0;
    const generator = createEMP003CopyGenerator({
      async run() {
        calls++;
        if (example.throws)
          throw new Error("private provider token and prompt");
        return {
          choices: [
            {
              message: { content: example.text },
              finish_reason: example.reason
            }
          ]
        };
      }
    } as unknown as Ai);
    await assert.rejects(
      generator.generate(input),
      new RegExp(`^Error: CONTENT_GENERATION_${example.code}$`)
    );
    assert.equal(calls, 1);
  }
  assert.deepEqual(
    warnings.map((message) => JSON.parse(message)),
    cases.map((example) => ({
      event: "emp003.copy.generation_failed",
      code: `CONTENT_GENERATION_${example.code}`
    }))
  );
  assert.equal(
    warnings.some((message) => /private|token|prompt|invented/.test(message)),
    false
  );
});
