import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveStages, readPackage } from '../src/aird.ts';

test('the discovery graph follows work done after the last STATE.md checkpoint; parallel stages are current together', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-stages-'));
  const at = (rel: string, seconds: number) => { const t = new Date(Date.parse('2026-11-17T07:00:00Z') + seconds * 1000); utimesSync(join(dir, rel), t, t); };
  try {
    writeFileSync(join(dir, 'STATE.md'), '---\nstatus: discovery\nactive_phase: product-ux\nnext_action: phase-4.5-prototype-and-phase-6-trd\n---\n');
    for (const name of ['00-intake.md', '00-discussion-log.md', 'codemap.md', '01-prd.md', '02-ui-spec.md', '03-risk-register.md']) { writeFileSync(join(dir, name), '# x\n'); at(name, -600); }
    at('STATE.md', 0);
    const before = deriveStages(readPackage(dir));
    assert.equal(before.current.id, 'product', 'nothing newer than the checkpoint: the recorded phase is current');

    writeFileSync(join(dir, '04-trd.md'), '# TRD\n'); at('04-trd.md', 180);
    mkdirSync(join(dir, 'prototype')); writeFileSync(join(dir, 'prototype', 'index.html'), '<html>'); at('prototype/index.html', 360); at('prototype', 360);
    const after = deriveStages(readPackage(dir));
    const state = Object.fromEntries(after.stages.filter((s) => s.lane === 'discovery').map((s) => [s.id, s.state]));
    assert.equal(state.product, 'done', 'work moved past the recorded phase');
    assert.equal(state.prototype, 'current');
    assert.equal(state.trd, 'current');
    assert.equal(state.risks, 'done');
    assert.equal(state.plan, 'todo');
    assert.equal(after.current.id, 'trd', 'the furthest stage in progress');
    assert.ok(after.progress > before.progress);
    assert.match(after.stages.find((s) => s.id === 'trd')!.detail ?? '', /04-trd\.md — новее отметки/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
