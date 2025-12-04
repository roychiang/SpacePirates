import { Nullable } from "@babylonjs/core";
import { Control, Grid, StackPanel, Button, Image, TextBlock } from "@babylonjs/gui";
import { GameDefinition } from "../Game";
import { Parameters } from "../Parameters";
import { BattleSelect } from "./BattleSelect";
import { Diorama } from "./Diorama";
import { State } from "./State";
import { States } from "./States";
import { Assets } from "../Assets";
import { GuiFramework } from "../GuiFramework";
import { playService } from "../../Viverse/Viverse";

export class Main extends State {

    public static diorama: Nullable<Diorama> = null;
    public static playButton: Nullable<Button> = null;
    private _playersOnlineText?: TextBlock;
    private _playersTimer?: number;
    public exit() {
        super.exit();
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

        playService.newMatchmakingClient("4p4wmv9d5z", true).then(() => {}).catch(() => {});

        if (GuiFramework.isLandscape) {
            GuiFramework.createBottomBar(this._adt);
            var panel = new StackPanel();
            panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            let grid = new Grid();
            grid.paddingBottom = "100px";
            grid.paddingLeft = "100px";
            GuiFramework.formatButtonGrid(grid);
            grid.addControl(panel, 0, 0);

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

            Main.playButton = GuiFramework.addButton("Single Play", panel);
            Main.playButton.isVisible = Assets.loadingComplete;

            Main.playButton.onPointerDownObservable.add(function (info) {
                const gameDefinition = new GameDefinition();
                // If split-screen is allowed, default to 2P (keyboard+gamepad supported)
                gameDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                gameDefinition.aiEnemies = Parameters.enemyCount;
                gameDefinition.aiAllies = Parameters.allyCount;
                console.log("[Main] Play clicked. allowSplitScreen=", Parameters.allowSplitScreen, "humanAllies=", gameDefinition.humanAllies, "aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
                BattleSelect.gameDefinition = gameDefinition;
                State.setCurrent(States.battleSelect);
            });

            if (Parameters.allowSplitScreen) {
                GuiFramework.addButton("Two Player Co-op", panel).onPointerDownObservable.add(function (info) {
                    const gameDefinition = new GameDefinition();
                    gameDefinition.humanAllies = 2;
                    gameDefinition.aiEnemies = Parameters.enemyCount;
                    gameDefinition.aiAllies = Parameters.allyCount;
                    console.log("[Main] 2P Co-op selected. humanAllies=2 aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
                    BattleSelect.gameDefinition = gameDefinition;
                    State.setCurrent(States.battleSelect);
                });

                GuiFramework.addButton("Two Players Vs", panel).onPointerDownObservable.add(function (info) {
                    const gameDefinition = new GameDefinition();
                    gameDefinition.humanAllies = 1;
                    gameDefinition.humanEnemies = 1;
                    gameDefinition.aiEnemies = Parameters.enemyCount;
                    gameDefinition.aiAllies = Parameters.allyCount;
                    console.log("[Main] 2P Vs selected. humanAllies=1 humanEnemies=1 aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
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
            this._adt.addControl(grid);
            const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt);
            let playersText = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline") as TextBlock;
            if (!playersText) {
                playersText = new TextBlock("globalPlayersOnline", "Players Online: --");
                GuiFramework.setFont(playersText, true, true);
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
                avatarGrid.addControl(playersText, 1, 1);
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
                        if (this._playersOnlineText) {
                            this._playersOnlineText.text = "";
                            this._playersOnlineText.text = `Players Online: ${total}`;
                        }
                    } catch {}
                }).catch(() => {});
            };
            updatePlayers();
            if (this._playersTimer) { window.clearInterval(this._playersTimer); }
            this._playersTimer = window.setInterval(updatePlayers, 2000);
        } else {
            var panel = new StackPanel();
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

            Main.playButton = GuiFramework.addButton("Single Play", panel);
            Main.playButton.isVisible = Assets.loadingComplete;

            Main.playButton.onPointerDownObservable.add(function (info) {
                const gameDefinition = new GameDefinition();
                // If split-screen is allowed, default to 2P (keyboard+gamepad supported)
                gameDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                gameDefinition.aiEnemies = Parameters.enemyCount;
                gameDefinition.aiAllies = Parameters.allyCount;
                console.log("[Main] Play clicked (portrait). allowSplitScreen=", Parameters.allowSplitScreen, "humanAllies=", gameDefinition.humanAllies, "aiEnemies=", gameDefinition.aiEnemies, "aiAllies=", gameDefinition.aiAllies);
                BattleSelect.gameDefinition = gameDefinition;
                State.setCurrent(States.battleSelect);
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
            const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt);
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
                avatarGrid.addControl(playersText, 1, 1);
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
                    } catch {}
                }).catch(() => {});
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
}
