import type { Page } from '@playwright/test'

import { completeMfaSignIn } from './mfa-login'
import { messages, productPath } from './product-settings'

/** The dedicated Console host serves its own login form and requires MFA. */
export async function loginToConsoleHost(page: Page, email: string, password: string) {
  const t = messages.console
  await page.goto(productPath('/login'))
  await page.getByLabel(t.loginEmail, { exact: true }).fill(email)
  await page.getByLabel(t.loginPassword, { exact: true }).fill(password)
  await page.getByRole('button', { name: t.signIn, exact: true }).click()
  await completeMfaSignIn(page, email)
}
