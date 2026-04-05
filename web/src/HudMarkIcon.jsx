/** Small neural-HUD mark: orange core, gold frame, corner nodes (matches app particle theme). */
export default function HudMarkIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      width={28}
      height={28}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="hudMarkSphere" cx="32%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="55%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </radialGradient>
      </defs>
      <rect
        x="3.5"
        y="3.5"
        width="41"
        height="41"
        fill="none"
        stroke="rgba(212, 175, 55, 0.85)"
        strokeWidth="1"
        rx="1"
      />
      <circle cx="24" cy="24" r="13.5" fill="#ea580c" />
      <line
        x1="24"
        y1="24"
        x2="8"
        y2="8"
        stroke="rgba(212, 175, 55, 0.75)"
        strokeWidth="0.75"
      />
      <line
        x1="24"
        y1="24"
        x2="40"
        y2="8"
        stroke="rgba(212, 175, 55, 0.75)"
        strokeWidth="0.75"
      />
      <circle cx="8" cy="8" r="3.8" fill="url(#hudMarkSphere)" />
      <circle cx="40" cy="8" r="3.8" fill="url(#hudMarkSphere)" />
      <circle cx="8" cy="40" r="3.8" fill="url(#hudMarkSphere)" />
      <circle cx="24" cy="1.2" r="1.1" fill="#78350f" opacity={0.9} />
      <circle cx="24" cy="46.8" r="1.1" fill="#78350f" opacity={0.9} />
      <circle cx="1.2" cy="24" r="1.1" fill="#78350f" opacity={0.9} />
      <circle cx="46.8" cy="24" r="1.1" fill="#78350f" opacity={0.9} />
    </svg>
  )
}
