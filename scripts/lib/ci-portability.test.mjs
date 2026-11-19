import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prepareCiVariant } from './ci-portability.mjs'
import { consoleEdgeFiles } from './console-edge.mjs'
import { productAdminEdgeFiles } from './product-admin-edge.mjs'
import { inspectProductAdminPlacement } from './product-admin-placement.mjs'
import { sourceSettings } from '../stand/settings-policy.mjs'

const root = join(import.meta.dirname, '../..')

test('both variants retain valid physical aliases and matching generated edge', async (t) => {
  const source = await sourceSettings(root)
  for (const variant of ['S1', 'S2']) {
    const copy = mkdtempSync(join(tmpdir(), 'ci-variant-contract-'))
    t.after(() => rmSync(copy, { recursive: true, force: true }))
    for (const file of [
      'packages/shared/src/config/locales.json',
      'packages/shared/src/config/admin-console.json',
      'packages/shared/src/config/product-admin.json',
      'docker/caddy/Caddyfile.console-host',
      'docker/nginx/operations-console.conf',
    ])
      cpSync(join(root, file), join(copy, file), { recursive: true })
    const routes = join(copy, 'apps/web/src/app/[locale]')
    for (const path of [
      source['admin-console'].alias,
      `(product-admin)/${source['product-admin'].alias}`,
    ]) {
      mkdirSync(join(routes, path), { recursive: true })
      writeFileSync(join(routes, path, 'page.tsx'), '')
    }
    for (const page of ['login', 'organizations', 'settings/api-keys', 'settings/sessions']) {
      const directory = join(routes, '(product-admin)', source['product-admin'].alias, page)
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'page.tsx'), '')
    }
    mkdirSync(join(copy, 'apps/web/public'), { recursive: true })
    const result = await prepareCiVariant(copy, variant)
    assert.deepEqual(result.source, source)
    assert.equal(result.exercised['admin-console'].alias, 'ops')
    assert.equal(result.exercised.locales.enabled.length, 1)
    assert.equal(result.exercised.locales.default, variant === 'S1' ? 'en' : 'ru')
    assert.equal(result.exercised['admin-console'].mode, variant === 'S1' ? 'disabled' : 'host')
    assert.equal(result.exercised['product-admin'].mode, variant === 'S1' ? 'path' : 'host')
    assert.doesNotThrow(() => inspectProductAdminPlacement(copy))
    assert.doesNotThrow(() => consoleEdgeFiles(copy))
    assert.doesNotThrow(() => productAdminEdgeFiles(copy))
    renameSync(join(routes, 'ops'), join(routes, 'lost-console'))
    assert.throws(() => inspectProductAdminPlacement(copy), /physical routes/)
  }
  assert.deepEqual(await sourceSettings(root), source)
})

test('variant preparation refuses the authoring checkout and unknown variants before edits', async () => {
  const source = await sourceSettings(root)
  for (const variant of ['S1', 'S2', 'S3', 'constructor'])
    await assert.rejects(prepareCiVariant(root, variant), /isolated source copy/)
  assert.deepEqual(await sourceSettings(root), source)
})
