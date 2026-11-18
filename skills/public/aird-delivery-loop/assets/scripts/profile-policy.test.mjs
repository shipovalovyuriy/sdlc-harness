import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profilePolicyProblem as check } from './aird-contract.mjs';
test('policy 2 preserves legacy and requires a profile matching explicit risks', () => {
 assert.equal(check({discovery_profile:'lite'}),null);
 const s={efficiency_policy:2,discovery_profile:'lite',risk_flags:[],profile_reason:'Known local edit'};
 assert.equal(check(s),null);
 for(const r of ['security','migration','schema','multi_service','external_unknown','public_contract','cross_layer']) assert.ok(check({...s,risk_flags:[r]}));
 assert.equal(check({...s,discovery_profile:'deep',risk_flags:['migration']}),null);
 assert.ok(check({...s,risk_flags:['unknown']}));
 assert.ok(check({...s,profile_reason:''}));
});
