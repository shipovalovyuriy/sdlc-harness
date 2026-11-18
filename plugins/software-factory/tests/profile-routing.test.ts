import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileProblem } from '../src/process-policy.ts';
test('legacy unchanged; policy 2 rejects downgrading risk and missing declarations', () => {
 assert.equal(profileProblem({discovery_profile:'lite'}), null);
 const state = {efficiency_policy:2,discovery_profile:'lite',risk_flags:[],profile_reason:'Known local reversible change'};
 assert.equal(profileProblem(state), null);
 for(const flag of ['security','migration','schema','multi_service','external_unknown','public_contract','cross_layer']) assert.ok(profileProblem({...state,risk_flags:[flag]}));
 assert.equal(profileProblem({...state,discovery_profile:'standard',risk_flags:['cross_layer']}),null);
 assert.ok(profileProblem({...state,discovery_profile:'standard',risk_flags:['migration']}));
 assert.equal(profileProblem({...state,discovery_profile:'deep',risk_flags:['migration','security']}),null);
 assert.ok(profileProblem({...state,risk_flags:['typo']}));
 assert.ok(profileProblem({...state,profile_reason:''}));
});

test('object prototype names are not valid profiles or risk flags',()=>{
 const state={efficiency_policy:2,discovery_profile:'lite',risk_flags:[],profile_reason:'local'};
 assert.ok(profileProblem({...state,discovery_profile:'toString'}));
 assert.ok(profileProblem({...state,risk_flags:['__proto__']}));
});
