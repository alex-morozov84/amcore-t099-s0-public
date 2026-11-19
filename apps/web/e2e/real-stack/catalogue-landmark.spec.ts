import { expect, test } from '@playwright/test'

import { productPath } from '../shared/product-settings'

import { registerViaUi, uniqueEmail } from './helpers'

test('catalogue exposes a region named by its page heading', async ({ page }) => {
  await registerViaUi(page, uniqueEmail('catalogue-landmark'))
  await page.goto(productPath('/catalogue'))

  const heading = page.getByRole('heading', { level: 1 })
  const title = await heading.innerText()
  await expect(page.getByRole('region', { name: title, exact: true })).toContainText(title)
})
