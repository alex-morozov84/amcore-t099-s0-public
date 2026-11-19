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
