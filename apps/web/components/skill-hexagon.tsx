'use client'

interface SkillHexagonProps {
  scores: { [key: string]: number }
}

const AXES = ['Reading', 'Listening', 'Speaking', 'Writing', 'Vocabulary', 'Grammar'] as const

const CENTER_X = 150
const CENTER_Y = 150
const RADIUS = 110
const LABEL_RADIUS = RADIUS + 24

function polarToCartesian(angle: number, radius: number): [number, number] {
  // Start from top (-90°), go clockwise
  const rad = ((angle - 90) * Math.PI) / 180
  return [CENTER_X + radius * Math.cos(rad), CENTER_Y + radius * Math.sin(rad)]
}

function getPoints(radius: number): [number, number][] {
  return AXES.map((_, i) => polarToCartesian((360 / AXES.length) * i, radius))
}

function pointsToPath(points: [number, number][]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'
}

export function SkillHexagon({ scores }: SkillHexagonProps) {
  const guideRings = [0.33, 0.66, 1.0]
  const dataPoints = AXES.map((axis, i) => {
    const score = scores[axis.toLowerCase()] ?? 0
    const scaledRadius = (score / 100) * RADIUS
    return polarToCartesian((360 / AXES.length) * i, scaledRadius)
  })

  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[240px] mx-auto">
      {/* Guide rings */}
      {guideRings.map((scale) => (
        <path
          key={scale}
          d={pointsToPath(getPoints(RADIUS * scale))}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* Axis lines */}
      {AXES.map((_, i) => {
        const [x, y] = polarToCartesian((360 / AXES.length) * i, RADIUS)
        return (
          <line
            key={i}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={x}
            y2={y}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        )
      })}

      {/* Data polygon */}
      <path
        d={pointsToPath(dataPoints)}
        fill="var(--accent-brand)"
        fillOpacity={0.1}
        stroke="var(--accent-brand)"
        strokeWidth={2}
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          fill="var(--accent-brand)"
        />
      ))}

      {/* Labels + scores */}
      {AXES.map((axis, i) => {
        const [x, y] = polarToCartesian((360 / AXES.length) * i, LABEL_RADIUS)
        const score = scores[axis.toLowerCase()] ?? 0
        // Adjust text anchor based on position
        const angle = (360 / AXES.length) * i
        let textAnchor: 'start' | 'middle' | 'end' = 'middle'
        if (angle > 30 && angle < 150) textAnchor = 'start'
        if (angle > 210 && angle < 330) textAnchor = 'end'

        return (
          <g key={axis}>
            <text
              x={x}
              y={y - 5}
              textAnchor={textAnchor}
              fill="var(--text-primary)"
              fontSize={11}
              fontWeight={500}
            >
              {axis}
            </text>
            <text
              x={x}
              y={y + 9}
              textAnchor={textAnchor}
              fill="var(--text-muted)"
              fontSize={10}
            >
              {score}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
