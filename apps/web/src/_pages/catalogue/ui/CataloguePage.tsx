import { getTranslations } from 'next-intl/server'

import { ProductCard } from './ProductCard'

export async function CataloguePage() {
  const t = await getTranslations('catalogue')
  return (
    <section aria-labelledby="catalogue-title">
      <h1 id="catalogue-title">{t('title')}</h1>
      <ProductCard name="AMCore Mug" price="$12.00" />
    </section>
  )
}
