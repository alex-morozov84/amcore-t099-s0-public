import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'
import { requiredCiJobs, requireCompleteCi } from './ci-required.mjs'
import { requireS0Results, sealS0Plan } from './s0-ci-results.mjs'

const successful = () =>
  Object.fromEntries(requiredCiJobs.map((name) => [name, { result: 'success' }]))

const workflowInventory = [...requiredCiJobs, 'test-email', 'deployment-version', 'ci-plan']
const identity = { source: 'a'.repeat(40), run: '123', attempt: '1' }

test('admission covers every workflow job, including browser and component families', () => {
  const { jobs } = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
  assert.deepEqual(
    Object.keys(jobs)
      .filter((name) => name !== 'ci-required')
      .sort(),
    [...workflowInventory].sort()
  )
  assert.deepEqual([...jobs['ci-required'].needs].sort(), [...workflowInventory].sort())
  assert.equal(jobs['ci-required'].if, '${{ always() }}')
  const step = jobs['ci-required'].steps.find((entry) => entry.run)
  assert.equal(step.env.CI_RESULTS, '${{ toJSON(needs) }}')
  assert.match(step.run, /scripts\/require-s0-ci\.mjs/)
  assert.equal(step.env.S0_PLAN, '${{ needs.ci-plan.outputs.plan }}')
  for (const name of workflowInventory.filter((job) => job !== 'ci-plan')) {
    assert.ok(jobs[name].needs.includes('ci-plan'))
    assert.ok(
      jobs[name].if.includes(`contains(fromJSON(needs.ci-plan.outputs.plan).jobs, '${name}')`)
    )
  }
  assert.doesNotThrow(() => requireCompleteCi(successful()))
})

test('one lost, cancelled, failed or skipped family cannot be hidden by the other successes', () => {
  for (const name of requiredCiJobs) {
    for (const result of ['failure', 'cancelled', 'skipped', 'neutral', undefined]) {
      assert.throws(
        () => requireCompleteCi({ ...successful(), [name]: { result } }),
        /did not succeed/
      )
    }
    const missing = successful()
    delete missing[name]
    assert.throws(() => requireCompleteCi(missing), /inventory/)
  }
  assert.throws(
    () => requireCompleteCi({ ...successful(), unexpected: { result: 'success' } }),
    /inventory/
  )
})

test('the actual gate command rejects malformed input and propagates the failure exit', () => {
  for (const value of [
    '',
    'null',
    '[]',
    '{}',
    '{',
    JSON.stringify({ ...successful(), storybook: { result: 'skipped' } }),
  ]) {
    const result = spawnSync(process.execPath, ['scripts/ci-required.mjs'], {
      env: { ...process.env, CI_RESULTS: value },
      encoding: 'utf8',
    })
    assert.equal(result.status, 1, value)
  }
  const result = spawnSync(process.execPath, ['scripts/ci-required.mjs'], {
    env: { ...process.env, CI_RESULTS: JSON.stringify(successful()) },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('plan gate rejects missing selected outcomes and mismatched source, run or attempt', () => {
  const selected = ['lint', 'typecheck', 'promtool', 'storybook']
  const plan = sealS0Plan({ ...identity, scope: 'selected-families', jobs: selected })
  const result = (job) => ({
    result: job === 'ci-plan' || selected.includes(job) ? 'success' : 'skipped',
  })
  const results = Object.fromEntries(workflowInventory.map((job) => [job, result(job)]))
  assert.doesNotThrow(() => requireS0Results(results, plan, identity))
  for (const outcome of [undefined, 'skipped', 'cancelled', 'failure']) {
    const evidence = { ...results }
    if (outcome === undefined) delete evidence.storybook
    else evidence.storybook = { result: outcome }
    assert.throws(() => requireS0Results(evidence, plan, identity), /inventory|storybook/)
  }
  for (const key of Object.keys(identity))
    assert.throws(
      () => requireS0Results(results, plan, { ...identity, [key]: 'other' }),
      /mismatch/
    )
  assert.throws(() => requireS0Results(results, { ...plan, jobs: [] }, identity), /digest/)
  assert.throws(
    () => requireS0Results({ ...results, 'api-e2e': { result: 'success' } }, plan, identity),
    /api-e2e/
  )
  for (const family of ['test-email', 'deployment-version'])
    assert.throws(() =>
      sealS0Plan({
        ...identity,
        scope: 'full-applicable',
        jobs: workflowInventory.filter(
          (job) => !['ci-plan', 'test-capability', family].includes(job)
        ),
      })
    )
})
