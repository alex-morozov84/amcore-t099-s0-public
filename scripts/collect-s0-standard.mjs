import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allocateControlSocket } from './stand/control-socket.mjs'
import { supervise } from './stand/supervisor.mjs'
import { groupArguments } from './stand/test-inventory.mjs'

const worktree = process.cwd()
const stands = join(worktree, '.amcore/stands')
await mkdir(stands, { recursive: true })
const id = 's0-collection-' + randomUUID()
const directory = join(stands, id)
await mkdir(directory)
const token = randomUUID()

try {
  const manifest = {
    id,
    worktree,
    snapshot: worktree,
    purpose: 'e2e',
    topology: 'path',
    consoleTopology: 'path',
    settingsPolicy: 'preserve',
    lane: 'real-stack',
    origins: { product: 'http://127.0.0.1:20000' },
    ports: { web: 20000 },
    relay: 'http://127.0.0.1:20001',
    controlSocket: await allocateControlSocket(),
    runToken: token,
  }
  const manifestPath = join(directory, 'manifest.json')
  await mkdir(join(directory, 'lease'))
  await writeFile(join(directory, 'lease/owner.json'), JSON.stringify({ token }))
  await writeFile(manifestPath, JSON.stringify(manifest))
  const close = await supervise(manifest, token)
  try {
    await groupArguments(manifest, 'standard', {
      cwd: worktree,
      env: {
        ...process.env,
        CI: 'true',
        AMCORE_STAND_MANIFEST: manifestPath,
        AMCORE_STAND_TOKEN: token,
      },
    })
    const inventory = JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'))
    const ids = inventory.selected.map(({ caseId, expectedStatus }) => {
      if (expectedStatus !== 'passed') throw new Error('Unexpected S0 collection skip')
      return caseId
    })
    await writeFile(process.argv[2], JSON.stringify(ids), { flag: 'wx' })
  } finally {
    await close()
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
