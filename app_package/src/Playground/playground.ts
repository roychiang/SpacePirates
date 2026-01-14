import { Scene, Vector3, Engine, FreeCamera, DirectionalLight, Color3, GlowLayer, ImageProcessingConfiguration, Color4, Nullable } from "@babylonjs/core";
import { Assets } from "./Assets";
import { States } from "./States/States";
import { State } from "./States/State";
import { GameState } from "./States/GameState";
import { GameSession } from "./States/GameSession";
import { Diorama } from "./States/Diorama";
import { Main } from "./States/Main";
import { BattleSelect } from "./States/BattleSelect";
import { GameDefinition } from "./Game";
import { Parameters } from './Parameters';

class Playground {
    public static CreateScene(engine: Engine, assetsHostUrl: string, canvas: HTMLCanvasElement): Scene {
        
        // This creates a basic Babylon Scene object (non-mesh)
        var scene = new Scene(engine);

        //scene.autoClear = false;
        scene.clearColor = new Color4(0,0,0,1);
        scene.autoClearDepthAndStencil = false;
        scene.skipPointerMovePicking = true;
        scene.pointerUpPredicate = ()=> false;
        scene.pointerDownPredicate = ()=> false;
        scene.pointerMovePredicate = ()=> false;

        // lighting
        const dirLight = new DirectionalLight("dirLight", new Vector3(0.47, -0.19, -0.86), scene);
        dirLight.diffuse = Color3.FromInts(255, 251, 199);
        dirLight.intensity = 1.5;

        // material image processing
        const imageProcessing = scene.imageProcessingConfiguration;
        imageProcessing.toneMappingEnabled = true;
        imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
        imageProcessing.exposure = 2.0;

        // glow
        const glowLayer = new GlowLayer("glowLayer", scene);
        glowLayer.intensity = 1.2;

        // This creates and positions a free camera (non-mesh)
        var camera = new FreeCamera("camera1", new Vector3(0, 5, -10), scene);

        new Assets(scene, assetsHostUrl, (assets) => {
            GameState.gameSession = new GameSession(assets, scene, canvas, glowLayer);
            Main.diorama = new Diorama(scene, assets, engine, glowLayer);
            States.photoMode.assets = assets;

            // Agent Deep Link Handler
            const urlParams = new URLSearchParams(window.location.search);
            const mode = urlParams.get("mode");
            const mission = urlParams.get("mission");
            
            if (mode === "quick" || mode === "single") {
                console.log("[Playground] Auto-starting Single Player (Quick Mode)");
                const startQuickPlay = () => {
                    const overrideDefinition = new GameDefinition();
                    overrideDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                    overrideDefinition.aiEnemies = Parameters.enemyCount;
                    overrideDefinition.aiAllies = Parameters.allyCount;
                    BattleSelect.gameDefinition = overrideDefinition;

                    // If a specific mission is requested (e.g., &mission=squad)
                    if (mission && Assets.missions) {
                        const targetMission = Assets.missions.find((m: any) => m.name.toLowerCase() === mission.toLowerCase());
                        if (targetMission) {
                            console.log(`[Playground] Found mission: ${targetMission.name}, starting directly...`);
                            
                            const base: GameDefinition = targetMission.gameDefinition as GameDefinition;
                            const override: Nullable<GameDefinition> = overrideDefinition;
                            
                            // Merge logic from BattleSelect.ts
                            const finalDef: GameDefinition = {
                                ...base,
                                humanAllies: override?.humanAllies ?? base.humanAllies,
                                humanEnemies: override?.humanEnemies ?? base.humanEnemies,
                                aiAllies: base.aiAllies,
                                aiEnemies: base.aiEnemies,
                                seed: base.seed,
                                asteroidCount: base.asteroidCount,
                                asteroidRadius: base.asteroidRadius,
                                humanAlliesLife: base.humanAlliesLife,
                                humanEnemiesLife: base.humanEnemiesLife,
                                aiAlliesLife: base.aiAlliesLife,
                                aiEnemiesLife: base.aiEnemiesLife,
                                shotDamage: base.shotDamage,
                                missileDamage: base.missileDamage,
                                delayedEnd: base.delayedEnd,
                                enemyBoundaryRadius: base.enemyBoundaryRadius,
                                humanBoundaryRadius: base.humanBoundaryRadius,
                            };
                            
                            GameState.gameDefinition = finalDef;
                            State.setCurrent(States.gameState);
                            return;
                        } else {
                            console.warn(`[Playground] Mission '${mission}' not found, falling back to BattleSelect.`);
                        }
                    }

                    // Fallback to Mission Select
                    State.setCurrent(States.battleSelect);
                };

                if (Assets.loadingComplete) {
                    startQuickPlay();
                } else {
                    Assets.onLoadingCompleteObservable.addOnce(() => {
                        startQuickPlay();
                    });
                }
            } else {
                State.setCurrent(States.main);
            }
        },
        (assets) => {
            if (Main.playButton) {
                Main.playButton.isVisible = true;
            }
        });
        return scene;
    }
}

export function CreatePlaygroundScene(engine: Engine, assetsHostUrl: string, canvas: HTMLCanvasElement): Scene {
    return Playground.CreateScene(engine, assetsHostUrl, canvas);
}
