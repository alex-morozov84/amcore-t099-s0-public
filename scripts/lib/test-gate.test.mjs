import assert from 'node:assert/strict'
import { requireS0Results, sealS0Plan } from './s0-ci-results.mjs'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

const jobs = parse(readFileSync('.github/workflows/ci.yml', 'utf8')).jobs
const expected = ['test-unit-redis', 'test-capability', 'test-notification-ai', 'api-e2e']
const gate = jobs.test
const identity = { source: 'a'.repeat(40), run: '123', attempt: '1' }
const selected = [
  'lint',
  'typecheck',
  'promtool',
  'test-unit-redis',
  'test-notification-ai',
  'api-e2e',
  'test',
]
const plan = sealS0Plan({ ...identity, scope: 'selected-families', jobs: selected })
const success = () =>
  Object.fromEntries(
    ['ci-plan', ...expected].map((key) => [
      key,
      { result: key === 'test-capability' ? 'skipped' : 'success' },
    ])
  )

test('Test requires every selected dependency and admits only planned skips', () => {
  assert.equal(gate.name, 'Test')
  assert.equal(gate['timeout-minutes'], 5)
  assert.match(gate.if, /always\(\)/)
  assert.deepEqual(gate.needs, ['ci-plan', ...expected])
  const step = gate.steps.at(-1)
  assert.equal(step.env.CI_RESULTS, '${{ toJSON(needs) }}')
  assert.match(step.run, /require-s0-ci\.mjs" test/)
  assert.doesNotThrow(() => requireS0Results(success(), plan, identity, 'test'))
  for (const key of expected) {
    const result = key === 'test-capability' ? 'success' : 'skipped'
    assert.throws(() =>
      requireS0Results({ ...success(), [key]: { result } }, plan, identity, 'test')
    )
    const missing = success()
    delete missing[key]
    assert.throws(() => requireS0Results(missing, plan, identity, 'test'), /inventory/)
  }
})

test('independent leaves preserve commands and frozen preparation without aggregate cycles', () => {
  // The mirror step is first; its script never fails the job (a warning instead).
  const mirror = 'bash scripts/docker-registry-mirror.sh'
  const commands = {
    'test-unit-redis': [mirror, 'pnpm test', 'pnpm --filter web test:integration'],
    'test-capability': [mirror, 'pnpm test:capability-extension'],
    'test-notification-ai': [mirror, 'pnpm test:extension-contracts'],
  }
  for (const [key, runs] of Object.entries(commands)) {
    const job = jobs[key]
    assert.deepEqual(job.needs, ['ci-plan', 'lint', 'typecheck'])
    assert.deepEqual(
      job.steps
        .filter((step) => step.run && !step.run.startsWith('pnpm install'))
        .map((step) => step.run),
      runs
    )
    assert.ok(job.steps.some((step) => step.run === 'pnpm install --frozen-lockfile'))
    assert.ok(job.steps.every((step) => !step['continue-on-error'] && !step.if))
  }
  function visit(key, ancestors = []) {
    assert.ok(!ancestors.includes(key), `cycle: ${[...ancestors, key]}`)
    const needs = jobs[key].needs || []
    for (const child of typeof needs === 'string' ? [needs] : needs)
      visit(child, [...ancestors, key])
  }
  visit('test')
})

test('stock API coverage has one CI execution path while focused local commands remain', () => {
  assert.equal(jobs['test-focused-background'], undefined)
  assert.ok(gate.needs.includes('api-e2e'))
  const root = JSON.parse(readFileSync('package.json', 'utf8'))
  const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'))
  assert.match(
    root.scripts['test:background-work-contracts'],
    /^pnpm --filter api test:e2e --runTestsByPath /
  )
  assert.equal(api.scripts['test:e2e'], 'node ../../scripts/api-e2e-ci.mjs')
})
