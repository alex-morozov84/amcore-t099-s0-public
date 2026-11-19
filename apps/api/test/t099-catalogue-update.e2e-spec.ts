import { Client } from 'pg'

import { searchCatalogue } from './fixtures/t099-catalogue/search.js'

describe('S0 catalogue search after source updates', () => {
  it('finds the saved literal discount label and price', async () => {
    const connectionString = process.env.T099_CATALOGUE_DATABASE_URL
    if (!connectionString) throw new Error('Missing isolated S0 catalogue database URL')
    const database = new Client({ connectionString })
    await database.connect()
    try {
      expect(await searchCatalogue(database, '50%_off')).toEqual([
        { name: 'AMCore Mug 50%_off', price_cents: 1200 },
      ])
    } finally {
      await database.end()
    }
  })
})
