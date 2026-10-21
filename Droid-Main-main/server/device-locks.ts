export class DeviceLocks {
  private locks = new Set<string>();

  has(device: string): boolean {
    return this.locks.has(device);
  }

  add(device: string): this {
    this.locks.add(device);
    return this;
  }

  delete(device: string): boolean {
    return this.locks.delete(device);
  }

  clear(): void {
    this.locks.clear();
  }

  acquire(device: string): boolean {
    if (this.locks.has(device)) return false;
    this.locks.add(device);
    return true;
  }

  release(device: string): void {
    this.locks.delete(device);
  }
}

export const deviceLocks = new DeviceLocks();
