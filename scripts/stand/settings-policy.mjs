import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

export async function sourceSettings(root) {
  return Object.fromEntries(
    await Promise.all(
      ['locales', 'admin-console', 'product-admin'].map(async (name) => [
        name,
        JSON.parse(await readFile(join(root, `packages/shared/src/config/${name}.json`), 'utf8')),
      ])
    )
  )
}

/** Retain source and exercised choices in the existing stand manifest. */
export async function recordSettings(m) {
  m.exercisedSettings = await sourceSettings(m.snapshot)
  await assertSettings(m)
}

export async function assertSettings(m) {
  if (!m.settingsPolicy) return // Existing retained stands predate this manifest field.
  if (!['preserve', 'variant'].includes(m.settingsPolicy))
    throw new Error('Invalid settings policy')
  const exercised = await sourceSettings(m.snapshot)
  if (!isDeepStrictEqual(exercised, m.exercisedSettings))
    throw new Error('Stand settings changed after preparation')
  if (m.settingsPolicy === 'preserve' && !isDeepStrictEqual(m.sourceSettings, exercised))
    throw new Error('Product execution must preserve source settings')
}

export function assertPreserveRequest(policy, fixture, topology, choices) {
  if (!['preserve', 'variant'].includes(policy)) throw new Error('Invalid settings policy')
  if (policy === 'preserve' && (fixture || (topology && topology !== choices.topology)))
    throw new Error('Preserved settings cannot use a topology variant or fixture')
}

/** Admit native transport before allocating a stand or contacting its engine. */
export function preservedTopology(lane, choices) {
  if (
    lane === 'console-real-stack' &&
    (!choices.consoleEnabled || choices.consoleTopology !== 'host')
  )
    throw new Error('Native Console lane requires enabled host source settings')
  if (lane === 'product-admin-real-stack')
    throw new Error('Native product checks use real-stack, not starter staff fixtures')
  if (lane === 'mocked' && choices.topology === 'host')
    throw new Error('Native mocked host transport is not prepared')
  return choices.topology
}
