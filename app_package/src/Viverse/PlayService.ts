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
  private client: any
  private appId = "v48pybqy7f"

  init(): void {}

  async newMatchmakingClient(appId: string, debug?: boolean): Promise<void> {
    this.appId = appId || this.appId
    const playClient = getViverse()?.playClient
    if (playClient && typeof playClient.newMatchmakingClient === "function") {
      try {
        console.log("[Play] newMatchmakingClient start", { appId: this.appId, debug })
        this.client = await playClient.newMatchmakingClient(this.appId, debug)
        console.log("[Play] newMatchmakingClient ready", { hasClient: !!this.client })
      } catch (e) {
        console.log("[Play] newMatchmakingClient error", e)
      }
    } else {
      this.client = undefined
      console.log("[Play] playClient.newMatchmakingClient not available")
    }
  }

  async setActor(actor: Actor): Promise<{ success: boolean; message?: string }> {
    this.actor = actor
    if (this.client && typeof this.client.setActor === "function") {
      try {
        console.log("[Play] setActor", actor)
        await this.client.setActor(actor)
      } catch (e) {
        console.log("[Play] setActor error", e)
      }
    }
    this.emit("actorJoined", actor)
    return { success: true }
  }

  async createRoom(cfg: {
    name: string
    mode: "team"
    maxPlayers: number
    minPlayers: number
    properties?: Record<string, any>
  }): Promise<CreateRoomResult> {
    if (this.client && typeof this.client.createRoom === "function") {
      try {
        console.log("[Play] createRoom", cfg)
        const res = await this.client.createRoom(cfg)
        console.log("[Play] createRoom result", res)
        this.room = res?.room || this.room
        this.emit("roomUpdated", this.room)
        return { success: !!res?.room, room: this.room, message: res?.message }
      } catch (e) {
        console.log("[Play] createRoom error", e)
      }
    }
    const id = Math.random().toString(36).slice(2)
    const room: Room = {
      id,
      app_id: this.appId,
      mode: "team",
      name: cfg.name,
      actors: this.actor ? [this.actor] : [],
      max_players: cfg.maxPlayers,
      min_players: cfg.minPlayers,
      is_closed: false,
      properties: cfg.properties || {},
      master_client_id: this.actor ? this.actor.session_id : "",
      game_session: "",
      created_by_me: true
    }
    this.room = room
    this.emit("roomUpdated", room)
    return { success: true, room }
  }

  async joinRoom(roomId: string): Promise<JoinRoomResult> {
    if (this.client && typeof this.client.joinRoom === "function") {
      try {
        console.log("[Play] joinRoom", roomId)
        const res = await this.client.joinRoom(roomId)
        console.log("[Play] joinRoom result", res)
        this.room = res?.room || this.room
        this.emit("roomUpdated", this.room)
        return { success: !!res?.room, room: this.room, message: res?.message }
      } catch (e) {
        console.log("[Play] joinRoom error", e)
      }
    }
    if (!this.room || this.room.id !== roomId) {
      if (!this.actor) return { success: false, message: "no actor" }
      const room: Room = {
        id: roomId,
        app_id: this.appId,
        mode: "team",
        name: roomId,
        actors: [this.actor],
        max_players: 2,
        min_players: 2,
        is_closed: false,
        properties: {},
        master_client_id: this.actor.session_id,
        game_session: "",
        created_by_me: false
      }
      this.room = room
    } else {
      if (this.actor && !this.room.actors.find(a => a.session_id === this.actor!.session_id)) {
        this.room.actors.push(this.actor)
      }
    }
    this.emit("roomUpdated", this.room)
    return { success: true, room: this.room }
  }

  async leaveRoom(): Promise<{ success: boolean; message?: string }> {
    if (this.client && typeof this.client.leaveRoom === "function") {
      try {
        const res = await this.client.leaveRoom()
        console.log("[Play] leaveRoom result", res)
        return { success: true, message: res?.message }
      } catch (e) {
        console.log("[Play] leaveRoom error", e)
      }
    }
    if (this.actor && this.room) {
      this.room.actors = this.room.actors.filter(a => a.session_id !== this.actor!.session_id)
      this.emit("actorLeft", this.actor)
    }
    return { success: true }
  }

  async closeRoom(): Promise<{ success: boolean; message?: string }> {
    if (this.client && typeof this.client.closeRoom === "function") {
      try {
        const res = await this.client.closeRoom()
        console.log("[Play] closeRoom result", res)
        return { success: true, message: res?.message }
      } catch (e) {
        console.log("[Play] closeRoom error", e)
      }
    }
    if (this.room) this.room.is_closed = true
    this.emit("roomUpdated", this.room)
    return { success: true }
  }

  async getAvailableRooms(): Promise<{ success: boolean; rooms: Room[] }> {
    if (this.client && typeof this.client.getAvailableRooms === "function") {
      try {
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const res = await this.client.getAvailableRooms()
        const t1 = performance.now()
        console.log("[Play] getAvailableRooms", { count: Array.isArray(res?.rooms) ? res.rooms.length : 0, ts, ms: Math.round(t1 - t0) })
        if (Array.isArray(res?.rooms)) {
          const list = (res.rooms || []) as Room[]
          console.log("[Play] rooms detail", list.map((r: Room) => ({ id: r.id, name: r.name, mode: r.mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: ((r.actors || []) as Actor[]).map((a: Actor) => ({ name: a.name, ready: !!a.properties?.["ready"] })) })))
        }
        return { success: true, rooms: res?.rooms || [] }
      } catch (e) {
        console.log("[Play] getAvailableRooms error", e)
      }
    }
    const rooms = this.room ? [this.room] : []
    console.log("[Play] getAvailableRooms fallback", rooms.map((r: Room) => ({ id: r.id, name: r.name, mode: r.mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: ((r.actors || []) as Actor[]).map((a: Actor) => ({ name: a.name, ready: !!a.properties?.["ready"] })) })))
    return { success: true, rooms }
  }

  async getMyRoomActors(): Promise<{ success: boolean; actors: Actor[] }> {
    if (this.client && typeof this.client.getMyRoomActors === "function") {
      try {
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const res = await this.client.getMyRoomActors()
        const t1 = performance.now()
        console.log("[Play] getMyRoomActors", { count: Array.isArray(res?.actors) ? res.actors.length : 0, ts, ms: Math.round(t1 - t0) })
        if (Array.isArray(res?.actors)) {
          const alist = (res.actors || []) as Actor[]
          console.log("[Play] actors detail", alist.map((a: Actor) => ({ name: a.name, ready: !!a.properties?.["ready"] })))
        }
        return { success: true, actors: res?.actors || [] }
      } catch (e) {
        console.log("[Play] getMyRoomActors error", e)
      }
    }
    const actors = this.room ? this.room.actors : []
    console.log("[Play] getMyRoomActors fallback", actors.map((a: Actor) => ({ name: a.name, ready: !!a.properties?.["ready"] })))
    return { success: true, actors }
  }

  on(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged", handler: Handler) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  private emit(event: string, payload?: any) {
    const arr = this.listeners[event] || []
    for (const h of arr) h(payload)
  }
}
import { getViverse } from "./Viverse"