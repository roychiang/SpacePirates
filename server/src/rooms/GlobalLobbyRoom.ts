import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class LobbyPlayer extends Schema {
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    @type("string") headIconUrl: string = "";
}

export class LobbyState extends Schema {
    @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}

export class GlobalLobbyRoom extends Room<LobbyState> {
    // Rate limit: last sent timestamp by sessionId
    private lastSendAt = new Map<string, number>();

    onCreate(options: any) {
        this.setState(new LobbyState());
        console.log("[GlobalLobby] Created");

        this.onMessage("chat", (client, message) => {
            const player = this.state.players.get(client.sessionId);
            // Validation
            if (!player) return;

            const text = typeof message === "string" ? message.trim() : (message?.text || "").trim();
            if (!text) return;
            if (text.length > 200) return;

            // Rate limit (800ms)
            const now = Date.now();
            const last = this.lastSendAt.get(client.sessionId) || 0;
            if (now - last < 800) return;
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

    onJoin(client: Client, options: any) {
        const player = new LobbyPlayer();
        player.sessionId = client.sessionId;
        player.name = options.name || "Guest";
        player.headIconUrl = options.headIconUrl || "";
        this.state.players.set(client.sessionId, player);
        console.log(`[GlobalLobby] ${player.name} (${client.sessionId}) joined.`);
    }

    onLeave(client: Client, consented: boolean) {
        this.state.players.delete(client.sessionId);
        console.log(`[GlobalLobby] ${client.sessionId} left.`);
    }
}
