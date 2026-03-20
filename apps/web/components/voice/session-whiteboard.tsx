'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  CorrectionCard,
  VocabClusterCard,
  TableCard,
  ContentCard,
  type WhiteboardContent,
} from './whiteboard'

// ── Icons ──

const IcPen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)
const IcEraser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
)
const IcHi = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
)
const IcTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)
const IcZIn = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)
const IcZOut = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)

type DrawTool = 'pen' | 'hi' | 'eraser'

function WbBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'w-[30px] h-[30px] flex items-center justify-center rounded-md border-none cursor-pointer transition-all duration-100',
        active ? 'bg-bg-active text-text-primary' : 'bg-transparent text-text-muted hover:bg-bg-secondary',
      )}
    >
      {children}
    </button>
  )
}

const PALETTE = [
  { c: '#1a1a1a' },
  { c: '#c8572a' },
  { c: '#3b6ec2' },
  { c: '#22a355' },
  { c: '#8b5cf6' },
]

interface SessionWhiteboardProps {
  agentContent: WhiteboardContent | null
}

export function SessionWhiteboard({ agentContent }: SessionWhiteboardProps) {
  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState('#1a1a1a')
  const [lineWidth, setLineWidth] = useState(2)
  const [tf, setTf] = useState({ scale: 1, x: 0, y: 0 })
  const tfRef = useRef({ scale: 1, x: 0, y: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panning = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })
  const drawing = useRef(false)
  const lastPt = useRef({ x: 0, y: 0 })
  const spaceDown = useRef(false)

  useEffect(() => { tfRef.current = tf }, [tf])

  // Init canvas
  useEffect(() => {
    const c = canvasRef.current
    if (c) { c.width = 2400; c.height = 1800 }
  }, [])

  // Space key for panning
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('textarea, input')) {
        e.preventDefault()
        spaceDown.current = true
      }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  const apply = useCallback((next: { scale: number; x: number; y: number }) => {
    next.scale = Math.max(0.2, Math.min(4, next.scale))
    tfRef.current = next
    setTf({ ...next })
  }, [])

  const toCanvas = useCallback((cx: number, cy: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const { scale, x, y } = tfRef.current
    return { x: (cx - r.left - x) / scale, y: (cy - r.top - y) / scale }
  }, [])

  // Wheel zoom
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const { scale, x, y } = tfRef.current
    const f = e.deltaY < 0 ? 1.08 : 0.93
    const ns = Math.max(0.2, Math.min(4, scale * f))
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    apply({ scale: ns, x: mx - (mx - x) * (ns / scale), y: my - (my - y) * (ns / scale) })
  }, [apply])

  useEffect(() => {
    const w = wrapRef.current
    if (!w) return
    w.addEventListener('wheel', onWheel, { passive: false })
    return () => w.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const onDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || spaceDown.current) {
      panning.current = true
      panStart.current = { mx: e.clientX, my: e.clientY, tx: tfRef.current.x, ty: tfRef.current.y }
      return
    }
    if (e.button === 0) {
      drawing.current = true
      lastPt.current = toCanvas(e.clientX, e.clientY)
    }
  }, [toCanvas])

  const onMove = useCallback((e: React.MouseEvent) => {
    if (panning.current) {
      apply({
        ...tfRef.current,
        x: panStart.current.tx + (e.clientX - panStart.current.mx),
        y: panStart.current.ty + (e.clientY - panStart.current.my),
      })
      return
    }
    if (!drawing.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    const pt = toCanvas(e.clientX, e.clientY)
    ctx.beginPath()
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = 26 / tf.scale
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = (tool === 'hi' ? 12 : lineWidth) / tf.scale
      ctx.globalAlpha = tool === 'hi' ? 0.36 : 1
      ctx.strokeStyle = color
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    ctx.globalAlpha = 1
    lastPt.current = pt
  }, [tool, color, lineWidth, tf.scale, toCanvas, apply])

  const onUp = useCallback(() => { panning.current = false; drawing.current = false }, [])

  const zoom = useCallback((f: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const cx = r.width / 2
    const cy = r.height / 2
    const { scale, x, y } = tfRef.current
    const ns = Math.max(0.2, Math.min(4, scale * f))
    apply({ scale: ns, x: cx - (cx - x) * (ns / scale), y: cy - (cy - y) * (ns / scale) })
  }, [apply])

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }, [])

  const cursor = panning.current ? 'grabbing' : spaceDown.current ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair'

  return (
    <div className="flex h-full">
      {/* Tools sidebar */}
      <aside className="w-12 bg-bg-pure border-r border-border flex flex-col items-center py-3.5 gap-0.5 shrink-0">
        <WbBtn active={tool === 'pen'} onClick={() => setTool('pen')} title="Pen"><IcPen /></WbBtn>
        <WbBtn active={tool === 'hi'} onClick={() => setTool('hi')} title="Highlight"><IcHi /></WbBtn>
        <WbBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser"><IcEraser /></WbBtn>

        <div className="w-[22px] h-px bg-border my-1.5" />

        {PALETTE.map(({ c }) => (
          <button
            key={c}
            onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }}
            className="w-4 h-4 rounded-full border-2 cursor-pointer outline-none shrink-0 transition-transform duration-100"
            style={{
              background: c,
              borderColor: color === c ? 'var(--text-primary)' : 'transparent',
              transform: color === c ? 'scale(1.25)' : 'scale(1)',
            }}
          />
        ))}

        <div className="w-[22px] h-px bg-border my-1.5" />

        {[1, 2, 4].map((w) => (
          <button
            key={w}
            onClick={() => setLineWidth(w)}
            className={cn(
              'w-7 h-[22px] flex items-center justify-center border-none cursor-pointer rounded-[5px]',
              lineWidth === w ? 'bg-bg-active' : 'bg-transparent',
            )}
          >
            <div
              className="w-3.5 rounded-full"
              style={{
                height: w,
                background: lineWidth === w ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            />
          </button>
        ))}

        <div className="flex-1" />
        <WbBtn onClick={clearCanvas} title="Clear canvas"><IcTrash /></WbBtn>
      </aside>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden bg-[#fafaf8]">
        <div
          ref={wrapRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          className="w-full h-full relative overflow-hidden"
          style={{ cursor }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`,
              width: 2400,
              height: 1800,
            }}
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none opacity-35"
              style={{
                backgroundImage: 'radial-gradient(circle, #c8c8c4 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />

            {/* Agent-driven lesson content */}
            <div className="absolute inset-0 p-[52px_72px] flex flex-col gap-8 pointer-events-none">
              {agentContent && (
                <div className="pointer-events-none max-w-[600px]">
                  {agentContent.type === 'correction' && <CorrectionCard data={agentContent.data} />}
                  {agentContent.type === 'vocab_cluster' && <VocabClusterCard data={agentContent.data} />}
                  {agentContent.type === 'table' && <TableCard data={agentContent.data} />}
                  {agentContent.type === 'content' && <ContentCard data={agentContent.data} />}
                </div>
              )}
            </div>

            {/* Drawing canvas */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              style={{ width: 2400, height: 1800, pointerEvents: 'all' }}
            />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center bg-bg-pure border border-border rounded-lg p-0.5 gap-px">
          <button
            onClick={() => zoom(1.2)}
            title="Zoom in"
            className="h-[26px] min-w-[26px] flex items-center justify-center border-none rounded-md bg-transparent text-text-secondary cursor-pointer hover:bg-bg-secondary"
          >
            <IcZIn />
          </button>
          <button
            onClick={() => apply({ scale: 1, x: 0, y: 0 })}
            title="Reset"
            className="h-[26px] min-w-[44px] flex items-center justify-center border-none rounded-md bg-transparent text-text-secondary cursor-pointer text-[11px] font-mono hover:bg-bg-secondary"
          >
            {Math.round(tf.scale * 100)}%
          </button>
          <button
            onClick={() => zoom(0.83)}
            title="Zoom out"
            className="h-[26px] min-w-[26px] flex items-center justify-center border-none rounded-md bg-transparent text-text-secondary cursor-pointer hover:bg-bg-secondary"
          >
            <IcZOut />
          </button>
        </div>
      </div>
    </div>
  )
}
