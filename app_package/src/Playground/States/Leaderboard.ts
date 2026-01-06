import { Nullable } from "@babylonjs/core"
import { Control, Grid, StackPanel, TextBlock, ScrollViewer, Rectangle } from "@babylonjs/gui"
import { State } from "./State"
import { States } from "./States"
import { GuiFramework } from "../GuiFramework"
import { Assets } from "../Assets"
import { playService } from "../../Viverse/Viverse"
import { TaloClient } from "../../Integrations/Talo"

export class Leaderboard extends State {
  public static leaderboardConfig = {
      killsAlias: "TotalKills",
      winsAlias: "TotalWins",
      title: "Leaderboard"
  };

  public backDestination: Nullable<State> = null
  private _lbPanels: Map<string, StackPanel> = new Map();
  private _statsTimers: number[] = [];
  private _isActive: boolean = false;
  private _onGameEnd?: (payload?: any) => void;
  private _onLeaderboardData?: (payload?: any) => void;

  public exit() {
    this._isActive = false;
    if (this._onGameEnd) {
      playService.off("gameEnd", this._onGameEnd);
      this._onGameEnd = undefined;
    }
    if (this._onLeaderboardData) {
      playService.off("leaderboardData", this._onLeaderboardData);
      this._onLeaderboardData = undefined;
    }
    for (const t of this._statsTimers) {
      window.clearTimeout(t);
    }
    this._statsTimers = [];
    this._lbPanels.clear();
    super.exit()
  }

