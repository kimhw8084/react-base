import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const cache = join(root, "offline", "npm-cache")
const registryDir = join(root, "offline", "registry", "base-nova")
const itemDir = join(registryDir, "items")
const templates = { vite: "react-base", next: "next-app" }

function fail(message) {
  console.error(message)
  process.exit(1)
}

function npmCliPath() {
  const binDir = dirname(process.execPath)
  const candidates = [
    resolve(binDir, "../lib/node_modules/npm/bin/npm-cli.js"),
    resolve(binDir, "node_modules/npm/bin/npm-cli.js"),
  ]
  return candidates.find(existsSync) ?? fail("Could not find npm bundled with the selected Node runtime.")
}

function runNpm(projectDir, args) {
  const env = {
    ...process.env,
    npm_config_cache: cache,
    npm_config_offline: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  }
  const result = spawnSync(process.execPath, [npmCliPath(), ...args], {
    cwd: projectDir,
    env,
    stdio: "inherit",
  })
  if (result.error) fail(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function projectPath(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function packageName(spec) {
  if (!spec.startsWith("@")) return spec.split("@")[0]
  return spec.match(/^(@[^/]+\/[^@]+)(?:@.*)?$/)?.[1] ?? spec
}

function copyTemplate(framework, destination) {
  const templateName = templates[framework]
  if (!templateName) fail("Framework must be 'vite' or 'next'.")
  const source = join(root, templateName)
  const target = projectPath(destination)
  if (existsSync(target)) fail(`Destination already exists: ${target}`)
  mkdirSync(dirname(target), { recursive: true })
  cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const parts = relative(source, sourcePath).split(sep)
      return !parts.some((part) => ["node_modules", ".next", "dist"].includes(part))
    },
  })
  runNpm(target, ["ci", "--offline", "--no-audit", "--no-fund"])
  console.log(`Created ${framework} app at ${target}`)
}

function safeOutputPath(base, candidate) {
  if (isAbsolute(candidate) || candidate.split(/[\\/]/).includes("..")) {
    fail(`Unsafe registry target path: ${candidate}`)
  }
  const output = resolve(base, candidate)
  if (relative(base, output).startsWith(`..${sep}`) || output === base) {
    fail(`Registry target escapes the project: ${candidate}`)
  }
  return output
}

function itemOutputPath(appRoot, file) {
  const prefix = "registry/base-nova/"
  if (file.target) return safeOutputPath(appRoot, file.target)
  if (typeof file.path !== "string" || !file.path.startsWith(prefix)) {
    fail(`Unexpected registry path: ${file.path}`)
  }
  const sourcePath = file.path.slice(prefix.length)
  let outputPath = `registry/base-nova/${sourcePath}`
  if (sourcePath.startsWith("ui/")) outputPath = `components/ui/${sourcePath.slice("ui/".length)}`
  else if (sourcePath.startsWith("hooks/")) outputPath = sourcePath
  else if (sourcePath.startsWith("lib/")) outputPath = sourcePath
  else if (sourcePath.startsWith("components/")) outputPath = sourcePath
  return safeOutputPath(appRoot, outputPath)
}

