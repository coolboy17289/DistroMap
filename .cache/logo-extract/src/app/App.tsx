export default function App() {
  const BG = "#0d1117";
  const TUX = "#e6edf3";
  const BEAK = "#f0883e";
  const DIM = "#484f58";

  return (
    <div className="size-full flex items-center justify-center" style={{ background: BG }}>
      <svg
        viewBox="0 0 560 130"
        width="560"
        height="130"
        xmlns="http://www.w3.org/2000/svg"
        style={{ fontFamily: "'Space Mono', 'Courier New', monospace" }}
      >
        <defs>
          <clipPath id="badge-clip">
            <circle cx="65" cy="65" r="56" />
          </clipPath>
        </defs>

        {/* ── BADGE ── */}
        <circle cx="65" cy="65" r="60" fill={BG} stroke="#30363d" strokeWidth="1.5" />

        {/* Map grid (clipped) */}
        <g clipPath="url(#badge-clip)" opacity="0.1" stroke={TUX} strokeWidth="0.7" fill="none">
          {[30, 45, 65, 80, 95, 110].map((y) => (
            <line key={`h${y}`} x1="5" y1={y} x2="125" y2={y} />
          ))}
          {[20, 35, 50, 65, 80, 95, 110].map((x) => (
            <line key={`v${x}`} x1={x} y1="5" x2={x} y2="125" />
          ))}
        </g>

        {/* Inner dashed ring */}
        <circle cx="65" cy="65" r="37" fill="none" stroke="#21262d" strokeWidth="1" strokeDasharray="3 5" />

        {/* ── TUX PENGUIN ── */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="65" cy="73" rx="12" ry="15" stroke={TUX} strokeWidth="1.5" />
          <ellipse cx="65" cy="77" rx="7" ry="10" stroke={TUX} strokeWidth="1" />
          <circle cx="65" cy="54" r="10" stroke={TUX} strokeWidth="1.5" />
          <circle cx="62" cy="52" r="1.5" fill={TUX} />
          <circle cx="68" cy="52" r="1.5" fill={TUX} />
          <path d="M 63 57 L 65 61 L 67 57" stroke={BEAK} strokeWidth="1.2" />
          <path d="M 53 69 C 50 66, 50 76, 53 79" stroke={TUX} strokeWidth="1.2" />
          <path d="M 77 69 C 80 66, 80 76, 77 79" stroke={TUX} strokeWidth="1.2" />
          <path d="M 58 87 L 56 91 M 58 87 L 61 91 M 58 87 L 63 90" stroke={BEAK} strokeWidth="1" />
          <path d="M 72 87 L 70 91 M 72 87 L 72 91 M 72 87 L 76 90" stroke={BEAK} strokeWidth="1" />
        </g>

        {/* ── DISTRO LOGOS (ring at r ≈ 45) ── */}

        {/* Arch Linux — 12 o'clock (65, 20) */}
        <g transform="translate(65,20)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 0 -8 L 7.5 6.5 L 3.5 6.5 L 0 0 L -3.5 6.5 L -7.5 6.5 Z"
            stroke="#1793d1" strokeWidth="1.4" />
          <path d="M 0 0 L 2.8 5.5 L -2.8 5.5 Z"
            stroke="#1793d1" strokeWidth="0.9" opacity="0.55" />
        </g>

        {/* Ubuntu — 2 o'clock (104, 42) */}
        <g transform="translate(104,42)" fill="none">
          <circle cx="0" cy="0" r="7.5" stroke="#e95420" strokeWidth="1.4" />
          <circle cx="0" cy="-4.5" r="2.1" fill="#e95420" />
          <circle cx="3.9" cy="2.25" r="2.1" fill="#e95420" />
          <circle cx="-3.9" cy="2.25" r="2.1" fill="#e95420" />
        </g>

        {/* Debian — 4 o'clock (104, 88) */}
        <g transform="translate(104,88)" fill="none" strokeLinecap="round">
          <path
            d="M 1 -7.5 C 6.5 -5.5, 8.5 0, 5.5 5 C 2.5 9.5, -4 9.5, -6.5 5 C -9 0.5, -6.5 -6, -1 -7.5 C 2 -7.5, 5.5 -5, 4.5 -2 C 3.5 1, 0.5 2.5, -2 1.5 C -4 0.5, -4 -3, -1.5 -4"
            stroke="#d70a53" strokeWidth="1.4"
          />
        </g>

        {/* Fedora — 6 o'clock (65, 110) */}
        <g transform="translate(65,110)" fill="none" strokeLinecap="round">
          <path
            d="M -3 6.5 L -3 -1 C -3 -6.5, 2 -9, 5.5 -6 C 8 -3.5, 7.5 1.5, 4 3 L -3 3"
            stroke="#51a2da" strokeWidth="1.4"
          />
          <line x1="-7" y1="2.5" x2="1" y2="2.5" stroke="#51a2da" strokeWidth="1.4" />
        </g>

        {/* NixOS — 8 o'clock (26, 88) */}
        <g transform="translate(26,88)" fill="none" strokeLinecap="round">
          <line x1="0" y1="-7.5" x2="0" y2="7.5" stroke="#5277c3" strokeWidth="1.4" />
          <line x1="-6.5" y1="-3.75" x2="6.5" y2="3.75" stroke="#5277c3" strokeWidth="1.4" />
          <line x1="-6.5" y1="3.75" x2="6.5" y2="-3.75" stroke="#5277c3" strokeWidth="1.4" />
          <path d="M -2.5 -5 L 0 -7.5 L 2.5 -5" stroke="#5277c3" strokeWidth="1" />
          <path d="M -2.5 5 L 0 7.5 L 2.5 5" stroke="#5277c3" strokeWidth="1" />
          <path d="M 5 -2.5 L 6.5 -3.75 L 5.5 -1" stroke="#5277c3" strokeWidth="1" />
        </g>

        {/* Linux Mint (leaf) — 10 o'clock (26, 42) */}
        <g transform="translate(26,42)" fill="none" strokeLinecap="round">
          <path
            d="M 0 7.5 C -5.5 4, -7 -1.5, -3 -6 C 0.5 -9, 6 -6.5, 5.5 -1 C 5 3.5, 0 7.5, 0 7.5 Z"
            stroke="#87cf3e" strokeWidth="1.4"
          />
          <line x1="0" y1="7.5" x2="0" y2="-6" stroke="#87cf3e" strokeWidth="0.9" opacity="0.7" />
          <path d="M 0 0 C -2 -2, -4 -1.5, -4.5 0.5" stroke="#87cf3e" strokeWidth="0.8" opacity="0.7" />
        </g>

        {/* ── WORDMARK ── */}
        <text x="150" y="73" fontSize="44" letterSpacing="-1.5">
          <tspan fill="#e6edf3" fontWeight="400">distro</tspan>
          <tspan fill="#58a6ff" fontWeight="700">Map</tspan>
        </text>

        {/* Tagline */}
        <text x="153" y="95" fontSize="9" fill={DIM} letterSpacing="3">
          LINUX DISTRIBUTION EXPLORER
        </text>

        {/* Compass tick marks on outer ring */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 65 + 57 * Math.sin(rad);
          const y1 = 65 - 57 * Math.cos(rad);
          const x2 = 65 + 62 * Math.sin(rad);
          const y2 = 65 - 62 * Math.cos(rad);
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#30363d" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}
