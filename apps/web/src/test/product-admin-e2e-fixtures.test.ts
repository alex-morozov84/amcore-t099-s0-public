// @vitest-environment node
import type * as SharedModule from '@amcore/shared'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  ensureAdministrationSession,
  productAdministrationOrigin,
} from '../../e2e/real-stack/helpers'

const model = vi.hoisted(() => ({
  mode: 'path' as 'path' | 'host',
  origins: { product: 'https://shop.example.test', staff: 'https://staff.example.test' },
  mfa: vi.fn(),
}))
vi.mock('@amcore/shared', async (original) => ({
  ...(await original<typeof SharedModule>()),
  PRODUCT_ADMIN_CONFIG: {
    get mode() {
      return model.mode
    },
  },
}))
vi.mock('../../e2e/support/managed-target.mjs', () => ({
  activeTarget: () => ({ origins: model.origins }),
}))
vi.mock('../../e2e/shared/mfa-login', () => ({ completeMfaSignIn: model.mfa }))
vi.mock('../../e2e/support/mfa-domain-fixture.mjs', () => ({
  resetMfaDomainSourceBudgets: vi.fn(),
  resetBrowserProbeDomainBudget: vi.fn(),
}))
beforeEach(() => {
  model.mode = 'path'
  model.origins.staff = 'https://staff.example.test'
})
afterEach(() => vi.resetAllMocks())

function browserFixture() {
  const control = { fill: vi.fn(), click: vi.fn() }
  const response = {
    url: () => `${model.origins.staff}/api/auth/login`,
    request: () => ({ method: () => 'POST' }),
    status: () => 202,
  }
  const page = {
    goto: vi.fn(),
    close: vi.fn(async () => {}),
    getByRole: vi.fn(() => control),
    getByLabel: vi.fn(() => control),
    waitForResponse: vi.fn(async (predicate: (value: typeof response) => boolean) => {
      expect(predicate(response)).toBe(true)
      expect(predicate({ ...response, url: () => `${model.origins.product}/api/auth/login` })).toBe(
        false
      )
      return response
    }),
    waitForURL: vi.fn(async (predicate: (url: URL) => boolean) => {
      expect(predicate(new URL(`${model.origins.staff}/organizations`))).toBe(true)
      for (const url of [
        `${model.origins.staff}/login`,
        `${model.origins.staff}/mfa`,
        `${model.origins.product}/organizations`,
      ])
        expect(predicate(new URL(url))).toBe(false)
    }),
  }
  return { page, context: { newPage: vi.fn(async () => page) } }
}

it('path administration keeps its existing shared website session', async () => {
  const { context } = browserFixture()
  expect(productAdministrationOrigin()).toBe(model.origins.product)
  await ensureAdministrationSession(context as never, 'member@example.test')
  expect(context.newPage).not.toHaveBeenCalled()
})

it('host administration signs in on staff with MFA and closes only its owned page', async () => {
  model.mode = 'host'
  const { page, context } = browserFixture()
  expect(productAdministrationOrigin()).toBe(model.origins.staff)
  await ensureAdministrationSession(context as never, 'member@example.test')
  const url = new URL(page.goto.mock.calls[0]![0])
  expect(url.origin).toBe(model.origins.staff)
  expect(url.pathname.endsWith('/login')).toBe(true)
  expect(model.mfa).toHaveBeenCalledWith(page, 'member@example.test')
  expect(page.waitForURL).toHaveBeenCalledOnce()
  expect(page.close).toHaveBeenCalledOnce()
})

it('host administration never falls back to the website when its origin is absent', async () => {
  model.mode = 'host'
  model.origins.staff = ''
  const { context } = browserFixture()
  await expect(
    ensureAdministrationSession(context as never, 'member@example.test')
  ).rejects.toThrow('admitted origin')
  expect(context.newPage).not.toHaveBeenCalled()
})

it('a failed MFA proof stays primary even if closing its owned page also fails', async () => {
  model.mode = 'host'
  const { page, context } = browserFixture()
  const error = new Error('fixture proof refused')
  model.mfa.mockRejectedValueOnce(error)
  page.close.mockRejectedValueOnce(new Error('fixture close refused'))
  await expect(ensureAdministrationSession(context as never, 'member@example.test')).rejects.toBe(
    error
  )
  expect(page.close).toHaveBeenCalledOnce()
  expect(page.waitForURL).not.toHaveBeenCalled()
})

it('a close failure after successful admission remains a failure', async () => {
  model.mode = 'host'
  const { page, context } = browserFixture()
  const error = new Error('fixture close refused')
  page.close.mockRejectedValueOnce(error)
  await expect(ensureAdministrationSession(context as never, 'member@example.test')).rejects.toBe(
    error
  )
})
