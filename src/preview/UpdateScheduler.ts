import * as vscode from "vscode";

export class UpdateScheduler implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private readonly delay_ms: number;

  public constructor(delay_ms: number) {
    this.delay_ms = delay_ms;
  }

  public schedule(task: () => void): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      task();
    }, this.delay_ms);
  }

  public dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
