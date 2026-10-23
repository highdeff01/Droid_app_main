import type { DesktopAutomationBridge } from "./automation-adapters";
import { encodePng } from "./png-encode";

/** Pointer button of a native click. */
export type NativeButton = "left" | "right";

/**
 * Native desktop control: the DesktopAutomationBridge contract (pointer / typeText / key)
 * plus the mouse moves, drags, chords, scrolls and full-screen capture the desktop routes need.
 */
export interface NativeDesktopControl extends Required<DesktopAutomationBridge> {
  move(x: number, y: number): Promise<void>;
  click(x: number, y: number, button: NativeButton, double: boolean): Promise<void>;
  drag(path: Array<{ x: number; y: number }>): Promise<void>;
  hotkey(keys: string[]): Promise<void>;
  scroll(x: number, y: number, direction: "up" | "down"): Promise<void>;
  /** Full main-display capture as a `data:image/png;base64,...` URL. */
  captureFrame(): Promise<string>;
}

interface NutPoint {
  x: number;
  y: number;
}

interface NutImage {
  width: number;
  height: number;
  data: Buffer;
  channels: number;
  byteWidth: number;
  colorMode: unknown;
}

/** The slice of the nut-js module this bridge uses (declared here so the module stays optional). */
export interface NutModule {
  mouse: {
    config: { autoDelayMs: number; mouseSpeed: number };
    setPosition(target: NutPoint): Promise<unknown>;
    click(button: number): Promise<unknown>;
    doubleClick(button: number): Promise<unknown>;
    drag(path: NutPoint[]): Promise<unknown>;
    scrollUp(amount: number): Promise<unknown>;
    scrollDown(amount: number): Promise<unknown>;
  };
  keyboard: {
    config: { autoDelayMs: number };
    type(...input: string[]): Promise<unknown>;
    pressKey(...keys: number[]): Promise<unknown>;
    releaseKey(...keys: number[]): Promise<unknown>;
  };
  screen: { width(): Promise<number>; height(): Promise<number>; grab(): Promise<NutImage> };
  Button: { LEFT: number; RIGHT: number };
  Key: Record<string, number>;
  ColorMode?: { BGR: unknown };
}

export type NutImporter = () => Promise<NutModule>;

export const NATIVE_MODULE_NAME = "@nut-tree-fork/nut-js";

const importNut: NutImporter = async () => {
  const loaded = (await import(NATIVE_MODULE_NAME)) as NutModule & { default?: NutModule };
  return loaded.mouse ? loaded : (loaded.default as NutModule);
};

/** pyautogui-style key names that differ from nut-js `Key` member names. */
const KEY_ALIASES: Record<string, string> = {
  enter: "Enter",
  return: "Return",
  esc: "Escape",
  escape: "Escape",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  tab: "Tab",
  space: "Space",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
  ctrl: "LeftControl",
  control: "LeftControl",
  shift: "LeftShift",
  alt: "LeftAlt",
  option: "LeftAlt",
  cmd: "LeftCmd",
  command: "LeftCmd",
  win: "LeftWin",
  super: "LeftSuper",
  capslock: "CapsLock",
};

/** Resolves a key name ("enter", "a", "f5", "7") to its nut-js key code; unknown keys throw. */
export function nutKeyCode(nut: Pick<NutModule, "Key">, name: string): number {
  const normalized = name.trim().toLowerCase();
  const member =
    KEY_ALIASES[normalized] ??
    (/^[a-z]$/.test(normalized) || /^f\d{1,2}$/.test(normalized)
      ? normalized.toUpperCase()
      : /^\d$/.test(normalized)
        ? `Num${normalized}`
        : undefined);
  const code = member === undefined ? undefined : nut.Key[member];
  if (typeof code !== "number") throw new Error(`Key "${name}" is not supported by native desktop control`);
  return code;
}

async function pressChord(nut: NutModule, keys: string[]): Promise<void> {
  const codes = keys.map((key) => nutKeyCode(nut, key));
  await nut.keyboard.pressKey(...codes);
  await nut.keyboard.releaseKey(...codes.reverse());
}

async function captureFrame(nut: NutModule): Promise<string> {
  const image = await nut.screen.grab();
  const png = encodePng({
    width: image.width,
    height: image.height,
    data: image.data,
    channels: image.channels,
    byteWidth: image.byteWidth,
    bgr: nut.ColorMode ? image.colorMode === nut.ColorMode.BGR : true,
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Wraps a loaded nut-js module as the native desktop control. */
export function createNativeDesktopControl(nut: NutModule): NativeDesktopControl {
  const button = (which: NativeButton) => (which === "right" ? nut.Button.RIGHT : nut.Button.LEFT);
  const at = (x: number, y: number) => nut.mouse.setPosition({ x: Math.round(x), y: Math.round(y) });
  const click = async (x: number, y: number, which: NativeButton, double: boolean) => {
    await at(x, y);
    await (double ? nut.mouse.doubleClick(button(which)) : nut.mouse.click(button(which)));
  };
  return {
    pointer: (action) => click(action.x, action.y, action.button ?? "left", false),
    typeText: async (text) => void (await nut.keyboard.type(text)),
    key: (key) => pressChord(nut, [key]),
    move: async (x, y) => void (await at(x, y)),
    click,
    drag: async (path) => {
      await at(path[0].x, path[0].y);
      await nut.mouse.drag(path.slice(1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
    },
    hotkey: (keys) => pressChord(nut, keys),
    scroll: async (x, y, direction) => {
      await at(x, y);
      await (direction === "up" ? nut.mouse.scrollUp(3) : nut.mouse.scrollDown(3));
    },
    captureFrame: () => captureFrame(nut),
  };
}

/**
 * Loads nut-js and proves it can reach the display (reads the screen size).
 * Rejects with the real reason when the module is missing or cannot run here.
 */
export async function loadNativeDesktopControl(importer: NutImporter = importNut): Promise<NativeDesktopControl> {
  const nut = await importer();
  const [width, height] = [await nut.screen.width(), await nut.screen.height()];
  if (!(width > 0 && height > 0)) throw new Error(`native screen reported ${width}x${height}`);
  nut.mouse.config.autoDelayMs = 0;
  nut.mouse.config.mouseSpeed = 4000;
  nut.keyboard.config.autoDelayMs = 5;
  return createNativeDesktopControl(nut);
}
