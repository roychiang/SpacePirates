import { Nullable } from "@babylonjs/core";
import { Control, Grid, StackPanel, Button, Image } from "@babylonjs/gui";
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
    public exit() {
        super.exit();
    }

    public enter() {
        super.enter();

        if (!this._adt) {
            return;
        }

        Main.diorama?.setEnable(this._adt);

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

            Main.playButton = GuiFramework.addButton("Play", panel);
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

            Main.playButton = GuiFramework.addButton("Play", panel);
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
        }

        // Mute button (Upper Right)
        const muteBtn = GuiFramework.createImageButton("mute_icon", Assets.joinUrl(Assets.globalAssetsHostUrl, "assets/UI/mic_on.svg"));
        muteBtn.width = "60px";
        muteBtn.height = "60px";
        muteBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        muteBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        muteBtn.left = "-20px";
        muteBtn.top = "20px";
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