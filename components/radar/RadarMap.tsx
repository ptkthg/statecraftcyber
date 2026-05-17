interface ThreatPoint {
  x: number;
  y: number;
  severity: "critical" | "high" | "medium";
}

const threatPoints: ThreatPoint[] = [
  { x: 72, y: 38, severity: "critical" },
  { x: 45, y: 42, severity: "high" },
  { x: 28, y: 48, severity: "high" },
  { x: 82, y: 48, severity: "critical" },
  { x: 55, y: 55, severity: "medium" },
  { x: 20, y: 38, severity: "medium" },
  { x: 88, y: 42, severity: "medium" },
  { x: 65, y: 62, severity: "high" },
];

const severityColors = {
  critical: "#E50914",
  high: "#FF6B35",
  medium: "#FFB800",
};

export default function RadarMap({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Outer ambient glow */}
      <div className="absolute inset-0 rounded-full bg-red-600/8 blur-3xl scale-110" />

      <div className="relative w-full aspect-square max-w-[520px] mx-auto">
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full"
          style={{ filter: "drop-shadow(0 0 40px rgba(229,9,20,0.2))" }}
        >
          <defs>
            <radialGradient id="sweepGradient" cx="200" cy="200" r="160" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E50914" stopOpacity="0.7" />
              <stop offset="80%" stopColor="#E50914" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#E50914" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#E50914" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#E50914" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background fill */}
          <circle cx="200" cy="200" r="165" fill="url(#bgGlow)" />

          {/* Concentric range rings */}
          <circle cx="200" cy="200" r="160" fill="none" stroke="rgba(229,9,20,0.45)" strokeWidth="1" />
          <circle cx="200" cy="200" r="120" fill="none" stroke="rgba(229,9,20,0.3)" strokeWidth="1" strokeDasharray="6 4" />
          <circle cx="200" cy="200" r="80"  fill="none" stroke="rgba(229,9,20,0.35)" strokeWidth="1" />
          <circle cx="200" cy="200" r="40"  fill="none" stroke="rgba(229,9,20,0.25)" strokeWidth="1" strokeDasharray="4 4" />

          {/* Cardinal crosshairs */}
          <line x1="40"  y1="200" x2="360" y2="200" stroke="rgba(229,9,20,0.25)" strokeWidth="1" />
          <line x1="200" y1="40"  x2="200" y2="360" stroke="rgba(229,9,20,0.25)" strokeWidth="1" />
          {/* Diagonal guides */}
          <line x1="87"  y1="87"  x2="313" y2="313" stroke="rgba(229,9,20,0.12)" strokeWidth="1" />
          <line x1="313" y1="87"  x2="87"  y2="313" stroke="rgba(229,9,20,0.12)" strokeWidth="1" />

          {/* Continent outlines (stroke only — no filled blobs) */}
          <g fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeLinejoin="round">
            {/* North America */}
            <path d="M60,110 L95,105 L100,120 L110,125 L115,140 L100,150 L80,155 L65,145 L55,130 Z" />
            {/* South America */}
            <path d="M95,165 L115,160 L120,175 L118,195 L110,215 L100,220 L88,210 L85,195 L88,180 Z" />
            {/* Europe */}
            <path d="M175,90 L200,85 L215,92 L218,105 L205,115 L185,110 L170,102 Z" />
            {/* Africa */}
            <path d="M185,125 L215,120 L225,135 L222,165 L210,185 L195,190 L180,180 L175,160 L178,140 Z" />
            {/* Asia */}
            <path d="M225,85 L295,80 L320,95 L330,110 L320,130 L290,140 L255,135 L230,120 L225,105 Z" />
            {/* Australia */}
            <path d="M280,185 L315,180 L325,195 L320,215 L305,220 L285,215 L278,200 Z" />
          </g>

          {/* Radar sweep */}
          <g style={{ transformOrigin: "200px 200px", animation: "radar-sweep 4s linear infinite" }}>
            <path
              d="M200,200 L360,200 A160,160 0 0,0 200,40 Z"
              fill="url(#sweepGradient)"
            />
            <line x1="200" y1="200" x2="360" y2="200" stroke="#E50914" strokeWidth="2" opacity="0.9" />
          </g>

          {/* Center crosshair */}
          <circle cx="200" cy="200" r="5" fill="#E50914" />
          <circle cx="200" cy="200" r="10" fill="none" stroke="#E50914" strokeWidth="1" opacity="0.5" />
          <circle cx="200" cy="200" r="16" fill="none" stroke="#E50914" strokeWidth="0.5" opacity="0.25" />

          {/* Threat dots */}
          {threatPoints.map((point, i) => {
            const cx = (point.x / 100) * 320 + 40;
            const cy = (point.y / 100) * 320 + 40;
            const color = severityColors[point.severity];
            return (
              <g key={i}>
                {/* Pulse ring */}
                <circle cx={cx} cy={cy} r="3" fill={color} opacity="0.2">
                  <animate attributeName="r" values="3;12;3" dur={`${2.2 + i * 0.4}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0;0.2" dur={`${2.2 + i * 0.4}s`} repeatCount="indefinite" />
                </circle>
                {/* Core dot */}
                <circle cx={cx} cy={cy} r="3.5" fill={color} />
              </g>
            );
          })}

          {/* Status label */}
          <text x="200" y="388" textAnchor="middle" fill="rgba(229,9,20,0.6)" fontSize="8" fontFamily="monospace" letterSpacing="3">
            NÍVEL DE AMEAÇA: ELEVADO
          </text>
        </svg>
      </div>
    </div>
  );
}
