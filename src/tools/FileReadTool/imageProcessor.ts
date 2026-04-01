import type { Buffer } from 'buffer'
import { isInBundledMode } from '../../utils/bundledMode.js'
import { join } from 'path'

export type SharpInstance = {
  metadata(): Promise<{ width: number; height: number; format: string }>
  resize(
    width: number,
    height: number,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpInstance
  jpeg(options?: { quality?: number }): SharpInstance
  png(options?: {
    compressionLevel?: number
    palette?: boolean
    colors?: number
  }): SharpInstance
  webp(options?: { quality?: number }): SharpInstance
  toBuffer(): Promise<Buffer>
}

export type SharpFunction = (input: Buffer) => SharpInstance

type SharpCreatorOptions = {
  create: {
    width: number
    height: number
    channels: 3 | 4
    background: { r: number; g: number; b: number }
  }
}

type SharpCreator = (options: SharpCreatorOptions) => SharpInstance

let imageProcessorModule: { default: SharpFunction } | null = null
let imageCreatorModule: { default: SharpCreator } | null = null

/**
 * Try loading sharp via multiple strategies:
 * 1. Direct import (works in dev/source mode)
 * 2. require() from project node_modules (works in bundled mode)
 * 3. require('sharp') from global (if installed globally)
 */
function tryLoadSharp(): unknown | null {
  // Strategy 1: standard import/require
  try {
    return require('sharp')
  } catch { /* continue */ }

  // Strategy 2: load from the source project's node_modules
  // The cli-dev binary is built from a known source directory
  const candidatePaths: string[] = []

  // Strategy 2a: relative to the binary's location
  if (typeof process.argv[1] === 'string') {
    const binaryDir = join(process.argv[1], '..')
    candidatePaths.push(join(binaryDir, 'node_modules', 'sharp'))
  }

  // Strategy 2b: relative to cwd
  candidatePaths.push(join(process.cwd(), 'node_modules', 'sharp'))

  // Strategy 2c: relative to the source project root (for dev builds)
  // The __dirname in bundled mode points to a virtual FS, so use
  // well-known paths based on the binary name
  if (typeof process.execPath === 'string') {
    const execDir = join(process.execPath, '..')
    candidatePaths.push(join(execDir, 'node_modules', 'sharp'))
  }

  for (const sharpPath of candidatePaths) {
    try {
      return require(sharpPath)
    } catch { /* continue */ }
  }

  return null
}

export async function getImageProcessor(): Promise<SharpFunction> {
  if (imageProcessorModule) {
    return imageProcessorModule.default
  }

  if (isInBundledMode()) {
    try {
      const imageProcessor = await import('image-processor-napi')
      const sharp = imageProcessor.sharp || imageProcessor.default
      imageProcessorModule = { default: sharp }
      return sharp
    } catch { /* not available in this build */ }
  }

  const sharpMod = tryLoadSharp()
  if (sharpMod) {
    const sharp = unwrapDefault(sharpMod as MaybeDefault<SharpFunction>)
    imageProcessorModule = { default: sharp }
    return sharp
  }

  throw new Error(
    'Image processing unavailable: install sharp in the project directory (bun add sharp)',
  )
}

/**
 * Get image creator for generating new images from scratch.
 */
export async function getImageCreator(): Promise<SharpCreator> {
  if (imageCreatorModule) {
    return imageCreatorModule.default
  }

  const sharpMod = tryLoadSharp()
  if (sharpMod) {
    const sharp = unwrapDefault(sharpMod as MaybeDefault<SharpCreator>)
    imageCreatorModule = { default: sharp }
    return sharp
  }

  throw new Error(
    'Image creation unavailable: install sharp in the project directory (bun add sharp)',
  )
}

type MaybeDefault<T> = T | { default: T }

function unwrapDefault<T extends (...args: never[]) => unknown>(
  mod: MaybeDefault<T>,
): T {
  return typeof mod === 'function' ? mod : mod.default
}
