import assert from 'node:assert/strict'
import { configuredLanes } from '../e2e-ci-plan.mjs'
import { readAdminConsoleSettings } from './settings-files.mjs'
import { caseDigest } from '../stand/s0-case-evidence.mjs'

export function configuredBrowserCases(root, identity, collection) {
  const { lanes, ...sourceIdentity } = collection
  assert.deepEqual(sourceIdentity, identity, 'Configured collection identity mismatch')
  const expected = configuredLanes(root)
  assert.deepEqual(Object.keys(lanes), expected, 'Configured collection lanes mismatch')
  const mode = readAdminConsoleSettings(root).mode
  const applicable = (lane) =>
    lanes[lane].filter(({ expectedStatus }) => expectedStatus !== 'skipped')
  if (mode === 'disabled')
    assert.equal(
      applicable('configured-standard').filter(
        ({ file, title }) =>
          file === 'e2e/real-stack/admin-overview.spec.ts' &&
          title === 'disabled Console refuses its page and BFF for an authenticated operator'
      ).length,
      1,
      'Missing mandatory disabled Console case'
    )
  if (mode === 'host')
    assert.ok(
      applicable('configured-console').some(
        ({ file, title }) =>
          file === 'e2e/console-real-stack/overview.spec.ts' &&
          title.startsWith('host-mode Overview panel renders real readiness')
      ),
      'Missing mandatory host Console case'
    )
  return Object.fromEntries(
    expected.map((lane) => {
      const tests = applicable(lane)
      assert.ok(tests.every(({ expectedStatus }) => expectedStatus === 'passed'))
      return [lane, caseDigest(tests.map(({ caseId }) => caseId))]
    })
  )
}
