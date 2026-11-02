# Next.js starter

This starter is part of the offline kit at the repository root. From the kit root, create a new app and add components from the vendored registry:

```sh
sh offline/run.sh create next ./work/my-app
sh offline/run.sh add next ./work/my-app button chart sidebar
sh offline/run.sh build ./work/my-app
```

On Windows, use `offline/run.ps1` in PowerShell. The starter includes local Geist fonts and its dependency set. For component imports, use aliases such as `@/components/ui/button`.
