type PriceDisplayProps = {
  amount: number | string;
  size?: "md" | "lg";
};

export function PriceDisplay({ amount, size = "md" }: PriceDisplayProps) {
  const value = Number(amount).toFixed(2);
  const priceClass = size === "lg" ? "price-lg" : "price-md";
  return (
    <span className={`${priceClass} inline-flex items-baseline gap-1`}>
      <span className="text-ink-secondary">Rs.</span>
      <span className="text-ink-primary">{value}</span>
    </span>
  );
}
