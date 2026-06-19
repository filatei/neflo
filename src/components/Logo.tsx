/**
 * Neflo logo. The mark is the exchange/convert glyph (paired arrows) — money
 * moving in and out, stablecoin to local currency. Monochrome: the tile uses
 * currentColor, the glyph is knocked out, so it inherits the text color.
 */
export function NefloMark({
  size = 24,
  className = "",
  id = "neflo-mark",
}: {
  size?: number;
  className?: string;
  id?: string;
}) {
  // The tile is drawn in currentColor; the arrows are knocked out (transparent)
  // via a mask, so they show the background through — adapts to light or dark.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <mask id={id}>
          <rect width="64" height="64" rx="15" fill="white" />
          <g
            stroke="black"
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
        </mask>
      </defs>
      <rect width="64" height="64" rx="15" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

export function Logo({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={"inline-flex items-center gap-2 " + className}>
      <NefloMark size={size} />
      <span className="text-xl font-extrabold tracking-tight">Neflo</span>
    </span>
  );
}
