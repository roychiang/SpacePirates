import { Control, Grid, StackPanel, Button, TextBlock, InputText, Ellipse, Image, Rectangle, Checkbox } from "@babylonjs/gui"
import { Parameters } from "../Parameters"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { avatarService } from "../../Viverse/Viverse"
import { authService } from "../../Viverse/Viverse"
import { playService } from "../../Viverse/Viverse"
import { getViverse } from "../../Viverse/Viverse"

export class Matchmaking extends State {
  private roomIdInput?: InputText
  private roomsPanel?: StackPanel
  private roomsTimer?: number
  private sdkStatus?: TextBlock
  private selectedRoomId?: string
  private listedRooms: any[] = []
  private joinBtn?: Button
  private onConnected = async () => { await this.ensureActor(); /* this.refreshRooms() removed to avoid overwriting event data */ }
  private onRoomListUpdated = (payload: any) => { const rooms = (payload && payload.rooms) ? payload.rooms : []; this.refreshRooms(rooms) }
  public pvpMode: boolean = false // Track whether PvP or Co-op mode is selected

  public enter() {
    super.enter()
    if (!this._adt) return
    authService.initClient({ clientId: "v48pybqy7f", domain: "account.htcvive.com", cookieDomain: window.location.hostname })
    playService.newMatchmakingClient("v48pybqy7f", true).then(() => {
      ; (playService as any).off?.("connected", this.onConnected)
        ; (playService as any).off?.("roomListUpdated", this.onRoomListUpdated)
      playService.on("connected", this.onConnected)
      playService.on("roomListUpdated", this.onRoomListUpdated)
      // Initial refresh
      this.refreshRooms()
      // Set up periodic refresh every 2 seconds
      if (this.roomsTimer) window.clearInterval(this.roomsTimer)
      this.roomsTimer = window.setInterval(() => this.refreshRooms(), 2000)
    })
    GuiFramework.setOrientation(this._adt)
    GuiFramework.createBottomBar(this._adt)
    GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
    const root = new Grid()
    GuiFramework.formatButtonGrid(root)
    const panel = new StackPanel()
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
    root.addControl(panel, 0, 0)
    const content = GuiFramework.createTextPanel(root)
    GuiFramework.createPageTitle("Matchmaking", content)
    console.log("[UI] SDK", !!getViverse(), "TOKEN", false)
    this.roomsPanel = new StackPanel()
    this.roomsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
    content.addControl(this.roomsPanel, 1, 1)
    const actions = new Grid()
    actions.addRowDefinition(70, true)
    actions.addRowDefinition(70, true)
    actions.addRowDefinition(70, true)
    actions.addColumnDefinition(1.0, false)
    this.roomIdInput = new InputText()
    GuiFramework.setFont(this.roomIdInput, true, true)
    this.roomIdInput.placeholderText = "ROOM ID"
    this.roomIdInput.width = 0.6
    this.roomIdInput.height = 0.3
    this.roomIdInput.color = "#a6fffa"
    this.roomIdInput.background = "#1a2a33"
    actions.addControl(this.roomIdInput, 0, 0)

    const pvpPanel = new StackPanel();
    pvpPanel.isVertical = false;
    pvpPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    pvpPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

    const pvpCheckbox = new Checkbox();
    pvpCheckbox.width = "20px";
    pvpCheckbox.height = "20px";
    pvpCheckbox.isChecked = this.pvpMode;
    pvpCheckbox.color = "#a6fffa";
    pvpCheckbox.onIsCheckedChangedObservable.add((value) => {
      this.pvpMode = value;
      this.updatePanelTitle();
      this.refreshRooms();
    });
    pvpPanel.addControl(pvpCheckbox);

    const pvpLabel = new TextBlock();
    pvpLabel.text = "PvP Mode";
    pvpLabel.color = "white";
    pvpLabel.fontSize = 18;
    pvpLabel.paddingLeft = "10px";
    pvpPanel.addControl(pvpLabel);

    actions.addControl(pvpPanel, 1, 0);

    const createBtn = GuiFramework.addButton("Create Room", panel)
    this.joinBtn = GuiFramework.addButton("Join Room", panel)
    this.joinBtn.isEnabled = false
    const cancelBtn = GuiFramework.addButton("Cancel", panel)
    createBtn.onPointerDownObservable.add(async () => {
      let name = "Guest_" + Math.floor(Math.random() * 1000)
      let url = ""
      let sessionId = Math.random().toString(36).slice(2)

      try {
        const token = await authService.getToken()
        if (token) {
          avatarService.init(token)
          name = await authService.getDisplayName(token)
          const profile = await avatarService.getProfile()
          url = avatarService.getHeadIconUrlOrDefault(profile)
          sessionId = await authService.getAccountId() || sessionId
        }
      } catch (e) {
        console.warn("[UI] Auth failed, using mock", e)
      }

      console.log("[UI] create room start", { name, sessionId, pvpMode: this.pvpMode })
      await playService.setActor({ session_id: sessionId, name, properties: { ready: 0, headIconUrl: url, displayName: name } })
      const roomProperties = {
        owner: name,
        gameId: "SpacePirates",
        game_mode: this.pvpMode ? "pvp" : "coop"
      };
      console.log("[UI] Creating room with properties:", roomProperties);
      const res = await playService.createRoom({
        name,
        mode: "team",
        maxPlayers: 2,
        minPlayers: 2,
        properties: roomProperties
      })
      if (!res.success) {
        console.log("[UI] create room failed", res.message)
        // TODO: Show error message to user
        return
      }
      await playService.ensureActorPresentInRoom()
      console.log("[UI] create room done")
      State.setCurrent(States.lobby)
    })
    this.joinBtn.onPointerDownObservable.add(async () => {
      let name = "Guest_" + Math.floor(Math.random() * 1000)
      let url = ""
      let sessionId = Math.random().toString(36).slice(2)

      try {
        const token = await authService.getToken()
        if (token) {
          avatarService.init(token)
          name = await authService.getDisplayName(token)
          const profile = await avatarService.getProfile()
          url = avatarService.getHeadIconUrlOrDefault(profile)
          sessionId = await authService.getAccountId() || sessionId
        }
      } catch (e) {
        console.warn("[UI] Auth failed, using mock", e)
      }

      await playService.setActor({ session_id: sessionId, name, properties: { ready: 0, headIconUrl: url, displayName: name } })
      const rid = this.selectedRoomId || (this.roomIdInput ? this.roomIdInput.text : "")
      const target = (this.listedRooms || []).find(r => r.id === rid)
      if (target && Array.isArray(target.actors) && target.actors.length >= (target.max_players || 2)) {
        console.log("[UI] join blocked: room full", { id: rid, count: target.actors.length })
        return
      }
      const res = await playService.joinRoom(rid || "room")
      if (!res.success) {
        console.log("[UI] join room failed", res.message)
        // TODO: Show error message to user
        return
      }
      await playService.ensureActorPresentInRoom()
      State.setCurrent(States.lobby)
    })
    cancelBtn.onPointerDownObservable.add(() => {
      State.setCurrent(States.main)
    })
    this._adt.addControl(root)
    this.loadStatus()
    // Removed polling timer - we get real-time updates from onRoomListUpdate event
    // this.roomsTimer = window.setInterval(() => this.refreshRooms(), 2000)
  }

