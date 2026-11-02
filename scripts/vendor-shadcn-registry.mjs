import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const projects = [
  { key: "vite", dir: "react-base", source: "src" },
  { key: "next", dir: "next-app", source: "" },
]

function resolveLocalImport(projectRoot, sourcePath, specifier) {
  const base = specifier.startsWith("@/")
    ? join(projectRoot, specifier.slice(2))
    : resolve(dirname(sourcePath), specifier)
  const candidates = [base]
  if (!/\.[cm]?[jt]sx?$/.test(base)) {
    candidates.push(...[".tsx", ".ts", ".jsx", ".js"].map((ext) => `${base}${ext}`))
    candidates.push(...["index.tsx", "index.ts", "index.jsx", "index.js"].map((file) => join(base, file)))
  }
  return candidates.find(existsSync)
}

function registryPath(projectRoot, sourcePath) {
  const localPath = relative(projectRoot, sourcePath).split(sep).join("/")
  if (localPath.startsWith("components/ui/")) {
    return `registry/base-nova/ui/${localPath.slice("components/ui/".length)}`
  }
  if (/^(components|hooks|lib)\//.test(localPath)) return `registry/base-nova/${localPath}`
  throw new Error(`Cannot map component source into registry: ${localPath}`)
}

function registryType(path) {
  if (path.includes("/ui/")) return "registry:ui"
  if (path.includes("/hooks/")) return "registry:hook"
  if (path.includes("/lib/")) return "registry:lib"
  return "registry:component"
}

for (const project of projects) {
  const projectRoot = join(root, project.dir, project.source)
  const componentsDir = join(projectRoot, "components", "ui")
  const packageJson = JSON.parse(readFileSync(join(root, project.dir, "package.json"), "utf8"))
  const dependencies = Object.keys(packageJson.dependencies ?? {}).sort()
  const outputDir = join(root, "offline", "registry", project.key)
  mkdirSync(outputDir, { recursive: true })
  const names = readdirSync(componentsDir)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.slice(0, -4))
    .sort()
  const items = []

  for (const name of names) {
    const mainFile = join(componentsDir, `${name}.tsx`)
    const files = new Map()
    const visited = new Set()

    function collect(sourcePath) {
      if (visited.has(sourcePath)) return
      visited.add(sourcePath)
      const content = readFileSync(sourcePath, "utf8")
      const path = registryPath(projectRoot, sourcePath)
      files.set(path, { path, type: registryType(path), content })

      const imports = content.matchAll(/(?:from\s+|import\s*)["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g)
      for (const match of imports) {
        const child = resolveLocalImport(projectRoot, sourcePath, match[1])
        if (!child) throw new Error(`${project.key}/${name} has unresolved local import ${match[1]}`)
        collect(child)
      }
    }

    collect(mainFile)
    const item = {
      name,
      type: "registry:ui",
      description: `${name} and its local source dependencies from the checked-in ${project.key} starter.`,
      dependencies,
      registryDependencies: [],
      files: [...files.values()],
    }
    writeFileSync(join(outputDir, `${name}.json`), `${JSON.stringify(item, null, 2)}\n`)
    items.push({ name, type: item.type, description: item.description })
  }

  writeFileSync(
    join(outputDir, "catalog.json"),
    `${JSON.stringify({ style: "base-nova", source: `../${project.dir}/components/ui`, items }, null, 2)}\n`,
  )
  console.log(`${project.key}: vendored ${items.length} checked-in UI items and their local imports`)
}
