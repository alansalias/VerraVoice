"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateStore = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const schema_1 = require("./schema");
class Mutex {
    current = Promise.resolve();
    async runExclusive(fn) {
        const previous = this.current;
        let release;
        this.current = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await fn();
        }
        finally {
            // @ts-expect-error release is always set
            release();
        }
    }
}
class StateStore {
    dataDir;
    mutex = new Mutex();
    state = (0, schema_1.defaultState)();
    constructor(dataDir) {
        this.dataDir = dataDir;
    }
    filePath() {
        return node_path_1.default.join(this.dataDir, "state.json");
    }
    async load() {
        await (0, promises_1.mkdir)(this.dataDir, { recursive: true });
        try {
            const raw = await (0, promises_1.readFile)(this.filePath(), "utf8");
            const parsedJson = JSON.parse(raw);
            this.state = schema_1.RootStateSchema.parse(parsedJson);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("ENOENT") || message.includes("no such file")) {
                this.state = (0, schema_1.defaultState)();
                await this.save();
            }
            else if (message.includes("Unexpected end of JSON input")) {
                this.state = (0, schema_1.defaultState)();
                await this.save();
            }
            else {
                throw err;
            }
        }
        return this.state;
    }
    get() {
        return this.state;
    }
    async save() {
        await this.mutex.runExclusive(async () => {
            await (0, promises_1.mkdir)(this.dataDir, { recursive: true });
            const json = JSON.stringify(this.state, null, 2);
            const tmp = `${this.filePath()}.tmp`;
            await (0, promises_1.writeFile)(tmp, json, "utf8");
            await (0, promises_1.rename)(tmp, this.filePath());
        });
    }
    async update(mutator) {
        await this.mutex.runExclusive(async () => {
            await mutator(this.state);
            await (0, promises_1.mkdir)(this.dataDir, { recursive: true });
            const json = JSON.stringify(this.state, null, 2);
            const tmp = `${this.filePath()}.tmp`;
            await (0, promises_1.writeFile)(tmp, json, "utf8");
            await (0, promises_1.rename)(tmp, this.filePath());
        });
    }
}
exports.StateStore = StateStore;
