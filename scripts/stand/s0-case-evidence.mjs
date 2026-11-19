import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function caseDigest(ids) {
  assert.ok(ids.length > 0, 'Empty S0 browser inventory')
  assert.equal(new Set(ids).size, ids.length, 'Duplicate S0 browser cases')
  assert.ok(
    ids.every((id) => typeof id === 'string' && id.length > 0),
    'Invalid S0 case ID'
  )
  return createHash('sha256')
    .update(JSON.stringify([...ids].sort()))
    .digest('hex')
}

export function browserCaseDigests(root, lanes) {
  const cases = JSON.parse(readFileSync(join(root, 'ci/s0-browser-cases.json'), 'utf8'))
  assert.deepEqual(Object.keys(cases).sort(), lanes.filter((lane) => lane !== 'safety').sort())
  for (const value of Object.values(cases))
    assert.match(value, /^[a-f0-9]{64}$/, 'Invalid S0 case digest')
  return cases
}

export function proveBrowserCases(tests, expected) {
  assert.ok(
    tests.every(
      ({ expectedStatus, results }) =>
        expectedStatus === 'passed' && results.at(-1)?.status === 'passed'
    ),
    'A selected S0 browser case failed or did not run'
  )
  const observed = caseDigest(tests.map((test) => test.id))
  assert.equal(observed, expected, 'Missing or unexpected S0 browser case')
  return observed
}
