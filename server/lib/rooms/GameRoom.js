"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
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
exports.GameRoom = exports.GameState = exports.Player = void 0;
const colyseus_1 = require("colyseus");
const schema_1 = require("@colyseus/schema");
const TaloService_1 = require("../services/TaloService");
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.sessionId = "";
        this.userId = "";
        this.name = "";
        this.headIconUrl = "";
        this.ready = false;
        this.displayName = "";
        this.joinOrder = 0;
    }
}
exports.Player = Player;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "sessionId", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "userId", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "headIconUrl", void 0);
__decorate([
    (0, schema_1.type)("boolean"),
    __metadata("design:type", Boolean)
], Player.prototype, "ready", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], Player.prototype, "displayName", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], Player.prototype, "joinOrder", void 0);
class GameState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
        this.score = 0;
        this.wave = 1;
        this.lives = 3;
        this.properties = new schema_1.MapSchema();
        this.totalEnemies = 0;
        this.enemiesKilled = 0;
    }
}
exports.GameState = GameState;
__decorate([
    (0, schema_1.type)({ map: Player }),
    __metadata("design:type", Object)
], GameState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "score", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "wave", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "lives", void 0);
__decorate([
    (0, schema_1.type)({ map: "string" }),
    __metadata("design:type", Object)
], GameState.prototype, "properties", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "totalEnemies", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], GameState.prototype, "enemiesKilled", void 0);
class GameRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 32;
        this.customMaxPlayers = 4;
        this.playerKills = new Map();
        this.killedEnemies = new Set();
        this.assignedJoinOrders = new Set();
        this.lastPositions = new Map();
    }
    onCreate(options) {
        this.setState(new GameState());
        // Store maxPlayers but keep maxClients high to prevent auto-lock hiding room
        if (options.maxPlayers) {
            this.customMaxPlayers = options.maxPlayers;
        }
        else if (options.maxClients) {
            this.customMaxPlayers = options.maxClients;
        }
        // Set room metadata for listing (includes game_mode for PVP/Co-op filtering)
        const metadata = {
            name: options.name || "Game Room",
            max_players: this.customMaxPlayers,
            game_mode: options.game_mode || (options.properties && options.properties.game_mode) || "coop"
        };
        if (options.properties) {
            Object.assign(metadata, options.properties);
            for (const key in options.properties) {
                this.state.properties.set(key, String(options.properties[key]));
            }
            // Parse total enemies from ai_config if available
            if (options.properties.ai_config) {
                try {
                    const aiConfig = JSON.parse(options.properties.ai_config);
                    // Count enemies (assuming type 1 is enemy)
                    const enemies = aiConfig.filter((c) => c.type === 1).length;
                    this.state.totalEnemies = enemies;
                }
                catch (e) {
                }
            }
        }
        // Fallback: If totalEnemies is still 0, check options/properties for explicit count
        if (this.state.totalEnemies === 0) {
            const fallback = Number(options.aiEnemies || (options.properties && options.properties.aiEnemies) || 10);
            if (fallback > 0) {
                this.state.totalEnemies = fallback;
            }
        }
        // Ensure game_mode is explicitly set in metadata if found in options
        if (options.game_mode) {
            metadata.game_mode = options.game_mode;
            this.state.properties.set("game_mode", options.game_mode);
        }
        this.setMetadata(metadata);
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        const finite = (v) => typeof v === "number" && Number.isFinite(v);
        const getJoinOrder = (client) => {
            const p = this.state.players.get(client.sessionId);
            return typeof (p === null || p === void 0 ? void 0 : p.joinOrder) === "number" ? p.joinOrder : -1;
        };
        const getHostJoinOrder = () => {
            let min = Number.POSITIVE_INFINITY;
            this.state.players.forEach((p) => {
                if (typeof p.joinOrder === "number" && p.joinOrder < min)
                    min = p.joinOrder;
            });
            return Number.isFinite(min) ? min : -1;
        };
        // Handle Relay messages
        this.onMessage("input", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0)
                return;
            const raw = message || {};
            const dx = finite(raw.dx) ? clamp(raw.dx, -0.1, 0.1) : 0;
            const dy = finite(raw.dy) ? clamp(raw.dy, -0.1, 0.1) : 0;
            const payload = {
                index: joinOrder,
                dx,
                dy,
                shooting: !!raw.shooting,
                burst: !!raw.burst,
                breaking: !!raw.breaking,
                launchMissile: !!raw.launchMissile,
                immelmann: !!raw.immelmann,
            };
            if (finite(raw.missileTarget) && Number.isInteger(raw.missileTarget) && raw.missileTarget >= 0 && raw.missileTarget < 256) {
                payload.missileTarget = raw.missileTarget;
            }
            if (raw.pos && finite(raw.pos.x) && finite(raw.pos.y) && finite(raw.pos.z)) {
                const x = raw.pos.x;
                const y = raw.pos.y;
                const z = raw.pos.z;
                const prev = this.lastPositions.get(client.sessionId);
                if (prev) {
                    const dxp = x - prev.x;
                    const dyp = y - prev.y;
                    const dzp = z - prev.z;
                    const distSq = dxp * dxp + dyp * dyp + dzp * dzp;
                    if (distSq < 4000000) {
                        payload.pos = { x, y, z };
                        this.lastPositions.set(client.sessionId, { x, y, z });
                    }
                }
                else {
                    payload.pos = { x, y, z };
                    this.lastPositions.set(client.sessionId, { x, y, z });
                }
            }
            if (raw.rot &&
                finite(raw.rot.x) &&
                finite(raw.rot.y) &&
                finite(raw.rot.z) &&
                finite(raw.rot.w)) {
                payload.rot = { x: raw.rot.x, y: raw.rot.y, z: raw.rot.z, w: raw.rot.w };
            }
            this.broadcast("input", payload, { except: client });
        });
        this.onMessage("shot", (client, message) => {
            this.broadcast("shot", message, { except: client });
        });
        this.onMessage("spawnEnemy", (client, message) => {
            this.broadcast("spawnEnemy", message);
        });
        this.onMessage("playerDied", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0)
                return;
            const raw = message || {};
            const hostJoinOrder = getHostJoinOrder();
            const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
            const index = isHost && finite(raw.index) ? raw.index : joinOrder;
            if (!finite(index) || index < 0 || index >= this.customMaxPlayers)
                return;
            this.broadcast("playerDied", { index });
        });
        // Anti-cheat: Track kills server-side
        this.onMessage("enemyKilled", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0)
                return;
            const raw = message || {};
            // Allow any player to report kills for now (Client Authoritative for their own kills)
            // Ideally, we should validate damage history, but for Co-op, we trust the client to report "I killed X".
            const enemyIndex = finite(raw.enemyIndex) ? raw.enemyIndex : raw.index;
            if (!finite(enemyIndex) || !Number.isInteger(enemyIndex) || enemyIndex < 0 || enemyIndex >= 2048)
                return;
            if (this.killedEnemies.has(enemyIndex))
                return;
            this.killedEnemies.add(enemyIndex);
            const killerIndex = finite(raw.killerIndex) ? raw.killerIndex : joinOrder;
            if (!finite(killerIndex) || !Number.isInteger(killerIndex) || killerIndex < 0 || killerIndex >= this.customMaxPlayers)
                return;
            let killerSessionId = null;
            this.state.players.forEach((p, sessionId) => {
                if (killerSessionId)
                    return;
                if (typeof p.joinOrder === "number" && p.joinOrder === killerIndex) {
                    killerSessionId = sessionId;
                }
            });
            if (!killerSessionId) {
                killerSessionId = client.sessionId;
            }
            const current = this.playerKills.get(killerSessionId) || 0;
            this.playerKills.set(killerSessionId, current + 1);
            this.state.score += 100;
            this.state.enemiesKilled++;
            this.broadcast("enemyKilled", {
                enemyIndex,
                killerIndex,
                killerId: killerSessionId
            });
        });
        this.onMessage("gameState", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0)
                return;
            const hostJoinOrder = getHostJoinOrder();
            const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
            if (!isHost)
                return;
            const raw = message || {};
            const out = {};
            if (finite(raw.wave) && raw.wave >= 0 && raw.wave < 10000) {
                out.wave = raw.wave;
                this.state.wave = raw.wave;
            }
            if (finite(raw.lives) && raw.lives >= -1 && raw.lives < 10000) {
                out.lives = raw.lives;
                this.state.lives = raw.lives;
            }
            if (Array.isArray(raw.ships)) {
                const ships = [];
                for (const s of raw.ships) {
                    if (!s || typeof s !== "object")
                        continue;
                    const idx = s.index;
                    const life = s.life;
                    if (!finite(idx) || !Number.isInteger(idx) || idx < 0 || idx >= 256)
                        continue;
                    if (!finite(life) || life < -1000000 || life > 1000000)
                        continue;
                    const shipOut = { index: idx, life };
                    const pos = s.position;
                    if (pos && finite(pos.x) && finite(pos.y) && finite(pos.z)) {
                        shipOut.position = { x: pos.x, y: pos.y, z: pos.z };
                    }
                    const rot = s.rotation;
                    if (rot && finite(rot.x) && finite(rot.y) && finite(rot.z) && finite(rot.w)) {
                        shipOut.rotation = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
                    }
                    ships.push(shipOut);
                    if (ships.length >= 256)
                        break;
                }
                out.ships = ships;
            }
            this.broadcast("gameState", out);
        });
        this.onMessage("gameEnd", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0)
                return;
            const hostJoinOrder = getHostJoinOrder();
            const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
            if (!isHost)
                return;
            const winnerFaction = typeof (message === null || message === void 0 ? void 0 : message.winnerFaction) === "number" ? message.winnerFaction : null;
            const result = typeof (message === null || message === void 0 ? void 0 : message.result) === "string" ? String(message.result) : "";
            const isCoopVictory = result === "victory";
            this.state.players.forEach((p, sessionId) => {
                const kills = this.playerKills.get(sessionId) || 0;
                let win = isCoopVictory;
                if (winnerFaction !== null && typeof p.joinOrder === "number") {
                    win = p.joinOrder === winnerFaction;
                }
                const identifier = (p.userId && typeof p.userId === "string" && p.userId.length > 0) ? p.userId : sessionId;
                const playerName = p.displayName || p.name || "Player";
                TaloService_1.TaloService.reportScore(sessionId, this.state.score, kills, win ? 1 : 0, identifier, "coop", playerName);
            });
            this.broadcast("gameEnd", message);
        });
        this.onMessage("getLeaderboard", (client, message) => __awaiter(this, void 0, void 0, function* () {
            const alias = typeof (message === null || message === void 0 ? void 0 : message.alias) === "string" ? String(message.alias) : "";
            const identifier = typeof (message === null || message === void 0 ? void 0 : message.identifier) === "string" ? String(message.identifier) : undefined;
            const data = yield TaloService_1.TaloService.getLeaderboardEntries(alias, identifier);
            client.send("leaderboardData", { alias, data });
        }));
        // Handle player ready state
        this.onMessage("ready", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.ready = !!message.ready;
            }
        });
        // Handle room properties update
        this.onMessage("updateRoomProperties", (client, message) => {
            const newMetadata = Object.assign({}, this.metadata);
            for (const key in message) {
                const val = message[key];
                this.state.properties.set(key, String(val));
                // Ensure value is JSON serializable (convert BigInt to Number, handle objects safely)
                if (typeof val === 'bigint') {
                    newMetadata[key] = Number(val);
                }
                else {
                    newMetadata[key] = val;
                }
            }
            if (message && message.ai_config) {
                try {
                    const parsed = typeof message.ai_config === "string" ? JSON.parse(message.ai_config) : message.ai_config;
                    if (Array.isArray(parsed)) {
                        const enemies = parsed.filter((c) => c && c.type === 1).length;
                        this.state.totalEnemies = enemies;
                        this.state.enemiesKilled = 0;
                        this.state.score = 0;
                        this.playerKills.clear();
                    }
                }
                catch (e) {
                }
            }
            try {
                this.setMetadata(newMetadata);
            }
            catch (e) {
            }
        });
    }
    updatePlayerMetadata() {
        const headIcons = [];
        this.state.players.forEach((p) => {
            headIcons.push(p.headIconUrl || "");
        });
        this.setMetadata(Object.assign(Object.assign({}, this.metadata), { playerCount: this.state.players.size, headIcons: JSON.stringify(headIcons) }));
    }
    onJoin(client, options) {
        var _a, _b, _c, _d, _e;
        // Check custom limit
        if (this.state.players.size >= this.customMaxPlayers) {
            throw new Error("Room is full");
        }
        const player = new Player();
        player.sessionId = client.sessionId;
        // Fix: Use persistent ID from client options if available, otherwise fallback to session ID
        const raw = options || {};
        const userId = (_b = (_a = raw.userId) !== null && _a !== void 0 ? _a : raw.sessionId) !== null && _b !== void 0 ? _b : client.sessionId;
        const playerName = (_e = (_d = (_c = raw.playerName) !== null && _c !== void 0 ? _c : raw.displayName) !== null && _d !== void 0 ? _d : raw.name) !== null && _e !== void 0 ? _e : "Player";
        player.userId = String(userId || client.sessionId);
        player.name = String(playerName || "Player");
        player.headIconUrl = raw.headIconUrl ? String(raw.headIconUrl) : "";
        player.displayName = raw.displayName ? String(raw.displayName) : player.name;
        // Find the first available join order (0-3)
        let assignedOrder = 0;
        while (this.assignedJoinOrders.has(assignedOrder)) {
            assignedOrder++;
        }
        this.assignedJoinOrders.add(assignedOrder);
        player.joinOrder = assignedOrder;
        this.state.players.set(client.sessionId, player);
        // Sync name to Talo
        if (player.name && player.name !== "Player") {
            TaloService_1.TaloService.updatePlayer(player.userId, player.name);
        }
        // Update metadata with player count and icons
        this.updatePlayerMetadata();
    }
    onLeave(client, consented) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            this.assignedJoinOrders.delete(player.joinOrder);
            this.lastPositions.delete(client.sessionId);
            // Broadcast playerDied to ensure clients mark the ship as dead immediately
            this.broadcast("playerDied", { index: player.joinOrder });
        }
        this.state.players.delete(client.sessionId);
        // Update metadata with player count and icons
        this.updatePlayerMetadata();
    }
    onDispose() {
    }
}
exports.GameRoom = GameRoom;
//# sourceMappingURL=GameRoom.js.map