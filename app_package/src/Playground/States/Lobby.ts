import { Control, Grid, StackPanel, Button, TextBlock, Rectangle, Ellipse, Image } from "@babylonjs/gui"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { Assets } from "../Assets"
import { playService } from "../../Viverse/Viverse"
import { GameDefinition } from "../Game"
import { GameState } from "./GameState"
import { authService } from "../../Viverse/Viverse"
import { avatarService } from "../../Viverse/Viverse"
import { Parameters } from "../Parameters"

export class Lobby extends State {
  private playersPanel?: StackPanel
  private startBtn?: Button
  private startTimer?: number
  private refreshTimer?: number
  private isStarting = false
  private onRoomUpdated = () => this.refresh()
  private onActorJoined = () => this.refresh()
  private onActorLeft = () => this.refresh()
  private onReadyChanged = () => this.refresh()

  public enter() {
    super.enter()
    this.isStarting = false
    if (!this._adt) return
    GuiFramework.setOrientation(this._adt)
    GuiFramework.createBottomBar(this._adt)
    GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
    const root = new Grid()
    GuiFramework.formatButtonGrid(root)
    const panel = new StackPanel()
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
    root.addControl(panel, 0, 0)
    const content = GuiFramework.createTextPanel(root)
    const room = playService.getRoom()
    const mode = (room && room.properties && room.properties.game_mode === "pvp") ? "PvP" : "CO-OP"
    GuiFramework.createPageTitle(`Lobby [${mode}]`, content)
    this.playersPanel = new StackPanel()
    content.addControl(this.playersPanel, 1, 1)
    const leaveBtn = GuiFramework.addButton("Leave Room", panel)
    this.startBtn = GuiFramework.addButton("Start Game", panel)
    this.startBtn.isVisible = false // Initially hidden, shown only for host when room is full
    leaveBtn.onPointerDownObservable.add(() => {
      playService.leaveRoom().then(() => {
        State.setCurrent(States.matchmaking)
      })
    })
    this.startBtn.onPointerDownObservable.add(async () => {
      if (this.isStarting) return
      // Host clicks Start Game - signal all players to start
      await playService.updateRoomProperties({ game_started: true })
      this.tryStart()
    })
    this._adt.addControl(root)

    // Mute button (Upper Right)
        const muteBtn = GuiFramework.createImageButton("mute_icon", Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_on.svg"));
        muteBtn.width = "60px";
        muteBtn.height = "60px";
        muteBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        muteBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        muteBtn.left = "-20px";
        muteBtn.top = "20px";
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

    playService.ensureActorPresentInRoom().then(() => this.refresh())
      ; (playService as any).off?.("roomUpdated", this.onRoomUpdated)
      ; (playService as any).off?.("actorJoined", this.onActorJoined)
      ; (playService as any).off?.("actorLeft", this.onActorLeft)
      ; (playService as any).off?.("readyStateChanged", this.onReadyChanged)
    playService.on("roomUpdated", this.onRoomUpdated)
    playService.on("actorJoined", this.onActorJoined)
    playService.on("actorLeft", this.onActorLeft)
    playService.on("readyStateChanged", this.onReadyChanged)
    this.loadStatus()
    // Polling fallback to ensure lobby updates even if events are missed
    this.refreshTimer = window.setInterval(() => this.refresh(), 3000)
  }

  private async refresh() {
    if (this.isStarting) return
    const res = await playService.getMyRoomActors()
    // Check if disposed after await
    if (!this.playersPanel || !this._adt) return

    let actors = res.actors || []
    this.playersPanel.clearControls()
    const room = playService.getRoom()
    const ownerId = room ? room.master_client_id : ""
    const me = (playService as any).getActor ? (playService as any).getActor() : undefined
    // Fallback: use room.actors if SDK returned fewer actors
    const roomActorCount = (room && Array.isArray(room.actors)) ? room.actors.length : 0
    const sdkActorCount = actors ? actors.length : 0
    if (sdkActorCount < roomActorCount) {
      console.log(`[Lobby] Using room.actors: SDK returned ${sdkActorCount} but room has ${roomActorCount}`)
      actors = room!.actors
    }
    if (me && (!actors.find(a => a.session_id === me.session_id))) {
      actors = (actors || []).concat([me])
    }

    const minPlayers = room ? (room.min_players || 2) : 2
    const isFull = actors.length >= minPlayers

    for (const a of actors) {
      const row = new Grid()
      row.addRowDefinition(60, true)
      row.addColumnDefinition(0.12, false)
      row.addColumnDefinition(0.5, false)
      row.addColumnDefinition(0.28, false)
      row.addColumnDefinition(0.1, false)
      row.height = "60px"
      row.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
      const container = new Rectangle()
      container.thickness = 0
      container.background = "#1a2a33"
      container.height = "60px"
      row.addControl(container, 0, 0)
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
      row.addControl(cell, 0, 0)
      const name = new TextBlock()
      GuiFramework.setFont(name, true, true)
      name.color = "white"
      name.fontSize = 24
      name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      name.text = a.name
      row.addControl(name, 0, 1)
      const owner = new TextBlock()
      GuiFramework.setFont(owner, true, true)
      owner.color = "#a6fffa"
      owner.fontSize = 18
      owner.text = (ownerId && a.session_id === ownerId) ? "Host" : ""
      owner.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      row.addControl(owner, 0, 2)
      const ready = new TextBlock()
      GuiFramework.setFont(ready, true, true)
      // Auto-ready: if room is full, show Ready, otherwise Waiting
      ready.color = isFull ? "#2ecc71" : "#e74c3c"
      ready.fontSize = 18
      ready.text = isFull ? "Ready" : "Waiting"
      ready.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      // No click handler - ready state is automatic

      row.addControl(ready, 0, 3)
      this.playersPanel.addControl(row)
    }
    const isOwner = !!me && !!ownerId && me.session_id === ownerId

    // Show Start Game button only for host when room is full
    if (this.startBtn) {
      this.startBtn.isVisible = isOwner && isFull
      this.startBtn.isEnabled = isOwner && isFull
    }

    // Check if game has been started via room properties
    if (room && room.properties) {
      // console.log("[Lobby] Checking game_started", room.properties.game_started)
      if (room.properties.game_started === true || room.properties.game_started === "true") {
        console.log("[Lobby] Game started detected, transitioning to game")
        this.tryStart()
      }
    }
  }

  public exit() {
    super.exit()
    this.playersPanel = undefined
    this.startBtn = undefined
    if (this.startTimer) { window.clearTimeout(this.startTimer); this.startTimer = undefined }
    if (this.refreshTimer) { window.clearInterval(this.refreshTimer); this.refreshTimer = undefined }
    ; (playService as any).off?.("roomUpdated", this.onRoomUpdated)
      ; (playService as any).off?.("actorJoined", this.onActorJoined)
      ; (playService as any).off?.("actorLeft", this.onActorLeft)
      ; (playService as any).off?.("readyStateChanged", this.onReadyChanged)
  }

  private async loadStatus() {
    const info = await authService.checkAuth()
    const token = info ? info.access_token : undefined
    console.log("[Lobby] token", !!token)
    avatarService.init(token)
    const name = await authService.getDisplayName(token)
    const profile = await avatarService.getProfile()
    const url = avatarService.getHeadIconUrlOrDefault(profile)
    console.log("[Lobby] avatar", { name, url })
    GuiFramework.updateTopLeftAvatar(name, url)
  }

  private async tryStart() {
    if (this.isStarting) return
    this.isStarting = true

    const room = playService.getRoom()
    const count = room ? Math.min(2, (room.actors || []).length) : 1
    const gameMode = room?.properties?.game_mode || "coop"
    console.log("[Lobby] tryStart: gameMode detected as:", gameMode, "raw:", room?.properties?.game_mode);

    const def = new GameDefinition()

    // Set up game definition based on mode
    if (gameMode === "pvp") {
      def.humanAllies = 1
      def.humanEnemies = 1
      console.log("[Lobby] PvP mode: humanAllies=1, humanEnemies=1")
    } else {
      def.humanAllies = count
      def.humanEnemies = 0
      // Ensure total allies = 4 (Humans + AI)
      def.aiAllies = Math.max(0, 4 - count)
      console.log("[Lobby] Co-op mode: humanAllies=" + count + ", aiAllies=" + def.aiAllies)
    }

    def.aiEnemies = Parameters.enemyCount
    if (gameMode === "pvp") {
       def.aiAllies = Parameters.allyCount // Use default parameter for PvP (usually 0 or low)
    }
    // For Co-op, aiAllies is already set above dynamically.
    
    GameState.gameDefinition = def
    console.log("[Lobby] GameDefinition created:", def);

    const me = (playService as any).getActor ? (playService as any).getActor() : undefined
    const ownerId = room ? room.master_client_id : ""
    const isOwner = !!me && !!ownerId && me.session_id === ownerId

    if (isOwner) {
      // Generate AI config
      const aiConfig: any[] = [];
      for (let i = 1; i <= def.aiAllies; i++) {
        aiConfig.push({
          type: 0,
          pos: { x: Math.random() * 100 - 50, y: Math.random() * 100 - 50, z: Math.random() * 100 - 50 - 500 },
          rot: { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2, z: Math.random() * Math.PI * 2 }
        });
      }
      for (let i = 1; i <= def.aiEnemies; i++) {
        aiConfig.push({
          type: 1,
          pos: { x: Math.random() * 100 - 50, y: Math.random() * 100 - 50, z: Math.random() * 100 - 50 + 500 },
          rot: { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2, z: Math.random() * Math.PI * 2 }
        });
      }

      // Save config and start game
      await playService.updateRoomProperties({ ai_config: JSON.stringify(aiConfig), game_started: true, playing: true });
    }

    playService.startMultiplayer().then(() => {
      State.setCurrent(States.gameState)
    })
  }
}