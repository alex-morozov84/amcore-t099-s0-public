import { expect, test } from '@playwright/test'

import { registerViaUi, uniqueEmail } from '../real-stack/helpers'
import { backgroundWorkBoardStatesJourney } from '../shared/background-work-intercepted-journeys'
import { backgroundWorkJourney, queueBoardJourney } from '../shared/background-work-journey'
import { completeMfaSignIn } from '../shared/mfa-login'
import { isProductHome, messages, productPath } from '../shared/product-settings'
import { activeTarget } from '../support/managed-target.mjs'

import { setSystemRole } from './helpers'

/** Host topology: the Console has its own origin, session audience and login. */
async function operator(
  browser: Parameters<Parameters<typeof test>[2]>[0]['browser'],
  label: string
) {
  const target = activeTarget()
  const email = uniqueEmail(label)
  const product = await browser.newContext({
    baseURL: target.origins.product,
    ignoreHTTPSErrors: true,
  })
  const consoleContext = await browser.newContext({
    baseURL: target.origins.console,
    ignoreHTTPSErrors: true,
  })
  const productPage = await product.newPage()
  await registerViaUi(productPage, email)
  await expect(productPage).toHaveURL(isProductHome)
  setSystemRole(email, 'SUPER_ADMIN')
  const page = await consoleContext.newPage()
  await page.goto(productPath('/login'))
  await page.getByLabel(messages.auth.email, { exact: true }).fill(email)
  await page.getByLabel(messages.auth.password, { exact: true }).fill('Test1234Secure')
  await page.getByRole('button', { name: messages.auth.login, exact: true }).click()
  await completeMfaSignIn(page, email)
  await expect(page).toHaveURL(isProductHome)
  return { page, close: () => Promise.all([product.close(), consoleContext.close()]) }
}

test('host-mode Background work: snapshot, live refresh, containment, responsive and accessible', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const { page, close } = await operator(browser, 'console-background-work')
  try {
    await backgroundWorkJourney(page, productPath('/background-work'))
  } finally {
    await close()
  }
})

test('host-mode queue board: opens from the Console session, read-only, nothing hidden leaks', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const { page, close } = await operator(browser, 'console-queue-board')
  try {
    await queueBoardJourney(page, {
      pageUrl: productPath('/background-work'),
      boardPath: '/api/bull-board',
    })
  } finally {
    await close()
  }
})

test('host-mode queue board entry follows the live summary: failed open, disabled, enabled again', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const { page, close } = await operator(browser, 'console-queue-board-states')
  try {
    await backgroundWorkBoardStatesJourney(page, productPath('/background-work'))
  } finally {
    await close()
  }
})

test('host-mode Background work: protected pages fail closed before the Console login', async ({
  browser,
}) => {
  const target = activeTarget()
  const context = await browser.newContext({
    baseURL: target.origins.console,
    ignoreHTTPSErrors: true,
  })
  try {
    const page = await context.newPage()
    expect((await page.goto(productPath('/background-work')))?.status()).toBe(404)
    await expect(
      page.getByRole('table', { name: messages.console.backgroundWork.tableLabel })
    ).toHaveCount(0)
  } finally {
    await context.close()
  }
})
