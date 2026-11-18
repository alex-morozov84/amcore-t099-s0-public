import assert from 'node:assert/strict'
import { cardCaseIds } from './lib/s0-card-selection.mjs'
import { validateEnvelopes } from './lib/lighthouse-ci-evidence.mjs'
import { requireCompleteCi, requiredCiJobs } from './lib/ci-required.mjs'
import { caseDigest, proveBrowserCases } from './stand/s0-case-evidence.mjs'

const mode = process.argv[2]
assert.ok(['missing', 'failed', 'skipped', 'cancelled'].includes(mode))
const lane = 'configured-standard'
const hash = caseDigest(cardCaseIds)
const identity = {
  source: process.env.GITHUB_SHA,
  run: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT,
}
const plan = {
  ...identity,
  digest: hash,
  assignments: { [lane]: [] },
  browserCases: { [lane]: hash },
}
const cases = cardCaseIds.map((id) => ({
  id,
  expectedStatus: 'passed',
  results: [{ status: 'passed' }],
}))
const upstream = { 'web-e2e-plan': { result: 'success' }, 'web-e2e-lanes': { result: 'success' } }
const pass = {
  ...identity,
  lane,
  plan: hash,
  expected: [],
  observed: [],
  outcomes: {
    setup: 'passed',
    test: 'passed',
    termination: 'passed',
    cleanup: 'passed',
    originalUpload: 'passed',
    audit: 'not_applicable',
    view: 'not_applicable',
    export: 'not_applicable',
    upload: 'not_applicable',
  },
  browserEvidence: { ...identity, plan: hash, lane, observed: proveBrowserCases(cases, hash) },
}
validateEnvelopes(plan, [pass], upstream)
if (mode === 'missing') delete pass.browserEvidence
if (mode === 'cancelled') upstream['web-e2e-lanes'].result = 'cancelled'
try {
  if (mode === 'failed' || mode === 'skipped') {
    cases[0].results[0].status = mode
    proveBrowserCases(cases, hash)
  }
  validateEnvelopes(plan, [pass], upstream)
} catch (error) {
  const expected = {
    missing: 'missing-or-foreign-browser-cases',
    failed: 'A selected S0 browser case failed or did not run',
    skipped: 'A selected S0 browser case failed or did not run',
    cancelled: 'earlier-ci-failure',
  }[mode]
  assert.equal(error.message, expected)
  console.log(mode + ': ' + error.message)
  const needs = Object.fromEntries(requiredCiJobs.map((name) => [name, { result: 'success' }]))
  needs['web-e2e'].result = 'failure'
  assert.throws(() => requireCompleteCi(needs), /web-e2e/)
  console.log('CI required rejected Web E2E failure')
  process.exitCode = 1
}
if (!process.exitCode) {
  console.error('CONTROL WAS NOT REJECTED')
  process.exitCode = 2
}
