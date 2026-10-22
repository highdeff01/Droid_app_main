import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describePythonResolution,
  probePython,
  pythonCandidates,
  resetPythonResolution,
  resolvePython,
  type PythonCandidate,
} from "./python-resolver";

const working = (...ok: string[]) =>
  vi.fn((c: PythonCandidate) => (ok.includes(c.command) ? "3.11.4" : null));

describe("python resolution order", () => {
  afterEach(() => resetPythonResolution());

  it("tries PYTHON_CMD first, then python3, python, and py -3", () => {
    expect(pythonCandidates({ PYTHON_CMD: "/opt/py/bin/python" })).toEqual([
      { command: "/opt/py/bin/python", prefixArgs: [] },
      { command: "python3", prefixArgs: [] },
      { command: "python", prefixArgs: [] },
      { command: "py", prefixArgs: ["-3"] },
    ]);
    expect(pythonCandidates({}).map((c) => c.command)).toEqual(["python3", "python", "py"]);
  });

  it("uses the override when it runs", () => {
    const probe = working("/custom/python", "python3");
    const r = probePython(probe, { PYTHON_CMD: "/custom/python" });
    expect(r).toMatchObject({ found: true, command: "/custom/python", version: "3.11.4" });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("keeps going past a broken override", () => {
    const r = probePython(working("python3"), { PYTHON_CMD: "/nonexistent" });
    expect(r).toMatchObject({ found: true, command: "python3" });
    expect(r.tried).toEqual(["/nonexistent", "python3"]);
  });

  it("falls back to python when python3 is missing", () => {
    expect(probePython(working("python"), {})).toMatchObject({ found: true, command: "python", prefixArgs: [] });
  });

  it("falls back to the py -3 launcher when it is the only interpreter", () => {
    expect(probePython(working("py"), {})).toMatchObject({ found: true, command: "py", prefixArgs: ["-3"] });
  });

  it("reports not found with every candidate tried", () => {
    const r = probePython(working(), {});
    expect(r).toEqual({ found: false, command: null, prefixArgs: [], version: null, tried: ["python3", "python", "py -3"] });
    expect(describePythonResolution(r)).toBe("not found");
  });

  it("probes once and caches the resolution until reset", () => {
    const probe = working("python");
    const first = resolvePython(probe);
    const second = resolvePython(probe);
    expect(second).toBe(first);
    expect(probe.mock.calls.length).toBeGreaterThan(0);
    const callsAfterFirst = probe.mock.calls.length;
    resolvePython(probe);
    expect(probe.mock.calls.length).toBe(callsAfterFirst);
    resetPythonResolution();
    resolvePython(probe);
    expect(probe.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("describes a found interpreter with its version", () => {
    expect(describePythonResolution(probePython(working("py"), {}))).toBe("py -3 (3.11.4)");
  });
});