  private async loadStatus() {
    console.log("[UI] Matchmaking loadStatus start")
    let name = "Guest"
    let url = ""
    let token: string | undefined

    try {
      const info = await authService.checkAuth()
      token = info ? info.access_token : undefined
      if (token) {
        avatarService.init(token)
        name = await authService.getDisplayName(token)
        const profile = await avatarService.getProfile()
        url = avatarService.getHeadIconUrlOrDefault(profile)
      }
    } catch (e) {
      console.warn("[UI] Auth failed (expected on localhost), using mock identity", e)
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        name = "Guest_" + Math.floor(Math.random() * 1000)
      }
    }

    console.log("[UI] Matchmaking profile", { name, url, hasToken: !!token })
    const header = this._adt?.getControlByName("panelTitle") as TextBlock
    if (header) this.updatePanelTitle()
    console.log("[UI] SDK", !!getViverse(), "TOKEN", !!token)
    GuiFramework.updateTopLeftAvatar(name, url)
    // title handled by createPageTitle
  }

  public exit() {
    super.exit()
    if (this.roomsTimer) window.clearInterval(this.roomsTimer)
      ; (playService as any).off?.("connected", this.onConnected)
      ; (playService as any).off?.("roomListUpdated", this.onRoomListUpdated)
  }

  private async refreshRooms(roomsOverride?: any[]) {
    console.log("[UI] refreshRooms called", { hasOverride: !!roomsOverride, count: roomsOverride ? roomsOverride.length : "undefined", pvpMode: this.pvpMode })
    const res = roomsOverride ? { rooms: roomsOverride } : await playService.getAvailableRooms()

    // Filter rooms by game mode
    const expectedMode = this.pvpMode ? "pvp" : "coop"
    const allRooms = res.rooms || []
    const filteredRooms = allRooms.filter((r: any) => {
      const roomMode = r.properties?.game_mode || "coop" // Default to coop if not set
      const matches = roomMode === expectedMode
      console.log("[UI] Room filter check:", { roomId: r.id, roomName: r.name, roomMode, expectedMode, matches, properties: r.properties })
      return matches
    })

    this.listedRooms = filteredRooms
    console.log("[UI] Filtered rooms:", { total: allRooms.length, filtered: filteredRooms.length, mode: expectedMode })

    if (Array.isArray(filteredRooms)) {
      console.log("[UI] rooms detail", filteredRooms.map((r: any) => ({ id: r.id, name: r.name, mode: r.mode, game_mode: r.properties?.game_mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: (r.actors || []).map((a: any) => ({ name: a.name, ready: !!a.properties?.["ready"] })) })))
    }
    if (!this.roomsPanel) return
    this.roomsPanel.clearControls()

    const memo: Record<string, boolean> = {}
    const uniqueRooms: any[] = []
    for (const rr of filteredRooms) {
      const id = String(rr.id || "")
      if (!id) continue
      if (memo[id]) continue
      memo[id] = true
      uniqueRooms.push(rr)
    }
    const appId = playService.getAppId()
    const byOwner: Record<string, any> = {}
    for (const rr of uniqueRooms) {
      if (rr.app_id !== appId) continue
      const ownerKey = String((rr.name) || (rr.properties && rr.properties["owner"]) || rr.master_client_id || rr.id)
      const current = byOwner[ownerKey]
      if (!current) {
        byOwner[ownerKey] = rr
      } else {
        const ca = Array.isArray(current.actors) ? current.actors.length : 0
        const ra = Array.isArray(rr.actors) ? rr.actors.length : 0
        byOwner[ownerKey] = ra >= ca ? rr : current
      }
    }
    const ownerRooms: any[] = []
    for (const k in byOwner) {
      if (Object.prototype.hasOwnProperty.call(byOwner, k)) ownerRooms.push(byOwner[k])
    }
    const displayedRooms = ownerRooms.filter((rr: any) => {
      const sameApp = typeof rr.app_id === "string" ? (rr.app_id === appId) : false
      const sameGame = !!(rr.properties && rr.properties["gameId"] === "SpacePirates")
      return !rr.is_closed && (sameApp || sameGame)
    })
      .sort((a: any, b: any) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
    for (const r of displayedRooms) {
      const row = new Grid()
      row.addColumnDefinition(0.12, false)
      row.addColumnDefinition(0.5, false)
      row.addColumnDefinition(0.28, false)
      row.addColumnDefinition(0.1, false)
      row.height = "60px"
      row.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
      const container = new Rectangle()
      container.thickness = 0
      container.background = (this.selectedRoomId === r.id) ? "#2a3f4d" : "#1a2a33"
      container.height = "60px"
      const actorList = (r.actors || [])
      const canJoinRow = !r.is_closed && actorList.length < (r.max_players || 2)
      row.addControl(container, 0, 0)
      const cb = new Checkbox()
      cb.isChecked = this.selectedRoomId === r.id
      cb.width = "24px"
      cb.height = "24px"
      cb.isEnabled = canJoinRow
      cb.color = canJoinRow ? "#2ecc71" : "#555555"
      cb.background = "#1a2a33"
      cb.thickness = 2
      cb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      cb.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
      cb.onIsCheckedChangedObservable.add((val) => {
        console.log("[UI] Checkbox changed", { id: r.id, val, selected: this.selectedRoomId })
        if (!canJoinRow) return
        this.selectedRoomId = val ? r.id : ""
        this.updateJoinButtonState()
        this.refreshRooms(this.listedRooms)
      })
      row.addControl(cb, 0, 0)
      const title = new TextBlock()
      GuiFramework.setFont(title, true, true)
      title.color = "white"
      title.fontSize = 22
      const modeStr = (r.properties && r.properties.game_mode === "pvp") ? "[PvP]" : "[CO-OP]"
      title.text = `${modeStr} ${r.name || r.id}`
      title.paddingLeft = 10
      row.addControl(title, 0, 1)
      const avatars = new StackPanel()
      avatars.isVertical = false
      avatars.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      avatars.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
      for (const a of actorList) {
        const cell = new Rectangle()
        cell.width = "44px"
        cell.height = "44px"
        cell.thickness = 0
        cell.cornerRadius = 22
        cell.background = "#1b2b33"
        const img = new Image("", (a.properties && typeof a.properties["headIconUrl"] === "string") ? String(a.properties["headIconUrl"]) : "")
        img.width = "44px"
        img.height = "44px"
        if (!img.source) {
          const q = new TextBlock()
          GuiFramework.setFont(q, true, true)
          q.color = "#4f73ff"
          q.fontSize = 28
          q.text = "?"
          q.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
          q.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
          cell.addControl(q)
        }
        cell.addControl(img)
        avatars.addControl(cell)
      }
      row.addControl(avatars, 0, 2)
      const canJoin = canJoinRow
      const status = new TextBlock()
      GuiFramework.setFont(status, true, true)
      status.color = canJoin ? "#2ecc71" : "#e74c3c"
      status.fontSize = 18
      status.text = canJoin ? "Join" : "Full"
      status.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      status.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
      row.addControl(status, 0, 3)
      this.roomsPanel.addControl(row)
    }
    this.updateJoinButtonState()
  }

  private updateJoinButtonState() {
    const rid = this.selectedRoomId || (this.roomIdInput ? this.roomIdInput.text : "")
    const target = (this.listedRooms || []).find(r => r.id === rid)
    const canJoin = !!target && !target.is_closed && ((target.actors || []).length < (target.max_players || 2))
    if (this.joinBtn) this.joinBtn.isEnabled = canJoin
  }

  private updatePanelTitle() {
    const header = this._adt?.getControlByName("panelTitle") as TextBlock
    if (header) {
      header.text = this.pvpMode ? "MATCHMAKING [PvP]" : "MATCHMAKING [CO-OP]"
    }
  }

  private async ensureActor() {
    const token = await authService.getToken()
    avatarService.init(token)
    const name = await authService.getDisplayName(token)
    const profile = await avatarService.getProfile()
    const url = avatarService.getHeadIconUrlOrDefault(profile)
    const sessionId = await authService.getAccountId() || Math.random().toString(36).slice(2)
    await playService.setActor({ session_id: sessionId, name, properties: { ready: 0, headIconUrl: url, displayName: name } })
  }
}