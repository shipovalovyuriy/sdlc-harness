import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep,join} from 'node:path';

/** Explicit local verification inputs, never guessed dependencies or an implicit cache hit. */
export function verificationIdentity(packageDir: string, state: Record<string, unknown>): string {
 if (Number(state.efficiency_policy) !== 2) return '';
 if (!Array.isArray(state.verification_inputs) || state.verification_inputs.length > 32 || typeof state.verification_environment !== 'string' || !state.verification_environment.trim()) throw new Error('Policy 2: declare verification_inputs and verification_environment before acceptance');
 const root=realpathSync(resolve(packageDir,'../../..'));
 const hash=createHash('sha256').update(state.verification_environment).update('\0');
 hash.update(readFileSync(join(packageDir,'08-quality-gates.md'))).update('\0');
 const paths=state.verification_inputs;
 if (paths.some(p=>typeof p!=='string' || !p.trim() || isAbsolute(p))) throw new Error('verification_inputs must contain workspace-relative file paths');
 for(const path of [...new Set(paths as string[])].sort()) {
  const file=realpathSync(resolve(root,path)),rel=relative(root,file);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)) throw new Error('Verification input outside workspace');
  const stat=statSync(file);
  if(!stat.isFile()||stat.size>1_000_000) throw new Error('Verification input must be a file no larger than 1 MB');
  hash.update(path).update('\0').update(readFileSync(file)).update('\0');
 }
 return hash.digest('hex');
}
export function evidenceState(gate: string, hasRuns: boolean): 'valid'|'stale'|'missing'|'blocked' {
 return gate==='passed'?'valid':gate==='untested'?(hasRuns?'stale':'missing'):'blocked';
}
