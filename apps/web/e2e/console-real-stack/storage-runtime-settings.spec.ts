import { expect, test } from '@playwright/test'

import { registerViaUi, uniqueEmail } from '../real-stack/helpers'
import { completeMfaSignIn } from '../shared/mfa-login'
import { isProductHome, messages, productPath } from '../shared/product-settings'
import { storageSettingJourney } from '../shared/storage-setting-journey'
import { activeTarget } from '../support/managed-target.mjs'

import { setSystemRole } from './helpers'

test('Overview Edit/Cancel/Save and operator reset in HTTPS host topology', async ({ browser }) => {
  const target = activeTarget()
  const email = uniqueEmail('storage-setting-host')
  const product = await browser.newContext({
    baseURL: target.origins.product,
    ignoreHTTPSErrors: true,
  })
  const console = await browser.newContext({
    baseURL: target.origins.console,
    ignoreHTTPSErrors: true,
  })
  try {
    const page = await product.newPage()
    await registerViaUi(page, email)
    await expect(page).toHaveURL(isProductHome)
    setSystemRole(email, 'SUPER_ADMIN')
    const operator = await console.newPage()
    // Protected pages intentionally fail closed before the separate host login.
    expect((await operator.goto(productPath()))?.status()).toBe(404)
    await operator.goto(productPath('/login'))
    await operator.getByLabel(messages.auth.email, { exact: true }).fill(email)
    await operator.getByLabel(messages.auth.password, { exact: true }).fill('Test1234Secure')
    await operator.getByRole('button', { name: messages.auth.login, exact: true }).click()
    await completeMfaSignIn(operator, email)
    await expect(operator).toHaveURL(isProductHome)
    await storageSettingJourney(operator, '/api/runtime-settings/storage-probe')
  } finally {
    await product.close()
    await console.close()
  }
})
