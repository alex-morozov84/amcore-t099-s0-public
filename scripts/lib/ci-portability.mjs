import { existsSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readAdminConsoleSettings } from './settings-files.mjs'
import {
  readProductAdminPlacement,
  inspectProductAdminPlacement,
} from './product-admin-placement.mjs'
import { consoleEdgeFiles } from './console-edge.mjs'
import { productAdminEdgeFiles } from './product-admin-edge.mjs'
import { sourceSettings } from '../stand/settings-policy.mjs'

const variants = {
  S1: { locale: 'en', consoleMode: 'disabled', adminMode: 'path', adminAlias: 'backoffice' },
  S2: { locale: 'ru', consoleMode: 'host', adminMode: 'host', adminAlias: 'staff' },
}

/** Apply a declared starter variant only to a source copy without Git metadata. */
export async function prepareCiVariant(root, variant) {
  const choice = Object.hasOwn(variants, variant) ? variants[variant] : null
  if (!choice || existsSync(join(root, '.git')))
    throw new Error('Use S1/S2 in an isolated source copy, never an authoring checkout')
  const source = await sourceSettings(root)
  const consoleSettings = readAdminConsoleSettings(root)
  const admin = readProductAdminPlacement(root)
  const routes = join(root, 'apps/web/src/app/[locale]')
  if (consoleSettings.alias !== 'ops')
    await rename(join(routes, consoleSettings.alias), join(routes, 'ops'))
  if (admin.alias !== choice.adminAlias)
    await rename(
      join(routes, '(product-admin)', admin.alias),
      join(routes, '(product-admin)', choice.adminAlias)
    )
  const settings = {
    locales: { version: 1, enabled: [choice.locale], default: choice.locale },
    'admin-console': { version: 1, mode: choice.consoleMode, alias: 'ops' },
    'product-admin': { version: 1, mode: choice.adminMode, alias: choice.adminAlias },
  }
  for (const [name, value] of Object.entries(settings))
    await writeFile(
      join(root, `packages/shared/src/config/${name}.json`),
      JSON.stringify(value, null, 2) + '\n'
    )
  inspectProductAdminPlacement(root)
  consoleEdgeFiles(root, true)
  productAdminEdgeFiles(root, true)
  return { variant, source, exercised: await sourceSettings(root) }
}
