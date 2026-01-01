import * as Colyseus from "colyseus.js";
import { getViverse } from "./Viverse";
import { Config } from "../Config";
import { VoiceManager } from "./VoiceManager";
import { TaloClient } from "../Integrations/Talo";

export type Actor = {
  session_id: string
  userId?: string
  name: string
  properties: Record<string, number | string>
}

export type Room = {
  id: string
  app_id: string
  mode: "team"
  name: string
  actors: Actor[]
  max_players: number
  min_players: number
  is_closed: boolean
  properties: Record<string, any>
  master_client_id: string
  game_session: string
  created_by_me: boolean
}

export type CreateRoomResult = { success: boolean; room?: Room; message?: string }
export type JoinRoomResult = { success: boolean; room?: Room; message?: string }

type Handler = (payload?: any) => void

export class PlayService {
  private actor?: Actor
  private room?: Room
  private listeners: Record<string, Handler[]> = {}
  private connected: boolean = false
  private _guestIdentity: string = "";

  private client?: Colyseus.Client
  public colyseusRoom?: Colyseus.Room
  public voiceManager: VoiceManager = new VoiceManager();

  // Default to local dev, user should update this for prod
  private endpoint = Config.getColyseusEndpoint();
  private appId = "spacepirates"

  init(): void { }

  async newMatchmakingClient(appId: string, debug?: boolean): Promise<void> {
    console.log("[Play] newMatchmakingClient start", { endpoint: this.endpoint })
    this.client = new Colyseus.Client(this.endpoint);
    this.connected = true;
    this.emit("connected");
  }

  private async recoverRoom(): Promise<boolean> {
    return false;
  }