function normalizeImports(content) {
  let normalized = content
    .replaceAll("@/registry/base-nova/ui/", "@/components/ui/")
    .replaceAll("@/registry/base-nova/hooks/", "@/hooks/")
    .replaceAll("@/registry/base-nova/lib/", "@/lib/")
    .replaceAll("@/registry/base-nova/components/", "@/components/")
  const reactNamespaceImport = /^import \* as React from ["']react["'];?\r?\n/gm
  if (!/\bReact\./.test(normalized.replace(reactNamespaceImport, ""))) {
    normalized = normalized.replace(reactNamespaceImport, "")
  }
  return normalized
}

function insertCssImport(css, statement) {
  if (css.includes(statement)) return css
  const imports = [...css.matchAll(/^@import[^;]+;\s*$/gm)]
  if (!imports.length) return `${statement}\n${css}`
  const last = imports.at(-1)
  const end = last.index + last[0].length
  return `${css.slice(0, end)}\n${statement}${css.slice(end)}`
}

function writeCss(target, cssPath, css) {
  const output = safeOutputPath(target, cssPath)
  if (!existsSync(output)) fail(`The starter CSS file does not exist: ${cssPath}`)
  writeFileSync(output, css)
}

function applyFont(framework, target, font) {
  if (!font?.dependency || !font.variable || !font.family) {
    fail("This registry font entry is missing its local package or CSS metadata.")
  }
  const components = JSON.parse(readFileSync(join(target, "components.json"), "utf8"))
  const cssPath = components.tailwind?.css
  if (!cssPath) fail("Could not find the starter CSS path in components.json.")
  const output = safeOutputPath(target, framework === "vite" ? cssPath : cssPath)
  let css = readFileSync(output, "utf8")
  const importPath = font.dependency.startsWith("@fontsource-variable/")
    ? font.dependency
    : `${font.dependency}/400.css`
  css = insertCssImport(css, `@import "${importPath}";`)
  const variable = font.variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const property = new RegExp(`(${variable}\\s*:\\s*)[^;]+;`)
  if (property.test(css)) css = css.replace(property, `$1${font.family};`)
  else css += `\n@theme inline {\n  ${font.variable}: ${font.family};\n}\n`
  writeCss(target, cssPath, css)
}

function cssObjectToRules(cssObject) {
  const output = []
  for (const [key, value] of Object.entries(cssObject ?? {})) {
    if (key.startsWith("@import ")) {
      output.push(`${key};`)
      continue
    }
    if (!key.startsWith("@layer ") || typeof value !== "object" || !value) continue
    const rules = []
    for (const [selector, declarations] of Object.entries(value)) {
      if (typeof declarations !== "object" || !declarations) continue
      const lines = Object.keys(declarations).map((declaration) => `    ${declaration};`)
      rules.push(`  ${selector} {\n${lines.join("\n")}\n  }`)
    }
    if (rules.length) output.push(`${key} {\n${rules.join("\n")}\n}`)
  }
  return output
}

function applyStyle(framework, target, item) {
  const components = JSON.parse(readFileSync(join(target, "components.json"), "utf8"))
  const cssPath = components.tailwind?.css
  if (!cssPath) fail("Could not find the starter CSS path in components.json.")
  const output = safeOutputPath(target, cssPath)
  let css = readFileSync(output, "utf8")
  for (const rule of cssObjectToRules(item.css)) {
    if (rule.startsWith("@import ")) css = insertCssImport(css, rule)
    else if (!css.includes("@layer base")) css += `\n${rule}\n`
  }
  writeCss(target, cssPath, css)
}

function readItem(name) {
  const itemPath = join(itemDir, `${name}.json`)
  if (!existsSync(itemPath)) fail(`No offline base-nova registry item named '${name}'.`)
  const item = JSON.parse(readFileSync(itemPath, "utf8"))
  if (item.name !== name) fail(`Registry item name mismatch in ${name}.json.`)
  return item
}

function addItems(framework, destination, requested) {
  if (!templates[framework]) fail("Framework must be 'vite' or 'next'.")
  const target = projectPath(destination)
  const overwrite = requested.includes("--overwrite")
  const itemsRequested = requested.filter((name) => name !== "--overwrite")
  const rootRegistry = JSON.parse(readFileSync(join(registryDir, "registry.json"), "utf8"))
  const names = itemsRequested.length === 1 && itemsRequested[0] === "--all"
    ? rootRegistry.items.filter((item) => item.type === "registry:ui").map((item) => item.name)
    : itemsRequested
  if (!names.length) fail("Pass one or more local registry item names, or --all for all UI components.")

  const packageJsonPath = join(target, "package.json")
  if (!existsSync(packageJsonPath)) fail(`No package.json in ${target}`)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const closure = new Map()
  const visiting = new Set()

  function visit(name) {
    if (closure.has(name)) return
    if (visiting.has(name)) return
    visiting.add(name)
    const item = readItem(name)
    for (const dependency of item.registryDependencies ?? []) visit(dependency)
    visiting.delete(name)
    closure.set(name, item)
  }

  for (const name of names) visit(name)

  const files = new Map()
  const missingDependencies = new Set()
  const fonts = []
  const styles = []
  const offlineAssetNames = new Set()
  const assetMap = JSON.parse(readFileSync(join(registryDir, "assets", "map.json"), "utf8"))
  const assetFiles = new Set(Object.values(assetMap).map((entry) => entry.file).filter(Boolean))
  const appRoot = join(target, framework === "vite" ? "src" : "")

  for (const item of closure.values()) {
    for (const spec of [...(item.dependencies ?? []), ...(item.devDependencies ?? [])]) {
      const dependencyName = packageName(spec)
      if (!declared[dependencyName]) missingDependencies.add(dependencyName)
    }
    if (item.font) {
      if (!declared[packageName(item.font.dependency ?? "")]) {
        missingDependencies.add(packageName(item.font.dependency ?? ""))
      }
      fonts.push(item.font)
    }
    if (item.type === "registry:style") styles.push(item)
    for (const file of item.files ?? []) {
      if (typeof file.content !== "string") fail(`Missing vendored source for ${item.name}: ${file.path}`)
      const output = itemOutputPath(appRoot, file)
      const content = normalizeImports(file.content)
      const previous = files.get(output)
      if (previous && previous !== content) fail(`Conflicting vendored versions for ${relative(target, output)}`)
      files.set(output, content)
      for (const match of content.matchAll(/\/offline-assets\/([A-Za-z0-9_.-]+)/g)) {
        if (assetFiles.has(match[1])) offlineAssetNames.add(match[1])
      }
    }
  }

  if (missingDependencies.size) {
    fail(`Use one of this kit's starters; missing bundled dependencies: ${[...missingDependencies].sort().join(", ")}`)
  }

  const conflicts = [...files].filter(([path, content]) => {
    return existsSync(path) && readFileSync(path, "utf8") !== content && !overwrite
  })
  if (conflicts.length) {
    fail(`Existing files differ: ${conflicts.map(([path]) => relative(target, path)).join(", ")}\nPass --overwrite to replace them with the offline snapshot.`)
  }

  for (const [path, content] of files) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
  }
  for (const font of fonts) applyFont(framework, target, font)
  for (const style of styles) applyStyle(framework, target, style)
  if (offlineAssetNames.size) {
    const publicDir = join(target, "public", "offline-assets")
    mkdirSync(publicDir, { recursive: true })
    for (const name of offlineAssetNames) {
      const source = join(registryDir, "assets", name)
      if (!existsSync(source)) fail(`Missing bundled registry asset ${name}.`)
      copyFileSync(source, join(publicDir, name))
    }
  }
  console.log(`Added ${closure.size} local registry item(s), ${files.size} source file(s), and ${offlineAssetNames.size} image asset(s).`)
  const noCode = [...closure.values()]
    .filter((item) => !item.files?.length && !item.font && item.type !== "registry:style")
    .map((item) => item.name)
  if (noCode.length) console.log(`Official entries without source files: ${noCode.join(", ")}`)
}

