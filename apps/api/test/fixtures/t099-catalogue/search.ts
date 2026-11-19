import type { Client } from 'pg'

import { escapeLikeLiteral } from '@amcore/shared'

export async function searchCatalogue(
  database: Client,
  text: string
): Promise<{ name: string; price_cents: number }[]> {
  const { rows } = await database.query<{ name: string; price_cents: number }>(
    'SELECT name, price_cents FROM s0_catalogue WHERE name ILIKE $1 ORDER BY name',
    ['%' + escapeLikeLiteral(text) + '%']
  )
  return rows
}
