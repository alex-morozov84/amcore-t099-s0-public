import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const productAdminE2ePlans = {
  'staff-oauth': {
    lane: 'product-admin-real-stack',
    fixture: 'product-admin-oauth',
    files: [
      'product-admin-oauth.spec.ts',
      'product-admin-oauth-get.spec.ts',
      'product-admin-oauth-surfaces.spec.ts',
      'product-admin-review-c2.spec.ts',
      'product-admin-denied-loss.spec.ts',
    ],
  },
  'staff-host': {
    lane: 'product-admin-real-stack',
    fixture: 'product-admin-three-host',
    files: ['product-admin-host.spec.ts'],
  },
  'staff-console-path': {
    lane: 'product-admin-real-stack',
    fixture: 'product-admin-console-path',
    files: ['product-admin-console-path.spec.ts'],
  },
  'staff-invitation': {
    lane: 'product-admin-real-stack',
    fixture: 'product-admin-closed-signup',
    files: ['product-admin-invitation.spec.ts'],
  },
  'staff-path-oauth': {
    lane: 'real-stack',
    fixture: 'product-admin-oauth-path',
    files: ['product-admin-oauth-path.spec.ts'],
  },
  'support-mail-path': {
    lane: 'product-admin-real-stack',
    fixture: 'support-mail-path',
    files: ['console-support-mail.spec.ts'],
  },
  'support-mail-host': {
    lane: 'product-admin-real-stack',
    fixture: 'support-mail-host',
    files: ['console-support-mail.spec.ts'],
  },
}

export function productAdminCiLanes(root) {
  for (const plan of Object.values(productAdminE2ePlans)) {
    for (const file of plan.files) {
      const directory = plan.lane === 'real-stack' ? 'real-stack' : 'product-admin-real-stack'
      if (!existsSync(join(root, 'apps/web/e2e', directory, file)))
        throw new Error(`Missing declared staff E2E: ${directory}/${file}`)
    }
  }
  return Object.keys(productAdminE2ePlans)
}

// Exact S0 obligations. Discovery must find these files independently of directory scanning.
export const s0Scenarios = {
  'configured-console-summary': {
    fixture: 'console-summary',
    directory: 'real-stack',
    files: ['admin-overview.spec.ts'],
    grep: 'summary fixture',
  },
  'configured-setup': {
    fixture: 'organization-setup',
    closedSignup: true,
    directory: 'organization-setup',
    files: ['organization-initial-setup.spec.ts'],
  },
  'configured-console-setup': {
    fixture: 'organization-setup',
    closedSignup: true,
    directory: 'organization-setup',
    files: ['console-organization-setup.spec.ts'],
  },
  'configured-provisioning': {
    fixture: 'organization-provisioning',
    directory: 'organization-provisioning',
    files: ['organization-provisioning.spec.ts'],
  },
  'configured-path-oauth': {
    fixture: 'product-admin-oauth-path',
    directory: 'real-stack',
    files: ['product-admin-oauth-path.spec.ts'],
    extraDirectory: 'product-admin-real-stack',
    extraFiles: ['product-admin-oauth-get.spec.ts', 'product-admin-oauth-surfaces.spec.ts'],
    https: true,
  },
  'configured-invitation': {
    fixture: 'product-admin-closed-signup',
    closedSignup: true,
    directory: 'product-admin-real-stack',
    files: ['product-admin-invitation.spec.ts'],
  },
  'configured-support-mail': {
    fixture: 'support-mail-path',
    directory: 'product-admin-real-stack',
    files: ['console-support-mail.spec.ts'],
  },
  'configured-placement': {
    directory: 'product-admin-real-stack',
    files: ['product-admin-console-path.spec.ts', 'product-admin-denied-loss.spec.ts'],
  },
  'configured-console-session': {
    directory: 'console-real-stack',
    files: ['sessions.spec.ts', 'session-isolation.spec.ts'],
    grep: 'vault rotation|MFA reentry',
  },
  'configured-invitation-https': {
    directory: 'console-real-stack',
    files: ['invitation-https.spec.ts', 'invitation-issued-ack.spec.ts'],
    https: true,
  },
}
