import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSecretList } from '../src/project-secrets.ts';

test('a pasted list understands dotenv, export and flat YAML; a comment above a key is its note', () => {
  const { entries, errors } = parseSecretList([
    '# адрес стейджинга',
    'STAGING_URL=https://stage.example.com/path?a=1&b=2',
    'export AIRD_APP_LOGIN=qa@example.com',
    'AIRD_APP_PASSWORD: "p@ss #word=1\\n"',
    "SINGLE='keeps \\n literally'",
    '',
    'URL_WITH_COLON: http://localhost:3000',
  ].join('\n'));
  assert.deepEqual(errors, []);
  assert.deepEqual(entries.map((e) => [e.name, e.value, e.note]), [
    ['STAGING_URL', 'https://stage.example.com/path?a=1&b=2', 'адрес стейджинга'],
    ['AIRD_APP_LOGIN', 'qa@example.com', null],
    ['AIRD_APP_PASSWORD', 'p@ss #word=1\n', null],
    ['SINGLE', 'keeps \\n literally', null],
    ['URL_WITH_COLON', 'http://localhost:3000', null],
  ]);
});

test('broken lines are reported by number and never guessed; later duplicates win', () => {
  const { entries, errors } = parseSecretList('1BAD=x\nGOOD=\nKEY: |\nQUOTE="open\nnot a pair\nDUP=a\nDUP=b\n');
  assert.deepEqual(errors.map((e) => e.line), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(entries.map((e) => [e.name, e.value]), [['DUP', 'b']]);
});
