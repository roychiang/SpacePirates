import { Control, Grid, StackPanel, Button, TextBlock, InputText, Ellipse, Image, Rectangle, Checkbox } from "@babylonjs/gui"
import { Parameters } from "../Parameters"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { Assets } from "../Assets"
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
    const adt = this._adt
    authService.initClient({ clientId: "4p4wmv9d5z", domain: "account.htcvive.com", cookieDomain: window.location.hostname })
    playService.newMatchmakingClient("4p4wmv9d5z", true).then(() => {
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
    GuiFramework.createPageTitle(this.pvpMode ? "SELECT ROOM [PVP]" : "SELECT ROOM [CO-OP]", content)
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
    // Players Online under username
    const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
    let playersText = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline") as TextBlock
    if (!playersText) {
      playersText = new TextBlock("globalPlayersOnline", "Players Online: --")
      GuiFramework.setFont(playersText, true, true)
      playersText.color = "#a6fffa"
      playersText.fontSize = 24
      playersText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      playersText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
      playersText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      playersText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
      playersText.isHitTestVisible = false
      playersText.width = "300px"
      playersText.height = "30px"
      playersText.textWrapping = false
      playersText.topInPixels = 26
      avatarGrid.addControl(playersText, 1, 1)
    }
    ;(this as any)._playersOnlineText = playersText
    const updatePlayers = () => {
      playService.getAvailableRooms().then(res => {
        const rooms = (res && res.rooms) ? res.rooms : []
        const appId = playService.getAppId()
        const filtered = rooms.filter((r: any) => {
          const sameApp = typeof r.app_id === "string" ? (r.app_id === appId) : false
          const sameGame = !!(r.properties && r.properties["gameId"] === "SpacePirates")
          return sameApp || sameGame
        })
        const total = filtered.reduce((acc: number, r: any) => acc + ((Array.isArray(r.actors) ? r.actors.length : 0) || 0), 0)
        const t = (this as any)._playersOnlineText as TextBlock
        if (t) {
             t.text = ""
             t.text = `Players Online: ${total}`
        }
      }).catch(() => {})
    }
    updatePlayers()
    if ((this as any)._playersTimer) window.clearInterval((this as any)._playersTimer)
    ;(this as any)._playersTimer = window.setInterval(updatePlayers, 2000)

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
      console.log("[UI] Creating room with properties:", JSON.stringify(roomProperties));
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
      if (target && (
          (Array.isArray(target.actors) && target.actors.length >= (target.max_players || 2)) ||
          (target.properties && (target.properties.playing || target.properties.game_started))
         )) {
        console.log("[UI] join blocked: room full or playing", { id: rid })
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
    // Mute button (Upper Right)
        const muteBtn = GuiFramework.createImageButton("mute_icon", Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_on.svg"));
        muteBtn.width = "60px";
        muteBtn.height = "60px";
        muteBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        muteBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        muteBtn.left = "-20px";
        muteBtn.top = "20px";
        if (muteBtn.image) { muteBtn.image.width = "60px"; muteBtn.image.height = "60px"; }
        if (playService.voiceManager.isMuted()) {
             muteBtn.image!.source = Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_off.svg");
        }
        muteBtn.onPointerClickObservable.add(() => {
             const isMuted = playService.voiceManager.toggleMute();
             if (isMuted) {
                 muteBtn.image!.source = Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_off.svg");
             } else {
                 muteBtn.image!.source = Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_on.svg");
             }
        });
        this._adt.addControl(muteBtn);

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
    if ((this as any)._playersTimer) window.clearInterval((this as any)._playersTimer)
    if ((this as any)._playersOnlineText) {
      const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt!) // Use existing adt or global
      avatarGrid.removeControl((this as any)._playersOnlineText)
      ;(this as any)._playersOnlineText = undefined
    }
  }

  private async refreshRooms(roomsOverride?: any[]) {
    console.log("[UI] refreshRooms called", { hasOverride: !!roomsOverride, count: roomsOverride ? roomsOverride.length : "undefined", pvpMode: this.pvpMode })
    const res = roomsOverride ? { rooms: roomsOverride } : await playService.getAvailableRooms()

    // Filter rooms by game mode
    const expectedMode = this.pvpMode ? "pvp" : "coop"
    const allRooms = res.rooms || []
    let filteredRooms = allRooms.filter((r: any) => {
      // Check both properties (mapped from metadata) and metadata directly if available
      const props = r.properties || r.metadata || {}
      const roomMode = props.game_mode || "coop" // Default to coop if not set
      const matches = roomMode === expectedMode
      console.log("[UI] Room filter check:", { roomId: r.id, roomName: r.name, roomMode, expectedMode, matches, properties: props })
      return matches
    })
    filteredRooms = filteredRooms.filter((r: any) => {
      const actorList = (r.actors || [])
      const count = Array.isArray(actorList) ? actorList.length : 0
      return count > 0 && !r.is_closed
    })

    this.listedRooms = filteredRooms
    console.log("[UI] Filtered rooms:", { total: allRooms.length, filtered: filteredRooms.length, mode: expectedMode })

    if (Array.isArray(filteredRooms)) {
      console.log("[UI] rooms detail", filteredRooms.map((r: any) => ({ id: r.id, name: r.name, mode: r.mode, game_mode: r.properties?.game_mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: (r.actors || []).map((a: any) => ({ name: a.name, ready: !!a.properties?.["ready"] })) })))
    }
    if (!this.roomsPanel) return
    this.roomsPanel.clearControls()

    const roomMap = new Map<string, any>();
    for (const rr of filteredRooms) {
      const id = String(rr.id || "")
      if (!id) continue
      
      const existing = roomMap.get(id);
      const rActors = (rr.actors && Array.isArray(rr.actors)) ? rr.actors.length : 0;
      const eActors = (existing && existing.actors && Array.isArray(existing.actors)) ? existing.actors.length : -1;

      // Prioritize room with more actors (likely more up-to-date)
      if (!existing || rActors > eActors) {
        roomMap.set(id, rr);
      }
    }
    const uniqueRooms = Array.from(roomMap.values());
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
      return (sameApp || sameGame)
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
      console.log("[UI] Room row:", { id: r.id, actors: actorList.length, playing: r.properties?.playing, started: r.properties?.game_started })
      // Enforce 2-player limit for UI status, regardless of server max_players (which might include AI slots)
      const canJoinRow = !r.is_closed && actorList.length < 2 && !(r.properties && (r.properties.playing || r.properties.game_started))
      row.addControl(container, 0, 0)
      const cb = new Checkbox()
      cb.isChecked = this.selectedRoomId === r.id
      cb.width = "32px"
      cb.height = "32px"
      cb.isEnabled = canJoinRow
      cb.color = canJoinRow ? "#2ecc71" : "#555555"
      cb.background = "#1a2a33"
      cb.thickness = 3
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
      title.fontSize = 24
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
        const url = (a.properties && typeof a.properties["headIconUrl"] === "string") ? String(a.properties["headIconUrl"]) : (a.headIconUrl || "")
        const img = new Image("", url)
        img.width = "44px"
        img.height = "44px"
        if (!url || url === "undefined" || url === "null") {
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
      
      let statusText = "Available";
      // Check if playing (locked or custom property)
      const isPlaying = r.properties && (r.properties.playing || r.properties.game_started);
      
      if (isPlaying) {
          statusText = "Playing";
      } else if (actorList.length >= 2 || r.is_closed) {
          statusText = "Full";
      }

      status.color = (statusText === "Available") ? "#2ecc71" : "#e74c3c"
      status.fontSize = 18
      status.text = statusText
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
    const canJoin = !!target && !target.is_closed && 
                    ((target.actors || []).length < 2) && 
                    !(target.properties && (target.properties.playing || target.properties.game_started))
    if (this.joinBtn) this.joinBtn.isEnabled = canJoin
  }

  private updatePanelTitle() {
    const header = this._adt?.getControlByName("panelTitle") as TextBlock
    if (header) {
      header.text = this.pvpMode ? "SELECT ROOM [PVP]" : "SELECT ROOM [CO-OP]"
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
