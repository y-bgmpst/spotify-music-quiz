export type PlaybackTarget = { uri: string; position_ms: number };
export interface PlaybackPort {
  start(target: PlaybackTarget): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}
export class FakePlayback implements PlaybackPort {
  last: PlaybackTarget | undefined;
  async start(target: PlaybackTarget) {
    this.last = target;
  }
  async pause() {}
  async stop() {
    this.last = undefined;
  }
}
