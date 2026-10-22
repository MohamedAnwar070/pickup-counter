import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Loads the first existing .env files without overriding variables that were
 * already supplied by the shell (Docker, CI, or a test runner).
 *
 * npm workspaces execute scripts with the package directory as cwd, so the
 * repository-level .env is one level above backend/. Both layouts are covered.
 */
export function loadLocalEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
    }
  }
}
