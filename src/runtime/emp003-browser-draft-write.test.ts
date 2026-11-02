import assert from "node:assert/strict";
import { test } from "node:test";
import { handleEMP003BrowserDraftWrite } from "./emp003-browser-draft-write";

const env = {} as Parameters<typeof handleEMP003BrowserDraftWrite>[1];
const request = (method: string, body = "{}", headers: Record<string, string> = {}) =>
  new Request("https://emp003-staging.example.test/api/emp003/drafts", {
    method, headers, ...(method === "POST" ? { body } : {})
  });

test("browser BFF rejects non-POST before auth", async () => {
  assert.equal((await handleEMP003BrowserDraftWrite(request("GET"), env)).status, 405);
});
test("browser BFF requires JSON before auth", async () => {
  assert.equal((await handleEMP003BrowserDraftWrite(request("POST"), env)).status, 415);
});
test("browser BFF rejects oversized or malformed length before auth", async () => {
  for (const length of ["65537", "12bad", "-1"]) {
    const response = await handleEMP003BrowserDraftWrite(
      request("POST", "{}", { "content-type": "application/json", "content-length": length }), env
    );
    assert.equal(response.status, 413, length);
  }
});
test("browser BFF rejects anonymous JSON and spoofed identity headers", async () => {
  const response = await handleEMP003BrowserDraftWrite(
    request("POST", "{}", {
      "content-type": "application/json",
      "cf-access-authenticated-user-email": "owner@example.com",
      "x-herreb-workforce-admin-token": "spoofed"
    }), env
  );
  assert.equal(response.status, 401);
});
