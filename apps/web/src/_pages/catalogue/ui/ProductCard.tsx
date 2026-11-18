export function ProductCard({ name, price }: { name: string; price: string }) {
  return (
    <article>
      <h2>{name}</h2>
      <p>{price}</p>
    </article>
  )
}
