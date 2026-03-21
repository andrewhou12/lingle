import type { NextConfig } from 'next'
import { join } from 'path'

const config: NextConfig = {
  reactStrictMode: false,
  transpilePackages: ['@lingle/shared', '@lingle/db'],
  outputFileTracingRoot: join(__dirname, '../../'),
  serverExternalPackages: ['kuromoji', 'ws', 'bufferutil', 'utf-8-validate'],
}

export default config
