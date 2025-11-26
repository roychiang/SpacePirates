import * as Colyseus from "colyseus.js";
import { getViverse } from "./Viverse";
import { Config } from "../Config";

export type Actor = {
  session_id: string
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

  private client?: Colyseus.Client
  private colyseusRoom?: Colyseus.Room

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
      const idx = this.room.actors.findIndex(a => a.session_id === this.actor!.session_id)
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
      const options = {
        name: cfg.name,
        maxClients: cfg.maxPlayers,
        properties: cfg.properties, // Pass properties to server
        ...this.actor, // Pass actor info as options for onJoin
        displayName: this.actor?.name,
        headIconUrl: this.actor?.properties?.headIconUrl
      };

      console.log("[Play] creating room...", options);
      this.colyseusRoom = await this.client.create("game_room", options);
      this.setupRoomHandlers(this.colyseusRoom);

      // Update local actor session_id to match Colyseus session_id
      if (this.actor) {
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
      return { success: true, room: this.room };
    } catch (e) {
      console.error("createRoom error", e);
      return { success: false, message: String(e) };
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
      const options = {
        ...this.actor,
        displayName: this.actor?.name,
        headIconUrl: this.actor?.properties?.headIconUrl
      };

      console.log("[Play] joining room...", roomId, options);
      this.colyseusRoom = await this.client.joinById(roomId, options);
      this.setupRoomHandlers(this.colyseusRoom);

      // Update local actor session_id to match Colyseus session_id
      if (this.actor) {
        this.actor.session_id = this.colyseusRoom.sessionId;
      }

      // We need to fetch room info or wait for state sync to populate this.room
      // For now, create a skeleton
      this.room = {
        id: this.colyseusRoom.roomId,
        app_id: this.appId,
        mode: "team",
        name: "Room " + roomId, // We might need to fetch metadata
        actors: [], // Will be populated by state sync
        max_players: 4,
        min_players: 1,
        is_closed: false,
        properties: {},
        master_client_id: "",
        game_session: "",
        created_by_me: false
      };

      this.emit("roomUpdated", this.room);
      return { success: true, room: this.room };
    } catch (e) {
      console.error("joinRoom error", e);
      return { success: false, message: String(e) };
    }
  }

  async leaveRoom(): Promise<{ success: boolean; message?: string }> {
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

  broadcastInput(payload: { index: number; dx: number; dy: number; shooting: boolean; burst: boolean; breaking: boolean; launchMissile?: boolean; immelmann?: boolean }) {
    this.colyseusRoom?.send("input", payload);
  }

  broadcastSpawnEnemy(payload: { id: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; type: number }) {
    this.colyseusRoom?.send("spawnEnemy", payload);
  }

  broadcastGameState(payload: { score: number; lives: number; wave: number }) {
    this.colyseusRoom?.send("gameState", payload);
  }

  broadcastGameEnd(payload: { result: "victory" | "defeat" }) {
    this.colyseusRoom?.send("gameEnd", payload);
  }

  async getAvailableRooms(): Promise<{ success: boolean; rooms: Room[] }> {
    if (!this.client) return { success: false, rooms: [] }

    try {
      const rooms = await (this.client as any).getAvailableRooms("game_room");
      const mapped: Room[] = rooms.map((r: any) => ({
        id: r.roomId,
        app_id: this.appId,
        mode: "team",
        name: r.metadata?.name || ("Room " + r.roomId),
        actors: new Array(r.clients).fill({} as Actor), // We don't know actors details from listing
        max_players: r.maxClients,
        min_players: 1,
        is_closed: r.locked,
        properties: r.metadata || {},
        master_client_id: "",
        game_session: "",
        created_by_me: false
      }));

      return { success: true, rooms: mapped };
    } catch (e) {
      console.error("getAvailableRooms error", e);
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

  on(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot" | "spawnEnemy" | "gameStateUpdate" | "gameEnd", handler: Handler) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  private emit(event: string, payload?: any) {
    const arr = this.listeners[event] || []
    for (const h of arr) h(payload)
  }

  off(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot" | "spawnEnemy" | "gameStateUpdate" | "gameEnd", handler: Handler) {
    const arr = this.listeners[event] || []
    this.listeners[event] = arr.filter(h => h !== handler)
  }

  private setupRoomHandlers(room: Colyseus.Room) {
    room.onStateChange((state: any) => {
      console.log("Room state changed:", state);
      this.syncState(state);
    });

    room.onMessage("input", (msg) => this.emit("remoteInput", msg));
    room.onMessage("shot", (msg) => this.emit("remoteShot", msg));
    room.onMessage("spawnEnemy", (msg) => this.emit("spawnEnemy", msg));
    room.onMessage("gameState", (msg) => this.emit("gameStateUpdate", msg));
    room.onMessage("gameEnd", (msg) => this.emit("gameEnd", msg));
  }

  private syncState(state: any) {
    if (!this.room) return;

    // Sync players
    const players: Actor[] = [];
    state.players.forEach((p: any, sessionId: string) => {
      players.push({
        session_id: sessionId,
        name: p.name,
        properties: {
          headIconUrl: p.headIconUrl,
          displayName: p.displayName,
          player_ready: p.ready ? "1" : "0",
          joinOrder: String(p.joinOrder || 0)
        }
      });
    });

    // Sort by joinOrder to maintain join sequence (P1=0, P2=1, etc)
    this.room.actors = players.sort((a, b) => {
      const aOrder = parseInt((a.properties?.joinOrder as string) || "0");
      const bOrder = parseInt((b.properties?.joinOrder as string) || "0");
      return aOrder - bOrder;
    });

    // Sync properties
    if (state.properties) {
      const props: Record<string, any> = {};
      state.properties.forEach((val: any, key: string) => {
        props[key] = val;
      });
      console.log("[Play] syncState properties:", props);
      this.room.properties = { ...(this.room.properties || {}), ...props };
    }

    this.emit("roomUpdated", this.room);
  }
}