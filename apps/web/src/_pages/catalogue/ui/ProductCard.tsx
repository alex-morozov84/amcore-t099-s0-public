export function ProductCard({ name, price }: { name: string; price: string }) {
  return (
    <article>
      <h2>{name}</h2>
      <p className="tabular-nums">{price.replace(/\d/g, '9')}</p>
    </article>
  )
}