  public enter() {
    super.enter()
    if (!this._adt) return
    this._isActive = true

    // Ensure top-left avatar is shown
    const actor = playService.getActor();
    if (actor) {
        GuiFramework.updateTopLeftAvatar(actor.name, (actor.properties?.headIconUrl as string) || "", this._adt);
    }

    this._onLeaderboardData = (message: any) => {
      if (!this._isActive) return;
      const alias = message?.alias ? String(message.alias) : "";
      if (!alias) return;
      const entriesPanel = this._lbPanels.get(alias);
      if (!entriesPanel) return;

      entriesPanel.clearControls();

      const data = message?.data;
      const entries = (data && Array.isArray(data.entries) ? data.entries : []).slice(0, 25);
      if (entries.length > 0) {
        entries.forEach((entry: any) => {
          const row = new Grid();
          row.height = "30px";
          row.width = "100%";
          row.addColumnDefinition(0.15, false); // Rank
          row.addColumnDefinition(0.60, false); // Name
          row.addColumnDefinition(0.25, false); // Score

          const rank = new TextBlock("rank", "#" + (Number(entry.position) + 1));
          rank.color = "white";
          rank.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          GuiFramework.setFont(rank, true, false);
          row.addControl(rank, 0, 0);

          const alias = entry?.member || entry?.playerAlias || entry?.player_alias;
          const nRaw = alias || "Unknown";
          let n = String(nRaw);
          
          // Try to get name from props (camelCase or snake_case)
          const playerProps = entry?.member?.props || 
                            alias?.player?.props || 
                            alias?.player?.properties; 

          if (playerProps && playerProps.name) {
              n = playerProps.name;
          } else if (typeof alias === 'object') {
              if (alias.username) n = alias.username;
              else if (alias.identifier) n = alias.identifier;
              else if (alias.id) n = `Player ${alias.id}`;
              else n = "Unknown";
          }
          const name = new TextBlock("name", n);
          name.color = "white";
          name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          GuiFramework.setFont(name, true, false);
          row.addControl(name, 0, 1);

          const score = new TextBlock("score", String(entry?.score ?? 0));
          score.color = "#a6fffa";
          score.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
          GuiFramework.setFont(score, true, true);
          row.addControl(score, 0, 2);

          entriesPanel.addControl(row);
        });
      } else {
        const err = data?.error ? `No data (${String(data.error)})` : "No entries yet";
        const noData = new TextBlock("noData", err);
        noData.color = "gray";
        noData.height = "30px";
        GuiFramework.setFont(noData, true, false);
        noData.fontSize = 20;
        entriesPanel.addControl(noData);
      }
    };
    playService.on("leaderboardData", this._onLeaderboardData);

    if (GuiFramework.isLandscape) {
      GuiFramework.createBottomBar(this._adt)
      const panel = new StackPanel()
      panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
      const grid = new Grid()
      grid.paddingBottom = "100px"
      grid.paddingLeft = "100px"
      GuiFramework.formatButtonGrid(grid)
      grid.addControl(panel, 0, 0)

      const contentGrid: Grid = GuiFramework.createTextPanel(grid)
      GuiFramework.createPageTitle(Leaderboard.leaderboardConfig.title, contentGrid)

      // Split content into Stats (Left) and Global Ranking (Right)
      const mainSplit = new Grid();
      mainSplit.addColumnDefinition(0.3, false);
      mainSplit.addColumnDefinition(0.7, false);
      // Fix: Add to Row 1 (Content), not Row 0 (Title)
      contentGrid.addControl(mainSplit, 1, 1);

      // --- Left: Personal Stats ---
      const statsPanel = new StackPanel();
      statsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      // Use spacing between elements instead of fixed heights that might overlap
      statsPanel.spacing = 10; 
      mainSplit.addControl(statsPanel, 0, 0);

      const killsTitle = new TextBlock("killsTitle", "Total Kills")
      GuiFramework.setFont(killsTitle, true, true)
      killsTitle.color = "#a6fffa"
      killsTitle.fontSize = 24
      killsTitle.height = "40px"
      killsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      // Ensure text wraps if needed, though title should fit
      killsTitle.textWrapping = true;
      killsTitle.resizeToFit = true;
      statsPanel.addControl(killsTitle)

      const killsValue = new TextBlock("killsValue", "--")
      GuiFramework.setFont(killsValue, true, true)
      killsValue.color = "white"
      killsValue.fontSize = 32
      killsValue.height = "50px"
      killsValue.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      statsPanel.addControl(killsValue)

      const spacer = new Rectangle();
      spacer.height = "20px";
      spacer.thickness = 0;
      statsPanel.addControl(spacer);

      const winsTitle = new TextBlock("winsTitle", "Total Wins")
      GuiFramework.setFont(winsTitle, true, true)
      winsTitle.color = "#a6fffa"
      winsTitle.fontSize = 24
      winsTitle.height = "40px"
      winsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      winsTitle.textWrapping = true;
      winsTitle.resizeToFit = true;
      statsPanel.addControl(winsTitle)

      const winsValue = new TextBlock("winsValue", "--")
      GuiFramework.setFont(winsValue, true, true)
      winsValue.color = "white"
      winsValue.fontSize = 32
      winsValue.height = "50px"
      winsValue.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      statsPanel.addControl(winsValue)

      // --- Right: Global Leaderboard List (Single List - Default to CO-OP) ---
      // Removed redundant StackPanel wrapper that caused height issues
      
      // Content Grid (1 Row, 2 Cols for Kills | Wins)
      const leaderboardsGrid = new Grid();
      leaderboardsGrid.addColumnDefinition(0.5, false);
      leaderboardsGrid.addColumnDefinition(0.5, false);
      leaderboardsGrid.height = "100%"; // Fill rest
      mainSplit.addControl(leaderboardsGrid, 0, 1);

      // Helper to create leaderboard section
      const createLbSection = (title: string, internalName: string, columnIndex: number) => {
          const listContainer = new ScrollViewer();
          listContainer.thickness = 0;
          listContainer.barColor = "#a6fffa";
          listContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
          listContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
          
          // Add padding to avoid squeezing
          if (columnIndex === 0) {
              listContainer.paddingRight = "20px";
              listContainer.paddingLeft = "20px";
          } else {
              listContainer.paddingLeft = "20px";
              listContainer.paddingRight = "20px";
          }
          
          leaderboardsGrid.addControl(listContainer, 0, columnIndex);

          const listPanel = new StackPanel();
          listPanel.width = "100%"; // Ensure content stretches
          listContainer.addControl(listPanel);

          const header = new TextBlock("lbHeader_" + internalName, title);
          GuiFramework.setFont(header, true, true);
          header.color = "#a6fffa";
          header.fontSize = 24;
          header.height = "50px";
          header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER; // Center title
          listPanel.addControl(header);

          const entriesPanel = new StackPanel();
          listPanel.addControl(entriesPanel);

          // Store reference for dynamic updates
          this._lbPanels.set(internalName, entriesPanel);

          // Request data via Colyseus if connected
          if (playService.colyseusRoom) {
              playService.colyseusRoom.send("getLeaderboard", { alias: internalName });
          } else {
              // Fallback to direct API if not connected (legacy)
              TaloClient.getLeaderboard(internalName).then((data: any) => {
                  if (!this._isActive) return;
                  if (data && data.entries) {
                  data.entries.slice(0, 25).forEach((entry: any) => {
                          const row = new Grid(); // Use Grid for better alignment
                          row.height = "30px";
                          row.width = "100%";
                          row.addColumnDefinition(0.15, false); // Rank
                          row.addColumnDefinition(0.60, false); // Name
                          row.addColumnDefinition(0.25, false); // Score
                          
                          const rank = new TextBlock("rank", "#" + (Number(entry.position) + 1));
                          rank.color = "white";
                          rank.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                          GuiFramework.setFont(rank, true, false);
                          row.addControl(rank, 0, 0);

                          const alias = entry?.member || entry?.playerAlias || entry?.player_alias;
                          const nRaw = alias || "Unknown";
                          let n = String(nRaw);
                          
                          // Try to get name from props (camelCase or snake_case)
                          const playerProps = entry?.member?.props || 
                                            alias?.player?.props || 
                                            alias?.player?.properties; 
                
                          if (playerProps && playerProps.name) {
                              n = playerProps.name;
                          } else if (typeof alias === 'object') {
                              if (alias.username) n = alias.username;
                              else if (alias.identifier) n = alias.identifier;
                              else if (alias.id) n = `Player ${alias.id}`;
                              else n = "Unknown";
                          }
                          const name = new TextBlock("name", n);
                          name.color = "white";
                          name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                          GuiFramework.setFont(name, true, false);
                          row.addControl(name, 0, 1);

                          const score = new TextBlock("score", String(entry?.score ?? 0));
                          score.color = "#a6fffa";
                          score.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
                          GuiFramework.setFont(score, true, true);
                          row.addControl(score, 0, 2);

                          entriesPanel.addControl(row);
                      });
                  } else {
                      const err = data?.error ? `No data (${String(data.error)})` : "No entries yet";
                      const noData = new TextBlock("noData", err);
                      noData.color = "gray";
                      noData.height = "30px";
                      noData.fontSize = 14;
                      GuiFramework.setFont(noData, true, false);
                      entriesPanel.addControl(noData);
                  }
              }).catch((e) => {
                  if (!this._isActive) return;
                  console.warn("Failed to load leaderboard " + internalName, e);
                  const errText = new TextBlock("err", "Could not load data");
                  errText.color = "red";
                  errText.height = "30px";
                  GuiFramework.setFont(errText, true, false);
                  entriesPanel.addControl(errText);
              });
          }
          
          const spacer = new Rectangle();
          spacer.height = "20px";
          spacer.thickness = 0;
          listPanel.addControl(spacer);
      };

      createLbSection("Top Kills", Leaderboard.leaderboardConfig.killsAlias, 0);
      createLbSection("Top Wins", Leaderboard.leaderboardConfig.winsAlias, 1);

      // Load Data
      const _this = this
      GuiFramework.addButton("Back", panel).onPointerDownObservable.add(function () {
        State.setCurrent(_this.backDestination || States.main)
      })

      this._adt.addControl(grid)

      const refreshStats = () => {
        const mode = Leaderboard.leaderboardConfig.killsAlias.includes("Single") ? "single" : 
                     Leaderboard.leaderboardConfig.killsAlias.includes("Coop") ? "coop" : undefined;
        playService.getPlayerStats(mode as any).then(s => {
          if (!this._isActive) return;
          killsValue.text = String(s.kills || 0)
          winsValue.text = String(s.wins || 0)
        }).catch(() => {
          if (!this._isActive) return;
          killsValue.text = "0"
          winsValue.text = "0"
        })
      }

      refreshStats()
      this._statsTimers.push(window.setTimeout(refreshStats, 1500))
      this._statsTimers.push(window.setTimeout(refreshStats, 3500))
      this._onGameEnd = () => {
        this._statsTimers.push(window.setTimeout(refreshStats, 2000))
      }
      playService.on("gameEnd", this._onGameEnd)

    } else {
      // Portrait Mode
      const panel = new StackPanel()
      panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM
      panel.paddingBottom = "100px"
      const grid = new Grid()
      grid.addRowDefinition(0.2, false)
      grid.addRowDefinition(0.6, false)
      grid.addRowDefinition(0.2, false)
      grid.addControl(panel, 2, 0)

      const title = new TextBlock("lbTitle", Leaderboard.leaderboardConfig.title.toUpperCase())
      GuiFramework.setFont(title, true, true)
      title.fontSize = 35
      title.color = "#a6fffa"
      title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
      title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
      title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
      title.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
      grid.addControl(title, 0, 0)

      const statsGrid = new Grid()
      statsGrid.addRowDefinition(1.0, false)
      statsGrid.addColumnDefinition(0.5, false)
      statsGrid.addColumnDefinition(0.5, false)
      grid.addControl(statsGrid, 1, 0)

      const killsPanel = new StackPanel()
      const winsPanel = new StackPanel()

      const killsTitle = new TextBlock("killsTitleP", "Total Kills")
      GuiFramework.setFont(killsTitle, true, true)
      killsTitle.color = "#a6fffa"
      killsTitle.fontSize = 24
      killsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      killsPanel.addControl(killsTitle)

      const killsValue = new TextBlock("killsValueP", "--")
      GuiFramework.setFont(killsValue, true, true)
      killsValue.color = "white"
      killsValue.fontSize = 30
      killsValue.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      killsPanel.addControl(killsValue)

      const winsTitle = new TextBlock("winsTitleP", "Total Wins")
      GuiFramework.setFont(winsTitle, true, true)
      winsTitle.color = "#a6fffa"
      winsTitle.fontSize = 24
      winsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      winsPanel.addControl(winsTitle)

      const winsValue = new TextBlock("winsValueP", "--")
      GuiFramework.setFont(winsValue, true, true)
      winsValue.color = "white"
      winsValue.fontSize = 30
      winsValue.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
      winsPanel.addControl(winsValue)

      statsGrid.addControl(killsPanel, 0, 0)
      statsGrid.addControl(winsPanel, 0, 1)

      const _this = this
      GuiFramework.addButton("Back", panel).onPointerDownObservable.add(function () {
        State.setCurrent(_this.backDestination || States.main)
      })

      this._adt.addControl(grid)

      const refreshStats = () => {
        const mode = Leaderboard.leaderboardConfig.killsAlias.includes("Single") ? "single" : 
                     Leaderboard.leaderboardConfig.killsAlias.includes("Coop") ? "coop" : undefined;
        playService.getPlayerStats(mode as any).then(s => {
          if (!this._isActive) return;
          killsValue.text = String(s.kills || 0)
          winsValue.text = String(s.wins || 0)
        }).catch(() => {
          if (!this._isActive) return;
          killsValue.text = "0"
          winsValue.text = "0"
        })
      }

      refreshStats()
      this._statsTimers.push(window.setTimeout(refreshStats, 1500))
      this._statsTimers.push(window.setTimeout(refreshStats, 3500))
      this._onGameEnd = () => {
        this._statsTimers.push(window.setTimeout(refreshStats, 2000))
      }
      playService.on("gameEnd", this._onGameEnd)
    }
  }
}
