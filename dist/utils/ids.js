"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newId = newId;
const node_crypto_1 = require("node:crypto");
function newId(prefix) {
    return `${prefix}_${(0, node_crypto_1.randomUUID)()}`;
}
