import { Nullable } from "@babylonjs/core";
import { Control, Grid, StackPanel, Button, Image, TextBlock } from "@babylonjs/gui";
import { GameDefinition } from "../Game";
import { Parameters } from "../Parameters";
import { BattleSelect } from "./BattleSelect";
import { Diorama } from "./Diorama";
import { State } from "./State";
import { States } from "./States";
import { Leaderboard } from "./Leaderboard";
import { Assets } from "../Assets";
import { GuiFramework } from "../GuiFramework";
import { playService, authService, avatarService } from "../../Viverse/Viverse";
import { TaloClient } from "../../Integrations/Talo";

export class Main extends State {

    public static diorama: Nullable<Diorama> = null;
    public static playButton: Nullable<Button> = null;
    private _playersOnlineText?: TextBlock;
    private _playersTimer?: number;
    private _panel: Nullable<StackPanel> = null;

    public exit() {
        super.exit();
        this._panel = null;
        if (this._playersTimer) { window.clearInterval(this._playersTimer); this._playersTimer = undefined as any; }
        if (this._adt && this._playersOnlineText) {
            const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt);
            const t = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline");
            if (t) avatarGrid.removeControl(t);
            this._playersOnlineText = undefined;
        }
    }

    public enter() {
        super.enter();

        if (!this._adt) {
            return;
        }

        Main.diorama?.setEnable(this._adt);

        playService.newMatchmakingClient("4p4wmv9d5z", true).then(() => { }).catch(() => { });

        if (GuiFramework.isLandscape) {
            GuiFramework.createBottomBar(this._adt);
            var panel = new StackPanel();
            panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            let grid = new Grid();
            grid.paddingBottom = "100px";
            grid.paddingLeft = "100px";
            GuiFramework.formatButtonGrid(grid);
            grid.addControl(panel, 0, 0);
            this._panel = panel;

            const fallbackUrl = window.location.href.includes('/docs/')
                ? window.location.origin + '/docs/'
                : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
            let logo = new Image("spacePirates", Assets.joinUrl(assetsHostUrl, "/assets/UI/spacePiratesLogo.svg"));
            logo.width = 0.7;
            logo.fixedRatio = 340 / 1040;
            logo.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
            logo.top = "100px";
            grid.addControl(logo, 0, 1);

            this.renderMainMenu();

            this._adt.addControl(grid);
            const existingAvatar = this._adt.getControlByName("globalPlayerListPanel");
            if (existingAvatar) {
                existingAvatar.dispose();
            }
            // Remove from global overlay if present to avoid duplication/fading issues
            const overlayAvatar = GuiFramework.globalOverlayAdt?.getControlByName("globalPlayerListPanel");
            if (overlayAvatar) overlayAvatar.dispose();

            // Force creation on this._adt to ensure it is on top of the Diorama fading layer
            const avatarGrid = GuiFramework.createTopLeftAvatar(this._adt);

            // Check VIVERSE Auth
            authService.checkAuth().then(async (info) => {
                if (info) {
                    try {
                        const profile = await avatarService.getProfile();
                        GuiFramework.updateTopLeftAvatar(profile.name || "Player", profile.activeAvatar?.headIconUrl);
                        
                        // Set Actor for Talo/PlayService
                        const accountId = await authService.getAccountId();
                        playService.setActor({
                            session_id: accountId || (info as any).account_id || "User",
                            name: profile.name || "Player",
                            properties: { headIconUrl: profile.activeAvatar?.headIconUrl || "" }
                        });
                    } catch (e) {
                        GuiFramework.updateTopLeftAvatar("Player");
                    }
                } else {
                    const isViverseDomain = window.location.hostname.includes("viverse.com") || window.location.hostname.includes("htcvive.com");
                    if (!isViverseDomain) {
                        // Login button temporarily disabled
                        // GuiFramework.attachLoginButton(() => { ... });
                    }
                    
                    // Set Guest Actor
                    if (!playService.getActor()) {
                        const guestId = "Guest_" + Math.floor(Math.random() * 100000);
                        playService.setActor({
                            session_id: guestId,
                            name: guestId,
                            properties: {}
                        });
                    }
                }
            }).catch((e) => {
                // Set Guest Actor on failure too
                if (!playService.getActor()) {
                    const guestId = "Guest_" + Math.floor(Math.random() * 100000);
                    playService.setActor({
                        session_id: guestId,
                        name: guestId,
                        properties: {}
                    });
                }
            });

            let playersText = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline") as TextBlock;
            if (!playersText) {
                playersText = new TextBlock("globalPlayersOnline", "Players Online: --");
                GuiFramework.setFont(playersText, true, true);
                playersText.fontFamily = "Arial, Helvetica, sans-serif"; // Force standard font to avoid rendering artifacts
                playersText.color = "#a6fffa";
                playersText.fontSize = 24;
                playersText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                playersText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                playersText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                playersText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                playersText.isHitTestVisible = false;
                playersText.width = "300px";
                playersText.height = "30px";
                playersText.textWrapping = false;
                playersText.topInPixels = 26;
                // avatarGrid is now a StackPanel
                avatarGrid.addControl(playersText);
            }
            this._playersOnlineText = playersText;
            const updatePlayers = () => {
                playService.getAvailableRooms().then(res => {
                    try {
                        const rooms = (res && res.rooms) ? res.rooms : [];
                        const appId = playService.getAppId();
                        const filtered = rooms.filter((r: any) => {
                            const sameApp = typeof r.app_id === "string" ? (r.app_id === appId) : false;
                            const sameGame = !!(r.properties && r.properties["gameId"] === "SpacePirates");
                            return sameApp || sameGame;
                        });
                        const total = filtered.reduce((acc: number, r: any) => {
                            let count = (Array.isArray(r.actors) ? r.actors.length : 0);
                            if (count === 0 && r.properties && (r.properties.playing || r.properties.game_started || r.is_closed)) {
                                count = (r.max_players || 4);
                            }
                            return acc + count;
                        }, 0);
                        if (this._playersOnlineText) {
                            this._playersOnlineText.text = "";
                            this._playersOnlineText.text = `Players Online: ${total}`;
                        }
                    } catch { }
                }).catch(() => { });
            };
            updatePlayers();
            if (this._playersTimer) { window.clearInterval(this._playersTimer); }
            this._playersTimer = window.setInterval(updatePlayers, 2000);
        } else {
            var panel = new StackPanel();
            this._panel = panel;
            panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            panel.paddingBottom = "100px";

            const fallbackUrl = window.location.href.includes('/docs/')
                ? window.location.origin + '/docs/'
                : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
            let logo = new Image("spacePirates", Assets.joinUrl(assetsHostUrl, "/assets/UI/spacePiratesLogo.svg"));
            logo.width = 0.8;
            logo.fixedRatio = 340 / 1040;
            logo.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
            logo.top = "150px";
            this._adt.addControl(logo);

            Main.playButton = GuiFramework.addButton("SINGLE", panel);
            Main.playButton.isVisible = Assets.loadingComplete;

            Main.playButton.onPointerDownObservable.add(function (info) {
                const gameDefinition = new GameDefinition();
                // If split-screen is allowed, default to 2P (keyboard+gamepad supported)
                gameDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                gameDefinition.aiEnemies = Parameters.enemyCount;
                gameDefinition.aiAllies = Parameters.allyCount;
                BattleSelect.gameDefinition = gameDefinition;
                State.setCurrent(States.battleSelect);
            });

            GuiFramework.addButton("Leaderboard (Single)", panel).onPointerDownObservable.add(function (info) {
                Leaderboard.leaderboardConfig = {
                    killsAlias: "TotalKillsSingle",
                    winsAlias: "TotalWinsSingle",
                    title: "Leaderboard (Single)"
                };
                States.leaderboard.backDestination = States.main;
                State.setCurrent(States.leaderboard);
            });

            GuiFramework.addButton("Leaderboard (CO-OP)", panel).onPointerDownObservable.add(function (info) {
                Leaderboard.leaderboardConfig = {
                    killsAlias: "TotalKillsCoop",
                    winsAlias: "TotalWinsCoop",
                    title: "Leaderboard (CO-OP)"
                };
                States.leaderboard.backDestination = States.main;
                State.setCurrent(States.leaderboard);
            });

            if (Parameters.allowSplitScreen) {
                GuiFramework.addButton("Two Player Co-op", panel).onPointerDownObservable.add(function (info) {
                    const gameDefinition = new GameDefinition();
                    gameDefinition.humanAllies = 2;
                    gameDefinition.aiEnemies = Parameters.enemyCount;
                    gameDefinition.aiAllies = Parameters.allyCount;
                    console.log("[Main] 2P Co-op selected (portrait). humanAllies=2 aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
                    BattleSelect.gameDefinition = gameDefinition;
                    State.setCurrent(States.battleSelect);
                });

                GuiFramework.addButton("Two Players Vs", panel).onPointerDownObservable.add(function (info) {
                    const gameDefinition = new GameDefinition();
                    gameDefinition.humanAllies = 1;
                    gameDefinition.humanEnemies = 1;
                    gameDefinition.aiEnemies = Parameters.enemyCount;
                    gameDefinition.aiAllies = Parameters.allyCount;
                    console.log("[Main] 2P Vs selected (portrait). humanAllies=1 humanEnemies=1 aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
                    BattleSelect.gameDefinition = gameDefinition;
                    State.setCurrent(States.battleSelect);
                });
            }

            GuiFramework.addButton("CO-OP", panel).onPointerDownObservable.add(function (info) {
                States.matchmaking.pvpMode = false;
                State.setCurrent(States.matchmaking);
            });

            // GuiFramework.addButton("Online PvP", panel).onPointerDownObservable.add(function (info) {
            //     States.matchmaking.pvpMode = true;
            //     State.setCurrent(States.matchmaking);
            // });



            GuiFramework.addButton("Options", panel).onPointerDownObservable.add(function (info) {
                States.options.backDestination = States.main;
                State.setCurrent(States.options);
            });

            GuiFramework.addButton("Credits", panel).onPointerDownObservable.add(function (info) {
                State.setCurrent(States.credits);
            });
            this._adt.addControl(panel);
            const existingAvatar = this._adt.getControlByName("globalPlayerListPanel");
            if (existingAvatar) {
                existingAvatar.dispose();
            }
            // Remove from global overlay if present to avoid duplication/fading issues
            const overlayAvatar = GuiFramework.globalOverlayAdt?.getControlByName("globalPlayerListPanel");
            if (overlayAvatar) overlayAvatar.dispose();

            // Force creation on this._adt to ensure it is on top of the Diorama fading layer
            const avatarGrid = GuiFramework.createTopLeftAvatar(this._adt);

            // Check VIVERSE Auth (Portrait)
            authService.checkAuth().then(async (info) => {
                if (info) {
                    console.log("[Main] User logged in:", info);
                    try {
                        const profile = await avatarService.getProfile();
                        GuiFramework.updateTopLeftAvatar(profile.name || "Player", profile.activeAvatar?.headIconUrl);
                        
                        // Set Actor for Talo/PlayService
                        const accountId = await authService.getAccountId();
                        playService.setActor({
                            session_id: accountId || (info as any).accountName || "User",
                            name: profile.name || "Player",
                            properties: { headIconUrl: profile.activeAvatar?.headIconUrl || "" }
                        });
                    } catch (e) {
                        console.warn("[Main] Failed to get profile", e);
                        GuiFramework.updateTopLeftAvatar("Player");
                    }
                } else {
                    const isViverseDomain = window.location.hostname.includes("viverse.com") || window.location.hostname.includes("htcvive.com");
                    if (!isViverseDomain) {
                        console.log("[Main] User not logged in, showing login button");
                        // Login button temporarily disabled
                        // GuiFramework.attachLoginButton(() => { ... });
                    } else {
                        console.log("[Main] User not logged in but on Viverse domain, skipping login button");
                    }

                    // Set Guest Actor
                    if (!playService.getActor()) {
                        const guestId = "Guest_" + Math.floor(Math.random() * 100000);
                        playService.setActor({
                            session_id: guestId,
                            name: guestId,
                            properties: {}
                        });
                    }
                }
            }).catch((e) => {
                // Set Guest Actor
                if (!playService.getActor()) {
                    const guestId = "Guest_" + Math.floor(Math.random() * 100000);
                    playService.setActor({
                        session_id: guestId,
                        name: guestId,
                        properties: {}
                    });
                }
                const isViverseDomain = window.location.hostname.includes("viverse.com") || window.location.hostname.includes("htcvive.com");
                if (!isViverseDomain) {
                    // Login button temporarily disabled
                    // GuiFramework.attachLoginButton(() => { ... });
                }
            });

            let playersText = this._adt.getControlByName("globalPlayersOnline") as TextBlock;
            if (!playersText) {
                playersText = new TextBlock("globalPlayersOnline", "Players Online: --");
                GuiFramework.setFont(playersText, true, true);
                playersText.color = "#a6fffa";
                playersText.fontSize = 18;
                playersText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                playersText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                playersText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                playersText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
                playersText.isHitTestVisible = false;
                playersText.width = "300px";
                playersText.height = "30px";
                playersText.textWrapping = false;
                playersText.topInPixels = 26;
                avatarGrid.addControl(playersText);
            }
            this._playersOnlineText = playersText;
            const updatePlayers = () => {
                playService.getAvailableRooms().then(res => {
                    try {
                        const rooms = (res && res.rooms) ? res.rooms : [];
                        const appId = playService.getAppId();
                        const filtered = rooms.filter((r: any) => {
                            const sameApp = typeof r.app_id === "string" ? (r.app_id === appId) : false;
                            const sameGame = !!(r.properties && r.properties["gameId"] === "SpacePirates");
                            return sameApp || sameGame;
                        });
                        const total = filtered.reduce((acc: number, r: any) => acc + ((Array.isArray(r.actors) ? r.actors.length : 0) || 0), 0);
                        if (this._playersOnlineText) this._playersOnlineText.text = `Players Online: ${total}`;
                    } catch { }
                }).catch(() => { });
            };
            updatePlayers();
            if (this._playersTimer) { window.clearInterval(this._playersTimer); }
            this._playersTimer = window.setInterval(updatePlayers, 2000);
        }

        // Mute button (Upper Right)
        const muteBtn = GuiFramework.createImageButton("mute_icon", Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_on.svg"));
        muteBtn.width = "60px";
        muteBtn.height = "60px";
        muteBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        muteBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        muteBtn.left = "-20px";
        muteBtn.top = "20px";
        if (muteBtn.image) { muteBtn.image.width = "60px"; muteBtn.image.height = "60px"; }
        // Set initial state
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

    }

    private renderMainMenu() {
        if (!this._panel) return;
        this._panel.clearControls();

        // Single Play
            Main.playButton = GuiFramework.addButton("Single", this._panel);
            Main.playButton.isVisible = Assets.loadingComplete;
            Main.playButton.onPointerDownObservable.add(() => {
                 const gameDefinition = new GameDefinition();
                 gameDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                 gameDefinition.aiEnemies = Parameters.enemyCount;
                 gameDefinition.aiAllies = Parameters.allyCount;
                 BattleSelect.gameDefinition = gameDefinition;
                 State.setCurrent(States.battleSelect);
            });

        // CO-OP
        GuiFramework.addButton("CO-OP", this._panel).onPointerDownObservable.add(() => {
            States.matchmaking.pvpMode = false;
            State.setCurrent(States.matchmaking);
        });

        // Leaderboards (Submenu)
        GuiFramework.addButton("Leaderboards", this._panel).onPointerDownObservable.add(() => {
            this.renderLeaderboardMenu();
        });

        // Options
        GuiFramework.addButton("Options", this._panel).onPointerDownObservable.add(() => {
            States.options.backDestination = States.main;
            State.setCurrent(States.options);
        });

        // Credits
        GuiFramework.addButton("Credits", this._panel).onPointerDownObservable.add(() => {
            State.setCurrent(States.credits);
        });
    }

    private renderLeaderboardMenu() {
        if (!this._panel) return;
        this._panel.clearControls();

        // Leaderboard - Single Play
        GuiFramework.addButton("SINGLE", this._panel).onPointerDownObservable.add(() => {
             Leaderboard.leaderboardConfig = {
                 killsAlias: "TotalKillsSingle",
                 winsAlias: "TotalWinsSingle",
                 title: "Leaderboard (Single)"
             };
             States.leaderboard.backDestination = States.main;
             State.setCurrent(States.leaderboard);
        });

        // Leaderboard - CO-OP
        GuiFramework.addButton("CO-OP", this._panel).onPointerDownObservable.add(() => {
             Leaderboard.leaderboardConfig = {
                 killsAlias: "TotalKillsCoop",
                 winsAlias: "TotalWinsCoop",
                 title: "Leaderboard (CO-OP)"
             };
             States.leaderboard.backDestination = States.main;
             State.setCurrent(States.leaderboard);
        });

        // Back
        GuiFramework.addButton("Back", this._panel).onPointerDownObservable.add(() => {
            this.renderMainMenu();
        });
    }
}
