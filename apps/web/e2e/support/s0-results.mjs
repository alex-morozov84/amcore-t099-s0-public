import { error as logError } from 'node:console'

import { writeFileSync } from 'node:fs'
import { proveBrowserCases } from '../../../../scripts/stand/s0-case-evidence.mjs'

// Store only the case-set hash and run identity. Raw Playwright JSON records secret-bearing steps.
export default class S0Results {
  onBegin(_config, suite) {
    this.tests = suite.allTests()
  }

  onEnd(result) {
    if (result.status !== 'passed') return
    try {
      const { expected, file, ...identity } = JSON.parse(process.env.AMCORE_S0_REPORT)
      const tests = identity.configured
        ? this.tests.filter(({ expectedStatus }) => expectedStatus !== 'skipped')
        : this.tests
      const observed = proveBrowserCases(tests, expected)
      writeFileSync(file, JSON.stringify({ ...identity, observed }), { flag: 'wx', mode: 0o600 })
    } catch (error) {
      logError(error.message)
      return { status: 'failed' }
    }
  }
}
