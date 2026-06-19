/**
 * Neflo logo. The mark is the exchange/convert glyph (paired arrows) — money
 * moving in and out, stablecoin to local currency.
 *
 * The tile uses currentColor; the arrows use `glyph` (default white). So on a
 * light surface set text-black (black tile, white arrows); on the dark sidebar
 * set text-white and glyph="#0d0d0d" (white tile, dark arrows).
 */
export function NefloMark({
  size = 24,
  className = "",
  glyph = "#ffffff",
}: {
  size?: number;
  className?: string;
  glyph?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <g
        stroke={glyph}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M24 45 V19" />
        <path d="M15 28 L24 19 L33 28" />
        <path d="M40 19 V45" />
        <path d="M31 36 L40 45 L49 36" />
      </g>
    </svg>
  );
}

export function Logo({
  size = 24,
  className = "",
  glyph,
}: {
  size?: number;
  className?: string;
  glyph?: string;
}) {
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <NefloMark size={size} glyph={glyph} />
      <span className="text-xl font-extrabold tracking-tight">Neflo</span>
    </span>
  );
}
