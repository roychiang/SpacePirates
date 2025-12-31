import { Vector3, Scene, Nullable, AbstractMesh, Quaternion, Observer, NodeMaterial, KeyboardInfo, KeyboardEventTypes, Camera, FreeCamera, TargetCamera, GlowLayer } from "@babylonjs/core";
import { ShipCamera } from "./ShipCamera";
import { InputManager } from "./Inputs/Input";
import { MissileManager, MAX_MISSILES } from "./Missile";
import { Ship, ShipManager } from "./Ship";
import { ShotManager } from "./Shot";
import { Assets } from "./Assets";
import { HUD } from './HUD';
import { States } from "./States/States";
import { State } from "./States/State";
import { GuiFramework } from "./GuiFramework";
import { Parameters } from './Parameters';
import { Recorder } from "./Recorder/Recorder";
import { ExplosionManager } from "./FX/Explosion";
import { SparksEffects } from "./FX/SparksEffect";
import { GamepadInput } from "./Inputs/GamepadInput";
import { TrailManager } from "./FX/Trail";
import { World } from "./World";
import { playService } from "../Viverse/Viverse";
import { Leaderboard } from "./States/Leaderboard";
import { TaloClient } from "../Integrations/Talo";

export class GameDefinition {
    public humanAllies: number = 0;
    public humanEnemies: number = 0;
    public aiAllies: number = 0;
    public aiEnemies: number = 0;
    public seed: number = 2022;
    public asteroidCount: number = 20;
    public asteroidRadius: number = 1000;
    public humanAlliesLife: number = 100;
    public humanEnemiesLife: number = 100;
    public aiAlliesLife: number = 50;
    public aiEnemiesLife: number = 10;
    public shotDamage: number = 1;
    public missileDamage: number = 20;
    public delayedEnd: number = 0;
    public enemyBoundaryRadius: number = 400;
    public humanBoundaryRadius: number = 800;
}

export class Game {
    private _shipManager: ShipManager;
    private _missileManager: MissileManager;
    private _shotManager: ShotManager;
    private _trailManager: TrailManager;
    private _scene: Scene;
    private _inputManager: InputManager;
    private _renderObserver: Nullable<Observer<Scene>> = null;
    private _HUD: Nullable<HUD>;
    private _speed: number = 1;
    private _targetSpeed: number = 1;
    private _recorder: Nullable<Recorder> = null;
    private _explosions: ExplosionManager;
    private _sparksEffects: SparksEffects;
    private _world: World;
    private _hotkeyObservable: Nullable<Observer<KeyboardInfo>> = null;
    private _cameraDummy: TargetCamera;
    public humanPlayerShips: Array<Ship> = new Array<Ship>();
    public activeCameras: Array<Camera> = new Array<Camera>();
    private _delayedEnd: number;
    private _gameDefinition: GameDefinition;
    // private _glowLayer: GlowLayer;
    
    // onEnemyKilled callback placeholder if needed
    // public onEnemyKilled: (ship: Ship) => void = () => {};

    private _localPlayerIndex: number = 0;
    private _gameResultReported: boolean = false;
    private _activePlayerIndices: Set<number> = new Set<number>();
    private _reportedPlayerDeaths: Set<number> = new Set<number>();
    private _missileDown: boolean = false;

