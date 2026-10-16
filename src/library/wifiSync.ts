// A stop snapshot must wait behind a running scan rather than being discarded.
export class WifiSync {
  private sequence = 0;
  private pending: Promise<void> = Promise.resolve();
  run(sequence: number, scan: () => Promise<void>) {
    this.pending = this.pending.catch(() => undefined).then(async () => {
      if (sequence <= this.sequence) return;
      await scan();
      this.sequence = sequence;
    });
    return this.pending;
  }
  async reset() {
    await this.pending.catch(() => undefined);
    this.sequence = 0;
  }
}
