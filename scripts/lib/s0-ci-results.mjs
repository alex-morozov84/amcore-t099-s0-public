import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { requiredCiJobs } from './ci-required.mjs'

export const s0Jobs = Object.freeze([...requiredCiJobs, 'test-email', 'deployment-version'])
const testJobs = ['test-unit-redis', 'test-capability', 'test-notification-ai', 'api-e2e']
const inapplicable = 'test-capability'

function digest(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

export function sealS0Plan(selection) {
  const { jobs, ...fields } = selection
  assert.equal(new Set(jobs).size, jobs.length, 'Duplicate selected jobs')
  assert.ok(
    jobs.every((job) => s0Jobs.includes(job)),
    'Unknown selected job'
  )
  const excluded = Object.fromEntries(
    s0Jobs
      .filter((job) => !jobs.includes(job))
      .map((job) => [job, job === inapplicable ? 'starter-only' : 'outside-selected-families'])
  )
  const plan = { ...fields, jobs, excluded }
  validateS0Selection(plan)
  return { ...plan, digest: digest(plan) }
}

function validateS0Selection(plan) {
  const { jobs, excluded } = plan
  assert.deepEqual(
    [...jobs, ...Object.keys(excluded)].sort(),
    [...s0Jobs].sort(),
    'CI plan inventory mismatch'
  )
  for (const job of ['lint', 'typecheck', 'promtool'])
    assert.ok(jobs.includes(job), `Missing ${job}`)
  assert.equal(excluded[inapplicable], 'starter-only')
  if (plan.scope === 'full-applicable') assert.deepEqual(Object.keys(excluded), [inapplicable])
  else assert.equal(plan.scope, 'selected-families')
  for (const [job, reason] of Object.entries(excluded))
    assert.equal(reason, job === inapplicable ? 'starter-only' : 'outside-selected-families')
}

export function requireS0Results(results, envelope, identity, scope) {
  const { digest: checksum, ...plan } = envelope
  assert.equal(checksum, digest(plan), 'CI plan digest mismatch')
  for (const key of ['source', 'run', 'attempt'])
    assert.equal(plan[key], identity[key], `CI plan ${key} mismatch`)
  validateS0Selection(plan)
  assert.equal(results['ci-plan']?.result, 'success', 'CI plan did not succeed')
  const expected = scope === 'test' ? testJobs : s0Jobs
  assert.deepEqual(
    Object.keys(results).sort(),
    [...expected, 'ci-plan'].sort(),
    'CI dependency inventory mismatch'
  )
  for (const job of expected) {
    const selected = plan.jobs.includes(job)
    assert.equal(
      results[job]?.result,
      selected ? 'success' : 'skipped',
      `Unexpected result for ${job}`
    )
  }
}
