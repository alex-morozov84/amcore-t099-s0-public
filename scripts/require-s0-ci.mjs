import { runIdentity } from './lighthouse/identity.mjs'
import { requireS0Results } from './lib/s0-ci-results.mjs'

const plan = JSON.parse(process.env.S0_PLAN)
if (plan.base !== process.env.POLICY_SOURCE) throw new Error('CI plan base mismatch')

requireS0Results(
  JSON.parse(process.env.CI_RESULTS),
  plan,
  runIdentity(process.cwd()),
  process.argv[2]
)
