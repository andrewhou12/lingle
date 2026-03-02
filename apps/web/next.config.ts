import type { NextConfig } from 'next'
import { join } from 'path'

const config: NextConfig = {
  transpilePackages: ['@lingle/core', '@lingle/shared', '@lingle/db'],
  outputFileTracingRoot: join(__dirname, '../../'),
  serverExternalPackages: ['kuromoji'],
}

export default config
