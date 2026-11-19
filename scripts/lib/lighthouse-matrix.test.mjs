import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { configuredArguments, selectedFiles } from '../e2e-ci-plan.mjs'
import { join } from 'node:path'
import { createWorkingTreeCopy } from './working-tree-fixture.mjs'

test('matrix works without Git or dependencies while evidence modes still require checkout identity', (t) => {
  const copy = createWorkingTreeCopy()
  t.after(() => copy.cleanup())
  assert.equal(existsSync(join(copy.root, '.git')), false)
  assert.equal(existsSync(join(copy.root, 'node_modules')), false)
  const env = {
    PATH: join(copy.root, 'no-tools'),
    HOME: process.env.HOME,
    GITHUB_OUTPUT: join(copy.root, 'outputs'),
    GITHUB_STEP_SUMMARY: join(copy.root, 'summary'),
  }
  const dispatch = (argument) =>
    spawnSync(process.execPath, ['scripts/e2e-ci.mjs', argument], {
      cwd: copy.root,
      env,
      encoding: 'utf8',
      timeout: 5000,
    })
  const matrix = dispatch('--matrix')
  assert.equal(matrix.status, 0, matrix.stderr)
  const rows = JSON.parse(matrix.stdout).include
  assert.ok(rows.length > 0)
  assert.equal(rows.find((row) => row.lane === 'path-standard').timeout, 40)
  assert.equal(rows.find((row) => row.lane === 'mocked').timeout, 25)
  assert.equal(new Set(rows.map((row) => row.lane)).size, rows.length)

  const consolePath = join(copy.root, 'packages/shared/src/config/admin-console.json')
  const defaults = JSON.parse(dispatch('--matrix').stdout)
  for (const mode of ['disabled', 'path', 'host']) {
    writeFileSync(consolePath, JSON.stringify({ version: 1, mode, alias: 'ops' }))
    const result = dispatch('--configured-matrix')
    assert.equal(result.status, 0, result.stderr)
    const lanes = JSON.parse(result.stdout).include.map((row) => row.lane)
    assert.ok(lanes.includes('configured-standard'))
    assert.ok(lanes.includes('configured-disruptive'))
    assert.equal(lanes.includes('configured-console'), mode === 'host')
    assert.equal(
      lanes.some((l) => ['mocked', 'safety', 'staff-oauth', 'setup-cli'].includes(l)),
      false
    )
    for (const lane of lanes) {
      const args = configuredArguments(copy.root, lane)
      assert.equal(args[args.indexOf('--settings-policy') + 1], 'preserve')
      assert.equal(args.includes('--fixture'), false)
    }
    assert.throws(() => configuredArguments(copy.root, 'staff-oauth'))
    if (mode !== 'host') assert.throws(() => configuredArguments(copy.root, 'configured-console'))
  }
  const combined = ['standard', 'disruptive'].flatMap((g) => selectedFiles(copy.root, g))
  assert.equal(new Set(combined).size, combined.length)
  const removed = selectedFiles(copy.root, 'disruptive')
  for (const file of removed) rmSync(join(copy.root, 'apps/web', file))
  const withoutDisruptive = dispatch('--configured-matrix')
  assert.equal(withoutDisruptive.status, 0, withoutDisruptive.stderr)
  assert.equal(
    JSON.parse(withoutDisruptive.stdout).include.some((r) => r.lane === 'configured-disruptive'),
    false
  )
  writeFileSync(consolePath, '{"version":1,"mode":"invalid","alias":"ops"}')
  assert.equal(dispatch('--configured-matrix').status, 1)
  assert.ok(defaults.include.some((r) => r.lane === 'path-standard'))
  for (const argument of ['--audit-plan', '--plan-ci']) {
    const refused = dispatch(argument)
    assert.equal(refused.error, undefined)
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /git/)
  }
  for (const path of ['outputs', 'summary', '.amcore'])
    assert.equal(existsSync(join(copy.root, path)), false)
})
