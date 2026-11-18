import { fileURLToPath } from 'node:url'
import config from '../apps/api/jest.config.js'

// Bound variant concurrency and recycle retained worker heap between suites.
export default {
  ...config,
  rootDir: fileURLToPath(new URL('../apps/api/', import.meta.url)),
  maxWorkers: 2,
  workerIdleMemoryLimit: '512MiB',
}
