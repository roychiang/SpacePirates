"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaloService = void 0;
class TaloService {
    static get baseUrl() {
        return process.env.TALO_BASE_URL || "https://api.trytalo.com/v1";
    }
    static get accessKey() {
        return process.env.TALO_ACCESS_KEY || "";
    }
    static requireAccessKey() {
        const k = this.accessKey;
        if (!k) {
            // Log once and return empty to prevent hard crashes if key is missing in dev
            if (!this.blockedReason) {
                console.warn("[TaloService] TALO_ACCESS_KEY is not set. Leaderboard/Stats will be disabled.");
                this.blockedReason = "TALO_ACCESS_KEY is not set";
            }
            return "";
        }
        return k;
    }
    static identifyAliasId(identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (this.blockedReason)
                throw new Error(this.blockedReason);
            const normalized = String(identifier || "").trim();
            if (!normalized)
                throw new Error("Missing player identifier");
            const cached = this.aliasIdCache.get(normalized);
            if (typeof cached === "number")
                return cached;
            const service = String(process.env.TALO_IDENTITY_SERVICE || "username");
            const url = new URL(`${this.baseUrl}/players/identify`);
            url.searchParams.set("service", service);
            url.searchParams.set("identifier", normalized);
            const res = yield fetch(url.toString(), {
                headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
            });
            if (!res.ok) {
                const text = yield res.text().catch(() => "");
                if (res.status === 403 && text.includes("Missing access key scope: read:players")) {
                    this.blockedReason = "Talo access key is missing scope: read:players";
                }
                throw new Error(`Identify failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
            }
            const data = yield res.json().catch(() => ({}));
            const aliasIdRaw = (_f = (_d = (_b = (_a = data === null || data === void 0 ? void 0 : data.alias) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (_c = data === null || data === void 0 ? void 0 : data.playerAlias) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : (_e = data === null || data === void 0 ? void 0 : data.player_alias) === null || _e === void 0 ? void 0 : _e.id) !== null && _f !== void 0 ? _f : data === null || data === void 0 ? void 0 : data.id;
            const aliasId = typeof aliasIdRaw === "number" ? aliasIdRaw : Number(aliasIdRaw);
            if (!Number.isFinite(aliasId) || aliasId <= 0) {
                throw new Error(`Identify returned no alias id: ${JSON.stringify(data)}`);
            }
            this.aliasIdCache.set(normalized, aliasId);
            return aliasId;
        });
    }
    static reportScore(sessionId, score, kills, wins, playerIdentifier) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.blockedReason)
                    return;
                console.log(`[TaloService] Reporting score for ${sessionId} (ID: ${playerIdentifier}): Score=${score}, Kills=${kills}, Wins=${wins}`);
                // 1. Send Game End Event
                yield this.addEvent("game_end", { kills, win: wins > 0 }, playerIdentifier);
                // 2. Update Leaderboards
                // For TotalStats, we need to fetch the current value first, then add to it.
                // Or use Talo Stats if available, but here we use Leaderboards as storage.
                // Update Total Kills
                yield this.incrementLeaderboardScore("TotalKillsCoop", kills, playerIdentifier);
                // Update Total Wins
                if (wins > 0) {
                    yield this.incrementLeaderboardScore("TotalWinsCoop", wins, playerIdentifier);
                }
                // HighScore (Max)
                // For HighScore, we usually want to submit the *current game score*. 
                // Talo leaderboards are typically "High Score" (keep best) by default.
                yield this.submitToLeaderboard("HighScore", score, playerIdentifier);
            }
            catch (e) {
            }
        });
    }
    static incrementLeaderboardScore(alias, incrementBy, playerIdentifier) {
        return __awaiter(this, void 0, void 0, function* () {
            if (incrementBy <= 0)
                return;
            try {
                if (this.blockedReason)
                    return;
                console.log(`[TaloService] Incrementing ${alias} for ${playerIdentifier} by ${incrementBy}`);
                // 1. Fetch current entry to add to it (simulating Sum)
                let currentScore = 0;
                try {
                    const aliasId = yield this.identifyAliasId(playerIdentifier);
                    const url = `${this.baseUrl}/leaderboards/${alias}/entries?page=0&aliasId=${encodeURIComponent(String(aliasId))}`;
                    const res = yield fetch(url, {
                        headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
                    });
                    if (res.ok) {
                        const data = yield res.json();
                        if (data.entries && data.entries.length > 0) {
                            const first = data.entries[0];
                            currentScore = parseFloat(first === null || first === void 0 ? void 0 : first.score) || 0;
                        }
                        else {
                        }
                    }
                    else {
                    }
                }
                catch (fetchErr) {
                }
                const newScore = currentScore + incrementBy;
                yield this.submitToLeaderboard(alias, newScore, playerIdentifier);
            }
            catch (e) {
            }
        });
    }
    static getLeaderboardEntries(alias, identifier) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.blockedReason)
                    return { entries: [], error: this.blockedReason };
                if (!alias || typeof alias !== "string") {
                    return { entries: [], error: "missing alias" };
                }
                const url = new URL(`${this.baseUrl}/leaderboards/${alias}/entries`);
                url.searchParams.set("page", "0");
                if (identifier) {
                    const aliasId = yield this.identifyAliasId(identifier);
                    url.searchParams.set("aliasId", String(aliasId));
                }
                const res = yield fetch(url.toString(), {
                    headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
                });
                if (!res.ok) {
                    const text = yield res.text().catch(() => "");
                    return { entries: [], error: `upstream ${res.status}` };
                }
                const data = yield res.json();
                return data;
            }
            catch (e) {
                return { entries: [], error: (e === null || e === void 0 ? void 0 : e.message) ? String(e.message) : String(e) };
            }
        });
    }
    static getLeaderboards() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield fetch(`${this.baseUrl}/leaderboards`, {
                    headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
                });
                const data = yield res.json();
                return data.leaderboards || [];
            }
            catch (e) {
                return [];
            }
        });
    }
    static submitToLeaderboard(alias, score, playerIdentifier) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.blockedReason)
                    return;
                const aliasId = yield this.identifyAliasId(playerIdentifier);
                const res = yield fetch(`${this.baseUrl}/leaderboards/${alias}/entries`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.requireAccessKey()}`,
                        "x-talo-alias": String(aliasId)
                    },
                    body: JSON.stringify({
                        score: score
                    })
                });
                if (!res.ok) {
                    const text = yield res.text().catch(() => "");
                    throw new Error(`Submit failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
                }
            }
            catch (e) {
            }
        });
    }
    static addEvent(eventName, props, playerIdentifier) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.blockedReason)
                    return;
                const aliasId = yield this.identifyAliasId(playerIdentifier);
                const res = yield fetch(`${this.baseUrl}/events`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.requireAccessKey()}`,
                        "x-talo-alias": String(aliasId)
                    },
                    body: JSON.stringify({
                        key: eventName,
                        props: props
                    })
                });
                if (!res.ok) {
                    const text = yield res.text().catch(() => "");
                    throw new Error(`Event failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
                }
                console.log(`[TaloService] Event ${eventName} sent`);
            }
            catch (e) {
                console.error("[TaloService] addEvent failed", e);
            }
        });
    }
}
exports.TaloService = TaloService;
TaloService.aliasIdCache = new Map();
TaloService.blockedReason = null;
//# sourceMappingURL=TaloService.js.map