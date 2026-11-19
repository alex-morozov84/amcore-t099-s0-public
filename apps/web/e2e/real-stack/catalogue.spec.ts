import { expect, test } from '@playwright/test'

import { expectNoAxeViolations } from '../shared/axe'
import { productPath } from '../shared/product-settings'

import { registerViaUi, uniqueEmail } from './helpers'

test.beforeEach(async ({ page }) => {
  await registerViaUi(page, uniqueEmail('catalogue'))
  await page.goto(productPath('/catalogue'))
})

test('catalogue renders the product card name and price', async ({ page }) => {
  test.skip(true, 'T099 control: skip a selected card case during execution')
  const card = page.getByRole('article')
  await expect(card.getByRole('heading', { name: 'AMCore Mug' })).toBeVisible()
  await expect(card.getByText('$12.00', { exact: true })).toBeVisible()
})

test('product card is accessible in the catalogue', async ({ page }) => {
  await expect(page.getByRole('article').getByRole('heading', { name: 'AMCore Mug' })).toBeVisible()
  await expectNoAxeViolations(page)
})
