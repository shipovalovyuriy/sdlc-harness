import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verificationIdentity,evidenceState} from '../src/evidence-validity.ts';
test('verification fingerprint changes with gates, config and environment; unknown or escaping inputs fail closed',()=>{
 const root=mkdtempSync(join(tmpdir(),'sf-evidence-')),pkg=join(root,'.agent/aird/demo');mkdirSync(pkg,{recursive:true});
 try{
  writeFileSync(join(pkg,'08-quality-gates.md'),'command: test');writeFileSync(join(root,'config.json'),'one');
  const state={efficiency_policy:2,verification_inputs:['config.json'],verification_environment:'disposable db v1'};
  const first=verificationIdentity(pkg,state);assert.equal(first,verificationIdentity(pkg,state));
  writeFileSync(join(root,'config.json'),'two');assert.notEqual(first,verificationIdentity(pkg,state));
  const next=verificationIdentity(pkg,state);writeFileSync(join(pkg,'08-quality-gates.md'),'command: another');assert.notEqual(next,verificationIdentity(pkg,state));
  assert.notEqual(verificationIdentity(pkg,state),verificationIdentity(pkg,{...state,verification_environment:'v2'}));
  assert.throws(()=>verificationIdentity(pkg,{efficiency_policy:2}));
  symlinkSync('/etc/hosts',join(root,'escape'));assert.throws(()=>verificationIdentity(pkg,{...state,verification_inputs:['escape']}));
  assert.equal(verificationIdentity(pkg,{}),'');assert.equal(evidenceState('untested',true),'stale');assert.equal(evidenceState('passed',true),'valid');
 }finally{rmSync(root,{recursive:true,force:true});}
});
