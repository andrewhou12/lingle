export function Spinner({ size = 20 }: { size?: number }) {
  const stroke = size < 20 ? 2.5 : 2

  return (
    <svg
      className="animate-spin"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        className="stroke-border"
        strokeWidth={stroke}
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        className="stroke-accent-brand"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  )
}
