import { runAuditPhase } from './lighthouse-phase.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { start } from './start.mjs'
import { refresh } from './refresh.mjs'
import {
  assertPreserveRequest,
  preservedTopology,
  assertSettings,
  recordSettings,
  sourceSettings,
} from './settings-policy.mjs'

test('preserved source refuses silent mode, alias or locale changes before execution', async () => {
  const snapshot = await mkdtemp(join(tmpdir(), 'stand-settings-'))
  const directory = join(snapshot, 'packages/shared/src/config')
  await mkdir(directory, { recursive: true })
  execFileSync('git', ['init', '--quiet', '--initial-branch=fixture'], { cwd: snapshot })
  const settings = {
    locales: { version: 1, enabled: ['en'], default: 'en' },
    'admin-console': { version: 1, mode: 'disabled', alias: 'ops' },
    'product-admin': { version: 1, mode: 'path', alias: 'backoffice' },
  }
  const put = (name, data) => writeFile(join(directory, `${name}.json`), JSON.stringify(data))
  try {
    for (const [name, data] of Object.entries(settings)) await put(name, data)
    const m = {
      snapshot,
      settingsPolicy: 'preserve',
      sourceSettings: await sourceSettings(snapshot),
    }
    await recordSettings(m)
    for (const [name, data] of [
      ['locales', { ...settings.locales, enabled: ['en', 'ru'] }],
      ['admin-console', { ...settings['admin-console'], mode: 'host' }],
      ['product-admin', { ...settings['product-admin'], alias: 'manage' }],
    ]) {
      await put(name, data)
      await assert.rejects(assertSettings(m), /changed after preparation/)
      await assert.rejects(start(m), /changed after preparation/)
      await assert.rejects(recordSettings(m), /must preserve source/)
      await put(name, settings[name])
      await recordSettings(m)
    }
    await put('product-admin', { ...settings['product-admin'], alias: 'manage' })
    await assert.rejects(
      refresh({ ...m, worktree: snapshot, topology: 'path' }),
      /Source settings changed; use a fresh stand ID/
    )
    await put('product-admin', settings['product-admin'])
    m.settingsPolicy = 'variant'
    await put('admin-console', { ...settings['admin-console'], mode: 'host' })
    await recordSettings(m)
    assert.equal(m.sourceSettings['admin-console'].mode, 'disabled')
    assert.equal(m.exercisedSettings['admin-console'].mode, 'host')
    await put('admin-console', settings['admin-console'])
    await assert.rejects(assertSettings(m), /changed after preparation/)
  } finally {
    await rm(snapshot, { recursive: true, force: true })
  }
})

test('native execution rejects alternate fixtures and mismatched transport', () => {
  const choices = { topology: 'path' }
  assert.doesNotThrow(() => assertPreserveRequest('preserve', undefined, undefined, choices))
  assert.throws(() => assertPreserveRequest('preserve', 'support-mail-host', 'host', choices))
  assert.throws(() => assertPreserveRequest('preserve', undefined, 'host', choices))
  assert.throws(() => assertPreserveRequest('invalid', undefined, undefined, choices))
  assert.doesNotThrow(() => assertPreserveRequest('variant', 'support-mail-host', 'host', choices))
})

test('native topology comes from source and refuses unprepared transports before allocation', () => {
  const path = { topology: 'path', consoleEnabled: true, consoleTopology: 'path' }
  const host = { topology: 'host', consoleEnabled: true, consoleTopology: 'host' }
  assert.equal(preservedTopology('real-stack', path), 'path')
  assert.equal(preservedTopology('real-stack', host), 'host')
  assert.equal(preservedTopology('console-real-stack', host), 'host')
  assert.throws(() => preservedTopology('console-real-stack', path), /host source/)
  assert.throws(() => preservedTopology('console-real-stack', { ...host, consoleEnabled: false }))
  assert.throws(() => preservedTopology('mocked', host), /not prepared/)
  assert.throws(() => preservedTopology('product-admin-real-stack', host), /starter staff fixtures/)
})

test('configured companion cannot admit a variant stand before touching infrastructure', async () => {
  const original = process.env.AMCORE_AUDIT_PLAN
  process.env.AMCORE_AUDIT_PLAN = JSON.stringify({ execution: 'configured' })
  try {
    await assert.rejects(
      runAuditPhase({ settingsPolicy: 'variant' }, 'unused'),
      /configured-audit-requires-preserved-settings/
    )
  } finally {
    if (original === undefined) delete process.env.AMCORE_AUDIT_PLAN
    else process.env.AMCORE_AUDIT_PLAN = original
  }
})
