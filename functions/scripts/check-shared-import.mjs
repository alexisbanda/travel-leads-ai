#!/usr/bin/env node
// Verifica que Node (sin loaders de TS) puede importar @tla/shared tal
// como queda resuelto para `functions` una vez compilado (dist/index.js,
// ver packages/shared/package.json#exports). Falla si el paquete no expone
// readResolvedInstance como función.
const mod = await import("@tla/shared");
if (typeof mod.readResolvedInstance !== "function") {
  console.error("check-shared-import: @tla/shared no expone readResolvedInstance");
  process.exit(1);
}
console.log("check-shared-import: ok");
