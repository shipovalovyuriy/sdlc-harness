import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionTiming, consumeUsage, newThreadUsage } from '../src/usage.ts';
test('parallel completed turns count once, gaps are not called generation or waiting', () => {
 assert.deepEqual(executionTiming([[0,100],[50,150],[200,250]]), {observedWindowMs:250, occupiedMs:200, agentMs:250, incomplete:false});
 assert.equal(executionTiming([]).occupiedMs,null);
 assert.equal(executionTiming([[1,2]],true).incomplete,true);
 const state=newThreadUsage();
 const events=[{seq:1,type:'turn/started',createdAt:100},{seq:2,type:'turn/completed',createdAt:200}];
 consumeUsage(state,'codex',events); consumeUsage(state,'codex',events);
 assert.deepEqual(state.intervals,[[100,200]]);
});

test('only a reported rate limit establishes provider waiting, unfinished waits stay open',()=>{
 const state=newThreadUsage();
 consumeUsage(state,'claude-code',[{seq:1,type:'provider/error',createdAt:100,data:{errorInfo:{category:'unknown'}}},{seq:2,type:'provider/error',createdAt:120,data:{errorInfo:{category:'rate-limit'}}}]);
 assert.equal(state.providerBlockedAt,120);assert.deepEqual(state.providerWaits,[]);
 consumeUsage(state,'claude-code',[{seq:3,type:'turn/started',createdAt:200}]);
 assert.deepEqual(state.providerWaits,[[120,200]]);assert.equal(state.providerBlockedAt,null);
});
