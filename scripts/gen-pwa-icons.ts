/**
 * One-off: rasterize public/logo.svg into the PWA icon set.
 * Run with: bun scripts/gen-pwa-icons.ts
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const svg = readFileSync(resolve(process.cwd(), 'public/logo.svg')).toString()
const OUT = resolve(process.cwd(), 'public/icons')

const BG = '#faf6ee' // paper canvas, matches the SVG background and themeColor

async function raster(size: number, file: string, maskable = false) {
  // Maskable icons need the glyph inside the ~80% safe zone, so we render the
  // 64-unit logo at 60% scale, centered, on a full-bleed background.
  const inner = maskable ? Math.round(size * 0.6) : size
  const pad = Math.round((size - inner) / 2)
  const layer = Buffer.from(svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `))
  const comp = [{ input: layer, left: pad, top: pad }]
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite(comp)
    .png()
    .toFile(resolve(OUT, file))
  console.log(`wrote public/icons/${file}`)
}

await Promise.all([
  raster(192, 'icon-192.png'),
  raster(512, 'icon-512.png'),
  raster(192, 'maskable-192.png', true),
  raster(512, 'maskable-512.png', true),
  raster(180, 'apple-touch-icon.png'),
])
