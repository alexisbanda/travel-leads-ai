/** Tipos de `sync-media.mjs` para los tests (TS no comprueba `.mjs`: `allowJs: false`). */
export function resolveInstanceId(
  env?: Record<string, string | undefined>,
  repoRoot?: string,
): string | undefined;

export function syncMedia(options: {
  instanceId: string | undefined;
  repoRoot?: string;
  targetDir: string;
}): void;
