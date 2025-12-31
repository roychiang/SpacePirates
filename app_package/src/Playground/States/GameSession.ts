import { Scene, Nullable, GlowLayer } from "@babylonjs/core";
import { Game, GameDefinition } from "../Game";
import { Assets } from "../Assets";
import { playService } from "../../Viverse/Viverse";

export class GameSession {

    private _game: Nullable<Game> = null;
    private _assets: Assets;
    private _scene: Scene;
    private _canvas: HTMLCanvasElement;
    private _glowLayer: GlowLayer;
    private _startAttempts: number = 0;
    private _startRetryTimer: any = null;
    private _pendingDefinition: Nullable<GameDefinition> = null;

    constructor(assets: Assets, scene: Scene, canvas: HTMLCanvasElement, glowLayer: GlowLayer) {
        this._assets = assets;
        this._scene = scene;
        this._canvas = canvas;
        this._glowLayer = glowLayer;
    }

    public getScene(): Scene {
        return this._scene;
    }

    public getCanvas(): HTMLCanvasElement {
        return this._canvas;
    }

    public getGame(): Nullable<Game> {
        return this._game;
    }

    public start(gameDefinition: Nullable<GameDefinition>): void {
        console.log("[GameSession] start() called with:", gameDefinition);
        this._pendingDefinition = gameDefinition;
        if (this._game) {
            return;
        }

        const resolved = this._resolveLocalPlayerIndex();
        if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < 0) {
            this._startAttempts++;
            if (this._startAttempts <= 50) {
                if (this._startRetryTimer) {
                    clearTimeout(this._startRetryTimer);
                }
                this._startRetryTimer = setTimeout(() => {
                    this._startRetryTimer = null;
                    this.start(this._pendingDefinition);
                }, 50);
                return;
            }
            console.warn("[GameSession] Failed to resolve localPlayerIndex in time, falling back to 0");
            this._game = new Game(this._assets, this._scene, this._canvas, gameDefinition, this._glowLayer, 0);
            return;
        }

        console.log("[GameSession] Calculated localPlayerIndex:", resolved);
        this._game = new Game(this._assets, this._scene, this._canvas, gameDefinition, this._glowLayer, resolved);
    }

    private _resolveLocalPlayerIndex(): number | null {
        try {
            const sessionId = playService.colyseusRoom?.sessionId;
            const state: any = (playService.colyseusRoom as any)?.state;
            const players = state?.players;
            if (sessionId && players) {
                const me = typeof players.get === "function" ? players.get(sessionId) : players[sessionId];
                const joinOrder = me?.joinOrder;
                if (typeof joinOrder === "number" && Number.isFinite(joinOrder)) {
                    return joinOrder;
                }
            }
        } catch { }

        const room = playService.getRoom();
        const mySessionId = playService.colyseusRoom?.sessionId || playService.getActor()?.session_id;
        if (room && Array.isArray(room.actors) && mySessionId) {
            const meActor = room.actors.find(a => a.session_id === mySessionId);
            const joinOrderRaw = meActor?.properties?.joinOrder;
            if (joinOrderRaw !== undefined) {
                const parsed = parseInt(String(joinOrderRaw), 10);
                if (Number.isFinite(parsed)) return parsed;
            }
            const idx = room.actors.findIndex(a => a.session_id === mySessionId);
            if (idx >= 0) return idx;
        }
        return null;
    }

    public stop(): void {
        if (!this._game) {
            return;
        }
        if (this._startRetryTimer) {
            clearTimeout(this._startRetryTimer);
            this._startRetryTimer = null;
        }
        this._startAttempts = 0;
        this._game.dispose();

        this._game = null;
    }

    public inProgress(): boolean {
        return !!this._game;
    }

    public pause(): void {
        console.log("[GameSession] pause called")
        try {
            this._game?.getRecorder()?.setRecordActive(false);
            this._game?.setTargetSpeed(0);
        } catch (e) {
            console.error("[GameSession] Error pausing game:", e);
        }
    }

    public resume(): void {
        console.log("[GameSession] resume called")
        try {
            if (this._game) {
                this._game.setTargetSpeed(1);
                this._game.getRecorder()?.setRecordActive(true);
            } else {
                console.warn("[GameSession] resume called but game is null");
            }
        } catch (e) {
            console.error("[GameSession] Error resuming game:", e);
        }
    }
}
