'use client'

import React, { useEffect, useRef } from 'react'

interface AnimatedBackgroundProps {
  type: 'particles' | 'gradient-shift' | 'waves' | 'glitch' | 'grid' | 'parallax' | 'aurora' | 'stars' | 'matrix' | 'scanlines'
  intensity?: number
  speed?: 'slow' | 'medium' | 'fast'
  color?: string
}

/**
 * Animated Background Effects Component
 * Provides various visual effects for themed backgrounds
 */
export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  type,
  intensity = 0.5,
  speed = 'medium',
  color = '#6366f1',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      console.error('[AnimatedBackground] Canvas ref not found')
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.error('[AnimatedBackground] Could not get 2D context')
      return
    }

    // Set canvas size to match viewport exactly
    const resizeCanvas = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      
      // Set canvas internal resolution
      canvas.width = w
      canvas.height = h
      
      // Reset context state after resize
      ctx.imageSmoothingEnabled = true
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const speedMultiplier = speed === 'slow' ? 0.5 : speed === 'fast' ? 2 : 1

    console.log(`[AnimatedBackground] Starting ${type} animation with intensity=${intensity}, speed=${speed}`)

    // Start the appropriate animation
    if (type === 'particles') {
      animationRef.current = startParticles(ctx, canvas, intensity, speedMultiplier, color)
    } else if (type === 'gradient-shift') {
      animationRef.current = startGradientShift(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'waves') {
      animationRef.current = startWaves(ctx, canvas, intensity, speedMultiplier, color)
    } else if (type === 'grid') {
      animationRef.current = startGrid(ctx, canvas, intensity, color)
    } else if (type === 'aurora') {
      animationRef.current = startAurora(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'stars') {
      animationRef.current = startStarfield(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'matrix') {
      animationRef.current = startMatrix(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'parallax') {
      animationRef.current = startParallax(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'glitch') {
      animationRef.current = startGlitch(ctx, canvas, intensity, speedMultiplier)
    } else if (type === 'scanlines') {
      animationRef.current = startScanlines(ctx, canvas, intensity)
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [type, intensity, speed, color])

    return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'block',
      }}
    />
  )
}

// ============ ANIMATION STARTERS ============

function startParticles(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number,
  color: string
): number {
  const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number }> = []
  const particleCount = Math.floor(intensity * 100) + 20 // Minimum 20 particles

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * speedMultiplier * 2,
      vy: (Math.random() - 0.5) * speedMultiplier * 2,
      size: Math.random() * 4 + 1,
    })
  }

  const animate = () => {
    // Clear with semi-transparent background for motion blur
    ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    ctx.fillStyle = color
    ctx.globalAlpha = Math.min(intensity, 1)

    particles.forEach((p) => {
      p.x += p.vx
      p.y += p.vy

      if (p.x < 0) p.x = canvas.width
      if (p.x > canvas.width) p.x = 0
      if (p.y < 0) p.y = canvas.height
      if (p.y > canvas.height) p.y = 0

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })

    ctx.globalAlpha = 1
    return requestAnimationFrame(animate)
  }

  return animate()
}

function startGradientShift(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  let hue = 0

  const animate = () => {
    hue += speedMultiplier * 0.3
    hue = hue % 360

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, `hsl(${hue}, 100%, 50%)`)
    gradient.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 100%, 50%)`)
    gradient.addColorStop(1, `hsl(${(hue + 240) % 360}, 100%, 50%)`)

    ctx.fillStyle = gradient
    ctx.globalAlpha = Math.min(intensity * 0.8, 0.9)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startWaves(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number,
  color: string
): number {
  let time = 0

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(15, 23, 42, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = Math.min(intensity, 0.8)

    for (let waveIndex = 0; waveIndex < 4; waveIndex++) {
      ctx.beginPath()

      const waveHeight = 40 * intensity
      const waveFrequency = 0.01
      const yOffset = (canvas.height / 5) * (waveIndex + 1)
      const phaseShift = waveIndex * 0.5

      for (let x = 0; x < canvas.width; x += 5) {
        const y =
          yOffset +
          Math.sin((x * waveFrequency + time * speedMultiplier * 0.02 + phaseShift) * Math.PI) *
            waveHeight

        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      ctx.stroke()
    }

    ctx.globalAlpha = 1
    time++

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startGrid(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  color: string
): number {
  let offset = 0

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(15, 23, 42, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = color
    ctx.globalAlpha = Math.min(intensity, 0.7)
    ctx.lineWidth = 1

    const gridSize = 40

    // Draw moving grid
    for (let x = -gridSize; x < canvas.width + gridSize; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x + offset, 0)
      ctx.lineTo(x + offset, canvas.height)
      ctx.stroke()
    }

    for (let y = -gridSize; y < canvas.height + gridSize; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y + offset)
      ctx.lineTo(canvas.width, y + offset)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    offset = (offset + 1) % gridSize

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startAurora(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  let time = 0

  const animate = () => {
    // Fade the canvas background over time for aurora trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw multiple flowing aurora bands with wave motion
    for (let bandIndex = 0; bandIndex < 4; bandIndex++) {
      const baseHue = 220 + bandIndex * 40
      const waveOffset = Math.sin(time * 0.008 * speedMultiplier + bandIndex * 0.5) * 100
      const bandHeight = canvas.height * 0.15
      const bandY = canvas.height * 0.25 + bandIndex * 80 + waveOffset

      // Create horizontal gradient for the aurora band
      const gradient = ctx.createLinearGradient(0, bandY - bandHeight / 2, 0, bandY + bandHeight / 2)

      const hue = (baseHue + time * speedMultiplier * 0.3) % 360
      const hue2 = (baseHue + 60 + time * speedMultiplier * 0.25) % 360

      // Create color stops for smooth aurora effect
      gradient.addColorStop(0, `hsla(${hue}, 100%, 40%, 0)`)
      gradient.addColorStop(0.25, `hsla(${hue}, 100%, 60%, 0.6)`)
      gradient.addColorStop(0.5, `hsla(${hue2}, 100%, 70%, 0.8)`)
      gradient.addColorStop(0.75, `hsla(${hue}, 100%, 60%, 0.6)`)
      gradient.addColorStop(1, `hsla(${hue}, 100%, 40%, 0)`)

      ctx.fillStyle = gradient
      ctx.globalAlpha = Math.min(intensity, 1)
      ctx.fillRect(0, bandY - bandHeight / 2, canvas.width, bandHeight)

      // Add a glowing effect with vertical gradients
      const glowGradient = ctx.createLinearGradient(0, bandY - bandHeight, 0, bandY + bandHeight)
      glowGradient.addColorStop(0.3, `hsla(${hue}, 100%, 50%, 0.2)`)
      glowGradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, 0.4)`)
      glowGradient.addColorStop(0.7, `hsla(${hue}, 100%, 50%, 0.2)`)

      ctx.fillStyle = glowGradient
      ctx.globalAlpha = Math.min(intensity * 0.5, 0.5)
      ctx.fillRect(0, bandY - bandHeight, canvas.width, bandHeight * 2)
    }

    ctx.globalAlpha = 1
    time++

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startStarfield(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  const stars: Array<{ x: number; y: number; z: number; vz: number }> = []
  const starCount = Math.floor(intensity * 150)

  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * canvas.width - canvas.width / 2,
      y: Math.random() * canvas.height - canvas.height / 2,
      z: Math.random() * 1000,
      vz: Math.random() * 5 * speedMultiplier + speedMultiplier,
    })
  }

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'

    stars.forEach((star) => {
      star.z -= star.vz

      if (star.z <= 0) {
        star.z = 1000
      }

      const x = (star.x / star.z) * 300 + canvas.width / 2
      const y = (star.y / star.z) * 300 + canvas.height / 2
      const size = (1 - star.z / 1000) * 3

      if (size > 0) {
        ctx.globalAlpha = Math.min(1 - star.z / 1000 + 0.3, 1)
        ctx.fillRect(x, y, size, size)
      }
    })

    ctx.globalAlpha = 1
    return requestAnimationFrame(animate)
  }

  return animate()
}

