import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { RootState, RootStateSchema, defaultState } from "./schema";

class Mutex {
  private current: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.current;
    let release: () => void;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      // @ts-expect-error release is always set
      release();
    }
  }
}

export class StateStore {
  private readonly mutex = new Mutex();
  private state: RootState = defaultState();

  constructor(private readonly dataDir: string) {}

  private filePath() {
    return path.join(this.dataDir, "state.json");
  }

  async load(): Promise<RootState> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath(), "utf8");
      const parsedJson = JSON.parse(raw) as unknown;
      this.state = RootStateSchema.parse(parsedJson);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("ENOENT") || message.includes("no such file")) {
        this.state = defaultState();
        await this.save();
      } else if (message.includes("Unexpected end of JSON input")) {
        this.state = defaultState();
        await this.save();
      } else {
        throw err;
      }
    }
    return this.state;
  }

  get(): RootState {
    return this.state;
  }

  async save(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await mkdir(this.dataDir, { recursive: true });
      const json = JSON.stringify(this.state, null, 2);
      const tmp = `${this.filePath()}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, this.filePath());
    });
  }

  async update(mutator: (state: RootState) => void | Promise<void>) {
    await this.mutex.runExclusive(async () => {
      await mutator(this.state);
      await mkdir(this.dataDir, { recursive: true });
      const json = JSON.stringify(this.state, null, 2);
      const tmp = `${this.filePath()}.tmp`;
      await writeFile(tmp, json, "utf8");
      await rename(tmp, this.filePath());
    });
  }
}

