# Building sonex-core

The Rust addon uses napi-rs v2. Keep `@napi-rs/cli` pinned to 2.18.4 and
install `sonex-core` dependencies before running the backend build.

```powershell
cd sonex-core
npm ci
cd ../backend
npm ci
npm run build
```

The backend invokes the local `sonex-core` package script and does not depend
on a global `napi` executable or an `npx` package download.
