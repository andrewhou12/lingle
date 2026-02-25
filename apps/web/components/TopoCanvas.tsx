'use client'

import { useEffect, useRef } from 'react'

function lerp(a: number, b: number, v: number) {
  return Math.abs(b - a) < 0.0001 ? 0.5 : (v - a) / (b - a)
}

function noise(x: number, y: number, t: number) {
  return (
    Math.sin(x * 2.2 + t * 0.35) * 0.25 +
    Math.sin(y * 1.8 - t * 0.28) * 0.25 +
    Math.sin((x + y) * 1.4 + t * 0.18) * 0.18 +
    Math.sin(x * 3.7 - y * 2.3 + t * 0.42) * 0.16 +
    Math.sin(x * 0.8 + y * 3.2 - t * 0.3) * 0.16
  )
}

export default function TopoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let t = 0
    const mouse = { x: 0.5, y: 0.5 }
    let animId = 0

    function resize() {
      W = cv!.width = window.innerWidth
      H = cv!.height = window.innerHeight
    }

    function draw() {
      t += 0.004
      ctx!.clearRect(0, 0, W, H)

      const cols = Math.ceil(W / 6)
      const rows = Math.ceil(H / 6)
      const cW = W / cols
      const cH = H / rows
      const LEVELS = 22

      const field: number[][] = []
      for (let r = 0; r <= rows; r++) {
        field[r] = []
        for (let c = 0; c <= cols; c++) {
          const nx = c / cols
          const ny = r / rows
          const md = Math.hypot(nx - mouse.x, ny - mouse.y)
          field[r][c] =
            noise(nx * 3.8, ny * 3.8, t) +
            Math.max(0, 1 - md * 3.2) * 0.45
        }
      }

      for (let lv = 0; lv < LEVELS; lv++) {
        const threshold = -0.85 + (lv / LEVELS) * 1.7
        const prog = lv / LEVELS
        const alpha = 0.025 + prog * 0.04

        ctx!.beginPath()
        ctx!.strokeStyle = `rgba(10,10,10,${alpha})`
        ctx!.lineWidth = 0.6

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const tl = field[row][col]
            const tr = field[row][col + 1]
            const bl = field[row + 1][col]
            const br = field[row + 1][col + 1]
            const x0 = col * cW
            const y0 = row * cH
            const x1 = x0 + cW
            const y1 = y0 + cH

            const idx =
              (tl >= threshold ? 8 : 0) |
              (tr >= threshold ? 4 : 0) |
              (br >= threshold ? 2 : 0) |
              (bl >= threshold ? 1 : 0)

            if (idx === 0 || idx === 15) continue

            const top = { x: x0 + lerp(tl, tr, threshold) * cW, y: y0 }
            const right = { x: x1, y: y0 + lerp(tr, br, threshold) * cH }
            const bottom = {
              x: x0 + lerp(bl, br, threshold) * cW,
              y: y1,
            }
            const left = { x: x0, y: y0 + lerp(tl, bl, threshold) * cH }

            let a = top
            let b = top
            switch (idx) {
              case 1:  a = left;   b = bottom; break
              case 2:  a = bottom; b = right;  break
              case 3:  a = left;   b = right;  break
              case 4:  a = right;  b = top;    break
              case 6:  a = bottom; b = top;    break
              case 7:  a = left;   b = top;    break
              case 8:  a = top;    b = left;   break
              case 9:  a = top;    b = bottom; break
              case 11: a = top;    b = right;  break
              case 12: a = right;  b = left;   break
              case 13: a = right;  b = bottom; break
              case 14: a = bottom; b = left;   break
              default: continue
            }

            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
          }
        }
        ctx!.stroke()
      }

      animId = requestAnimationFrame(draw)
    }

    function handleMouse(e: MouseEvent) {
      mouse.x = e.clientX / W
      mouse.y = e.clientY / H
    }

    resize()
    animId = requestAnimationFrame(draw)

    cv.addEventListener('mousemove', handleMouse)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animId)
      cv.removeEventListener('mousemove', handleMouse)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  )
}
