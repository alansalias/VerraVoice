"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tierName = tierName;
function tierName(tier) {
    switch (tier) {
        case 0:
            return "Wilderness";
        case 1:
            return "Expedition";
        case 2:
            return "Encampment";
        case 3:
            return "Village";
        case 4:
            return "Town";
        case 5:
            return "City";
        default:
            return "Unknown";
    }
}
