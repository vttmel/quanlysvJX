export type GameVersionEnvValues = {
  gameVersionPath: string;
  gameVersionSubPath: string;
};

const PATH_KEY = 'GAME_VERSION_PATH';
const SUB_PATH_KEY = 'GAME_VERSION_SUB_PATH';

function parseLine(line: string): { key: string; value: string } | null {
  const index = line.indexOf('=');
  if (index <= 0) {
    return null;
  }
  return { key: line.slice(0, index), value: line.slice(index + 1) };
}

export function readGameVersionEnv(content: string): GameVersionEnvValues {
  const values = content.split('\n').reduce<GameVersionEnvValues>(
    (current, line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return current;
      }
      if (parsed.key === PATH_KEY) {
        return { ...current, gameVersionPath: parsed.value };
      }
      if (parsed.key === SUB_PATH_KEY) {
        return { ...current, gameVersionSubPath: parsed.value };
      }
      return current;
    },
    { gameVersionPath: '', gameVersionSubPath: '' }
  );

  return values;
}

export function patchGameVersionEnv(content: string, values: GameVersionEnvValues): string {
  const normalizedPath = values.gameVersionPath.trim();
  const normalizedSubPath = values.gameVersionSubPath.trim();
  const sourceLines = content.length > 0 ? content.split('\n').filter((line, index, lines) => index < lines.length - 1 || line.length > 0) : [];

  let pathFound = false;
  let subPathFound = false;

  let nextLines = sourceLines.map((line) => {
    const parsed = parseLine(line);
    if (!parsed) return line;

    if (parsed.key === PATH_KEY) {
      pathFound = true;
      return `${PATH_KEY}=${normalizedPath}`;
    }

    if (parsed.key === SUB_PATH_KEY) {
      subPathFound = true;
      if (normalizedSubPath) {
        return `${SUB_PATH_KEY}=${normalizedSubPath}`;
      } else {
        return null; // mark for removal
      }
    }

    return line;
  }).filter((line): line is string => line !== null);

  if (!pathFound) {
    nextLines.push(`${PATH_KEY}=${normalizedPath}`);
  }
  if (!subPathFound && normalizedSubPath) {
    nextLines.push(`${SUB_PATH_KEY}=${normalizedSubPath}`);
  }

  return `${nextLines.join('\n')}\n`;
}
