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
exports.GameRoom = exports.GameState = exports.Player = void 0;
const colyseus_1 = require("colyseus");
const schema_1 = require("@colyseus/schema");
class Player extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.sessionId = "";
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
class GameRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 4;
        this.customMaxPlayers = 4;
    }
    onCreate(options) {
        this.setState(new GameState());
        console.log("GameRoom created with options:", options);
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
            game_mode: options.game_mode || (options.properties && options.properties.game_mode) || "coop"
        };
        if (options.properties) {
            console.log("Initializing room properties:", options.properties);
            Object.assign(metadata, options.properties);
            for (const key in options.properties) {
                this.state.properties.set(key, String(options.properties[key]));
            }
        }
        // Ensure game_mode is explicitly set in metadata if found in options
        if (options.game_mode) {
            metadata.game_mode = options.game_mode;
            this.state.properties.set("game_mode", options.game_mode);
        }
        this.setMetadata(metadata);
        console.log("Room metadata set:", metadata);
        // Handle Relay messages
        this.onMessage("input", (client, message) => {
            this.broadcast("input", message, { except: client });
        });
        this.onMessage("shot", (client, message) => {
            this.broadcast("shot", message, { except: client });
        });
        this.onMessage("spawnEnemy", (client, message) => {
            this.broadcast("spawnEnemy", message);
        });
        this.onMessage("gameState", (client, message) => {
            // Update server state if needed, or just relay
            if (message.score !== undefined)
                this.state.score = message.score;
            if (message.wave !== undefined)
                this.state.wave = message.wave;
            if (message.lives !== undefined)
                this.state.lives = message.lives;
            this.broadcast("gameState", message);
        });
        this.onMessage("gameEnd", (client, message) => {
            this.broadcast("gameEnd", message);
        });
        // Handle player ready state
        this.onMessage("ready", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.ready = !!message.ready;
            }
        });
        // Handle room properties update
        this.onMessage("updateRoomProperties", (client, message) => {
            console.log("Updating room properties:", message);
            const newMetadata = Object.assign({}, this.metadata);
            for (const key in message) {
                this.state.properties.set(key, String(message[key]));
                newMetadata[key] = message[key];
            }
            this.setMetadata(newMetadata);
        });
    }
    onJoin(client, options) {
        // Check custom limit
        if (this.state.players.size >= this.customMaxPlayers) {
            throw new Error("Room is full");
        }
        console.log(client.sessionId, "joined!");
        const player = new Player();
        player.sessionId = client.sessionId;
        player.name = options.name || "Player";
        player.headIconUrl = options.headIconUrl || "";
        player.displayName = options.displayName || options.name || "Player";
        player.joinOrder = this.state.players.size; // Assign join order based on current player count
        this.state.players.set(client.sessionId, player);
        // Update metadata with player count
        this.setMetadata(Object.assign(Object.assign({}, this.metadata), { playerCount: this.state.players.size }));
    }
    onLeave(client, consented) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
        // Update metadata with player count
        this.setMetadata(Object.assign(Object.assign({}, this.metadata), { playerCount: this.state.players.size }));
    }
    onDispose() {
        console.log("room", this.roomId, "disposing...");
    }
}
exports.GameRoom = GameRoom;
//# sourceMappingURL=GameRoom.js.map