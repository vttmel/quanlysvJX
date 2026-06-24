import fs from 'node:fs';
import path from 'node:path';
import type { UpdateRun, UpdateRunLog, UpdateRunsFile } from './updateRunTypes.js';
import { isActiveUpdateRun } from './updateRunTypes.js';

const maxStoredRuns = 20;

export class UpdateRunRepository {
  constructor(private readonly filePath: string) {}

  read(): UpdateRunsFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, runs: [] };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as UpdateRunsFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.runs)) {
        return { version: 1, runs: [] };
      }

      return parsed;
    } catch {
      return { version: 1, runs: [] };
    }
  }

  write(data: UpdateRunsFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const pruned = this.prune(data.runs);
    fs.writeFileSync(this.filePath, JSON.stringify({ version: 1, runs: pruned }, null, 2) + '\n', 'utf8');
  }

  list(): UpdateRun[] {
    return this.read().runs;
  }

  get(runId: string): UpdateRun | null {
    return this.read().runs.find((run) => run.runId === runId) ?? null;
  }

  getLatest(): UpdateRun | null {
    return [...this.read().runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  getActive(): UpdateRun | null {
    return this.read().runs.find(isActiveUpdateRun) ?? null;
  }

  upsert(run: UpdateRun): UpdateRun {
    const data = this.read();
    const index = data.runs.findIndex((item) => item.runId === run.runId);
    const runs = index >= 0
      ? data.runs.map((item) => (item.runId === run.runId ? run : item))
      : [...data.runs, run];

    this.write({ ...data, runs });
    return run;
  }

  patch(runId: string, patcher: (run: UpdateRun) => UpdateRun): UpdateRun | null {
    const run = this.get(runId);
    if (!run) {
      return null;
    }

    return this.upsert(patcher(run));
  }

  appendLog(runId: string, log: UpdateRunLog): UpdateRun | null {
    return this.patch(runId, (run) => ({
      ...run,
      updatedAt: log.at,
      logs: [...run.logs, log],
    }));
  }

  private prune(runs: UpdateRun[]): UpdateRun[] {
    return [...runs]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .slice(Math.max(0, runs.length - maxStoredRuns));
  }
}
