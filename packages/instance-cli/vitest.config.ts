import { mergeConfig } from "vitest/config";
import base from "../../vitest.shared.ts";

// Los tests de validate.ts lanzan `tsx src/validate.ts` como subproceso
// (spawnSync) para probar el CLI real; NODE_OPTIONS propaga la condición
// "source" a ese subproceso para que resuelva @tla/shared en src/ sin dist/.
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--conditions=source"]
  .filter(Boolean)
  .join(" ");

export default mergeConfig(base, {});