function startMatrix(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split('')
  const fontSize = 14
  const columns = Math.floor(canvas.width / fontSize)
  const drops: number[] = []

  for (let i = 0; i < columns; i++) {
    drops[i] = Math.floor(Math.random() * canvas.height)
  }

  const animate = () => {
    ctx.fillStyle = 'rgba(0, 20, 0, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = `hsla(120, 100%, 50%, ${Math.min(intensity, 0.8)})`
    ctx.font = `${fontSize}px monospace`

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)]
      ctx.fillText(char, i * fontSize, drops[i] * fontSize)

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0
      }

      drops[i] += speedMultiplier * 0.5
    }

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startParallax(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  let offset = 0
  const layers = [
    { speed: 0.2, color: 'rgba(100, 150, 255, 0.1)', height: 0.3 },
    { speed: 0.5, color: 'rgba(150, 100, 255, 0.15)', height: 0.6 },
    { speed: 1, color: 'rgba(200, 100, 255, 0.2)', height: 1 },
  ]

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(15, 23, 42, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    layers.forEach((layer) => {
      ctx.fillStyle = layer.color
      ctx.globalAlpha = Math.min(intensity * layer.speed, 0.8)
      ctx.fillRect(0, canvas.height * layer.height * 0.5, canvas.width, canvas.height * layer.height * 0.5)
    })

    ctx.globalAlpha = 1
    offset += speedMultiplier * 0.5

    return requestAnimationFrame(animate)
  }

  return animate()
}

function startGlitch(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number,
  speedMultiplier: number
): number {
  let time = 0

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(15, 23, 42, 1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Random glitch lines
    for (let i = 0; i < 5 * intensity; i++) {
      if (Math.random() > 0.8 - intensity * 0.2) {
        const y = Math.random() * canvas.height
        const height = Math.random() * 40 + 5
        const offset = (Math.random() - 0.5) * 30

      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 255, 0.5)'
      ctx.globalAlpha = Math.min(intensity, 0.8)
        ctx.fillRect(offset, y, canvas.width - Math.abs(offset), height)
      }
    }

    // Glitch blocks
    if (time % 10 === 0) {
      const numGlitches = Math.floor(intensity * 3)
      for (let i = 0; i < numGlitches; i++) {
        const x = Math.random() * canvas.width
        const y = Math.random() * canvas.height
        const w = Math.random() * 100 + 50
        const h = Math.random() * 50 + 20

        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 255, 255, 0.4)'
        ctx.globalAlpha = Math.min(intensity, 0.8)
        ctx.fillRect(x, y, w, h)
      }
    }

    ctx.globalAlpha = 1
    time += speedMultiplier

    return requestAnimationFrame(animate)
  }

  return animate()
}
// Scanlines effect - CRT monitor style
function startScanlines(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity: number
): number {
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw scanlines
    ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * intensity})`
    for (let y = 0; y < canvas.height; y += 2) {
      ctx.fillRect(0, y, canvas.width, 1)
    }
    
    // Optional: Add subtle flicker
    if (Math.random() > 0.97) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.02 * intensity})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    return requestAnimationFrame(animate)
  }

  return animate()
}