function listItems(type) {
  const registry = JSON.parse(readFileSync(join(registryDir, "registry.json"), "utf8"))
  const items = type ? registry.items.filter((item) => item.type === type || item.type === `registry:${type}`) : registry.items
  for (const item of items) console.log(`${item.type}\t${item.name}`)
  console.log(`${items.length} local item(s).`)
}

function verifyPack() {
  const lockfiles = ["react-base/package-lock.json", "next-app/package-lock.json"]
  const urls = new Set()
  for (const lockfile of lockfiles) {
    const lock = JSON.parse(readFileSync(join(root, lockfile), "utf8"))
    for (const entry of Object.values(lock.packages ?? {})) {
      if (entry.resolved?.startsWith("https://registry.npmjs.org/")) urls.add(entry.resolved)
    }
  }

  const cacheList = spawnSync(process.execPath, [npmCliPath(), "cache", "ls", `--cache=${cache}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  if (cacheList.error) fail(cacheList.error.message)
  if (cacheList.status !== 0) fail(cacheList.stderr || "Could not read the bundled npm cache.")
  const missingTarballs = [...urls].filter((url) => !cacheList.stdout.includes(url))
  if (missingTarballs.length) fail(`Offline npm cache is missing ${missingTarballs.length} locked package tarball(s).`)

  const registry = JSON.parse(readFileSync(join(registryDir, "registry.json"), "utf8"))
  const names = new Set(registry.items.map((item) => item.name))
  const itemFiles = readdirSync(itemDir).filter((file) => file.endsWith(".json"))
  if (itemFiles.length !== registry.items.length) fail("The local item manifests do not match registry.json.")
  const itemMap = new Map()
  const packageNames = new Set()
  let sourceFiles = 0
  let codeBearingUiItems = 0
  for (const fileName of itemFiles) {
    const item = JSON.parse(readFileSync(join(itemDir, fileName), "utf8"))
    if (!names.has(item.name) || item.name !== fileName.slice(0, -5)) fail(`Unexpected local manifest ${fileName}.`)
    itemMap.set(item.name, item)
    for (const dep of [...(item.dependencies ?? []), ...(item.devDependencies ?? [])]) packageNames.add(packageName(dep))
    if (item.font?.dependency) packageNames.add(packageName(item.font.dependency))
    for (const file of item.files ?? []) {
      if (typeof file.content !== "string") fail(`${item.name} has a source file without local content: ${file.path}`)
      sourceFiles += 1
    }
    if (item.type === "registry:ui" && item.files?.length) codeBearingUiItems += 1
  }
  for (const item of itemMap.values()) {
    for (const dependency of item.registryDependencies ?? []) {
      if (!itemMap.has(dependency)) fail(`${item.name} has missing registry dependency ${dependency}.`)
    }
  }
  for (const framework of Object.keys(templates)) {
    const packageJson = JSON.parse(readFileSync(join(root, templates[framework], "package.json"), "utf8"))
    const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
    for (const dependency of packageNames) {
      if (!declared[dependency]) fail(`${framework} starter is missing registry package ${dependency}.`)
    }
    const starterRoot = join(root, templates[framework], framework === "vite" ? "src" : "")
    for (const item of itemMap.values()) {
      if (item.type !== "registry:ui") continue
      for (const file of item.files ?? []) {
        const source = file.path.slice("registry/base-nova/ui/".length)
        const path = join(starterRoot, "components", "ui", source)
        const expected = normalizeImports(file.content)
        if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
          fail(`${framework} starter does not contain the current offline ${item.name} source.`)
        }
      }
    }
  }

  const source = JSON.parse(readFileSync(join(registryDir, "source.json"), "utf8"))
  for (const [path, digest] of Object.entries(source.upstreamSha256)) {
    const sourcePath = join(registryDir, "upstream", path)
    if (!existsSync(sourcePath)) fail(`Missing official upstream snapshot file ${path}.`)
    if (createHash("sha256").update(readFileSync(sourcePath)).digest("hex") !== digest) {
      fail(`Official upstream checksum mismatch: ${path}`)
    }
  }
  const assetMap = JSON.parse(readFileSync(join(registryDir, "assets", "map.json"), "utf8"))
  const assetNames = new Set(Object.values(assetMap).map((entry) => entry.file).filter(Boolean))
  for (const assetName of assetNames) {
    if (!existsSync(join(registryDir, "assets", assetName))) fail(`Missing local registry image asset ${assetName}.`)
  }
  for (const item of itemMap.values()) {
    for (const file of item.files ?? []) {
      const externalUrls = [...file.content.matchAll(/https?:\/\/[^\s"'<>`]+/g)]
        .map(([url]) => url)
        .filter((url) => !url.startsWith("http://www.w3.org/2000/svg"))
      if (externalUrls.length) fail(`${item.name} still contains an online URL in ${file.path}: ${externalUrls[0]}`)
    }
  }

  const runtimeManifestPath = join(root, "offline", "runtimes", "manifest.json")
  const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8"))
  for (const runtime of runtimeManifest.runtimes) {
    const runtimePath = join(root, "offline", "runtimes", runtime.file)
    if (!existsSync(runtimePath)) fail(`Missing bundled runtime ${runtime.file}`)
    const digest = createHash("sha256").update(readFileSync(runtimePath)).digest("hex")
    if (digest !== runtime.sha256) fail(`Checksum mismatch for bundled runtime ${runtime.file}`)
  }
  console.log(`Verified ${urls.size} cached npm tarballs, ${registry.items.length} registry items (${codeBearingUiItems} source-bearing UI items), ${sourceFiles} vendored files, ${assetNames.size} local images, and ${runtimeManifest.runtimes.length} Node runtimes.`)
}

const [command, first, second, ...rest] = process.argv.slice(2)
switch (command) {
  case "create":
    if (!first || !second) fail("Usage: offline.mjs create <vite|next> <destination>")
    copyTemplate(first, second)
    break
  case "install": {
    if (!first) fail("Usage: offline.mjs install <project-directory>")
    const target = projectPath(first)
    runNpm(target, ["ci", "--offline", "--no-audit", "--no-fund"])
    break
  }
  case "build": {
    if (!first) fail("Usage: offline.mjs build <project-directory>")
    const target = projectPath(first)
    runNpm(target, ["run", "build"])
    break
  }
  case "dev": {
    if (!first) fail("Usage: offline.mjs dev <project-directory>")
    const target = projectPath(first)
    runNpm(target, ["run", "dev"])
    break
  }
  case "add":
    if (!first || !second) fail("Usage: offline.mjs add <vite|next> <project-directory> <item...|--all> [--overwrite]")
    addItems(first, second, rest)
    break
  case "list":
    listItems(first)
    break
  case "verify":
    verifyPack()
    break
  default:
    fail("Commands: create, install, add, list, dev, build, verify")
}
