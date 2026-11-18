import { productAdminPath } from '@amcore/shared'
import { expect, test } from '@playwright/test'

import { logoutViaApi, registerViaUi, TEST_PASSWORD, uniqueEmail } from '../real-stack/helpers'
import { activeTarget, guardedSql } from '../support/managed-target.mjs'

import { getBrowserFixture } from './get-browser-fixture'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

for (const provider of ['google', 'github'] as const) {
  for (const surface of ['site', 'admin'] as const) {
    test(`${provider} GET callback completes selected ${surface} session with S256`, async ({
      browser,
    }) => {
      const m = activeTarget()
      const { product, staff } = m.origins
      if (!staff && !m.s0Scenario) throw new Error('Staff provider fixture required')
      const origin = surface === 'site' ? product : (staff ?? product)
      const destination = surface === 'admin' ? '/en' + productAdminPath('/organizations') : '/en'
      const context = await browser.newContext({
        baseURL: product,
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
      })
      const email = uniqueEmail(`${provider}-${surface}`)
      try {
        const page = await context.newPage()
        await registerViaUi(page, email)
        expect((await logoutViaApi(context.request, product)).status()).toBe(200)
        const seen = await getBrowserFixture(context, origin, email, provider, surface)
        await page.goto(
          `${origin}/api/${surface === 'admin' ? 'product-admin/' : ''}auth/oauth/${provider}`
        )
        try {
          await page.waitForURL((url) => url.origin === origin && url.pathname === destination, {
            timeout: 15000,
          })
        } catch {
          throw new Error('GET OAuth did not reach the selected signed-in destination')
        }
        expect(seen()).toBe(true)
        const response = await context.request.get(`${origin}/api/auth/me`)
        expect(response.status()).toBe(200)
        expect((await response.json()).user.email).toBe(email)
        expect(
          (await context.cookies(origin)).some((cookie) =>
            ['refresh_token', '__Host-amcore_admin_oauth_refresh'].includes(cookie.name)
          )
        ).toBe(false)
      } finally {
        await context.close().catch(() => undefined)
      }
    })
  }

  test(`${provider} selected account linking retains the current session without creating another login session`, async ({
    browser,
  }) => {
    const m = activeTarget()
    const { product, staff } = m.origins
    if (!staff && !m.s0Scenario) throw new Error('Staff provider fixture required')
    const admin = staff ?? product
    const cookieName = staff ? '__Host-amcore_staff_session' : 'amcore_session'
    const organizations = '/en' + productAdminPath('/organizations')
    const context = await browser.newContext({
      baseURL: product,
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
    })
    const email = uniqueEmail(`${provider}-link-owner`)
    const identityEmail = uniqueEmail(`${provider}-linked-identity`)
    try {
      const page = await context.newPage()
      await registerViaUi(page, email)
      if (staff) {
        await page.goto(`${staff}/en/login`)
        await page.getByRole('textbox', { name: /email/i }).fill(email)
        await page.getByLabel(/^password$/i).fill(TEST_PASSWORD)
        await page.getByRole('button', { name: /sign in/i }).click()
        await page.waitForURL((url) => url.origin === staff && url.pathname === organizations)
      } else {
        await page.goto(admin + organizations)
        await expect(page).toHaveURL(admin + organizations)
      }
      const sessionBefore = (await context.cookies(admin)).find(
        (cookie) => cookie.name === cookieName
      )?.value
      const sessions = () =>
        guardedSql(
          'SELECT count(*) FROM core.sessions s JOIN core.users u ON u.id=s."userId" WHERE u."emailCanonical"=:\'email\';',
          { email }
        ).trim()
      expect(Boolean(sessionBefore)).toBe(true)
      const countBefore = sessions()
      const seen = await getBrowserFixture(context, admin, identityEmail, provider, 'admin', true)
      await page.goto(`${admin}/api/product-admin/auth/oauth/${provider}/link`, {
        referer: admin + organizations,
      })
      try {
        await page.waitForURL(
          (url) =>
            url.origin === admin &&
            url.pathname === '/en' + productAdminPath('/auth/linked') &&
            url.searchParams.get('linked') === provider,
          { timeout: 15000 }
        )
      } catch {
        throw new Error('Provider linking did not reach the controlled result page')
      }
      expect(seen()).toBe(true)
      expect(sessions()).toBe(countBefore)
      expect(
        (await context.cookies(admin)).find((cookie) => cookie.name === cookieName)?.value ===
          sessionBefore
      ).toBe(true)
      const response = await context.request.get(`${admin}/api/auth/me`)
      expect((await response.json()).user.email).toBe(email)
      expect(
        guardedSql(
          'SELECT count(*) FROM core.oauth_accounts a JOIN core.users u ON u.id=a."userId" WHERE u."emailCanonical"=:\'email\';',
          { email }
        ).trim()
      ).toBe('1')
      expect(
        (await context.cookies(admin)).some(
          (cookie) => cookie.name === '__Host-amcore_admin_oauth_refresh'
        )
      ).toBe(false)
    } finally {
      await context.close().catch(() => undefined)
    }
  })
}
