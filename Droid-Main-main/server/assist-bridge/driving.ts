import type { Driver, DrivingPayload } from "../../shared/assist-bridge";

/** The boss: droid-new drives unless it hands the wheel over. */
export const BOSS: Driver = "droid-new";

/** Display name of each driver. */
export const DRIVER_NAMES: Readonly<Record<Driver, string>> = { "droid-new": "droid-new", "droid-main": "droid-main" };

/** The one-line flag for the UI: who owns execution. */
export const drivingFlag = (d: DrivingPayload): string => `Driving: ${DRIVER_NAMES[d.driver]}`;

/**
 * Whether an inbound driving claim from droid-new agrees with what this app holds. droid-new is the
 * arbiter, so this app follows it — a claim only conflicts when it moves the wheel while this app
 * believes it is driving (which happens after a local takeover, before droid-new acknowledges it).
 */
export const agreesOnDriving = (local: DrivingPayload | null, claim: DrivingPayload): boolean => local === null || local.driver === claim.driver;

/** The log line for an inbound claim. */
export const claimLine = (claim: DrivingPayload): string =>
  `droid-new is driving: ${DRIVER_NAMES[claim.driver]} — ${claim.reason}`;

/** The log line when a claim moves the wheel away from this app. */
export const yieldedLine = (local: DrivingPayload, claim: DrivingPayload): string =>
  `droid-new took the wheel back (${DRIVER_NAMES[local.driver]} → ${DRIVER_NAMES[claim.driver]}) — ${claim.reason}`;

/** Tracks the driving flag droid-new broadcasts, and lets a local takeover claim the wheel. */
export class DrivingState {
  private current: DrivingPayload | null = null;

  /** The wheel right now, or null until droid-new reports. */
  get(): DrivingPayload | null {
    return this.current;
  }

  /** Applies droid-new's claim (it is the arbiter, so its word is the flag). */
  claim(claim: DrivingPayload): DrivingPayload {
    this.current = { driver: claim.driver, since: claim.since, reason: claim.reason };
    return this.current;
  }

  /** A local takeover: main takes the wheel until droid-new says otherwise. */
  takeWheel(reason: string, now = Date.now()): DrivingPayload {
    this.current = { driver: "droid-main", since: now, reason };
    return this.current;
  }

  /** The default when droid-new has not reported yet: droid-new drives, because it is the boss. */
  orDefault(now = Date.now()): DrivingPayload {
    return this.current ?? { driver: BOSS, since: now, reason: "droid-new is the boss and holds admin status" };
  }
}
