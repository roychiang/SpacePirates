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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalLobbyRoom = exports.LobbyState = exports.LobbyPlayer = void 0;
const colyseus_1 = require("colyseus");
const schema_1 = require("@colyseus/schema");
class LobbyPlayer extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.sessionId = "";
        this.name = "";
        this.headIconUrl = "";
    }
}
exports.LobbyPlayer = LobbyPlayer;
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], LobbyPlayer.prototype, "sessionId", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], LobbyPlayer.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("string"),
    __metadata("design:type", String)
], LobbyPlayer.prototype, "headIconUrl", void 0);
class LobbyState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
    }
}
exports.LobbyState = LobbyState;
__decorate([
    (0, schema_1.type)({ map: LobbyPlayer }),
    __metadata("design:type", Object)
], LobbyState.prototype, "players", void 0);
class GlobalLobbyRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        // Rate limit: last sent timestamp by sessionId
        this.lastSendAt = new Map();
    }
    onCreate(options) {
        this.setState(new LobbyState());
        console.log("[GlobalLobby] Created");
        this.onMessage("chat", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            // Validation
            if (!player)
                return;
            const text = typeof message === "string" ? message.trim() : ((message === null || message === void 0 ? void 0 : message.text) || "").trim();
            if (!text)
                return;
            if (text.length > 200)
                return;
            // Rate limit (800ms)
            const now = Date.now();
            const last = this.lastSendAt.get(client.sessionId) || 0;
            if (now - last < 800)
                return;
            this.lastSendAt.set(client.sessionId, now);
            // Broadcast to all clients
            this.broadcast("chat", {
                senderId: client.sessionId,
                name: player.name,
                text: text,
                ts: now
            });
        });
    }
    onJoin(client, options) {
        const player = new LobbyPlayer();
        player.sessionId = client.sessionId;
        player.name = options.name || "Guest";
        player.headIconUrl = options.headIconUrl || "";
        this.state.players.set(client.sessionId, player);
        console.log(`[GlobalLobby] ${player.name} (${client.sessionId}) joined.`);
    }
    onLeave(client, consented) {
        this.state.players.delete(client.sessionId);
        console.log(`[GlobalLobby] ${client.sessionId} left.`);
    }
}
exports.GlobalLobbyRoom = GlobalLobbyRoom;
//# sourceMappingURL=GlobalLobbyRoom.js.map