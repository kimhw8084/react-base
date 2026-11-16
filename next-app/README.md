# Next.js starter

This is the ready-to-build Next.js app inside the fully offline kit. It includes all 64 source-bearing official shadcn `base-nova` UI components in `components/ui/`, local Geist fonts, and the full locked registry dependency set.

From the kit root, create an app and add any locally vendored registry resource:

```sh
sh offline/run.sh create next ./work/my-app
sh offline/run.sh list
sh offline/run.sh add next ./work/my-app button chart sidebar
sh offline/run.sh add next ./work/my-app login-01 font-inter
sh offline/run.sh build ./work/my-app
```

On Windows, use `offline/run.ps1` in PowerShell. All installation and build commands use the bundled npm cache in offline mode. The complete 221-entry registry snapshot is in `offline/registry/base-nova/` at the kit root.
