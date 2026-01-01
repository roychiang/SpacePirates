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
  private autoStartTimer?: number
  private autoStartCountdown: number = 20
  private countdownText?: TextBlock
  private isStarting = false
  private lastPlayerCount: number = 0;
  private onRoomUpdated = () => this.refresh()
  private onActorJoined = () => this.refresh()
  private onActorLeft = () => this.refresh()
  private onReadyChanged = () => this.refresh()



  public enter() {
    super.enter()
    this.isStarting = false
    this.lastPlayerCount = 0
    if (!this._adt) return
    GuiFramework.setOrientation(this._adt)
    GuiFramework.createBottomBar(this._adt)
    const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
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

    // Countdown Text
    this.countdownText = new TextBlock();
    this.countdownText.text = "Auto-starting in 20...";
    this.countdownText.color = "#f39c12"; 
    this.countdownText.fontSize = 24;
    this.countdownText.height = "40px";
    this.countdownText.isVisible = false;
    GuiFramework.setFont(this.countdownText, true, true);
    panel.addControl(this.countdownText);

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

    // Players Online under username
    let playersText = avatarGrid.children.find(c => c.name === "globalPlayersOnline") as TextBlock
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
      avatarGrid.addControl(playersText)
    }
    
    // Initial update
    this.updateGlobalPlayerList(avatarGrid);

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
    if (this.refreshTimer) window.clearInterval(this.refreshTimer)
    this.refreshTimer = window.setInterval(() => this.refresh(), 3000)
  }

  private updateGlobalPlayerList(avatarGrid: any) {
      // Refresh top left list with ALL actors
      if (playService.getRoom() && playService.getRoom()!.actors) {
          const actors = playService.getRoom()!.actors.map(a => ({
              name: a.name,
              url: (a.properties?.headIconUrl as string) || ""
          }));
          GuiFramework.updateTopLeftAvatar(actors);
      }

      playService.getAvailableRooms().then(res => {
        const rooms = (res && res.rooms) ? res.rooms : []
        const appId = playService.getAppId()
        const filtered = rooms.filter((r: any) => {
          const sameApp = typeof r.app_id === "string" ? (r.app_id === appId) : false
          const sameGame = !!(r.properties && r.properties["gameId"] === "SpacePirates")
          return sameApp || sameGame
        })
        const total = filtered.reduce((acc: number, r: any) => acc + ((Array.isArray(r.actors) ? r.actors.length : 0) || 0), 0)
        
        // Ensure we count the current room's players if they weren't included (e.g. room not in list)
        const currentRoom = playService.getRoom();
        const currentRoomCount = (currentRoom && currentRoom.actors) ? currentRoom.actors.length : 0;
        const displayTotal = Math.max(total, currentRoomCount);

        const t = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline") as TextBlock
        if (t) {
            t.text = ""
            t.text = `Players Online: ${displayTotal}`
        }
      }).catch(() => {})
  }

  private async refresh() {
    if (this.isStarting) return
    
    // Also update global player list
    if (this._adt) {
        const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt);
        this.updateGlobalPlayerList(avatarGrid);
    }

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
    if (me && (!actors.find(a => a.session_id === me.session_id || (a.userId && a.userId === me.session_id) || (a.name === me.name)))) {
      actors = (actors || []).concat([me])
    }
    
    const mySessionId = (playService as any).colyseusRoom?.sessionId || me?.session_id || ""
    const isOwner = !!mySessionId && !!ownerId && mySessionId === ownerId;

    const minPlayers = room ? (room.min_players || 2) : 2
    const isFull = actors.length >= minPlayers
    
    // Host Logic: Check for new players to reset countdown
    const currentCount = actors.length;
    if (isOwner && currentCount > this.lastPlayerCount && currentCount >= 2 && !this.isStarting) {
         // Player joined and we have enough players -> Reset countdown
         console.log(`[Lobby] Player count increased (${this.lastPlayerCount} -> ${currentCount}), resetting countdown.`);
         const now = Date.now();
         playService.updateRoomProperties({ target_start_time: now + 20000 });
    }
    this.lastPlayerCount = currentCount;

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
      const url = (a.properties && typeof a.properties["headIconUrl"] === "string") ? String(a.properties["headIconUrl"]) : ((a as any).headIconUrl || "")
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
    // const isOwner variable is now declared earlier, remove duplicate declaration

    // Show Start Game button only for host when room is full
    if (this.startBtn) {
      this.startBtn.isVisible = isOwner && isFull
      this.startBtn.isEnabled = isOwner && isFull
    }

    // Auto-start logic (Host triggers start, all clients sync countdown via room properties)
    const playerCount = actors.length;
    
    // Check if countdown target time is set in room properties
    const targetTime = (room && room.properties && room.properties.target_start_time) ? Number(room.properties.target_start_time) : 0;
    
    if (playerCount >= 2 && !this.isStarting) {
        if (isOwner) {
             // Host Logic: Start or Reset countdown if needed
             const now = Date.now();
             const remaining = targetTime - now;
             
             // If no timer or timer expired/invalid, start new one
             if (targetTime === 0 || remaining <= 0) {
                 if (targetTime === 0) {
                     console.log("[Lobby] Host starting new countdown (20s)...");
                     playService.updateRoomProperties({ target_start_time: now + 20000 });
                 } else if (remaining <= -2000) { // Tolerance for slight diff
                      // Timer finished long ago? Reset if not started?
                      // Actually if game_started is false but timer finished, we should have started.
                      // But maybe we just became host.
                 }
             }
        }
        
        // Client Logic: Update UI based on server time
        if (targetTime > 0) {
             const remainingSeconds = Math.ceil((targetTime - Date.now()) / 1000);
             
             if (remainingSeconds > 0) {
                 if (this.countdownText) {
                     this.countdownText.isVisible = true;
                     this.countdownText.text = `Auto-starting in ${remainingSeconds}...`;
                 }
                 
                 // Host: Check if time to start
                 if (isOwner && remainingSeconds <= 0) { // Should be caught by next tick or loop
                 }
             } else {
                 if (this.countdownText) {
                    this.countdownText.text = "Starting...";
                 }
                 if (isOwner && !this.isStarting) {
                     // Bake configuration before starting
                     const count = Math.min(4, playerCount);
                     const aiAllies = Math.max(0, 4 - count);
                     playService.updateRoomProperties({ 
                         game_started: true, 
                         config_human_count: count,
                         config_ai_count: aiAllies
                     });
                     this.tryStart();
                 }
             }
        }
    } else {
        // Less than 2 players
        if (isOwner && targetTime > 0) {
            playService.updateRoomProperties({ target_start_time: 0 });
        }
        if (this.countdownText) {
            this.countdownText.isVisible = false;
        }
    }

    if (isOwner && playerCount > this.lastPlayerCount && playerCount >= 2 && !this.isStarting) {
         const now = Date.now();
         playService.updateRoomProperties({ target_start_time: now + 20000 });
    }
    this.lastPlayerCount = playerCount;

    // Check if game has been started via room properties
    if (room && room.properties) {
      if (room.properties.game_started === true || room.properties.game_started === "true") {
        this.tryStart()
      }
    }
  }

  // Hook into refresh to detect new players and reset timer (Host only)
  // ... inside refresh() ...


  public exit() {
    super.exit()
    this.playersPanel = undefined
    this.startBtn = undefined
    this.countdownText = undefined
    if (this.startTimer) { window.clearTimeout(this.startTimer); this.startTimer = undefined }
    if (this.refreshTimer) { window.clearInterval(this.refreshTimer); this.refreshTimer = undefined }
    if (this.autoStartTimer) { window.clearInterval(this.autoStartTimer); this.autoStartTimer = undefined }
    ; (playService as any).off?.("roomUpdated", this.onRoomUpdated)
    ; (playService as any).off?.("actorJoined", this.onActorJoined)
    ; (playService as any).off?.("actorLeft", this.onActorLeft)
    ; (playService as any).off?.("readyStateChanged", this.onReadyChanged)
    
    if (this._adt) {
        const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
        const t = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline")
        if (t) avatarGrid.removeControl(t)
    }
  }

  private async loadStatus() {
    const info = await authService.checkAuth()
    const token = info ? info.access_token : undefined
    avatarService.init(token)
    const name = await authService.getDisplayName(token)
    const profile = await avatarService.getProfile()
    const url = avatarService.getHeadIconUrlOrDefault(profile)
    GuiFramework.updateTopLeftAvatar(name, url)
  }

  private async tryStart() {
    if (this.isStarting) return
    this.isStarting = true

    const room = playService.getRoom()
    // Use configuration from properties if available, otherwise fallback to current state
    let count = room ? Math.min(4, (room.actors || []).length) : 1
    let aiAllies = Math.max(0, 4 - count)
    
    if (room && room.properties) {
        if (room.properties.config_human_count !== undefined) {
            count = Number(room.properties.config_human_count);
            console.log(`[Lobby] Using configured human count: ${count}`);
        }
        if (room.properties.config_ai_count !== undefined) {
            aiAllies = Number(room.properties.config_ai_count);
            console.log(`[Lobby] Using configured AI count: ${aiAllies}`);
        }
    }

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
      def.aiAllies = aiAllies
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
    const mySessionId = (playService as any).colyseusRoom?.sessionId || me?.session_id || ""
    const isOwner = !!mySessionId && !!ownerId && mySessionId === ownerId

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
