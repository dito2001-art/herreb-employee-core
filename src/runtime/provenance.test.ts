import assert from "node:assert/strict";
import test from "node:test";
import {
  canAuthorizeControlledWrite,
  type RuntimeProvenance,
  unverifiedProvenance
} from "./provenance";

test("claimed session identity cannot authorize controlled writes", () => {
  const provenance = unverifiedProvenance("session-state");
  assert.equal(
    canAuthorizeControlledWrite(provenance, "herreb", "fernando"),
    false
  );
});

test("only matching owner-verified provenance can authorize controlled writes", () => {
  const verified: RuntimeProvenance = {
    assurance: "OWNER_VERIFIED",
    subjectId: "fernando",
    tenantId: "herreb",
    source: "trusted-authenticator"
  };
  assert.equal(
    canAuthorizeControlledWrite(verified, "herreb", "fernando"),
    true
  );
  assert.equal(
    canAuthorizeControlledWrite(verified, "other", "fernando"),
    false
  );
  assert.equal(
    canAuthorizeControlledWrite(verified, "herreb", "other"),
    false
  );
});

test("service verification alone does not become owner authorization", () => {
  const serviceVerified: RuntimeProvenance = {
    assurance: "SERVICE_VERIFIED",
    subjectId: "fernando",
    tenantId: "herreb",
    source: "internal-service"
  };
  assert.equal(
    canAuthorizeControlledWrite(serviceVerified, "herreb", "fernando"),
    false
  );
});
