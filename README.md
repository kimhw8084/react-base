# Fully offline React app kit

This repository is the source of truth for an offline Vite + React starter, a Next.js starter, and the complete first-party shadcn `base-nova` registry snapshot included here. It is designed for machines that cannot reach the public internet after the package has been downloaded.

## Start an app offline

Download the tracked `react-base-offline-pack.zip` file from this repository and extract it. A Git clone needs Git LFS enabled; run `git lfs pull` if the ZIP is a short text pointer.

macOS or Linux:

```sh
sh offline/run.sh create vite ./work/my-vite-app
sh offline/run.sh create next ./work/my-next-app
sh offline/run.sh list
sh offline/run.sh add vite ./work/my-vite-app button chart sidebar
sh offline/run.sh add next ./work/my-next-app dashboard-01 font-inter
sh offline/run.sh dev ./work/my-vite-app
sh offline/run.sh build ./work/my-vite-app
```

Windows PowerShell:

```powershell
.\offline\run.ps1 create vite .\work\my-vite-app
.\offline\run.ps1 create next .\work\my-next-app
.\offline\run.ps1 list
.\offline\run.ps1 add next .\work\my-next-app dashboard-01 font-inter
.\offline\run.ps1 build .\work\my-next-app
```

`add` accepts any item name shown by `list`: UI components, examples, blocks, hooks, libraries, styles, and fonts. It installs local registry dependencies recursively, copies vendored source, and uses locally bundled images and font packages. `--all` adds every code-bearing official UI component. The official `form` entry is included in the registry metadata and has no source files in the upstream registry.

## What is inside

- `react-base/` is the Vite + React + TypeScript starter. Its `src/components/ui/` folder includes all 64 source-bearing official `base-nova` UI components.
- `next-app/` is the Next.js starter, with the same 64 source-bearing official UI components in `components/ui/`.
- `offline/registry/base-nova/` contains all 221 official registry entries: 65 UI entries, 68 examples, 30 blocks, 52 fonts, two styles, two hooks, one component, and one library. `upstream/` keeps the original downloaded manifests and `source.json` records their SHA-256 checksums. The active manifests have local image references for offline use.
- Both starters lock the packages required by every included registry item, including all 26 font packages. The shared npm cache contains the locked package tarballs.
- `offline/runtimes/` bundles Node.js 24.22.2 for macOS ARM64/x64, Windows ARM64/x64, Linux ARM64/x64, and Linux x64 musl.

`sh offline/run.sh verify` (or `offline/run.ps1 verify`) checks registry counts and source checksums, package cache coverage, starter components, local image assets, and Node runtime checksums. `install`, `dev`, and `build` force npm offline mode and disable Next.js telemetry.

## Offline boundary

Creating, installing, adding included resources, building, and running either starter needs no public network access. The pack cannot include future third-party packages or an application's private backend; add those artifacts and services to the intranet environment before using an app that depends on them.
