import { Control, Grid, StackPanel, Button, TextBlock, InputText, Ellipse, Image, Rectangle } from "@babylonjs/gui"
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

  public enter() {
    super.enter()
    if (!this._adt) return
    authService.initClient({ clientId: "v48pybqy7f", domain: "account.htcvive.com", cookieDomain: window.location.hostname })
    playService.newMatchmakingClient("v48pybqy7f", false).then(() => { this.refreshRooms() })
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
    const createBtn = GuiFramework.addButton("Create Room", panel)
    const joinBtn = GuiFramework.addButton("Join Room", panel)
    const cancelBtn = GuiFramework.addButton("Cancel", panel)
    createBtn.onPointerDownObservable.add(async () => {
      const token = await authService.getToken()
      const name = await authService.getDisplayName(token)
      const sessionId = Math.random().toString(36).slice(2)
      playService.setActor({ session_id: sessionId, name, properties: { ready: 0 } }).then(() => {
        playService.createRoom({ name: "Remote Coop", mode: "team", maxPlayers: 2, minPlayers: 2 }).then(() => {
          State.setCurrent(States.lobby)
        })
      })
    })
    joinBtn.onPointerDownObservable.add(async () => {
      const token = await authService.getToken()
      const name = await authService.getDisplayName(token)
      const sessionId = Math.random().toString(36).slice(2)
      playService.setActor({ session_id: sessionId, name, properties: { ready: 0 } }).then(() => {
        const rid = this.roomIdInput ? this.roomIdInput.text : ""
        playService.joinRoom(rid || "room").then(() => {
          State.setCurrent(States.lobby)
        })
      })
    })
    cancelBtn.onPointerDownObservable.add(() => {
      State.setCurrent(States.main)
    })
    this._adt.addControl(root)
    this.loadStatus()
    this.roomsTimer = window.setInterval(() => this.refreshRooms(), 2000)
  }

  private async loadStatus() {
    console.log("[UI] Matchmaking loadStatus start")
    const info = await authService.checkAuth()
    const token = info ? info.access_token : undefined
    avatarService.init(token)
    const name = await authService.getDisplayName(token)
    const profile = await avatarService.getProfile()
    const url = avatarService.getHeadIconUrlOrDefault(profile)
    console.log("[UI] Matchmaking profile", { name, url, hasToken: !!token })
    const header = this._adt?.getControlByName("panelTitle") as TextBlock
    if (header) header.text = "MATCHMAKING"
    console.log("[UI] SDK", !!getViverse(), "TOKEN", !!token)
    GuiFramework.updateTopLeftAvatar(name, url)
    // title handled by createPageTitle
  }

  public exit() {
    super.exit()
    if (this.roomsTimer) window.clearInterval(this.roomsTimer)
  }

  private async refreshRooms() {
    const res = await playService.getAvailableRooms()
    if (Array.isArray(res.rooms)) {
      console.log("[UI] rooms detail", res.rooms.map(r => ({ id: r.id, name: r.name, mode: r.mode, max: r.max_players, min: r.min_players, closed: r.is_closed, actors: (r.actors || []).map(a => ({ name: a.name, ready: !!a.properties?.["ready"] })) })))
    }
    if (!this.roomsPanel) return
    this.roomsPanel.clearControls()
    const header = new TextBlock()
    GuiFramework.setFont(header, true, true)
    header.color = "#a6fffa"
    header.fontSize = 20
    header.text = "Rooms"
    this.roomsPanel.addControl(header)
    for (const r of res.rooms) {
      const line = new TextBlock()
      GuiFramework.setFont(line, true, true)
      line.color = "white"
      line.fontSize = 18
      const names = (r.actors || []).map(a => a.name).join(", ")
      line.text = `${r.id}  [${names}]`
      this.roomsPanel.addControl(line)
    }
  }
}