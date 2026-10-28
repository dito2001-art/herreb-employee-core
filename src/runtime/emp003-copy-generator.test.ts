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
