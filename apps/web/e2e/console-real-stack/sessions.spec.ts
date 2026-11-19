import { completeMfaSignIn, completeMfaStepUp } from '../shared/mfa-login'
import {
  consolePath,
  isProductHome,
  messages,
  productPath,
  translate,
} from '../shared/product-settings'
import { activeTarget } from '../support/managed-target.mjs'

const standTarget = activeTarget()
import { expect, test } from '@playwright/test'

import { registerViaUi, TEST_PASSWORD, uniqueEmail } from '../real-stack/helpers'
import { guardedExec, guardedSql } from '../support/managed-target.mjs'

import { ageSessionLastAuthAt, setSystemRole } from './helpers'

function exec(service: string, args: string[]): string {
  return guardedExec(service, ...args).trim()
}

test('Console session preserves current UA on actual vault rotation; Sessions revoke requires step-up', async ({
  browser,
}) => {
  const host = standTarget.consoleTopology === 'host'
  const consoleOrigin = standTarget.origins.console ?? standTarget.origins.product
  const consoleUrlPath = host ? productPath : consolePath
  const email = uniqueEmail('host-sessions-admin'),
    target = uniqueEmail('host-sessions-target')
  const product = await browser.newContext({
    baseURL: `${standTarget.origins.product}`,
    ignoreHTTPSErrors: true,
  })
  const productPage = await product.newPage()
  await registerViaUi(productPage, email)
  await expect(productPage).toHaveURL(isProductHome)
  await product.clearCookies()
  await registerViaUi(productPage, target)
  await expect(productPage).toHaveURL(isProductHome)
  setSystemRole(email, 'SUPER_ADMIN')
  const admin = await browser.newContext({
    baseURL: consoleOrigin,
    ignoreHTTPSErrors: true,
  })
  const page = await admin.newPage()
  await page.goto(productPath('/login'))
  await page.getByLabel(messages.auth.email, { exact: true }).fill(email)
  await page.getByLabel(messages.auth.password, { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: messages.auth.login, exact: true }).click()
  await completeMfaSignIn(page, email)
  await expect(page).toHaveURL((url) => url.origin === consoleOrigin && isProductHome(url))
  await page.waitForLoadState('networkidle')
  ageSessionLastAuthAt(email)
  const sid = (await admin.cookies()).find(
    (cookie) => cookie.name === (host ? '__Host-amcore_console_session' : 'amcore_session')
  )!.value
  const key = `web:${host ? 'console-session' : 'session'}:v1:${sid}`
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0 T011-host-rotation'
  expect(
    exec('redis', [
      'redis-cli',
      'EVAL',
      "local v=cjson.decode(redis.call('GET',KEYS[1]));v.accessTokenExpiresAt=0;redis.call('SET',KEYS[1],cjson.encode(v),'KEEPTTL');return 1",
      '1',
      key,
    ])
  ).toBe('1')
  const targetId = guardedSql(`SELECT id FROM core.users WHERE "emailCanonical" = :'email';`, {
    email: target,
  }).trim()
  const refreshed = await admin.request.get(consoleUrlPath(`/users/${targetId}`), {
    headers: { 'User-Agent': ua },
  })
  expect(refreshed.status()).toBe(200)
  expect(
    guardedSql(
      `SELECT s."userAgent" FROM core.sessions s JOIN core.users u ON u.id=s."userId" WHERE u."emailCanonical" = :'email' AND s."revokedAt" IS NULL ORDER BY s."createdAt" DESC LIMIT 1;`,
      { email }
    ).trim()
  ).toBe(ua)
  await page.goto(consoleUrlPath(`/users/${targetId}`))
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: translate('console.userSessionsHeading', { count: 1 }),
    })
  ).toBeVisible()
  const responses: number[] = []
  page.on('response', (response) => {
    const path = host ? '/api/auth/step-up' : '/api/console/auth/step-up'
    if (new URL(response.url()).pathname === path) responses.push(response.status())
  })
  await page
    .getByRole('button', { name: messages.console.userSessionsRevokeAll, exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: messages.console.userSessionsRevokeAll, exact: true })
    .click()
  const stepUp = page.getByRole('dialog', { name: messages.console.stepUpTitle })
  await expect(stepUp).toBeVisible()
  await stepUp.getByLabel(messages.auth.password, { exact: true }).fill(TEST_PASSWORD)
  await stepUp.getByRole('button', { name: messages.console.stepUpSubmit }).click()
  await completeMfaStepUp(page, email)
  await expect(page.getByText(messages.console.userSessionsEmpty, { exact: true })).toBeVisible()
  expect(responses).toEqual([202, 204])
  await admin.close()
  await product.close()
})
