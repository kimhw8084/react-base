# Offline React app kit

This repository is a transferable offline kit for the included Vite and Next.js starters. It bundles the exact npm package artifacts from the lockfiles, a local shadcn `base-nova` component snapshot, and Node 24.22.2 runtimes for the supported platforms.

## Use the kit

Download and extract `react-base-offline-pack.zip`, then run these commands from its root.

When using a Git clone, run `git lfs pull` first if the ZIP is a small text pointer instead of the full archive.

macOS or Linux:

```sh
sh offline/run.sh create vite ./work/my-vite-app
sh offline/run.sh create next ./work/my-next-app
sh offline/run.sh add vite ./work/my-vite-app button chart sidebar
sh offline/run.sh dev ./work/my-vite-app
sh offline/run.sh build ./work/my-vite-app
```

Windows PowerShell:

```powershell
.\offline\run.ps1 create vite .\work\my-vite-app
.\offline\run.ps1 create next .\work\my-next-app
.\offline\run.ps1 add next .\work\my-next-app button chart sidebar
.\offline\run.ps1 dev .\work\my-next-app
.\offline\run.ps1 build .\work\my-next-app
```

`create` copies the starter and installs from the bundled cache. `add` reads the local component snapshot and includes each component's local component dependencies. Use `--all` in place of component names to add the full snapshot. `install`, `dev`, and `build` force npm offline mode and disable Next.js telemetry. Run `sh offline/run.sh verify` or `.\offline\run.ps1 verify` to check the cache, catalogs, and runtime checksums.

## Included snapshot

- Vite + React + TypeScript starter and Next.js starter, each with a lockfile.
- 64 shadcn UI items in `base-nova` style, snapshotted separately for Vite and Next.js.
- All package tarballs and metadata referenced by the three checked-in lockfiles, including optional native packages for Windows, macOS, Linux, and Linux musl.
- Local Geist and Geist Mono fonts. The Next.js starter does not fetch Google Fonts at build time.
- Portable Node.js 24.22.2 runtimes for macOS ARM64/x64, Windows ARM64/x64, Linux ARM64/x64, and Linux x64 musl.

The offline guarantee covers these two starters, their pinned dependency graphs, the included shadcn component snapshot, and the bundled runtime matrix. A future app that adds a package or a service not in this kit needs that artifact added to a new kit snapshot. No finite bundle can contain unknown future packages or app-specific services.
