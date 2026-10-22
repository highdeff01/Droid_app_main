import { spawn, spawnSync, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "child_process";

export { PYTHON_SETUP_FIX } from "../shared/device-execution";

export interface PythonCandidate {
  command: string;
  /** Arguments that always precede the script (e.g. `-3` for the Windows `py` launcher). */
  prefixArgs: string[];
}

export interface PythonResolution {
  found: boolean;
  command: string | null;
  prefixArgs: string[];
  version: string | null;
  tried: string[];
}

/** Probe result: the interpreter's version string, or null when it cannot be run. */
export type PythonProbe = (candidate: PythonCandidate) => string | null;

/** Order: PYTHON_CMD override, then python3, python, and the Windows `py -3` launcher. */
export function pythonCandidates(env: NodeJS.ProcessEnv = process.env): PythonCandidate[] {
  const candidates: PythonCandidate[] = [];
  const override = env.PYTHON_CMD?.trim();
  if (override) candidates.push({ command: override, prefixArgs: [] });
  candidates.push(
    { command: "python3", prefixArgs: [] },
    { command: "python", prefixArgs: [] },
    { command: "py", prefixArgs: ["-3"] },
  );
  return candidates;
}

/** Runs `<candidate> --version` synchronously; returns e.g. "3.11.4" or null. */
export const probePythonCandidate: PythonProbe = (candidate) => {
  try {
    const result = spawnSync(candidate.command, [...candidate.prefixArgs, "--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) return null;
    const match = `${result.stdout ?? ""}${result.stderr ?? ""}`.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

/** Tries every candidate in order and returns the first that runs. Never cached. */
export function probePython(
  probe: PythonProbe = probePythonCandidate,
  env: NodeJS.ProcessEnv = process.env,
): PythonResolution {
  const tried: string[] = [];
  for (const candidate of pythonCandidates(env)) {
    tried.push([candidate.command, ...candidate.prefixArgs].join(" "));
    const version = probe(candidate);
    if (version) {
      return { found: true, command: candidate.command, prefixArgs: candidate.prefixArgs, version, tried };
    }
  }
  return { found: false, command: null, prefixArgs: [], version: null, tried };
}

let cachedResolution: PythonResolution | null = null;

/** Cached resolution: probed once per process (warmed at server startup). */
export function resolvePython(probe?: PythonProbe): PythonResolution {
  if (!cachedResolution) cachedResolution = probePython(probe);
  return cachedResolution;
}

/** Clears the cache so the next resolvePython() re-probes (tests, explicit re-check). */
export function resetPythonResolution(): void {
  cachedResolution = null;
}

/**
 * Spawns the resolved interpreter with `args`. When nothing resolved it spawns the
 * first candidate so the caller's existing `error` (ENOENT) handler reports the
 * honest "unavailable" outcome.
 */
export function spawnPython(
  args: string[],
  options: SpawnOptionsWithoutStdio = {},
): ChildProcessWithoutNullStreams {
  const resolution = resolvePython();
  const fallback = pythonCandidates()[0];
  const command = resolution.command ?? fallback.command;
  const prefixArgs = resolution.found ? resolution.prefixArgs : fallback.prefixArgs;
  return spawn(command, [...prefixArgs, ...args], options);
}

/** Display label for the resolved interpreter, e.g. "python3 (3.11.4)" or "not found". */
export function describePythonResolution(resolution: PythonResolution): string {
  if (!resolution.found || !resolution.command) return "not found";
  return `${[resolution.command, ...resolution.prefixArgs].join(" ")} (${resolution.version})`;
}
