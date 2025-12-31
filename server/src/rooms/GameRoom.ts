import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { TaloService } from "../services/TaloService";

export class Player extends Schema {
    @type("string") sessionId: string = "";
    @type("string") userId: string = "";
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
    @type("number") totalEnemies: number = 0;
    @type("number") enemiesKilled: number = 0;
}

export class GameRoom extends Room<GameState> {
    maxClients = 32;
    customMaxPlayers = 4;
    playerKills = new Map<string, number>();
    killedEnemies = new Set<number>();
    assignedJoinOrders = new Set<number>();
    lastPositions = new Map<string, { x: number; y: number; z: number }>();

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
            max_players: this.customMaxPlayers,
            game_mode: options.game_mode || (options.properties && options.properties.game_mode) || "coop"
        };
        
        if (options.properties) {
            console.log("Initializing room properties:", options.properties);
            Object.assign(metadata, options.properties);
            for (const key in options.properties) {
                this.state.properties.set(key, String(options.properties[key]));
            }

            // Parse total enemies from ai_config if available
            if (options.properties.ai_config) {
                try {
                    const aiConfig = JSON.parse(options.properties.ai_config);
                    // Count enemies (assuming type 1 is enemy)
                    const enemies = aiConfig.filter((c: any) => c.type === 1).length;
                    this.state.totalEnemies = enemies;
                    console.log(`[GameRoom] Set totalEnemies to ${enemies} based on ai_config`);
                } catch (e) {
                    console.error("[GameRoom] Failed to parse ai_config for enemy count", e);
                }
            }
        }
        
        // Fallback: If totalEnemies is still 0, check options/properties for explicit count
        if (this.state.totalEnemies === 0) {
             const fallback = Number(options.aiEnemies || (options.properties && options.properties.aiEnemies) || 10);
             if (fallback > 0) {
                 this.state.totalEnemies = fallback;
                 console.log(`[GameRoom] Set totalEnemies to ${fallback} based on fallback options`);
             }
        }
        
        // Ensure game_mode is explicitly set in metadata if found in options
        if (options.game_mode) {
            metadata.game_mode = options.game_mode;
            this.state.properties.set("game_mode", options.game_mode);
        }

        this.setMetadata(metadata);
        console.log("Room metadata set:", metadata);

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const finite = (v: any): v is number => typeof v === "number" && Number.isFinite(v);
        const getJoinOrder = (client: Client): number => {
            const p = this.state.players.get(client.sessionId);
            return typeof p?.joinOrder === "number" ? p.joinOrder : -1;
        };
        const getHostJoinOrder = (): number => {
            let min = Number.POSITIVE_INFINITY;
            this.state.players.forEach((p) => {
                if (typeof p.joinOrder === "number" && p.joinOrder < min) min = p.joinOrder;
            });
            return Number.isFinite(min) ? min : -1;
        };

        // Handle Relay messages
        this.onMessage("input", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0) return;

            const raw: any = message || {};
            const dx = finite(raw.dx) ? clamp(raw.dx, -0.1, 0.1) : 0;
            const dy = finite(raw.dy) ? clamp(raw.dy, -0.1, 0.1) : 0;
            const payload: any = {
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
                    if (distSq < 4_000_000) {
                        payload.pos = { x, y, z };
                        this.lastPositions.set(client.sessionId, { x, y, z });
                    }
                } else {
                    payload.pos = { x, y, z };
                    this.lastPositions.set(client.sessionId, { x, y, z });
                }
            }

            if (
                raw.rot &&
                finite(raw.rot.x) &&
                finite(raw.rot.y) &&
                finite(raw.rot.z) &&
                finite(raw.rot.w)
            ) {
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
            if (joinOrder < 0) return;

            const raw: any = message || {};
            const hostJoinOrder = getHostJoinOrder();
            const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
            const index = isHost && finite(raw.index) ? raw.index : joinOrder;
            if (!finite(index) || index < 0 || index >= this.customMaxPlayers) return;

            this.broadcast("playerDied", { index });
        });

        // Anti-cheat: Track kills server-side
        this.onMessage("enemyKilled", (client, message) => {
            const joinOrder = getJoinOrder(client);
            if (joinOrder < 0) return;

            const raw: any = message || {};
            // Allow any player to report kills for now (Client Authoritative for their own kills)
            // Ideally, we should validate damage history, but for Co-op, we trust the client to report "I killed X".
            
            const enemyIndex = finite(raw.enemyIndex) ? raw.enemyIndex : raw.index;
            if (!finite(enemyIndex) || !Number.isInteger(enemyIndex) || enemyIndex < 0 || enemyIndex >= 2048) return;
            if (this.killedEnemies.has(enemyIndex)) return;
            this.killedEnemies.add(enemyIndex);

            const killerIndex = finite(raw.killerIndex) ? raw.killerIndex : joinOrder;
            if (!finite(killerIndex) || !Number.isInteger(killerIndex) || killerIndex < 0 || killerIndex >= this.customMaxPlayers) return;

            let killerSessionId: string | null = null;
            this.state.players.forEach((p, sessionId) => {
                if (killerSessionId) return;
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
            if (joinOrder < 0) return;

            const hostJoinOrder = getHostJoinOrder();
            const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
            if (!isHost) return;

            const raw: any = message || {};

            const out: any = {};
            if (finite(raw.wave) && raw.wave >= 0 && raw.wave < 10_000) {
                out.wave = raw.wave;
                this.state.wave = raw.wave;
            }
            if (finite(raw.lives) && raw.lives >= -1 && raw.lives < 10_000) {
                out.lives = raw.lives;
                this.state.lives = raw.lives;
            }

            if (Array.isArray(raw.ships)) {
                const ships: any[] = [];
                for (const s of raw.ships) {
                    if (!s || typeof s !== "object") continue;
                    const idx = (s as any).index;
                    const life = (s as any).life;
                    if (!finite(idx) || !Number.isInteger(idx) || idx < 0 || idx >= 256) continue;
                    if (!finite(life) || life < -1_000_000 || life > 1_000_000) continue;

                    const shipOut: any = { index: idx, life };

                    const pos = (s as any).position;
                    if (pos && finite(pos.x) && finite(pos.y) && finite(pos.z)) {
                        shipOut.position = { x: pos.x, y: pos.y, z: pos.z };
                    }
                    const rot = (s as any).rotation;
                    if (rot && finite(rot.x) && finite(rot.y) && finite(rot.z) && finite(rot.w)) {
                        shipOut.rotation = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
                    }

                    ships.push(shipOut);
                    if (ships.length >= 256) break;
                }
                out.ships = ships;
            }

            this.broadcast("gameState", out);
        });

        this.onMessage("gameEnd", (client, message) => {
             const joinOrder = getJoinOrder(client);
             if (joinOrder < 0) return;
             const hostJoinOrder = getHostJoinOrder();
             const isHost = hostJoinOrder >= 0 && joinOrder === hostJoinOrder;
             if (!isHost) return;

             const winnerFaction = typeof (message as any)?.winnerFaction === "number" ? (message as any).winnerFaction : null;
             const result = typeof (message as any)?.result === "string" ? String((message as any).result) : "";
             const isCoopVictory = result === "victory";

             this.state.players.forEach((p, sessionId) => {
                 const kills = this.playerKills.get(sessionId) || 0;
                 let win = isCoopVictory;
                 if (winnerFaction !== null && typeof p.joinOrder === "number") {
                     win = p.joinOrder === winnerFaction;
                 }
                 const identifier = (p.userId && typeof p.userId === "string" && p.userId.length > 0) ? p.userId : sessionId;
                 TaloService.reportScore(sessionId, this.state.score, kills, win ? 1 : 0, identifier);
             });

            this.broadcast("gameEnd", message);
        });

        this.onMessage("getLeaderboard", async (client, message) => {
            const alias = typeof (message as any)?.alias === "string" ? String((message as any).alias) : "";
            const identifier = typeof (message as any)?.identifier === "string" ? String((message as any).identifier) : undefined;
            const data = await TaloService.getLeaderboardEntries(alias, identifier);
            client.send("leaderboardData", { alias, data });
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
                const val = message[key];
                this.state.properties.set(key, String(val));
                // Ensure value is JSON serializable (convert BigInt to Number, handle objects safely)
                if (typeof val === 'bigint') {
                    newMetadata[key] = Number(val);
                } else {
                    newMetadata[key] = val;
                }
            }
            if (message && message.ai_config) {
                try {
                    const parsed = typeof message.ai_config === "string" ? JSON.parse(message.ai_config) : message.ai_config;
                    if (Array.isArray(parsed)) {
                        const enemies = parsed.filter((c: any) => c && c.type === 1).length;
                        this.state.totalEnemies = enemies;
                        this.state.enemiesKilled = 0;
                        this.state.score = 0;
                        this.playerKills.clear();
                    }
                } catch (e) {
                    console.error("[GameRoom] Failed to parse ai_config for enemy count", e);
                }
            }
            try {
                this.setMetadata(newMetadata);
            } catch (e) {
                console.error("[GameRoom] Failed to set metadata:", e);
            }
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
        // Fix: Use persistent ID from client options if available, otherwise fallback to session ID
        const raw: any = options || {};
        const userId = raw.userId ?? raw.sessionId ?? client.sessionId;
        const playerName = raw.playerName ?? raw.displayName ?? raw.name ?? "Player";
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
        console.log(`[GameRoom] Assigned joinOrder ${assignedOrder} to ${player.name} (${client.sessionId})`);

        this.state.players.set(client.sessionId, player);
        
        // Update metadata with player count and icons
        this.updatePlayerMetadata();
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left!");
        const player = this.state.players.get(client.sessionId);
        if (player) {
            console.log(`[GameRoom] Releasing joinOrder ${player.joinOrder} for ${player.name}`);
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
        console.log("room", this.roomId, "disposing...");
    }
}
