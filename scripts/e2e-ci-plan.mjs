import { readFileSync } from 'node:fs'
import { readAdminConsoleSettings, readLocaleSettings } from './lib/settings-files.mjs'
import { productAdminCiLanes, s0Scenarios } from './product-admin-e2e-plan.mjs'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const specPattern = /\.(spec|test)\.[cm]?[jt]sx?$/
export function specFiles(root, directory = 'apps/web/e2e/real-stack') {
  const base = join(root, directory)
  if (!existsSync(base)) throw new Error(`Missing E2E directory: ${directory}`)
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        specPattern.test(entry.name) &&
        !(
          directory === 'apps/web/e2e/real-stack' &&
          entry.name === 'product-admin-oauth-path.spec.ts'
        )
    )
    .map((entry) => relative(join(root, 'apps/web'), join(entry.parentPath, entry.name)))
    .sort()
}

// Specs that stall or pause the stand's shared services run in their own lane. The Redis outage
// specs pause Redis for seconds at a time, which the standard lane's time budget cannot absorb.
export const disruptiveSpec = (file) =>
  /(?:runtime-settings|background-work|redis-outage-session|redis-outage-controls|redis-stall|refresh-owner-held)\.(?:spec|test)\./.test(
    file
  )
export function selectedFiles(root, group) {
  if (!['standard', 'disruptive'].includes(group)) throw new Error('Unknown E2E group')
  return specFiles(root).filter((file) => disruptiveSpec(file) === (group === 'disruptive'))
}

export function ciLanes(root, { configured = false, s0 = false } = {}) {
  if (s0) return s0Lanes(root)
  if (configured) return configuredLanes(root)
  const lanes = ['safety', 'mocked', 'path-standard', 'setup-cli']
  if (selectedFiles(root, 'disruptive').length) lanes.push('path-disruptive')
  if (existsSync(join(root, 'scripts/run-console-session-e2e.mjs')))
    lanes.push('host', 'setup-console')
  return [...lanes, ...productAdminCiLanes(root)]
}

export function admitS0(root) {
  const console = readAdminConsoleSettings(root)
  const locales = readLocaleSettings(root)
  const admin = JSON.parse(
    readFileSync(join(root, 'packages/shared/src/config/product-admin.json'))
  )
  if (
    console.mode !== 'path' ||
    console.alias !== 'admin' ||
    admin.mode !== 'path' ||
    admin.alias !== 'manage' ||
    locales.default !== 'en' ||
    locales.enabled.join(',') !== 'en,ru'
  )
    throw new Error('Synthetic browser inventory requires S0 source settings')
}

export function s0Lanes(root) {
  admitS0(root)
  const standard = selectedFiles(root, 'standard')
  for (const file of [
    'catalogue.spec.ts',
    'product-admin-path.spec.ts',
    'product-admin-adoption.spec.ts',
  ]) {
    if (!standard.includes('e2e/real-stack/' + file))
      throw new Error('Missing required standard spec: ' + file)
  }
  if (!selectedFiles(root, 'disruptive').length) throw new Error('Missing disruptive specs')
  for (const scenario of Object.values(s0Scenarios)) {
    const specs = [
      ...scenario.files.map((file) => join(scenario.directory, file)),
      ...(scenario.extraFiles ?? []).map((file) => join(scenario.extraDirectory, file)),
    ]
    for (const file of specs) {
      if (!existsSync(join(root, 'apps/web/e2e', file)))
        throw new Error('Missing specialist spec: ' + file)
    }
  }
  return [
    'safety',
    'mocked',
    'configured-standard',
    'configured-disruptive',
    ...Object.keys(s0Scenarios),
  ]
}

export function s0Arguments(root, lane) {
  if (!s0Lanes(root).includes(lane)) throw new Error('Inapplicable configured lane')
  const args = [
    '--lane',
    lane === 'mocked' ? 'mocked' : 'real-stack',
    '--settings-policy',
    'preserve',
  ]
  if (s0Scenarios[lane]) return [...args, '--s0-scenario', lane]
  if (lane !== 'mocked') args.push('--ci-group', lane.slice('configured-'.length))
  return args
}

/** Native Docker lanes only; mocked transport and starter fixtures remain separate obligations. */
export function configuredLanes(root) {
  const lanes = ['configured-standard']
  if (selectedFiles(root, 'disruptive').length) lanes.push('configured-disruptive')
  if (readAdminConsoleSettings(root).mode === 'host') lanes.push('configured-console')
  return lanes
}

export function configuredArguments(root, lane) {
  if (!configuredLanes(root).includes(lane)) throw new Error('Inapplicable configured lane')
  const args = ['--lane', lane === 'configured-console' ? 'console-real-stack' : 'real-stack']
  if (lane !== 'configured-console') args.push('--ci-group', lane.slice('configured-'.length))
  return [...args, '--settings-policy', 'preserve']
}
