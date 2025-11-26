import { Nullable } from "@babylonjs/core";
import { State } from "./State";
import { GameSession } from "./GameSession";
import { Main } from "./Main";
import { GameDefinition } from "../Game";
import { InputManager } from "../Inputs/Input";

export class GameState extends State {

    public static gameSession: Nullable<GameSession> = null;
    public static gameDefinition: Nullable<GameDefinition> = null;
    private static _pointerLockRequested = false;

    public exit() {
        super.exit();
    }

    public enter() {
        super.enter();

        Main.diorama?.setEnable(null);

        if (!GameState.gameSession?.inProgress()) {
            console.log("[GameState] Starting new session with gameDefinition:", GameState.gameDefinition);
            GameState.gameSession?.start(GameState.gameDefinition);
        } else {
            console.log("[GameState] Resuming session");
            GameState.gameSession?.resume();
            // Reset flag to allow pointer lock re-request after resume
            GameState._pointerLockRequested = false;
        }

        // Request pointer lock on first user interaction (required by browser security)
        const canvas = (InputManager as any)._canvas;
        if (canvas && !GameState._pointerLockRequested) {
            const requestPointerLock = () => {
                if (GameState._pointerLockRequested || document.pointerLockElement) return;
                GameState._pointerLockRequested = true;

                console.log("[GameState] Requesting pointer lock after user interaction");
                try {
                    // Set requesting flag to prevent changeCallback from triggering menu
                    (InputManager as any)._isRequestingPointerLock = true;

                    // Ensure requestPointerLock exists on canvas
                    canvas.requestPointerLock =
                        canvas.requestPointerLock ||
                        canvas.mozRequestPointerLock ||
                        canvas.webkitRequestPointerLock;

                    // Handle the promise rejection to prevent uncaught SecurityError
                    const lockPromise = canvas.requestPointerLock();
                    if (lockPromise && typeof lockPromise.catch === 'function') {
                        lockPromise.catch((error: any) => {
                            console.warn("[GameState] Pointer lock request rejected:", error);
                            (InputManager as any)._isRequestingPointerLock = false;
                            GameState._pointerLockRequested = false;
                        });
                    }
                } catch (error) {
                    console.warn("[GameState] Failed to request pointer lock:", error);
                    (InputManager as any)._isRequestingPointerLock = false;
                    GameState._pointerLockRequested = false;
                }

                // Remove listeners after first request
                canvas.removeEventListener('click', requestPointerLock);
                canvas.removeEventListener('keydown', requestPointerLock);
            };

            canvas.addEventListener('click', requestPointerLock, { once: true });
            canvas.addEventListener('keydown', requestPointerLock, { once: true });
        }
    }
}