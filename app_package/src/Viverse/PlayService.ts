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
  private play: any
  private client: any
  private mpClient: any
  private appId = "v48pybqy7f"
  private actorsRefreshTimer?: number
  private actorsRefreshing: boolean = false

  init(): void { }

  async newMatchmakingClient(appId: string, debug?: boolean): Promise<void> {
    this.appId = appId || this.appId
    const sdk = getViverse()
    if (sdk && typeof (sdk as any).Play === "function") {
      try {
        console.log("[Play] newMatchmakingClient start", { appId: this.appId, debug })
        this.play = new (sdk as any).Play()
        this.client = await this.play.newMatchmakingClient(this.appId, debug)
        console.log("[Play] newMatchmakingClient ready", { hasClient: !!this.client })
        if (this.client && typeof this.client.on === "function") {
          try {
            this.client.on("onConnect", async () => {
              this.connected = true
              console.log("[Play] onConnect")
              this.emit("connected")
            })
            if (typeof (this.client as any).on === "function") {
              try {
                this.client.on("onDisconnect", () => {
                  this.connected = false
                  console.log("[Play] onDisconnect")
                  this.room = undefined as any
                  this.emit("roomUpdated", this.room)
                  this.emit("roomListUpdated", { rooms: [] })
                })
              } catch { }
            }
            this.client.on("onRoomListUpdate", (rooms: Room[]) => {
              console.log("[Play] onRoomListUpdate", Array.isArray(rooms) ? rooms.length : 0)
              this.emit("roomListUpdated", { rooms })
            })
            this.client.on("onRoomActorChange", async (payload: any) => {
              try { console.log("[Play] onRoomActorChange", payload) } catch { }
              try {
                if (Array.isArray(payload) || (payload && Array.isArray(payload.actors))) {
                  const incoming: Actor[] = Array.isArray(payload) ? (payload as Actor[]) : (payload.actors as Actor[])
                  const prev = Array.isArray(this.room?.actors) ? (this.room!.actors as Actor[]) : []
                  const byId: Record<string, Actor> = {}
                  for (const p of prev) byId[p.session_id] = p
                  for (const a of (incoming || [])) {
                    const prevMatch = byId[a.session_id]
                    const isMe = !!this.actor && a.session_id === this.actor!.session_id
                    const fromProps = (a as any)?.properties && typeof (a as any).properties["displayName"] === "string" ? String((a as any).properties["displayName"]) : ""
                    const name = (isMe && this.actor!.name) || (a.name && String(a.name)) || fromProps || (prevMatch ? prevMatch.name : "")
                    const mergedProps = this.mergeProps(prevMatch?.properties, a.properties, isMe)
                    byId[a.session_id] = { ...a, name: name && name.length > 0 ? name : (a.session_id ? a.session_id.slice(0, 8) : "Player"), properties: mergedProps }
                  }
                  const merged = Object.keys(byId).map(k => byId[k])
                  if (this.room) this.room.actors = merged
                  this.emit("roomUpdated", this.room)
                  return
                }
              } catch (e) {
                console.log("[Play] onRoomActorChange payload apply error", e)
              }
              this.scheduleActorsRefresh()
            })
          } catch (e) {
            console.log("[Play] bind events error", e)
          }
        }
      } catch (e) {
        console.log("[Play] newMatchmakingClient error", e)
      }
    } else {
      this.play = undefined
      this.client = undefined
      console.log("[Play] viverse.Play not available")
    }
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
    if (this.client && typeof this.client.setActor === "function") {
      try {
        console.log("[Play] setActor", actor)
        await this.waitConnected()
        await this.client.setActor(actor)
      } catch (e) {
        console.log("[Play] setActor error", e)
      }
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
    try {
      this.actor.properties = { ...(this.actor.properties || {}), player_ready: ready ? "1" : "0" }
      try { console.log("[Play] setReady", { session_id: this.actor.session_id, ready }) } catch { }
      if (this.client && typeof this.client.setActor === "function") {
        await this.waitConnected()
        await this.client.setActor(this.actor)
      }
      if (this.room && Array.isArray(this.room.actors)) {
        const idx = this.room.actors.findIndex(a => a.session_id === this.actor!.session_id)
        if (idx >= 0) {
          const a = this.room.actors[idx]
          this.room.actors[idx] = { ...a, properties: { ...(a.properties || {}), player_ready: ready ? "1" : "0" } }
        } else {
          this.room.actors = (this.room.actors || []).concat([this.actor])
        }
      }
      this.emit("readyStateChanged", { session_id: this.actor.session_id, ready })
      return { success: true }
    } catch (e) {
      console.log("[Play] setReady error", e)
      return { success: false }
    }
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
        await this.waitConnected()
        const expiresAt = Date.now() + (30 * 60 * 1000)
        const payload = { ...cfg, properties: { ...(cfg.properties || {}), open: true, visibility: "public", gameId: "SpacePirates", ownerName: cfg.name, expiresAt } }
        console.log("[Play] createRoom", payload)
        const res = await this.client.createRoom(payload)
        console.log("[Play] createRoom result", res)
        this.room = res?.room || this.room
        if (this.room) {
          if (!Array.isArray(this.room.actors) || this.room.actors.length === 0) {
            if (this.actor) this.room.actors = [this.actor]
          }
          if (this.room.properties) {
            if (typeof this.room.properties["expiresAt"] !== "number") this.room.properties["expiresAt"] = expiresAt
            if (typeof this.room.properties["ownerName"] !== "string") this.room.properties["ownerName"] = cfg.name
          }
          if ((!this.room.master_client_id || this.room.master_client_id === "") && this.actor) {
            this.room.master_client_id = this.actor.session_id
          }
          if (this.client && typeof this.client.joinRoom === "function" && this.actor) {
            try {
              const hasMe = !!this.room.actors.find(a => a.session_id === this.actor!.session_id)
              if (!hasMe) {
                await this.waitConnected()
                const j = await this.client.joinRoom(this.room.id)
                console.log("[Play] auto-join after create", j)
                this.room = j?.room || this.room
                if (this.room && this.actor && (!Array.isArray(this.room.actors) || !this.room.actors.find(a => a.session_id === this.actor!.session_id))) {
                  this.room.actors = (this.room.actors || []).concat([this.actor])
                }
              }
            } catch (e) {
              console.log("[Play] auto-join error", e)
            }
          }
        }
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
      properties: { ...(cfg.properties || {}), open: true, visibility: "public", gameId: "SpacePirates", ownerName: cfg.name, expiresAt: Date.now() + (30 * 60 * 1000) },
      master_client_id: this.actor ? this.actor.session_id : "",
      game_session: "",
      created_by_me: true
    }
    this.room = room
    this.emit("roomUpdated", room)
    return { success: true, room }
  }

  async updateRoomProperties(props: Record<string, any>): Promise<{ success: boolean; message?: string }> {
    if (this.client && typeof this.client.updateRoom === "function" && this.room) {
      try {
        await this.waitConnected()
        const payload = { id: this.room.id, properties: { ...(this.room.properties || {}), ...props } }
        console.log("[Play] updateRoomProperties", payload)
        const res = await this.client.updateRoom(payload)
        console.log("[Play] updateRoomProperties result", res)
        this.room = res?.room || this.room
        this.emit("roomUpdated", this.room)
        return { success: !!res?.room, message: res?.message }
      } catch (e) {
        console.log("[Play] updateRoomProperties error", e)
        return { success: false, message: String(e) }
      }
    }
    // Fallback for local testing or if client not available
    if (this.room) {
      this.room.properties = { ...(this.room.properties || {}), ...props }
      this.emit("roomUpdated", this.room)
      return { success: true }
    }
    return { success: false, message: "no room" }
  }

  async joinRoom(roomId: string): Promise<JoinRoomResult> {
    if (this.client && typeof this.client.joinRoom === "function") {
      try {
        console.log("[Play] joinRoom", roomId)
        await this.waitConnected()
        const res = await this.client.joinRoom(roomId)
        console.log("[Play] joinRoom result", res)
        this.room = res?.room || this.room
        if (this.room) {
          if (this.actor && (!Array.isArray(this.room.actors) || !this.room.actors.find(a => a.session_id === this.actor!.session_id))) {
            this.room.actors = (this.room.actors || []).concat([this.actor])
          }
          if ((!this.room.master_client_id || this.room.master_client_id === "") && this.actor) {
            this.room.master_client_id = this.actor.session_id
          }
        }
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
    const amOwner = !!this.actor && !!this.room && this.room.master_client_id === this.actor.session_id
    if (amOwner && this.client && typeof this.client.closeRoom === "function") {
      try {
        await this.waitConnected()
        const res = await this.client.closeRoom()
        console.log("[Play] closeRoom result", res)
      } catch (e) {
        console.log("[Play] closeRoom error", e)
      }
    }
    if (this.client && typeof this.client.leaveRoom === "function") {
      try {
        await this.waitConnected()
        const res = await this.client.leaveRoom()
        console.log("[Play] leaveRoom result", res)
        return { success: true, message: res?.message }
      } catch (e) {
        console.log("[Play] leaveRoom error", e)
      }
    }
    if (this.actor && this.room) {
      this.room.actors = this.room.actors.filter(a => a.session_id !== this.actor!.session_id)
      if (this.room.actors.length === 0) {
        console.log("[Play] room empty, removing")
        this.room = undefined as any
      }
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

  getRoom(): Room | undefined {
    return this.room
  }

  async startMultiplayer(): Promise<{ success: boolean }> {
    const roomId = this.room?.id || ""
    const sdk = getViverse()
    if (sdk && (sdk as any).Play && typeof (sdk as any).Play.MultiplayerClient === "function" && roomId) {
      try {
        console.log("[Net] MultiplayerClient start", { roomId, appId: this.appId })
        this.mpClient = new (sdk as any).Play.MultiplayerClient(roomId, this.appId)
        if (typeof this.mpClient.init === "function") {
          await this.mpClient.init()
        }
        console.log("[Net] MultiplayerClient ready", { hasClient: !!this.mpClient })
        if (this.mpClient && typeof this.mpClient.on === "function") {
          try {
            this.mpClient.on("onMessage", (msg: any) => {
              try {
                const data = typeof msg === "string" ? JSON.parse(msg) : msg
                if (data && data.type === "input") {
                  this.emit("remoteInput", data.payload)
                }
                if (data && data.type === "shot") {
                  this.emit("remoteShot", data.payload)
                }
              } catch (e) {
                console.log("[Net] onMessage parse error", e)
              }
            })
          } catch (e) {
            console.log("[Net] bind mp events error", e)
          }
        }
        return { success: true }
      } catch (e) {
        console.log("[Net] MultiplayerClient error", e)
      }
    }
    console.log("[Net] multiplayer not available")
    return { success: false }
  }

  broadcastInput(payload: { index: number; dx: number; dy: number; shooting: boolean; burst: boolean; breaking: boolean; launchMissile?: boolean; immelmann?: boolean }) {
    const msg = JSON.stringify({ type: "input", payload })
    try {
      if (this.mpClient && typeof this.mpClient.sendMessage === "function") {
        this.mpClient.sendMessage(msg)
        return
      }
      if (this.mpClient && typeof this.mpClient.send === "function") {
        this.mpClient.send(msg)
        return
      }
      if (this.mpClient && typeof this.mpClient.broadcast === "function") {
        this.mpClient.broadcast(msg)
        return
      }
    } catch (e) {
      console.log("[Net] broadcastInput error", e)
    }
  }

  async getAvailableRooms(): Promise<{ success: boolean; rooms: Room[] }> {
    if (this.client && typeof this.client.getAvailableRooms === "function") {
      try {
        await this.waitConnected()
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const res = await this.client.getAvailableRooms()
        const t1 = performance.now()
        console.log("[Play] getAvailableRooms", { count: Array.isArray(res?.rooms) ? res.rooms.length : 0, ts, ms: Math.round(t1 - t0) })
        if (Array.isArray(res?.rooms)) {
          const list = (res.rooms || []) as Room[]
          console.log("[Play] rooms detail", list.map((r: Room) => ({ id: r.id, name: r.name, mode: r.mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: ((r.actors || []) as Actor[]).map((a: Actor) => ({ name: a.name, ready: a.properties?.["player_ready"] === 1 || a.properties?.["player_ready"] === "1" })) })))
        }
        return { success: true, rooms: res?.rooms || [] }
      } catch (e) {
        console.log("[Play] getAvailableRooms error", e)
      }
    }
    console.log("[Play] getAvailableRooms fallback", [])
    return { success: true, rooms: [] }
  }

  async getMyRoomActors(): Promise<{ success: boolean; actors: Actor[] }> {
    if (this.client && typeof this.client.getMyRoomActors === "function") {
      try {
        await this.waitConnected()
        const ts = new Date().toISOString()
        const t0 = performance.now()
        const res = await this.client.getMyRoomActors()
        const t1 = performance.now()
        console.log("[Play] getMyRoomActors", { count: Array.isArray(res?.actors) ? res.actors.length : 0, ts, ms: Math.round(t1 - t0) })
        let alist = Array.isArray(res?.actors) ? (res.actors as Actor[]) : []
        if (this.actor && (!Array.isArray(alist) || !alist.find((a: Actor) => a.session_id === this.actor!.session_id))) {
          alist = (alist || []).concat([this.actor])
        }
        const prev = Array.isArray(this.room?.actors) ? (this.room!.actors as Actor[]) : []
        alist = (alist || []).map((a: Actor) => {
          const prevMatch = prev.find((p: Actor) => p.session_id === a.session_id)
          const isMe = !!this.actor && a.session_id === this.actor!.session_id
          const fromProps = (a as any)?.properties && typeof (a as any).properties["displayName"] === "string" ? String((a as any).properties["displayName"]) : ""
          const name = (isMe && this.actor!.name) || (a.name && String(a.name)) || fromProps || (prevMatch ? prevMatch.name : "")
          const mergedProps = this.mergeProps(prevMatch?.properties, a.properties, isMe)
          return { ...a, name: name && name.length > 0 ? name : (a.session_id ? a.session_id.slice(0, 8) : "Player"), properties: mergedProps }
        })
        console.log("[Play] actors detail", alist.map((a: Actor) => ({ name: a.name, ready: this.isReady(a.properties?.["player_ready"]) })))
        // 合併 getAvailableRooms 中的我方房間資料，若其演員列表更完整或可補齊 ready
        if (this.client && typeof this.client.getAvailableRooms === "function" && this.room && this.room.id) {
          try {
            const resRooms = await this.client.getAvailableRooms()
            const my = Array.isArray(resRooms?.rooms) ? (resRooms.rooms as Room[]).find((r: Room) => r.id === this.room!.id) : undefined
            if (my && Array.isArray(my.actors)) {
              const repl = (my.actors as Actor[])
              const hasMissingReady = (alist || []).some((a: Actor) => typeof (a.properties || {})["player_ready"] === "undefined")
              const shouldMerge = repl.length >= alist.length || hasMissingReady
              if (shouldMerge) {
                const prev2 = Array.isArray(this.room?.actors) ? (this.room!.actors as Actor[]) : []
                const byId: Record<string, Actor> = {}
                for (const p of (alist || [])) byId[p.session_id] = p
                for (const a of (repl || [])) {
                  const prevMatch = byId[a.session_id] || prev2.find((p: Actor) => p.session_id === a.session_id)
                  const isMe = !!this.actor && a.session_id === this.actor!.session_id
                  const fromProps = (a as any)?.properties && typeof (a as any).properties["displayName"] === "string" ? String((a as any).properties["displayName"]) : ""
                  const name = (isMe && this.actor!.name) || (a.name && String(a.name)) || fromProps || (prevMatch ? (prevMatch as Actor).name : "")
                  const mergedProps = this.mergeProps((prevMatch as any)?.properties, a.properties, isMe)
                  byId[a.session_id] = { ...a, name: name && name.length > 0 ? name : (a.session_id ? a.session_id.slice(0, 8) : "Player"), properties: mergedProps }
                }
                alist = Object.keys(byId).map(k => byId[k])
              }
            }
          } catch { }
        }
        if (this.room) {
          this.room.actors = alist
        }
        if ((!alist || alist.length === 0) && this.room && Array.isArray(this.room.actors) && this.room.actors.length > 0) {
          console.log("[Play] getMyRoomActors server-empty, using local room actors", this.room.actors.map((a: Actor) => ({ name: a.name })))
          return { success: true, actors: this.room.actors }
        }
        return { success: true, actors: alist || [] }
      } catch (e) {
        console.log("[Play] getMyRoomActors error", e)
      }
    }
    const actors = this.room ? this.room.actors : []
    console.log("[Play] getMyRoomActors fallback", actors.map((a: Actor) => ({ name: a.name, ready: this.isReady(a.properties?.["player_ready"]) })))
    return { success: true, actors }
  }

  async ensureActorPresentInRoom(): Promise<void> {
    const actor = this.actor
    const room = this.room
    if (!actor || !room || !room.id) return
    try {
      const res = await this.getMyRoomActors()
      const list = res.actors || []
      const hasMe = !!list.find((a: Actor) => a.session_id === actor.session_id)
      if (!hasMe && this.client && typeof this.client.joinRoom === "function") {
        await this.waitConnected()
        const j = await this.client.joinRoom(room.id)
        const updated = j?.room || room
        const ulist = Array.isArray(updated.actors) ? updated.actors : []
        const present = !!ulist.find((a: Actor) => a.session_id === actor.session_id)
        this.room = { ...updated, actors: present ? ulist : ulist.concat([actor]) }
        this.emit("roomUpdated", this.room)
      }
    } catch { }
  }

  on(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot", handler: Handler) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  private emit(event: string, payload?: any) {
    const arr = this.listeners[event] || []
    for (const h of arr) h(payload)
  }

  off(event: "roomUpdated" | "actorJoined" | "actorLeft" | "readyStateChanged" | "connected" | "roomListUpdated" | "remoteInput" | "remoteShot", handler: Handler) {
    const arr = this.listeners[event] || []
    this.listeners[event] = arr.filter(h => h !== handler)
  }

  private scheduleActorsRefresh() {
    try {
      if (this.actorsRefreshTimer) { window.clearTimeout(this.actorsRefreshTimer); this.actorsRefreshTimer = undefined }
      this.actorsRefreshTimer = window.setTimeout(async () => {
        this.actorsRefreshTimer = undefined
        if (this.actorsRefreshing) return
        this.actorsRefreshing = true
        try {
          const res = await this.getMyRoomActors()
          if (this.room) {
            this.room.actors = res.actors || this.room.actors
          }
        } catch (e) {
          console.log("[Play] actors refresh error", e)
        }
        this.actorsRefreshing = false
        this.emit("roomUpdated", this.room)
      }, 150)
    } catch { }
  }

  private isReady(val: any): boolean {
    return val === 1 || val === "1" || val === true
  }

  private mergeProps(prevProps?: Record<string, number | string>, newProps?: Record<string, number | string>, isMe?: boolean): Record<string, number | string> {
    const p = prevProps || {}
    const n = newProps || {}
    const merged: Record<string, number | string> = { ...p, ...n }
    const m = this.mergeReady(p["player_ready"], n["player_ready"]) as any
    if (typeof m !== "undefined") merged["player_ready"] = m
    if (isMe && this.actor && this.actor.properties) {
      // Restore local override for Optimistic UI
      if (typeof this.actor.properties["player_ready"] !== "undefined") merged["player_ready"] = this.actor.properties["player_ready"] as any
      if (typeof this.actor.properties["headIconUrl"] === "string") merged["headIconUrl"] = this.actor.properties["headIconUrl"] as any
      if (typeof (this.actor as any).properties["displayName"] === "string") merged["displayName"] = (this.actor as any).properties["displayName"] as any
    }
    return merged
  }

  private mergeReady(prev: any, next: any): number | undefined {
    // Always prefer the new value from server (next) over cached value (prev)
    // This ensures ready state can toggle from 1 -> 0 and 0 -> 1
    if (typeof next !== 'undefined') {
      const n = this.isReady(next)
      const result = n ? 1 : 0
      console.log(`[Play] mergeReady: prev=${prev}, next=${next} => ${result}`)
      return result
    }
    // Only use prev if next is undefined
    if (typeof prev !== 'undefined') {
      const p = this.isReady(prev)
      const result = p ? 1 : 0
      console.log(`[Play] mergeReady: prev=${prev}, next=undefined => ${result}`)
      return result
    }
    console.log(`[Play] mergeReady: prev=undefined, next=undefined => undefined`)
    return undefined
  }
}
import { getViverse } from "./Viverse"