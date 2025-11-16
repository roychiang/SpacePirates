import { Control, Grid, StackPanel, Button, TextBlock, Rectangle, Ellipse, Image } from "@babylonjs/gui"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { playService } from "../../Viverse/Viverse"
import { authService } from "../../Viverse/Viverse"
import { avatarService } from "../../Viverse/Viverse"

export class Lobby extends State {
  private playersPanel?: StackPanel
  private startBtn?: Button

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
    this.startBtn = GuiFramework.addButton("Start Game", panel)
    leaveBtn.onPointerDownObservable.add(() => {
      playService.leaveRoom().then(() => {
        State.setCurrent(States.matchmaking)
      })
    })
    this.startBtn.onPointerDownObservable.add(() => {
      this.tryStart()
    })
    this._adt.addControl(root)
    this.refresh()
    playService.on("roomUpdated", () => this.refresh())
    playService.on("actorJoined", () => this.refresh())
    playService.on("actorLeft", () => this.refresh())
    this.loadStatus()
  }

  private async refresh() {
    const res = await playService.getMyRoomActors()
    const actors = res.actors
    console.log("[Lobby] actors detail", actors.map(a => ({ name: a.name, ready: !!a.properties["ready"] })))
    if (!this.playersPanel) return
    this.playersPanel.clearControls()
    for (const a of actors) {
      const row = new Grid()
      row.addRowDefinition(50, true)
      row.addColumnDefinition(1.0, false)
      row.addColumnDefinition(200, true)
      const name = new TextBlock()
      GuiFramework.setFont(name, true, true)
      name.color = "white"
      name.fontSize = 24
      name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      name.text = a.name
      row.addControl(name, 0, 0)
      const readyBtn = GuiFramework.addButton((a.properties["ready"] ? "Ready" : "Not Ready"), this.playersPanel)
      readyBtn.onPointerDownObservable.add(() => {
        a.properties["ready"] = a.properties["ready"] ? 0 : 1
        this.refresh()
      })
      this.playersPanel.addControl(row)
    }
    const allReady = actors.length > 0 && actors.every(a => !!a.properties["ready"]) 
    if (this.startBtn) this.startBtn.isEnabled = allReady
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
    State.setCurrent(States.gameState)
  }
}