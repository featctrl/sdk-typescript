/**
 * Attempts to populate `process.env` from `.env.local` then `.env` when
 * `FEATCTRL_SDK_KEY` is not already present in the environment.
 *
 * Uses the Node.js 22+ built-in `process.loadEnvFile()`, which never
 * overwrites variables that are already defined.
 *
 * Any file-not-found or IO error is silently swallowed — the process always
 * continues normally.
 *
 * This function is intentionally NOT re-exported from `index.ts`; it is an
 * internal implementation detail of the auto-start singleton.
 */
export function loadEnvIfNeeded(): void {
  if (process.env['FEATCTRL_SDK_KEY']?.trim()) {
    // Key is already available — skip file loading entirely.
    return;
  }

  // .env.local takes priority (matches Vite / Next.js convention).
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // File not found or unreadable — silently skip.
  }

  // .env is the base fallback; existing variables are never overwritten.
  try {
    process.loadEnvFile('.env');
  } catch {
    // File not found or unreadable — silently skip.
  }
}

