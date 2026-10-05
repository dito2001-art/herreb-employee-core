import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeEMP002Operation } from './emp002-identity-policy';

test('owner and team can operate the tenant agenda', () => {
  assert.equal(authorizeEMP002Operation({ role: 'OWNER' }, 'READ_OWNER_AGENDA'), true);
  assert.equal(authorizeEMP002Operation({ role: 'TEAM' }, 'RESCHEDULE_APPOINTMENT'), true);
});

test('external contacts can manage appointments but cannot read the owner agenda', () => {
  assert.equal(authorizeEMP002Operation({ role: 'EXTERNAL_CONTACT' }, 'CHECK_AVAILABILITY'), true);
  assert.equal(authorizeEMP002Operation({ role: 'EXTERNAL_CONTACT' }, 'CREATE_APPOINTMENT'), true);
  assert.equal(authorizeEMP002Operation({ role: 'EXTERNAL_CONTACT' }, 'RESCHEDULE_APPOINTMENT'), true);
  assert.equal(authorizeEMP002Operation({ role: 'EXTERNAL_CONTACT' }, 'CANCEL_APPOINTMENT'), true);
  assert.equal(authorizeEMP002Operation({ role: 'EXTERNAL_CONTACT' }, 'READ_OWNER_AGENDA'), false);
});

test('unknown actors are denied', () => {
  assert.equal(authorizeEMP002Operation({ role: 'UNKNOWN' }, 'CHECK_AVAILABILITY'), false);
});
