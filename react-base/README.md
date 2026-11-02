# Vite + React + TypeScript starter

This starter is part of the offline kit at the repository root. From the kit root, create a new app and add components from the vendored registry:

```sh
sh offline/run.sh create vite ./work/my-app
sh offline/run.sh add vite ./work/my-app button chart sidebar
sh offline/run.sh build ./work/my-app
```

The starter already includes its dependency set and the 64-component `base-nova` snapshot. For component imports, use the local aliases, such as `@/components/ui/button`.
