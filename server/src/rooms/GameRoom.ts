import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    @type("string") headIconUrl: string = "";
    @type("boolean") ready: boolean = false;
    @type("string") displayName: string = "";
    @type("number") joinOrder: number = 0;
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("number") score: number = 0;
    @type("number") wave: number = 1;
    @type("number") lives: number = 3;
    @type({ map: "string" }) properties = new MapSchema<string>();
}

export class GameRoom extends Room<GameState> {
    maxClients = 4;
    customMaxPlayers = 4;

    onCreate(options: any) {
        this.setState(new GameState());

        console.log("GameRoom created with options:", options);

        // Store maxPlayers but keep maxClients high to prevent auto-lock hiding room
        if (options.maxPlayers) {
            this.customMaxPlayers = options.maxPlayers;
        } else if (options.maxClients) {
            this.customMaxPlayers = options.maxClients;
        }

        // Set room metadata for listing (includes game_mode for PVP/Co-op filtering)
        const metadata: any = {
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
            if (message.score !== undefined) this.state.score = message.score;
            if (message.wave !== undefined) this.state.wave = message.wave;
            if (message.lives !== undefined) this.state.lives = message.lives;
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
            const newMetadata: any = { ...this.metadata };
            for (const key in message) {
                this.state.properties.set(key, String(message[key]));
                newMetadata[key] = message[key];
            }
            this.setMetadata(newMetadata);
        });
    }

    updatePlayerMetadata() {
        const headIcons: string[] = [];
        this.state.players.forEach((p) => {
             headIcons.push(p.headIconUrl || "");
        });
        this.setMetadata({ 
            ...this.metadata, 
            playerCount: this.state.players.size,
            headIcons: JSON.stringify(headIcons)
        });
    }

    onJoin(client: Client, options: any) {
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
        
        // Update metadata with player count and icons
        this.updatePlayerMetadata();
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
        
        // Update metadata with player count and icons
        this.updatePlayerMetadata();
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
    }
}
