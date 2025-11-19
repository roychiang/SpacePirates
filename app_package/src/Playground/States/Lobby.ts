import { Control, Grid, StackPanel, Button, TextBlock, Rectangle, Ellipse, Image } from "@babylonjs/gui"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { playService } from "../../Viverse/Viverse"
import { GameDefinition } from "../Game"
import { GameState } from "./GameState"
import { authService } from "../../Viverse/Viverse"
import { avatarService } from "../../Viverse/Viverse"

export class Lobby extends State {
  private playersPanel?: StackPanel
  private startBtn?: Button
  private startTimer?: number
  private onRoomUpdated = () => this.refresh()
  private onActorJoined = () => this.refresh()
  private onActorLeft = () => this.refresh()
  private onReadyChanged = () => this.refresh()

  public enter() {
    super.enter()
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
    GuiFramework.createPageTitle("Lobby", content)
    this.playersPanel = new StackPanel()
    content.addControl(this.playersPanel, 1, 1)
    const leaveBtn = GuiFramework.addButton("Leave Room", panel)
    this.startBtn = GuiFramework.addButton("Ready", panel)
    leaveBtn.onPointerDownObservable.add(() => {
      playService.leaveRoom().then(() => {
        State.setCurrent(States.matchmaking)
      })
    })
    this.startBtn.onPointerDownObservable.add(async () => {
      const res = await playService.getMyRoomActors()
      const actors = res.actors || []
      const me = (playService as any).getActor ? (playService as any).getActor() : undefined
      const mine = me ? actors.find(a => a.session_id === me.session_id) : undefined
      const current = !!(mine && mine.properties && mine.properties["ready"])
      await playService.setReady(!current)
      this.refresh()
    })
    this._adt.addControl(root)
    playService.ensureActorPresentInRoom().then(() => this.refresh())
    ;(playService as any).off?.("roomUpdated", this.onRoomUpdated)
    ;(playService as any).off?.("actorJoined", this.onActorJoined)
    ;(playService as any).off?.("actorLeft", this.onActorLeft)
    ;(playService as any).off?.("readyStateChanged", this.onReadyChanged)
    playService.on("roomUpdated", this.onRoomUpdated)
    playService.on("actorJoined", this.onActorJoined)
    playService.on("actorLeft", this.onActorLeft)
    playService.on("readyStateChanged", this.onReadyChanged)
    this.loadStatus()
  }

  private async refresh() {
    const res = await playService.getMyRoomActors()
    let actors = res.actors || []
    console.log("[Lobby] actors detail", actors.map(a => { const v = a.properties?.["ready"] as any; return { name: a.name, ready: (v === 1 || v === "1" || v === true) } }))
    if (!this.playersPanel) return
    this.playersPanel.clearControls()
    const room = playService.getRoom()
    const ownerId = room ? room.master_client_id : ""
    const me = (playService as any).getActor ? (playService as any).getActor() : undefined
    if ((!actors || actors.length === 0) && room && Array.isArray(room.actors) && room.actors.length > 0) {
      actors = room.actors
    }
    if (me && (!actors.find(a => a.session_id === me.session_id))) {
      actors = (actors || []).concat([me])
    }
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
      const rVal = a.properties?.["ready"] as any
      const rOn = (rVal === 1 || rVal === "1" || rVal === true)
      ready.color = rOn ? "#2ecc71" : "#e74c3c"
      ready.fontSize = 18
      ready.text = rOn ? "Ready" : "Waiting"
      ready.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      if (me && a.session_id === me.session_id) {
        ready.onPointerDownObservable.add(async () => {
          const v = a.properties["ready"] as any
          const current = (v === 1 || v === "1" || v === true)
          await playService.setReady(!current)
          this.refresh()
        })
      }
      
      row.addControl(ready, 0, 3)
      this.playersPanel.addControl(row)
    }
    const isOwner = !!me && !!ownerId && me.session_id === ownerId
    const minPlayers = room ? (room.min_players || 2) : 2
    const enoughPlayers = actors.length >= minPlayers
    const allReady = actors.length > 0 && actors.every(a => { const v = a.properties?.["ready"] as any; return v === 1 || v === "1" || v === true })
    const iAmReady = !!me && !!actors.find(a => { const v = a.properties?.["ready"] as any; return a.session_id === me!.session_id && (v === 1 || v === "1" || v === true) })
    if (this.startBtn) {
      this.startBtn.isEnabled = !!me && !iAmReady
      this.startBtn.isVisible = !!me && !iAmReady
    }
    if (isOwner && enoughPlayers && allReady) {
      if (!this.startTimer) {
        this.startTimer = window.setTimeout(() => {
          this.tryStart()
          this.startTimer = undefined
        }, 3000)
      }
    } else {
      if (this.startTimer) { window.clearTimeout(this.startTimer); this.startTimer = undefined }
    }
  }

  public exit() {
    super.exit()
    if (this.startTimer) { window.clearTimeout(this.startTimer); this.startTimer = undefined }
    ;(playService as any).off?.("roomUpdated", this.onRoomUpdated)
    ;(playService as any).off?.("actorJoined", this.onActorJoined)
    ;(playService as any).off?.("actorLeft", this.onActorLeft)
    ;(playService as any).off?.("readyStateChanged", this.onReadyChanged)
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

  private tryStart() {
    const room = playService.getRoom()
    const count = room ? Math.min(2, (room.actors || []).length) : 1
    const def = new GameDefinition()
    def.humanAllies = count
    def.humanEnemies = 0
    def.aiAllies = 0
    def.aiEnemies = 0
    GameState.gameDefinition = def
    playService.startMultiplayer().then(() => { State.setCurrent(States.gameState) })
  }
}