export type DeviceCommandAction =
  | "click"
  | "double_click"
  | "right_click"
  | "clear_and_type"
  | "type_text"
  | "press_key"
  | "hotkey"
  | "scroll"
  | "wait";

export interface ParsedDeviceCommand {
  name: string;
  action: DeviceCommandAction;
  x: number;
  y: number;
  text?: string;
  keyPayload?: string;
  delayMs: number;
}

/** Converts a pair of numeric string coordinates into a `{x, y}` point. */
const point = (x: string, y: string) => ({ x: Number(x), y: Number(y) });

/**
 * Parses a newline- or semicolon-separated block of plain-text commands
 * (e.g. "click 10,20", "wait 500") into a list of allowlisted device
 * commands, throwing if a line is malformed, disallowed, or out of range.
 */
export function parseDeviceCommands(source: string): ParsedDeviceCommand[] {
  const commands: ParsedDeviceCommand[] = [];
  const lines = source
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 50) throw new Error("A command batch is limited to 50 reviewed steps.");

  for (const [index, line] of lines.entries()) {
    let match: RegExpMatchArray | null;
    if ((match = line.match(/^click\s+(\d+)\s*[, ]\s*(\d+)$/i))) {
      commands.push({ name: `Click ${match[1]},${match[2]}`, action: "click", ...point(match[1], match[2]), delayMs: 500 });
    } else if ((match = line.match(/^double[-_ ]?click\s+(\d+)\s*[, ]\s*(\d+)$/i))) {
      commands.push({ name: `Double click ${match[1]},${match[2]}`, action: "double_click", ...point(match[1], match[2]), delayMs: 500 });
    } else if ((match = line.match(/^right[-_ ]?click\s+(\d+)\s*[, ]\s*(\d+)$/i))) {
      commands.push({ name: `Right click ${match[1]},${match[2]}`, action: "right_click", ...point(match[1], match[2]), delayMs: 500 });
    } else if ((match = line.match(/^(?:type|clear-and-type)\s+"([\s\S]{1,2000})"(?:\s+at\s+(\d+)\s*[, ]\s*(\d+))?$/i))) {
      const x = match[2] ? Number(match[2]) : 960;
      const y = match[3] ? Number(match[3]) : 540;
      commands.push({ name: `Type text`, action: line.toLowerCase().startsWith("clear") ? "clear_and_type" : "type_text", x, y, text: match[1], delayMs: 500 });
    } else if ((match = line.match(/^key\s+([a-z0-9_-]+)$/i))) {
      commands.push({ name: `Press ${match[1]}`, action: "press_key", x: 960, y: 540, keyPayload: match[1], delayMs: 250 });
    } else if ((match = line.match(/^hotkey\s+([a-z0-9+_-]+)$/i))) {
      commands.push({ name: `Hotkey ${match[1]}`, action: "hotkey", x: 960, y: 540, keyPayload: match[1], delayMs: 250 });
    } else if ((match = line.match(/^wait\s+(\d{1,6})$/i))) {
      const delayMs = Number(match[1]);
      if (delayMs > 120_000) throw new Error(`Line ${index + 1}: wait cannot exceed 120000ms.`);
      commands.push({ name: `Wait ${delayMs}ms`, action: "wait", x: 960, y: 540, delayMs });
    } else if ((match = line.match(/^scroll\s+(up|down)(?:\s+at\s+(\d+)\s*[, ]\s*(\d+))?$/i))) {
      commands.push({ name: `Scroll ${match[1].toLowerCase()}`, action: "scroll", x: Number(match[2] ?? 960), y: Number(match[3] ?? 540), text: match[1].toLowerCase(), delayMs: 500 });
    } else {
      throw new Error(`Line ${index + 1} is not an allowlisted device command: ${line}`);
    }
  }
  return commands;
}
