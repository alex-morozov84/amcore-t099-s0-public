import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allocateControlSocket } from './stand/control-socket.mjs'
import { supervise } from './stand/supervisor.mjs'
import { runIdentity } from './lighthouse/identity.mjs'
import { configuredLanes } from './e2e-ci-plan.mjs'
import { collect, groupArguments } from './stand/test-inventory.mjs'

const worktree = process.cwd()
const stands = join(worktree, '.amcore/stands')
await mkdir(stands, { recursive: true })
const id = 's0-collection-' + randomUUID()
const directory = join(stands, id)
const token = randomUUID()

const inventoryMode = process.env.AMCORE_E2E_INVENTORY === 'configured'
const lanes = inventoryMode ? configuredLanes(worktree) : ['configured-standard']
const inventories = {}
for (const lane of lanes) {
  await collectLane(lane)
}
const output = inventoryMode
  ? { ...runIdentity(worktree), lanes: inventories }
  : {
      ...runIdentity(worktree),
      ids: inventories['configured-standard'].map(({ caseId, expectedStatus }) => {
        if (expectedStatus !== 'passed') throw new Error('Unexpected S0 collection skip')
        return caseId
      }),
    }
await writeFile(process.argv[2], JSON.stringify(output), { flag: 'wx' })

async function collectLane(lane) {
  await mkdir(directory, { recursive: true })
  const hostConsole = lane === 'configured-console'
  try {
    const manifest = {
      id,
      worktree,
      snapshot: worktree,
      purpose: 'e2e',
      topology: 'path',
      consoleTopology: 'path',
      settingsPolicy: 'preserve',
      lane: hostConsole ? 'console-real-stack' : 'real-stack',
      origins: {
        product: 'http://127.0.0.1:20000',
        console: 'https://ops.invalid:20000',
        staff: 'https://staff.invalid:20000',
      },
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
      const options = {
        cwd: worktree,
        env: {
          ...process.env,
          CI: 'true',
          ...(inventoryMode ? { AMCORE_CONFIGURED_CASES: '1' } : {}),
          AMCORE_STAND_MANIFEST: manifestPath,
          AMCORE_STAND_TOKEN: token,
        },
      }
      if (hostConsole) inventories[lane] = await collect(options, [], 'console-real-stack')
      else {
        await groupArguments(manifest, lane.slice('configured-'.length), options)
        const inventory = JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'))
        inventories[lane] = inventory.selected
      }
    } finally {
      await close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
