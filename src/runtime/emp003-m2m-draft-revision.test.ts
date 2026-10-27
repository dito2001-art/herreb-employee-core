import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEMP003M2MDraftRevision as parse } from './emp003-m2m-draft-revision';

test('M2M fail closed: missing, ambiguous and malformed revision modes', () => {
  for (const value of [undefined, null, {}, {createOnly:false}, {expectedRevision:0}, {expectedRevision:-1}, {expectedRevision:1.2}, {expectedRevision:'1'}, {createOnly:true,expectedRevision:1}, {createOnly:true,expectedRevision:null}, {createOnly:false,expectedRevision:1}]) assert.equal(parse(value), null);
});
test('M2M create-only and CAS edit require explicit exclusive revision modes', () => {
  assert.deepEqual(parse({createOnly:true}), {createOnly:true});
  assert.deepEqual(parse({expectedRevision:1}), {expectedRevision:1});
  assert.deepEqual(parse({expectedRevision:4}), {expectedRevision:4});
});
