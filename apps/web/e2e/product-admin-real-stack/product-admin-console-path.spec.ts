import { DEFAULT_LOCALE, localizedFrontendUrl, productAdminPath } from '@amcore/shared'
import { expect, test } from '@playwright/test'

import { setSystemRole } from '../real-stack/admin-helpers'
import {
  loginViaUi,
  logoutViaApi,
  registerViaUi,
  TEST_PASSWORD,
  uniqueEmail,
} from '../real-stack/helpers'
import { completeMfaSignIn } from '../shared/mfa-login'
import { activeTarget } from '../support/managed-target.mjs'

test('Console path and product administration enforce their configured session placement', async ({
  browser,
}) => {
  const { product, staff } = activeTarget().origins
  const native = activeTarget().s0Scenario === 'configured-placement'
  if (!staff && !native) throw new Error('Staff host required')
  const context = await browser.newContext({ baseURL: product, ignoreHTTPSErrors: true })
  try {
    const page = await context.newPage()
    const email = uniqueEmail('console-path-staff')
    await registerViaUi(page, email)
    if (native)
      expect((await context.request.get(`${product}/api/console/access`)).status()).toBe(403)
    expect((await logoutViaApi(context.request, product)).status()).toBe(200)
    setSystemRole(email, 'SUPER_ADMIN')
    await loginViaUi(page, email)
    await page.waitForURL((url) => url.origin === product && url.pathname === '/en')
    expect((await context.request.get(`${product}/api/console/access`)).status()).toBe(204)
    if (native) {
      const destination = localizedFrontendUrl(
        product,
        DEFAULT_LOCALE,
        productAdminPath('/organizations')
      )
      await page.goto(destination)
      await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
      await page.goto(localizedFrontendUrl(product, DEFAULT_LOCALE, '/admin'))
      expect((await context.request.get(`${product}/api/console/access`)).status()).toBe(204)
      expect((await logoutViaApi(context.request, product)).status()).toBe(200)
      expect((await context.request.get(`${product}/api/console/access`)).status()).toBe(401)
      await page.goto(destination)
      const login = localizedFrontendUrl(product, DEFAULT_LOCALE, productAdminPath('/login'))
      await expect(page).toHaveURL((url) => url.origin + url.pathname === login)
      return
    }
    await page.goto(`${staff}/en/login`)
    await page.getByRole('textbox', { name: /email/i }).fill(email)
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD)
    const signIn = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith('/auth/login') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: /sign in/i }).click()
    if ((await signIn).status() === 202) await completeMfaSignIn(page, email)
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
    expect((await context.request.get(`${staff}/api/console/access`)).status()).toBe(404)
    expect((await logoutViaApi(context.request, product)).status()).toBe(200)
    expect((await context.request.get(`${product}/api/console/access`)).status()).toBe(401)
    expect((await context.request.get(`${staff}/api/auth/me`)).status()).toBe(200)
  } finally {
    await context.close()
  }
})
