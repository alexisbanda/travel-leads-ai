import { mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.ts";

// JSX automático (React 19) para los tests de componentes; tsconfig usa
// `jsx: preserve` porque compila Next.
export default mergeConfig(shared, { esbuild: { jsx: "automatic" } });
