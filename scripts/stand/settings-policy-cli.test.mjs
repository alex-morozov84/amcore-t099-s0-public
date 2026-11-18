import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'stand-policy-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const modules = {
    'stand/trace.mjs': `import {appendFileSync} from 'node:fs';
      export const trace=(stage,m)=>appendFileSync('calls.jsonl',
        JSON.stringify({stage,policy:m.settingsPolicy??null})+String.fromCharCode(10));`,
    'stand/state.mjs': `import {readFileSync} from 'node:fs';
      export const root=process.cwd();
      export const lease=async()=>({token:'test-token',release:async()=>{}});
      export const load=async()=>JSON.parse(readFileSync('manifest.json','utf8'));`,
    'stand/project.mjs': `export const projectChoices=async()=>({topology:'host',
      consoleEnabled:true,consoleTopology:'host'});`,
    'stand/process.mjs': `export const stopChildren=async()=>{};
      export const setJournal=()=>{},requestCancellation=()=>{},allowCleanup=()=>{},setProcessDeadline=()=>{};`,
    'stand/ownership.mjs': `import {trace} from './trace.mjs';
      export const dataAdmission=async m=>trace('dataAdmission',m);
      export const cleanup=async m=>trace('cleanup',m);`,
    'stand/refresh.mjs': `import {trace} from './trace.mjs';
      export const refresh=async m=>trace('refresh',m);`,
    'stand/boot.mjs': `import {trace} from './trace.mjs';
      export const boot=async m=>trace('boot',m);`,
    'stand/playwright.mjs': `import {trace} from './trace.mjs';
      export const test=async m=>trace('test',m);`,
    'stand/create.mjs': `export const create=async()=>{throw Error('Unexpected allocation')};`,
    'stand/snapshot.mjs': `export const snapshot=async()=>{throw Error('Unexpected snapshot')};`,
    'stand/product-admin-source.mjs': `export const productAdminProfiles=[];`,
    'lib/lighthouse-deadlines.mjs': `export const standDeadline=()=>{throw Error('Unexpected deadline')};`,
  }
  for (const [name, source] of Object.entries(modules)) {
    const path = join(root, 'scripts', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  copyFileSync(new URL('../stand.mjs', import.meta.url), join(root, 'scripts/stand.mjs'))
  copyFileSync(
    new URL('./settings-policy.mjs', import.meta.url),
    join(root, 'scripts/stand/settings-policy.mjs')
  )
  return root
}

for (const state of ['stopped', 'running'])
  for (const policy of ['legacy', 'variant', 'preserve'])
    test(`preserve CLI admission for ${state} ${policy} manifest precedes infrastructure`, (t) => {
      const root = fixture(t)
      const manifest = JSON.stringify({
        purpose: 'e2e',
        mocked: false,
        topology: 'host',
        state,
        ...(policy === 'legacy' ? {} : { settingsPolicy: policy }),
      })
      writeFileSync(join(root, 'manifest.json'), manifest)
      writeFileSync(join(root, 'calls.jsonl'), '')
      const result = spawnSync(
        process.execPath,
        [
          'scripts/stand.mjs',
          'e2e',
          '--id',
          'reused',
          '--lane',
          'real-stack',
          '--settings-policy',
          'preserve',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 5000,
          env: { PATH: join(root, 'no-tools') },
        }
      )
      assert.equal(result.error, undefined)
      assert.equal(readFileSync(join(root, 'manifest.json'), 'utf8'), manifest)
      const calls = readFileSync(join(root, 'calls.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      if (policy !== 'preserve') {
        assert.equal(result.status, 1, result.stderr)
        assert.match(result.stderr, policy === 'legacy' ? /fresh stand ID/ : /Cannot switch/)
        assert.deepEqual(
          calls,
          [],
          'Refused reuse must not reach admission, refresh, boot or cleanup'
        )
      } else {
        assert.equal(result.status, 0, result.stderr)
        assert.deepEqual(
          calls.map((row) => row.stage),
          [...(state === 'running' ? ['dataAdmission'] : []), 'refresh', 'boot', 'test', 'cleanup']
        )
        assert.ok(calls.every((row) => row.policy === 'preserve'))
      }
    })
