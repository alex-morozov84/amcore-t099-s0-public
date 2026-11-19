import { readFile } from 'node:fs/promises'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'

import { searchCatalogue } from './fixtures/t099-catalogue/search.js'

describe('S0 catalogue search after source updates', () => {
  it('finds the saved literal discount label and price', async () => {
    const retainedDatabase = process.env.T099_CATALOGUE_DATABASE_URL
    const container = retainedDatabase
      ? undefined
      : await new PostgreSqlContainer('postgres:18-alpine').start()
    try {
      const database = new Client({
        connectionString: retainedDatabase ?? container?.getConnectionUri(),
      })
      await database.connect()
      try {
        if (container) {
          for (const file of ['migration.sql', 'seed.sql']) {
            await database.query(
              await readFile(new URL(`./fixtures/t099-catalogue/${file}`, import.meta.url), 'utf8')
            )
          }
        }
        expect(await searchCatalogue(database, '50%_off')).toEqual([
          { name: 'AMCore Mug 50%_off', price_cents: 1200 },
        ])
      } finally {
        await database.end()
      }
    } finally {
      await container?.stop()
    }
  })
})
