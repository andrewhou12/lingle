'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { VoiceState } from '@/hooks/use-voice-conversation'

interface VoiceCentralOrbProps {
  state: VoiceState
  size?: number
  className?: string
  /** Emit floating characters when AI speaks */
  onFloatChars?: (text: string) => void
}

const VOICE_TO_ORB: Record<VoiceState, string> = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'listening',
}

interface OrbConfig {
  r: number
  amp: number
  spd: number
  bars: boolean
  think: boolean
  rip: boolean
}

const CFGS: Record<string, OrbConfig> = {
  idle:          { r: 80, amp: 3,  spd: .010, bars: false, think: false, rip: false },
  speaking:      { r: 87, amp: 7,  spd: .019, bars: false, think: false, rip: true },
  listening:     { r: 83, amp: 5,  spd: .015, bars: true,  think: false, rip: false },
  user_speaking: { r: 92, amp: 15, spd: .027, bars: true,  think: false, rip: false },
  thinking:      { r: 78, amp: 2,  spd: .007, bars: false, think: true,  rip: false },
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export function VoiceCentralOrb({ state, size = 272, className }: VoiceCentralOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbRef = useRef({
    r: 80, tR: 80, amp: 3, tA: 3, spd: .011, tS: .011,
    phase: 0, thinkRot: 0,
    bars: new Array(44).fill(0) as number[],
    barT: new Array(44).fill(0) as number[],
    ripples: [] as Array<{ r: number; a: number }>,
    ripT: 0, barTimer: 0,
    showBars: false, showThink: false, showRip: false,
    orbState: 'idle',
  })
  const animRef = useRef<number>(0)

  const setOrbState = useCallback((s: string) => {
    const c = CFGS[s] || CFGS.idle
    const orb = orbRef.current
    orb.tR = c.r; orb.tA = c.amp; orb.tS = c.spd
    orb.showBars = c.bars; orb.showThink = c.think; orb.showRip = c.rip
    orb.orbState = s
  }, [])

  // Sync voice state to orb state
  useEffect(() => {
    const mapped = VOICE_TO_ORB[state] || 'idle'
    setOrbState(mapped)
  }, [state, setOrbState])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const CW = canvas.width, CH = canvas.height
    const CX = CW / 2, CY = CH / 2

    function draw(ts: number) {
      const orb = orbRef.current
      ctx!.clearRect(0, 0, CW, CH)

      orb.r = lerp(orb.r, orb.tR, .07)
      orb.amp = lerp(orb.amp, orb.tA, .06)
      orb.spd = lerp(orb.spd, orb.tS, .05)
      orb.phase += orb.spd
      orb.thinkRot += .024
      const t = ts / 1000

      // Ripples
      orb.ripples = orb.ripples.filter(r => r.a > .004)
      orb.ripples.forEach(r => {
        r.r += 1.5; r.a *= .966
        ctx!.beginPath()
        ctx!.arc(CX, CY, r.r, 0, Math.PI * 2)
        ctx!.strokeStyle = `rgba(47,47,47,${r.a * .2})`
        ctx!.lineWidth = 1
        ctx!.stroke()
      })
      if (orb.showRip) {
        orb.ripT++
        if (orb.ripT % 52 === 0) orb.ripples.push({ r: orb.r + 5, a: .38 })
      }

      // Thinking arcs
      if (orb.showThink) {
        for (let i = 0; i < 3; i++) {
          const a = orb.thinkRot + i * (Math.PI * 2 / 3)
          ctx!.beginPath()
          ctx!.arc(CX, CY, orb.r + 18, a, a + .84)
          ctx!.strokeStyle = `rgba(47,47,47,${.07 + i * .055})`
          ctx!.lineWidth = 2
          ctx!.lineCap = 'round'
          ctx!.stroke()
        }
      }

      // Frequency bars
      if (orb.showBars) {
        orb.barTimer++
        if (orb.barTimer % 3 === 0) {
          const iv = orb.orbState === 'user_speaking' ? 1.8 : 1.0
          for (let i = 0; i < 44; i++) {
            const a = (i / 44) * Math.PI * 2
            orb.barT[i] = iv * (6 + Math.abs(
              Math.sin(a * 2.4 + t * 3.3) * 12 +
              Math.sin(a * 5.1 - t * 2.1) * 6 +
              Math.sin(a * 1.3 + t * 4.6) * 4
            ) * .52)
          }
        }
        const bc = orb.orbState === 'user_speaking' ? '200,87,42' : '47,47,47'
        for (let i = 0; i < 44; i++) {
          orb.bars[i] = lerp(orb.bars[i], orb.barT[i], .19)
          const a = (i / 44) * Math.PI * 2 - Math.PI / 2
          const r0 = orb.r + 3, r1 = r0 + orb.bars[i]
          ctx!.beginPath()
          ctx!.moveTo(CX + r0 * Math.cos(a), CY + r0 * Math.sin(a))
          ctx!.lineTo(CX + r1 * Math.cos(a), CY + r1 * Math.sin(a))
          ctx!.strokeStyle = `rgba(${bc},${.17 + (orb.bars[i] / 36) * .53})`
          ctx!.lineWidth = 2.5
          ctx!.lineCap = 'round'
          ctx!.stroke()
        }
      }

      // Main orb shape
      ctx!.beginPath()
      const N = 160, ph = orb.phase, am = orb.amp
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2
        const p = Math.sin(a * 3 + ph * 1.1) * am * .5 +
                  Math.sin(a * 5 - ph * .8) * am * .25 +
                  Math.sin(a * 7 + ph * 1.4) * am * .14 +
                  Math.sin(a * 2 - ph * .5) * am * .18 +
                  Math.sin(a * 11 + ph * 1.9) * am * .07
        const rr = orb.r + p
        if (i === 0) ctx!.moveTo(CX + rr * Math.cos(a), CY + rr * Math.sin(a))
        else ctx!.lineTo(CX + rr * Math.cos(a), CY + rr * Math.sin(a))
      }
      ctx!.closePath()

      const g = ctx!.createRadialGradient(CX - orb.r * .18, CY - orb.r * .2, 0, CX, CY, orb.r + am + 4)
      if (orb.orbState === 'user_speaking') {
        g.addColorStop(0, 'rgba(255,252,248,.97)')
        g.addColorStop(.5, 'rgba(252,244,236,.93)')
        g.addColorStop(1, 'rgba(238,222,208,.86)')
      } else {
        g.addColorStop(0, 'rgba(255,255,255,.97)')
        g.addColorStop(.6, 'rgba(248,247,245,.93)')
        g.addColorStop(1, 'rgba(235,233,230,.86)')
      }
      ctx!.fillStyle = g
      ctx!.fill()
      ctx!.strokeStyle = orb.orbState === 'user_speaking'
        ? 'rgba(200,87,42,.18)' : 'rgba(185,182,178,.2)'
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      // Highlight
      ctx!.beginPath()
      ctx!.arc(CX - orb.r * .22, CY - orb.r * .26, orb.r * .38, 0, Math.PI * 2)
      const hg = ctx!.createRadialGradient(
        CX - orb.r * .22, CY - orb.r * .26, 0,
        CX - orb.r * .22, CY - orb.r * .26, orb.r * .38,
      )
      hg.addColorStop(0, 'rgba(255,255,255,.2)')
      hg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx!.fillStyle = hg
      ctx!.fill()

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [size])

  return (
    <div className={className} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={size} height={size} style={{ display: 'block' }} />
    </div>
  )
}
