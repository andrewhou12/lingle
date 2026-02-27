import type { CSSProperties } from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  style?: CSSProperties
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  style,
}: SkeletonProps) {
  return (
    <div
      className="skeleton shrink-0"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  )
}
