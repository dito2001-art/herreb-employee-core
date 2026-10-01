import assert from "node:assert/strict";
import test from "node:test";

import * as provenance from "./provenance";

test("claimed session identity cannot authorize controlled writes", () => {
  const value = provenance.unverifiedProvenance("session-state");
  const allowed = provenance.canAuthorizeControlledWrite(
    value,
    "herreb",
    "fernando"
  );
  assert.equal(allowed, false);
});

test("only matching owner-verified provenance can authorize controlled writes", () => {
  const verified: provenance.RuntimeProvenance = {
    assurance: "OWNER_VERIFIED",
    subjectId: "fernando",
    tenantId: "herreb",
    source: "trusted-authenticator"
  };

  const ownerAllowed = provenance.canAuthorizeControlledWrite(
    verified,
    "herreb",
    "fernando"
  );
  const wrongTenantAllowed = provenance.canAuthorizeControlledWrite(
    verified,
    "other",
    "fernando"
  );
  const wrongActorAllowed = provenance.canAuthorizeControlledWrite(
    verified,
    "herreb",
    "other"
  );

  assert.equal(ownerAllowed, true);
  assert.equal(wrongTenantAllowed, false);
  assert.equal(wrongActorAllowed, false);
});

test("service verification alone does not become owner authorization", () => {
  const serviceVerified: provenance.RuntimeProvenance = {
    assurance: "SERVICE_VERIFIED",
    subjectId: "fernando",
    tenantId: "herreb",
    source: "internal-service"
  };
  const allowed = provenance.canAuthorizeControlledWrite(
    serviceVerified,
    "herreb",
    "fernando"
  );
  assert.equal(allowed, false);
});