  private waitConnected(timeoutMs: number = 8000): Promise<void> {
    if (this.connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs)
      this.on("connected", () => { clearTimeout(timer); resolve() })
    })
  }

  async setActor(actor: Actor): Promise<{ success: boolean; message?: string }> {
    this.actor = actor
    console.log("[Play] setActor", actor)
    
    const identity =
      (this.actor?.userId && String(this.actor.userId)) ||
      (this.actor?.properties && (this.actor.properties as any).userId ? String((this.actor.properties as any).userId) : "") ||
      (this.actor?.session_id ? String(this.actor.session_id) : "");
    
    if (identity) {
      TaloClient.identify(identity);
    }

    this.emit("actorJoined", actor)
    return { success: true }
  }

  getActor(): Actor | undefined {
    return this.actor
  }

  getAppId(): string {
    return this.appId
  }

  async setReady(ready: boolean): Promise<{ success: boolean }> {
    if (!this.actor) return { success: false }

    // Update local actor props
    this.actor.properties = { ...(this.actor.properties || {}), player_ready: ready ? "1" : "0" }

    // Send to server if in room
    if (this.colyseusRoom) {
      this.colyseusRoom.send("ready", { ready });
    }

    // Update local room state optimistically
    if (this.room && Array.isArray(this.room.actors)) {
      const mySessionId = this.colyseusRoom?.sessionId || this.actor!.session_id
      const idx = this.room.actors.findIndex(a => a.session_id === mySessionId)
      if (idx >= 0) {
        const a = this.room.actors[idx]
        this.room.actors[idx] = { ...a, properties: { ...(a.properties || {}), player_ready: ready ? "1" : "0" } }
      }
    }

    this.emit("readyStateChanged", { session_id: this.actor.session_id, ready })
    return { success: true }
  }

  async createRoom(cfg: {
    name: string
    mode: "team"
    maxPlayers: number
    minPlayers: number
    properties?: Record<string, any>
  }): Promise<CreateRoomResult> {
    if (!this.client) return { success: false, message: "No client" }

    try {
      const userId = this.getIdentity();
      
      let displayName = this.actor?.name ? String(this.actor.name) : "";
      if (!displayName) {
          if (userId.startsWith("Guest_")) {
              displayName = userId;
          } else {
              if (!this._guestIdentity) {
                   this._guestIdentity = "Guest_" + Math.floor(Math.random() * 1000000);
              }
              displayName = this._guestIdentity;
          }
      }

      const options = {
        name: cfg.name,
        maxClients: cfg.maxPlayers,
        properties: cfg.properties, // Pass properties to server
        game_mode: cfg.properties?.game_mode, // Lift game_mode to top level for reliability
        userId,
        displayName: displayName,
        headIconUrl: this.actor?.properties?.headIconUrl ? String(this.actor.properties.headIconUrl) : undefined,
        playerName: displayName
      };

      console.log("[Play] creating room...", JSON.stringify(options));
      this.colyseusRoom = await this.client.create("game_room", options);
      this.setupRoomHandlers(this.colyseusRoom);

      // Update local actor session_id to match Colyseus session_id
      if (this.actor) {
        // Preserve persistent ID in properties before overwriting session_id
        if (!this.actor.userId) {
            this.actor.userId = this.actor.session_id;
        }
        this.actor.properties = { ...(this.actor.properties || {}), userId: this.actor.userId };
        
        this.actor.session_id = this.colyseusRoom.sessionId;
      }

      // Construct local Room object
      this.room = {
        id: this.colyseusRoom.roomId,
        app_id: this.appId,
        mode: "team",
        name: cfg.name,
        actors: [this.actor!],
        max_players: cfg.maxPlayers,
        min_players: cfg.minPlayers,
        is_closed: false,
        properties: cfg.properties || {},
        master_client_id: this.colyseusRoom.sessionId, // In Colyseus, we might not have a clear "master", but let's use our sessionId
        game_session: "",
        created_by_me: true
      };

      this.emit("roomUpdated", this.room);

      // Initialize Voice Peer
      if (this.colyseusRoom) {
          await this.voiceManager.initialize(this.colyseusRoom.sessionId);
      }

      return { success: true, room: this.room };
    } catch (e) {
      console.error("createRoom error", e);
      const err: any = e as any;
      const msg =
        (typeof err?.message === "string" && err.message) ||
        (typeof err?.serverError?.message === "string" && err.serverError.message) ||
        (typeof err?.serverError === "string" && err.serverError) ||
        String(e);
      return { success: false, message: msg };
    }
  }

  async updateRoomProperties(props: Record<string, any>): Promise<{ success: boolean; message?: string }> {
    // Colyseus rooms don't have generic property bag updates from client by default unless we implement it.
    // For now, just update local
    if (this.room) {
      this.room.properties = { ...(this.room.properties || {}), ...props }
      this.emit("roomUpdated", this.room)

      if (this.colyseusRoom) {
        this.colyseusRoom.send("updateRoomProperties", props);
      }
      return { success: true }
    }
    return { success: false, message: "no room" }
  }

  async joinRoom(roomId: string): Promise<JoinRoomResult> {
    if (!this.client) return { success: false, message: "No client" }

    try {
      const userId = this.getIdentity();

      let displayName = this.actor?.name ? String(this.actor.name) : "";
      if (!displayName) {
          if (userId.startsWith("Guest_")) {
              displayName = userId;
          } else {
              if (!this._guestIdentity) {
                   this._guestIdentity = "Guest_" + Math.floor(Math.random() * 1000000);
              }
              displayName = this._guestIdentity;
          }
      }

      const options = {
        userId,
        displayName: displayName,
        headIconUrl: this.actor?.properties?.headIconUrl ? String(this.actor.properties.headIconUrl) : undefined,
        playerName: displayName
      };

      console.log("[Play] joining room...", roomId, options);
      this.colyseusRoom = await this.client.joinById(roomId, options);
      this.setupRoomHandlers(this.colyseusRoom);

      // Update local actor session_id to match Colyseus session_id
      if (this.actor) {
        // this.actor.session_id = this.colyseusRoom.sessionId; // Don't overwrite persistent ID!
      }

      // We need to fetch room info or wait for state sync to populate this.room
      // For now, create a skeleton
      this.room = {
        id: this.colyseusRoom.roomId,
        app_id: this.appId,
        mode: "team",
        name: "Room " + roomId, // We might need to fetch metadata
        actors: [], // Will be populated by state sync
        max_players: 4, // Max players set to 4
        min_players: 1,
        is_closed: false,
        properties: {},
        master_client_id: "",
        game_session: "",
        created_by_me: false
      };

      this.emit("roomUpdated", this.room);

      // Initialize Voice Peer
      if (this.colyseusRoom) {
          await this.voiceManager.initialize(this.colyseusRoom.sessionId);
      }

      return { success: true, room: this.room };
    } catch (e) {
      console.error("joinRoom error", e);
      const err: any = e as any;
      const msg =
        (typeof err?.message === "string" && err.message) ||
        (typeof err?.serverError?.message === "string" && err.serverError.message) ||
        (typeof err?.serverError === "string" && err.serverError) ||
        String(e);
      return { success: false, message: msg };
    }
  }

  async leaveRoom(): Promise<{ success: boolean; message?: string }> {
    this.voiceManager.leave();
    if (this.colyseusRoom) {
      this.colyseusRoom.leave();
      this.colyseusRoom = undefined;
    }
    this.room = undefined as any;
    this.emit("actorLeft", this.actor);
    return { success: true };
  }

  async closeRoom(): Promise<{ success: boolean; message?: string }> {
    // In Colyseus, leaving usually closes if empty, or we can lock it.
    // For now, just leave.
    return this.leaveRoom();
  }

  getRoom(): Room | undefined {
    return this.room
  }

  async startMultiplayer(): Promise<{ success: boolean }> {
    // Already started if we have a room
    return { success: !!this.colyseusRoom };
  }

  broadcastInput(payload: { index: number; dx: number; dy: number; shooting: boolean; burst: boolean; breaking: boolean; launchMissile?: boolean; missileTarget?: number; immelmann?: boolean; pos?: { x: number; y: number; z: number }; rot?: { x: number; y: number; z: number; w: number } }) {
    this.colyseusRoom?.send("input", payload);
  }

  broadcastSpawnEnemy(payload: { id: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; type: number }) {
    this.colyseusRoom?.send("spawnEnemy", payload);
  }

  broadcastGameState(payload: { score: number; lives: number; wave: number }) {
    this.colyseusRoom?.send("gameState", payload);
  }

  broadcastGameEnd(payload: { result?: "victory" | "defeat", winnerFaction?: number, stats?: any[] }) {
    this.colyseusRoom?.send("gameEnd", payload);
  }

  async getAvailableRooms(): Promise<{ success: boolean; rooms: Room[] }> {
    if (!this.client) return { success: false, rooms: [] }

    try {
      const rooms = await (this.client as any).getAvailableRooms("game_room");
      if (!Array.isArray(rooms)) {
        console.warn("getAvailableRooms: Expected array but got", rooms);
        return { success: false, rooms: [] };
      }
      const mapped: Room[] = rooms.map((r: any) => {
        let count = r.clients;
        if (r.metadata && r.metadata.playerCount !== undefined && r.metadata.playerCount !== null) {
            const pc = Number(r.metadata.playerCount);
            if (!isNaN(pc)) count = pc;
        }
        return {
        id: r.roomId,
        app_id: this.appId,
        mode: "team",
        name: r.metadata?.name || ("Room " + r.roomId),
        actors: (() => {
            if (r.metadata && r.metadata.headIcons) {
                try {
                    const icons = JSON.parse(r.metadata.headIcons);
                    if (Array.isArray(icons)) {
                        return icons.map((url: string) => ({ 
                            session_id: "", name: "", 
                            properties: { headIconUrl: url },
                            headIconUrl: url 
                        } as Actor));
                    }
                } catch(e) {}
            }
            return new Array(count).fill({} as Actor);
        })(),
        max_players: r.maxClients,
        min_players: 1,
        is_closed: r.locked,
        properties: r.metadata || {},
        master_client_id: "",
        game_session: "",
        created_by_me: false
      }});

      return { success: true, rooms: mapped };
    } catch (e) {
      console.warn("getAvailableRooms: Matchmaking server unreachable (dev mode?)", e);
      return { success: false, rooms: [] };
    }
  }

  async getMyRoomActors(): Promise<{ success: boolean; actors: Actor[] }> {
    // Handled by state sync
    return { success: true, actors: this.room?.actors || [] };
  }

  async ensureActorPresentInRoom(): Promise<void> {
    // No-op for Colyseus, handled by join
  }

  private getIdentity(): string {
    let identity =
      (this.actor?.userId && String(this.actor.userId)) ||
      (this.actor?.properties && (this.actor.properties as any).userId ? String((this.actor.properties as any).userId) : "") ||
      (this.actor?.session_id ? String(this.actor.session_id) : "") ||
      (this.colyseusRoom?.sessionId ? String(this.colyseusRoom.sessionId) : "");
    
    if (!identity) {
        if (!this._guestIdentity) {
            this._guestIdentity = "Guest_" + Math.floor(Math.random() * 1000000);
        }
        identity = this._guestIdentity;
    }
    return identity;
  }

  async getPlayerStats(mode?: "single" | "coop"): Promise<{ kills: number; wins: number }> {
    const identity = this.getIdentity();
    if (identity) {
      TaloClient.identify(identity);
    }
    return TaloClient.getPlayerStats(mode);
  }

  async reportGameResult(kills: number, win: boolean, score: number = 0) {
      const identity = this.getIdentity();
      
      let playerName = this.actor?.name || (this.actor?.properties as any)?.displayName || "";
      
      if (identity) {
        TaloClient.identify(identity);
      }
      return TaloClient.addEvent("game_end", { kills, win, score, playerName });
  }

  notifyEnemyKill(payload: number | { enemyIndex: number; killerIndex?: number }) {
      if (typeof payload === "number") {
          this.colyseusRoom?.send("enemyKilled", { index: payload });
          return;
      }
      this.colyseusRoom?.send("enemyKilled", { index: payload.enemyIndex, killerIndex: payload.killerIndex });
  }

  notifyPlayerDeath(index: number) {
      this.colyseusRoom?.send("playerDied", { index });
  }

  on(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot" | "spawnEnemy" | "gameStateUpdate" | "gameEnd" | "playerDied" | "enemyKilled" | "leaderboardData", handler: Handler) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  private emit(event: string, payload?: any) {
    const arr = this.listeners[event] || []
    for (const h of arr) h(payload)
  }

  off(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot" | "spawnEnemy" | "gameStateUpdate" | "gameEnd" | "playerDied" | "enemyKilled" | "leaderboardData", handler: Handler) {
    const arr = this.listeners[event] || []
    this.listeners[event] = arr.filter(h => h !== handler)
  }

  private setupRoomHandlers(room: Colyseus.Room) {
    room.onStateChange((state: any) => {
      this.syncState(state);
    });

    room.onMessage("input", (msg) => this.emit("remoteInput", msg));
    room.onMessage("shot", (msg) => this.emit("remoteShot", msg));
    room.onMessage("spawnEnemy", (msg) => this.emit("spawnEnemy", msg));
    room.onMessage("playerDied", (msg) => this.emit("playerDied", msg));
    room.onMessage("enemyKilled", (msg) => this.emit("enemyKilled", msg));
    room.onMessage("gameState", (msg) => this.emit("gameStateUpdate", msg));
    room.onMessage("gameEnd", (msg) => this.emit("gameEnd", msg));
    room.onMessage("leaderboardData", (msg) => this.emit("leaderboardData", msg));

    room.onLeave((code: number) => {
      this.voiceManager.leave();
    });

    room.onError((code: number, message?: string) => {
    });
  }

  private syncState(state: any) {
    if (!this.room) return;

    // Detect left players
    const leftActors: Actor[] = [];
    if (this.room.actors) {
        const newSessionIds = new Set<string>();
        state.players.forEach((p: any, sessionId: string) => {
            newSessionIds.add(sessionId);
        });
        
        this.room.actors.forEach(actor => {
            if (!newSessionIds.has(actor.session_id)) {
                leftActors.push(actor);
            }
        });
    }

    // Sync players
    const players: Actor[] = [];
    state.players.forEach((p: any, sessionId: string) => {
      players.push({
        session_id: sessionId,
        userId: p.userId, // Sync userId from server state
        name: p.name,
        properties: {
          headIconUrl: p.headIconUrl,
          displayName: p.displayName,
          player_ready: p.ready ? "1" : "0",
          joinOrder: String(p.joinOrder || 0),
          userId: p.userId
        }
      });
    });

    // Sort by joinOrder to maintain join sequence (P1=0, P2=1, etc)
    this.room.actors = players.sort((a, b) => {
      const aOrder = parseInt((a.properties?.joinOrder as string) || "0");
      const bOrder = parseInt((b.properties?.joinOrder as string) || "0");
      return aOrder - bOrder;
    });

    // Emit left events after updating local state so UI gets fresh list
    leftActors.forEach(actor => {
        this.emit("actorLeft", actor);
        // Also close voice connection
        this.voiceManager.closeConnection(actor.session_id);
    });

    // Determine host as the lowest joinOrder among active players
    if (this.room.actors.length > 0) {
      let hostSessionId = this.room.actors[0].session_id;
      let hostJoinOrder = parseInt(String(this.room.actors[0].properties?.joinOrder ?? "0"), 10);
      for (const actor of this.room.actors) {
        const jo = parseInt(String(actor.properties?.joinOrder ?? "0"), 10);
        if (Number.isFinite(jo) && jo < hostJoinOrder) {
          hostJoinOrder = jo;
          hostSessionId = actor.session_id;
        }
      }
      this.room.master_client_id = hostSessionId;
    } else {
      this.room.master_client_id = "";
    }

    // Sync properties
    if (state.properties) {
      const props: Record<string, any> = {};
      state.properties.forEach((val: any, key: string) => {
        props[key] = val;
      });
      console.log("[Play] syncState properties:", props);
      this.room.properties = { ...(this.room.properties || {}), ...props };
    }

    const gameMode = String(this.room.properties?.game_mode || "coop");
    if (gameMode !== "coop") {
      this.voiceManager.leave();
    } else if (this.colyseusRoom) {
      const meSessionId = this.colyseusRoom.sessionId;
      const meActor = this.room.actors.find(a => a.session_id === meSessionId);
      const myJoinOrder = parseInt(String(meActor?.properties?.joinOrder ?? "-1"), 10);
      for (const actor of this.room.actors) {
        if (actor.session_id === meSessionId) continue;
        const otherJoinOrder = parseInt(String(actor.properties?.joinOrder ?? "-1"), 10);
        if (myJoinOrder >= 0 && otherJoinOrder >= 0 && otherJoinOrder <= myJoinOrder) continue;
        this.voiceManager.call(actor.session_id);
      }
    }

    this.emit("roomUpdated", this.room);
  }
}