    constructor(assets: Assets, scene: Scene, canvas: HTMLCanvasElement, gameDefinition: Nullable<GameDefinition>, glowLayer: GlowLayer, localPlayerIndex: number = 0) {
        this._scene = scene;
        this._localPlayerIndex = localPlayerIndex;

        // Ensure context binding
        this.updatePlayerList = this.updatePlayerList.bind(this);

        var shootFrame = 0;

        if (!gameDefinition) {
            gameDefinition = new GameDefinition();
            gameDefinition.humanAllies = 1;
            gameDefinition.humanEnemies = 0;
            gameDefinition.aiEnemies = Parameters.enemyCount;
            gameDefinition.aiAllies = Parameters.allyCount;
            console.log("Using default game definition");
        }
        this._gameDefinition = gameDefinition;
        console.log("[Game] Starting with:", {
            humanAllies: gameDefinition.humanAllies,
            humanEnemies: gameDefinition.humanEnemies,
            aiAllies: gameDefinition.aiAllies,
            aiEnemies: gameDefinition.aiEnemies,
            localPlayerIndex: this._localPlayerIndex
        });

        const MaxShips = gameDefinition.humanAllies + gameDefinition.humanEnemies + gameDefinition.aiEnemies + gameDefinition.aiAllies;
        this._shotManager = new ShotManager(assets, scene, glowLayer);
        this._trailManager = new TrailManager(scene, assets.trailMaterial ? assets.trailMaterial : new NodeMaterial("empty", scene), MaxShips + MAX_MISSILES);
        this._missileManager = new MissileManager(scene, this._trailManager);
        this._shipManager = new ShipManager(this._missileManager, this._shotManager, assets, this._trailManager, scene, MaxShips, gameDefinition, glowLayer);
        
        this._shipManager.onEnemyKilled = (killerShip, victimIndex) => {
             // Notify server of the kill regardless of host status.
             // The server will handle deduplication (killedEnemies Set).
             const victim = this._shipManager.ships[victimIndex];
             if (!victim || victim.isHuman || victim.faction !== 1) return;
             const killerIndex = this._shipManager.ships.indexOf(killerShip);
             if (killerIndex < 0) return;
             playService.notifyEnemyKill({ enemyIndex: victimIndex, killerIndex });
        };

        this._shipManager.onShipDestroyed = (shipIndex) => {
             // Notify server if the destroyed ship is the local player's ship
             if (shipIndex === this._localPlayerIndex) {
                 console.log("[Game] Local player died, notifying server.");
                 playService.notifyPlayerDeath(this._localPlayerIndex);
             }
        };

        this._inputManager = new InputManager(scene, canvas);
        this._explosions = new ExplosionManager(scene, assets, glowLayer);
        this._sparksEffects = new SparksEffects(scene, assets);
        if (Parameters.recorderActive) {
            this._recorder = new Recorder(this._shipManager, this._explosions, this._sparksEffects, this._shotManager, this._missileManager, this._trailManager, Parameters.recordFrameCount);
            this._recorder.setRecordActive(true);
        }

        this.activeCameras = [];
        for (let i = 0; i < gameDefinition.humanAllies; i++) {
            this._activePlayerIndices.add(i);
            const ship = this._shipManager.spawnShip(new Vector3(i * 50, 0, -500), Quaternion.Identity(), true, 0);
            if (ship) {
                const camera = new ShipCamera(ship, scene);
                ship.shipCamera = camera
                // Assign control index: local player's ship uses index 0 (keyboard/mouse)
                // Remote players' ships use their broadcast index
                // FIX: Shift control index by 1 to reserve index 0 for local physical input
                ship.controlIndex = i + 1;

                // Ensure an input slot exists for this ship's control index
                InputManager.getOrCreateInput(ship.controlIndex);
                console.log('[Game] Ally ship spawned:', { spawnIndex: i, controlIndex: ship.controlIndex, isLocal: i === this._localPlayerIndex });
                this.humanPlayerShips.push(ship);

                // Only add camera for local player
                if (i === this._localPlayerIndex) {
                    this.activeCameras.push(camera.getFreeCamera());
                }
            }
        }

        for (let i = 0; i < gameDefinition.humanEnemies; i++) {
            const ship = this._shipManager.spawnShip(new Vector3(i * 50, 0, 500), Quaternion.FromEulerAngles(0, Math.PI, 0), true, 1);
            if (ship) {
                const camera = new ShipCamera(ship, scene);
                ship.shipCamera = camera;

                // Calculate which player this enemy ship belongs to
                const enemyPlayerIndex = gameDefinition.humanAllies + i;
                this._activePlayerIndices.add(enemyPlayerIndex);

                // Assign control index: local player's ship uses index 0 (keyboard/mouse)
                // Remote players' ships use their broadcast index
                // FIX: Shift control index by 1
                ship.controlIndex = enemyPlayerIndex + 1;

                // Ensure an input slot exists for this ship's control index
                InputManager.getOrCreateInput(ship.controlIndex);
                console.log('[Game] Enemy ship spawned:', { spawnIndex: i, enemyPlayerIndex, controlIndex: ship.controlIndex, isLocal: enemyPlayerIndex === this._localPlayerIndex });
                this.humanPlayerShips.push(ship);

                // Only add camera for local player
                if (enemyPlayerIndex === this._localPlayerIndex) {
                    this.activeCameras.push(camera.getFreeCamera());
                }
            }
        }

        // Create World AFTER all ships are spawned so activeCameras is populated
        // Use first active camera, or create a dummy if none (shouldn't happen in normal gameplay)
        const worldCamera = this.activeCameras.length > 0 ? this.activeCameras[0] : new FreeCamera("dummyCamera", new Vector3(0, 0, 0), scene);
        this._world = new World(assets, scene, gameDefinition, worldCamera, glowLayer);

        this._cameraDummy = new FreeCamera("camera1", new Vector3(0, 0, 0), scene);
        this._cameraDummy.layerMask = 0x10000000;
        // Do NOT include the dummy GUI camera in active player cameras
        // to prevent its viewport from being set like a player split.

        // Cameras: split-screen based on input devices (keyboard + gamepads)
        // Keep at least 1 camera, cap to available ship cameras
        const requestedCamCount = 1; // Force 1 camera for networked multiplayer
        const shipCameras = this.activeCameras;
        const playerCamCount = Math.min(requestedCamCount, shipCameras.length);
        const playerCameras = shipCameras.slice(0, playerCamCount);
        const divCamera = 1 / playerCamCount;
        for (let i = 0; i < playerCamCount; i++) {
            const camera = playerCameras[i];
            camera.viewport.x = i * divCamera;
            camera.viewport.width = divCamera;
        }
        // Ensure the dummy GUI camera renders over the full screen,
        // independent of player split viewports
        this._cameraDummy.viewport.x = 0;
        this._cameraDummy.viewport.width = 1;
        scene.activeCameras = [...playerCameras, this._cameraDummy];
        console.log("[Game] Cameras configured:", {
            playerCameras: playerCamCount,
            humanShips: this.humanPlayerShips.length,
            viewports: playerCameras.map(c => ({ x: c.viewport.x, width: c.viewport.width })),
            dummyViewport: { x: this._cameraDummy.viewport.x, width: this._cameraDummy.viewport.width }
        });
        if (this.humanPlayerShips.length > this._localPlayerIndex) {
            this._world.ship = this.humanPlayerShips[this._localPlayerIndex];
        }

        // Spawn AI from Room Properties Config
        const room = playService.getRoom();
        let aiConfig: any[] = [];
        if (room && room.properties && room.properties.ai_config) {
            try {
                aiConfig = JSON.parse(room.properties.ai_config);
                console.log("[Game] Loaded AI config:", aiConfig);
            } catch (e) {
                console.error("[Game] Failed to parse AI config", e);
            }
        }

        if (aiConfig.length > 0) {
            aiConfig.forEach(cfg => {
                const pos = new Vector3(cfg.pos.x, cfg.pos.y, cfg.pos.z);
                const rot = new Quaternion(cfg.rot.x, cfg.rot.y, cfg.rot.z, cfg.rot.w || 1.0); // Ensure w exists if using Euler, but here we saved Euler in Lobby? Wait, Lobby saved Euler?
                // Lobby saved: rot: { x: rand, y: rand, z: rand } (Euler)
                // But Game.ts used Quaternion.FromEulerAngles.
                // Let's check Lobby again.
                // Lobby: rot: { x: Math.random() * Math.PI * 2 ... }
                // So these are Euler angles.
                const quat = Quaternion.FromEulerAngles(cfg.rot.x, cfg.rot.y, cfg.rot.z);
                this._shipManager.spawnShip(pos, quat, false, cfg.type);
            });
        } else {
            // Fallback if no config (e.g. single player or error)
            console.log("[Game] No AI config found, using random spawn");
            for (let i = 1; i <= gameDefinition.aiAllies; i++) {
                this._shipManager.spawnShip(
                    new Vector3(Math.random() * 100 - 50, Math.random() * 100 - 50, Math.random() * 100 - 50 - 500),
                    Quaternion.FromEulerAngles(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
                    false, 0);
            }
            for (let i = 1; i <= gameDefinition.aiEnemies; i++) {
                this._shipManager.spawnShip(
                    new Vector3(Math.random() * 100 - 50, Math.random() * 100 - 50, Math.random() * 100 - 50 + 500),
                    Quaternion.FromEulerAngles(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
                    false, 1);
            }
        }

        // Listen for player leave events (for all clients including host)
        playService.on("actorLeft", (p: any) => {
            this.updatePlayerList();
            if (!p) return;
            const joinOrder = parseInt(p.properties?.joinOrder || "-1");
            console.log("[Game] Player left, index:", joinOrder);
            
            if (joinOrder >= 0 && joinOrder < this.humanPlayerShips.length) {
                // Remove from active players to trigger Host migration if needed
                this._activePlayerIndices.delete(joinOrder);

                const ship = this.humanPlayerShips[joinOrder];
                if (ship) {
                    console.log("[Game] Removing ship for left player:", joinOrder);
                    ship.life = -1;
                    ship.shipMesh?.setEnabled(false);
                    ship.trail?.invalidate();
                    ship.shipCamera?.dispose();
                }
            }
        });
        
        // Listen for new players (if late join is supported)
        playService.on("actorJoined", (p: any) => {
            this.updatePlayerList();
        });
        
        // Initial update
        this.updatePlayerList();

        // Listen for player death events (broadcast by server)
        playService.on("playerDied", (p: any) => {
            if (!p) return;
            const index = p.index;
            console.log("[Game] Player died event received for index:", index);
            
            if (typeof index === "number" && index >= 0 && index < this.humanPlayerShips.length) {
                // Ensure we don't destroy ourselves based on remote message if we are still alive locally?
                // Actually, trust the server message. If server says died, they died.
                const ship = this.humanPlayerShips[index];
                if (ship && ship.isValid()) {
                    console.log("[Game] Destroying ship for died player:", index);
                    // Use shipManager to destroy properly
                    this._shipManager.destroyShip(index);
                    // Ensure life is set to -1 immediately so HUD updates
                    ship.life = -1;
                }
            }
        });

        if (this._localPlayerIndex !== 0) {
            // Client listens for dynamic spawns (if any future ones)
            playService.on("spawnEnemy", (p: any) => {
                if (!p) return;
                const pos = new Vector3(p.position.x, p.position.y, p.position.z);
                const rot = new Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
                this._shipManager.spawnShip(pos, rot, false, p.type);
            });

            // Client listens for game end
            playService.on("gameEnd", (p: any) => {
                if (this._gameResultReported) return;
                this._gameResultReported = true;

                // Update statistics if provided
                if (p && p.stats && Array.isArray(p.stats)) {
                    p.stats.forEach((s: any, index: number) => {
                        if (index >= 0 && index < this.humanPlayerShips.length) {
                             const ship = this.humanPlayerShips[index];
                             if (ship && ship.statistics) {
                                 Object.assign(ship.statistics, s);
                             }
                        }
                    });
                }

                let isVictory = false;
                if (p && p.winnerFaction !== undefined) {
                    const myFaction = this.humanPlayerShips[this._localPlayerIndex].faction;
                    isVictory = (myFaction === p.winnerFaction);
                } else if (p && p.result === "victory") {
                    isVictory = true;
                }

                // Report stats to Talo (Client Side)
                const myShip = this.humanPlayerShips[this._localPlayerIndex];
                if (myShip) {
                    const kills = myShip.statistics ? myShip.statistics.shipsDestroyed : 0;
                    if (!playService.colyseusRoom) {
                        playService.reportGameResult(kills, isVictory);
                    }
                }

                if (isVictory) {
                    States.victory.ship = this.humanPlayerShips[this._localPlayerIndex]; // Just use local player for camera focus
                    if (this._HUD) { this._HUD.dispose(); this._HUD = null; }
                    State.setCurrent(States.victory);
                } else if (p && (p.result === "defeat" || !isVictory)) {
                    if (this._HUD) { this._HUD.dispose(); this._HUD = null; }
                    States.dead.ship = this.humanPlayerShips[this._localPlayerIndex]; // Force local player ship
                    State.setCurrent(States.dead);
                }
            });

            // Client listens for game state updates (ship lives)
            playService.on("gameStateUpdate", (p: any) => {
                if (p && p.ships && Array.isArray(p.ships)) {
                    p.ships.forEach((s: any) => {
                        let pos = s.position;
                        let rot = s.rotation;
                        // Skip position/rotation update for local player to avoid jitter
                        if (s.index === this._localPlayerIndex) {
                            pos = null;
                            rot = null;
                        }
                        
                        // Synchronization Fix: Dead is Dead.
                        // If we locally know a ship is dead (life <= 0), do not accept "alive" updates (life > 0) from server.
                        // This prevents stale or out-of-order packets from reviving dead players (Zombie Bug).
                        const currentShip = this._shipManager.ships[s.index];
                        if (currentShip && currentShip.life <= 0 && s.life > 0) {
                             // Ignore this update for life, but maybe accept pos/rot? 
                             // Usually dead ships don't move, so safe to ignore life update.
                             return;
                        }

                        this._shipManager.setShipState(s.index, s.life, pos, rot);
                    });
                }
            });
        }

        // Listen for playerDied events (Important for Host to know when clients die)
        playService.on("playerDied", (p: any) => {
            if (!p) return;
            const index = p.index;
            if (typeof index === "number" && index >= 0 && index < this.humanPlayerShips.length) {
                // If it's me, I already handled it. If it's remote, I need to update.
                if (index !== this._localPlayerIndex) {
                    console.log(`[Game] Received playerDied for index ${index}`);
                    const ship = this.humanPlayerShips[index];
                    if (ship) {
                        ship.life = -1;
                    }
                }
            }
        });

        // remove asteroids too close to ships
        this._world.removeAsteroids(new Vector3(0, 0, -500), 50);
        this._world.removeAsteroids(new Vector3(0, 0, 500), 50);

        // Only create HUD for local player
        const localShip = this.humanPlayerShips[this._localPlayerIndex];
        this._HUD = new HUD(this._shipManager, assets, scene, localShip ? [localShip] : []);
        scene.customLODSelector = (mesh: AbstractMesh, camera: Camera) => { return mesh; };
        scene.freezeMaterials();
        //AbstractMesh.isInFrustum = function() { return true; };

        let gameStateTimer = 0;
        this._renderObserver = scene.onBeforeRenderObservable.add(() => {
            this._speed += (this._targetSpeed - this._speed) * 0.1;
            const deltaTime = scene.getEngine().getDeltaTime() * this._speed;
            InputManager.deltaTime = deltaTime;

            GamepadInput.gamepads.forEach(gp => gp.tick());

            shootFrame -= deltaTime;
            let canShoot = false;
            if (shootFrame <= 0) {
                canShoot = true;
                shootFrame = 130; // can shoot only every 130 ms
            }
            try {
                // Each player reads from their own input slot based on localPlayerIndex
                const local = InputManager.getOrCreateInput(0);

                // Copy physical input (0) to logical input slot (localPlayerIndex + 1)
                const logicalInput = InputManager.getOrCreateInput(this._localPlayerIndex + 1);
                logicalInput.dx = local.dx;
                logicalInput.dy = local.dy;
                logicalInput.shooting = local.shooting;
                logicalInput.burst = local.burst;
                logicalInput.breaking = local.breaking;
                const missilePressed = !!local.launchMissile && !this._missileDown;
                this._missileDown = !!local.launchMissile;
                logicalInput.immelmann = local.immelmann;

                if (local.dx !== 0 || local.dy !== 0 || local.shooting) {
                    // console.log('[Game] Broadcasting input:', { localPlayerIndex: this._localPlayerIndex, dx: local.dx, dy: local.dy, shooting: local.shooting });
                }
                
                // Get current ship transform for authoritative sync
                const myShip = this.humanPlayerShips[this._localPlayerIndex];
                const pos = myShip ? { x: myShip.root.position.x, y: myShip.root.position.y, z: myShip.root.position.z } : undefined;
                const rot = myShip && myShip.root.rotationQuaternion ? { x: myShip.root.rotationQuaternion.x, y: myShip.root.rotationQuaternion.y, z: myShip.root.rotationQuaternion.z, w: myShip.root.rotationQuaternion.w } : undefined;
                const missileEvent = !!(missilePressed && myShip && myShip.missileCooldown <= 0 && myShip.bestPrey >= 0 && myShip.bestPreyTime > Parameters.timeToLockMissile && myShip.availableMissiles > 0);
                const missileTarget = missileEvent && myShip ? myShip.bestPrey : undefined;
                logicalInput.launchMissile = missileEvent;

                playService.broadcastInput({ 
                    index: this._localPlayerIndex, 
                    dx: local.dx, 
                    dy: local.dy, 
                    shooting: local.shooting, 
                    burst: local.burst, 
                    breaking: local.breaking, // Typo in original code? local.breaking mapped to breaking
                    launchMissile: missileEvent,
                    missileTarget,
                    immelmann: local.immelmann,
                    pos: pos,
                    rot: rot
                });
            } catch { }

            // Determine Host: Lowest active player index
            const minIndex = this._activePlayerIndices.size > 0 ? Math.min(...Array.from(this._activePlayerIndices)) : this._localPlayerIndex;
            const isHost = this._localPlayerIndex === minIndex;
            // Fallback if set is empty (shouldn't happen if I am here): I am host
            // const isHost = (playService.getRoom()?.master_client_id === playService.getActor()?.session_id);
            
            // Debug Log for Co-op Collision Issue
            if (isHost && this.humanPlayerShips.length > 1) {
                const p1 = this.humanPlayerShips[0];
                const p2 = this.humanPlayerShips[1];
                if (p1 && p1.life < 0 && p2 && p2.life >= 0) {
                     if (Math.random() < 0.02) {
                         console.log(`[Game] P1 Dead, P2 Alive. Speed: ${this._speed}. TargetSpeed: ${this._targetSpeed}. P2 Pos: ${p2.root.position}. DeltaTime: ${deltaTime}`);
                     }
                }
            }

            // Capture life before tick to detect death
            const myShip = this.humanPlayerShips[this._localPlayerIndex];
            const wasAlive = myShip && myShip.life > 0;

            this._shipManager.tick(canShoot, InputManager.inputs, deltaTime, this._speed, this._sparksEffects, this._explosions, this._world, this._targetSpeed, isHost, this._localPlayerIndex);

            // Client-Side Death Reporting
            if (wasAlive && myShip && myShip.life <= 0) {
                 console.log(`[Game] Local player ${this._localPlayerIndex} died. Notifying Host.`);
                 playService.notifyPlayerDeath(this._localPlayerIndex);
            }

            if (isHost) {
                const humanCount = this._gameDefinition.humanAllies + this._gameDefinition.humanEnemies;
                for (let i = 0; i < humanCount; i++) {
                    const s = this._shipManager.ships[i];
                    if (s && s.life <= 0 && !this._reportedPlayerDeaths.has(i)) {
                        this._reportedPlayerDeaths.add(i);
                        playService.notifyPlayerDeath(i);
                    }
                }
            }

            // Host broadcasts game state periodically
            if (isHost) {
                gameStateTimer -= deltaTime;
                if (gameStateTimer <= 0) {
                    gameStateTimer = 100; // Broadcast every 100ms (10Hz)
                    const shipsData = this._shipManager.ships.map((s, idx) => ({
                        index: idx,
                        life: s.life,
                        position: { x: s.root.position.x, y: s.root.position.y, z: s.root.position.z },
                        rotation: { x: s.root.rotationQuaternion?.x, y: s.root.rotationQuaternion?.y, z: s.root.rotationQuaternion?.z, w: s.root.rotationQuaternion?.w }
                    }));
                    try {
                        playService.broadcastGameState({
                            score: 0, // TODO: implement score
                            lives: 0, // TODO: implement shared lives
                            wave: 0,
                            ships: shipsData
                        } as any);
                    } catch (e) {
                        console.warn("Failed to broadcast game state:", e);
                    }
                }
            }

            this.humanPlayerShips.forEach((ship) => {
                if (ship && ship.shipCamera) {
                    var wmat = ship.root.getWorldMatrix();
                    ship.shipCamera.Tick(ship, wmat, ship.speedRatio, this._speed);
                }
            });

            this._shotManager.tick(deltaTime, this._world);
            this._missileManager.tick(deltaTime, this._explosions, this._world);
            if (this._HUD) {
                const ls = this.humanPlayerShips[this._localPlayerIndex];
                this._HUD.tick(scene.getEngine(), this._speed, ls ? [ls] : []);
            }
            if (this._recorder) {
                this._recorder.tick();
            }
            this._sparksEffects.tick(deltaTime);
            this._explosions.tick(deltaTime);
            if (this._targetSpeed === 1) {
                this._trailManager.tick(deltaTime);
            }

            // victory check - Host Only
            if (isHost) {
                this._checkVictory(scene.getEngine().getDeltaTime() / 1000);
            }
        });

        try {
            playService.on("remoteInput", (p: any) => {
                if (!p) return;
                if (typeof p.index !== "number") return;
                const idx = p.index;
                // Remote input targets the logical slot (index + 1)
                const target = InputManager.getOrCreateInput(idx + 1);
                target.dx = p.dx || 0;
                target.dy = p.dy || 0;
                target.shooting = !!p.shooting;
                target.burst = !!p.burst;
                target.breaking = !!p.breaking;
                target.launchMissile = !!p.launchMissile;
                target.immelmann = !!p.immelmann;
                target.constrainInput();

                if (p.launchMissile && typeof p.missileTarget === "number") {
                    const ship = this.humanPlayerShips[idx];
                    const prey = this._shipManager.ships[p.missileTarget];
                    if (ship && ship.isValid() && prey && prey.isValid()) {
                        ship.fireMissile(this._missileManager, prey);
                        ship.missileCooldown = Parameters.missileCoolDownTime;
                    }
                    target.launchMissile = false;
                }

                if (p.pos && p.rot && idx >= 0 && idx < this.humanPlayerShips.length && idx !== this._localPlayerIndex) {
                    const ship = this.humanPlayerShips[idx];
                    if (ship && ship.isValid()) {
                        ship.root.position.set(p.pos.x, p.pos.y, p.pos.z);
                        if (ship.root.rotationQuaternion) {
                            ship.root.rotationQuaternion.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w);
                        }
                    }
                }
            })
        } catch { }

        try {
            playService.on("enemyKilled", (p: any) => {
                if (!p) return;
                if (this._isHostNow()) return;

                const enemyIndex = typeof p.enemyIndex === "number" ? p.enemyIndex : p.index;
                const killerIndex = typeof p.killerIndex === "number" ? p.killerIndex : null;
                if (typeof enemyIndex !== "number" || enemyIndex < 0 || enemyIndex >= this._shipManager.ships.length) return;

                const victim = this._shipManager.ships[enemyIndex];
                if (victim && victim.isValid() && !victim.isHuman && victim.faction === 1) {
                    const pos = victim.root.position.clone();
                    const rot = victim.root.rotationQuaternion ? victim.root.rotationQuaternion.clone() : Quaternion.Identity();
                    this._explosions.spawnExplosion(pos, rot);
                    this._shipManager.destroyShip(enemyIndex);
                }

                if (killerIndex !== null && killerIndex >= 0 && killerIndex < this._shipManager.ships.length) {
                    const killerShip = this._shipManager.ships[killerIndex];
                    killerShip?.statistics?.addShipDestroyed();
                }
            })
        } catch { }

        /* inspector
        this._hotkeyObservable = scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
              case KeyboardEventTypes.KEYDOWN:
                if (kbInfo.event.key == 'i') {
                    if (this._scene.debugLayer.isVisible()) {
                        this._scene.debugLayer.hide();
                    } else {
                        this._scene.debugLayer.show();
                    }
                }
                break;
            }
        });
        */

        this._delayedEnd = gameDefinition.delayedEnd;
    }

    private updatePlayerList() {
        if (playService.getRoom() && playService.getRoom()!.actors) {
             const actors = playService.getRoom()!.actors.map(a => ({
                 name: a.name,
                 url: (a.properties?.headIconUrl as string) || ""
             }));
             GuiFramework.updateTopLeftAvatar(actors);
        }
    }

    private _isHostNow(): boolean {
        const minIndex = this._activePlayerIndices.size > 0 ? Math.min(...Array.from(this._activePlayerIndices)) : this._localPlayerIndex;
        return this._localPlayerIndex === minIndex;
    }

    public getShipManager(): ShipManager {
        return this._shipManager;
    }

    public setTargetSpeed(speed: number): void {
        this._targetSpeed = speed;
    }
    /*
        public getCamera(): Camera {
            return this._camera;
        }
    */
    public getRecorder(): Nullable<Recorder> {
        return this._recorder;
    }

    private _checkVictory(deltaTime: number): void {
        if (this._gameDefinition.humanEnemies > 0) {
            // PvP Logic
            let faction0Alive = false;
            let faction1Alive = false;
            this._shipManager.ships.forEach(s => {
                if (s.isValid()) {
                    if (s.faction === 0) faction0Alive = true;
                    if (s.faction === 1) faction1Alive = true;
                }
            });

            let winnerFaction = -1;
            if (!faction0Alive) winnerFaction = 1;
            else if (!faction1Alive) winnerFaction = 0;

            if (winnerFaction !== -1) {
                if (this._delayedEnd <= 0) {
                     if (!this._gameResultReported) {
                        this._gameResultReported = true;
                        playService.broadcastGameEnd({ winnerFaction: winnerFaction });
                        if (this._HUD) { this._HUD.dispose(); this._HUD = null; }
                        
                        const myShip = this.humanPlayerShips[this._localPlayerIndex];
                        const isVictory = (myShip.faction === winnerFaction);
                        const kills = myShip.statistics ? myShip.statistics.shipsDestroyed : 0;
                        if (!playService.colyseusRoom) {
                            playService.reportGameResult(kills, isVictory);
                        }

                        if (isVictory) {
                            States.victory.ship = myShip;
                            State.setCurrent(States.victory);
                        } else {
                            State.setCurrent(States.dead);
                        }
                     }
                }
                this._delayedEnd -= deltaTime;
            }
        } else {
            // Co-op Logic
            var enemyCount = 0;
            var anyHumanAlive = false;
            this._shipManager.ships.forEach((ship, shipIndex) => {
                if (ship.isValid()) {
                    if (ship.faction == 1) {
                        enemyCount++;
                    }
                    if (ship.isHuman) {
                        anyHumanAlive = true;
                    }
                }
            });

            if (!anyHumanAlive) {
                if (this._delayedEnd <= 0) {
                    if (!this._gameResultReported) {
                        this._gameResultReported = true;
                        if (this._HUD) {
                            this._HUD.dispose();
                            this._HUD = null;
                        }
                        
                        const stats = this.humanPlayerShips.map(s => s.statistics);
                        playService.broadcastGameEnd({ result: "defeat", stats: stats });
                        
                        const myShip = this.humanPlayerShips[this._localPlayerIndex];
                        const kills = myShip.statistics ? myShip.statistics.shipsDestroyed : 0;
                        if (!playService.colyseusRoom) {
                            playService.reportGameResult(kills, false);
                        }

                        States.dead.ship = myShip;
                        State.setCurrent(States.dead);
                    }
                }
                this._delayedEnd -= deltaTime;
            }
            else if (!enemyCount) {
                if (this._delayedEnd <= 0) {
                    if (!this._gameResultReported) {
                        this._gameResultReported = true;
                        // Just pick the local player or first human for camera focus
                        const winner = this.humanPlayerShips.find(s => s.isValid()) || this.humanPlayerShips[0];
                        States.victory.ship = winner;
                        
                        const stats = this.humanPlayerShips.map(s => s.statistics);
                        playService.broadcastGameEnd({ result: "victory", stats: stats });

                        const myShip = this.humanPlayerShips[this._localPlayerIndex];
                        const kills = myShip.statistics ? myShip.statistics.shipsDestroyed : 0;
                        if (!playService.colyseusRoom) {
                            playService.reportGameResult(kills, true);
                        }

                        if (this._HUD) {
                            this._HUD.dispose();
                            this._HUD = null;
                        }
                        
                        State.setCurrent(States.victory);
                    }
                }
                this._delayedEnd -= deltaTime;
            }
        }
    }

    dispose() {
        this._shipManager.dispose();
        this._missileManager.dispose();
        this._shotManager.dispose();
        if (this._HUD) {
            this._HUD.dispose();
            this._HUD = null;
        }
        this._inputManager.dispose();
        if (this._recorder) {
            this._recorder.dispose();
        }
        this._explosions.dispose();
        this._sparksEffects.dispose();
        this._trailManager.dispose();
        this._world.dispose();
        this._scene.onBeforeRenderObservable.remove(this._renderObserver);
        this._cameraDummy.dispose();
        if (this._scene && this._hotkeyObservable) {
            this._scene.onKeyboardObservable.remove(this._hotkeyObservable);
        }
        //this._glowLayer.dispose();
    }
}
