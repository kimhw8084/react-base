import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const cache = join(root, "offline", "npm-cache")
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

function addComponents(framework, destination, requested) {
  if (!templates[framework]) fail("Framework must be 'vite' or 'next'.")
  const target = projectPath(destination)
  const registryDir = join(root, "offline", "registry", framework)
  const catalog = JSON.parse(readFileSync(join(registryDir, "catalog.json"), "utf8"))
  const overwrite = requested.includes("--overwrite")
  const itemsRequested = requested.filter((name) => name !== "--overwrite")
  const names = itemsRequested.length === 1 && itemsRequested[0] === "--all"
    ? catalog.items.map((item) => item.name)
    : itemsRequested
  if (!names.length) fail("Pass one or more component names, or --all.")

  const packageJsonPath = join(target, "package.json")
  if (!existsSync(packageJsonPath)) fail(`No package.json in ${target}`)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const files = new Map()
  const missingDependencies = new Set()

  for (const name of names) {
    const path = join(registryDir, `${name}.json`)
    if (!existsSync(path)) fail(`No offline ${framework} component named '${name}'.`)
    const item = JSON.parse(readFileSync(path, "utf8"))
    for (const spec of item.dependencies ?? []) {
      const dependencyName = packageName(spec)
      if (!declared[dependencyName]) missingDependencies.add(dependencyName)
    }
    for (const file of item.files ?? []) {
      if (typeof file.content !== "string") fail(`Missing vendored source for ${name}: ${file.path}`)
      const prefix = "registry/base-nova/"
      if (!file.path.startsWith(prefix)) fail(`Unexpected registry path for ${name}: ${file.path}`)
      let appRelative = file.path.slice(prefix.length)
      if (appRelative.startsWith("ui/")) appRelative = `components/${appRelative}`
      if (!/^(components|hooks|lib)\//.test(appRelative) || appRelative.includes("..")) {
        fail(`Unsafe or unsupported component path: ${file.path}`)
      }
      const appRoot = framework === "vite" ? "src" : ""
      const outputPath = resolve(target, appRoot, appRelative)
      const previous = files.get(outputPath)
      if (previous && previous !== file.content) fail(`Conflicting vendored versions for ${file.path}`)
      files.set(outputPath, file.content)
    }
  }

  if (missingDependencies.size) {
    fail(`Add from one of this kit's starters; missing dependencies: ${[...missingDependencies].join(", ")}`)
  }

  const conflicts = [...files].filter(([path, content]) => {
    return existsSync(path) && readFileSync(path, "utf8") !== content && !overwrite
  })
  if (conflicts.length) {
    fail(`Existing files differ: ${conflicts.map(([path]) => relative(target, path)).join(", ")}\nPass --overwrite to replace them with the kit snapshot.`)
  }

  for (const [path, content] of files) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
  }
  console.log(`Added ${names.length} local UI item(s) and ${files.size} source file(s).`)
}

function verifyPack() {
  const lockfiles = ["package-lock.json", "react-base/package-lock.json", "next-app/package-lock.json"]
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
  const missing = [...urls].filter((url) => !cacheList.stdout.includes(url))
  if (missing.length) {
    fail(`Offline npm cache is missing ${missing.length} locked package tarball(s).`)
  }

  let uiItems = 0
  for (const framework of Object.keys(templates)) {
    const registryDir = join(root, "offline", "registry", framework)
    const catalog = JSON.parse(readFileSync(join(registryDir, "catalog.json"), "utf8"))
    const packageJson = JSON.parse(readFileSync(join(root, templates[framework], "package.json"), "utf8"))
    const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
    const itemFiles = readdirSync(registryDir).filter((name) => name.endsWith(".json") && name !== "catalog.json")
    if (itemFiles.length !== catalog.items.length) fail(`${framework} catalog does not match its item files.`)
    for (const name of itemFiles) {
      const item = JSON.parse(readFileSync(join(registryDir, name), "utf8"))
      for (const dependency of item.dependencies ?? []) {
        const dependencyName = packageName(dependency)
        if (!declared[dependencyName]) fail(`${framework}/${item.name} requires unbundled dependency ${dependencyName}.`)
      }
      if (!item.files?.length || item.files.some((file) => typeof file.content !== "string")) {
        fail(`${framework}/${item.name} has missing local source files.`)
      }
    }
    uiItems += catalog.items.length
  }

  const runtimeManifestPath = join(root, "offline", "runtimes", "manifest.json")
  const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8"))
  for (const runtime of runtimeManifest.runtimes) {
    const runtimePath = join(root, "offline", "runtimes", runtime.file)
    if (!existsSync(runtimePath)) fail(`Missing bundled runtime ${runtime.file}`)
    const digest = createHash("sha256").update(readFileSync(runtimePath)).digest("hex")
    if (digest !== runtime.sha256) fail(`Checksum mismatch for bundled runtime ${runtime.file}`)
  }
  console.log(`Verified ${urls.size} npm tarballs, ${uiItems} local UI items, and ${runtimeManifest.runtimes.length} Node runtimes.`)
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
    if (!first || !second) fail("Usage: offline.mjs add <vite|next> <project-directory> <component...|--all> [--overwrite]")
    addComponents(first, second, rest)
    break
  case "verify":
    verifyPack()
    break
  default:
    fail("Commands: create, install, add, dev, build, verify")
}
