import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const cardPath = 'apps/web/src/_pages/catalogue/ui/ProductCard.tsx'
export const cardSpec = 'e2e/real-stack/catalogue.spec.ts'
export const cardCaseIds = [
  '3e44262f2ef7343c525c-e8db519418a908fc1e54',
  '3e44262f2ef7343c525c-fd447a4f47105f5c6aba',
]

export function selectCardFromPr(root, env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'pull_request') return false
  try {
    const pr = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')).pull_request
    const base = pr.base.sha
    const head = pr.head.sha
    if (![base, head, env.GITHUB_SHA].every((value) => /^[a-f0-9]{40}$/.test(value))) return false
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    if (git('show', '-s', '--format=%H %P', 'HEAD') !== `${env.GITHUB_SHA} ${base} ${head}`)
      return false
    const changed = (from, to) =>
      git('diff', '--no-renames', '--name-status', from, to, '--') === `M\t${cardPath}`
    return changed(git('merge-base', base, head), head) && changed(base, 'HEAD')
  } catch {
    return false
  }
}
