import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCiRole } from './lib/ci-policy.mjs'
import { prepareCiVariant } from './lib/ci-portability.mjs'
import { snapshot } from './stand/snapshot.mjs'
import { run, stopChildren, requestCancellation } from './stand/process.mjs'

const root = join(import.meta.dirname, '..')
const [variant, packages, option] = process.argv.slice(2)
const selected = packages?.split(',') ?? []
let copy
const controller = new globalThis.AbortController()
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    requestCancellation()
    controller.abort()
    process.exitCode = signal === 'SIGINT' ? 130 : 143
  })
const execute = (command, args) => run(command, args, { cwd: copy, signal: controller.signal })
try {
  if (
    !['S1', 'S2'].includes(variant) ||
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((name) => !['api', 'web', 'shared'].includes(name)) ||
    (option !== undefined && option !== '--prepare-only') ||
    process.argv.length > 5
  )
    throw new Error('Use: node scripts/ci-portability.mjs S1|S2 api,web,shared [--prepare-only]')
  if (parseCiRole(await readFile(join(root, 'PROJECT_CONTEXT.md'), 'utf8')) !== 'upstream-starter')
    throw new Error('Starter variants do not replace native product checks')
  copy = await mkdtemp(join(tmpdir(), 'amcore-ci-portability-'))
  console.log(`Portability source copy: ${copy}`)
  await snapshot(root, copy)
  console.log(JSON.stringify(await prepareCiVariant(copy, variant)))
  if (option !== '--prepare-only') {
    // Existing lint-contract fixtures enumerate a real Git root and its source inventory.
    await execute('git', ['init', '--quiet', '--initial-branch=ci-portability'])
    await execute('git', ['add', '--all'])
    await execute('pnpm', ['install', '--frozen-lockfile'])
    await execute(process.execPath, ['scripts/api-e2e-ci.mjs', '--prepare'])
    const reports = join(root, '.amcore/ci-portability-results')
    await mkdir(reports, { recursive: true })
    for (const name of selected) {
      const report = join(reports, `${variant}-${name}.json`)
      await rm(report, { force: true })
      // Native diagnostic reports survive copy cleanup; exit status remains the verdict.
      await execute('pnpm', [
        '--filter',
        name,
        ...(name === 'web'
          ? ['test:run', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`]
          : name === 'api'
            ? [
                'test',
                '--config',
                join(copy, 'scripts/api-unit-portability.config.mjs'),
                '--passWithNoTests=false',
                '--json',
                '--outputFile',
                report,
              ]
            : ['test', '--reporter=default', '--reporter=json', `--outputFile.json=${report}`]),
      ])
    }
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  try {
    await stopChildren()
    if (copy) await rm(copy, { recursive: true, force: true })
  } catch (error) {
    console.error(`Temporary source retained for cleanup: ${copy}`)
    console.error(error.message)
    process.exitCode ||= 1
  }
}
