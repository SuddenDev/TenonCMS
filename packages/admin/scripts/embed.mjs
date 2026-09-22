// Turns the Vite build into one JS module, so the server serves the admin without filesystem access.
// Files are base64, so server bundlers that rewrite code (e.g. `typeof window`) cannot alter them.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const assets = {}
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || entry.name === 'assets.js') continue
  const file = join(entry.parentPath, entry.name)
  assets[`/${relative(dist, file)}`] = readFileSync(file).toString('base64')
}
writeFileSync(join(dist, 'assets.js'), `export default ${JSON.stringify(assets)}\n`)
console.log(`embedded ${Object.keys(assets).length} admin file(s)`)
