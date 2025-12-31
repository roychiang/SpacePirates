import { Nullable, KeyboardInfo, Observer, Scene, KeyboardEventTypes, VirtualJoystick, Tools } from "@babylonjs/core";
import { Agent } from "../Agent";
import { State } from "../States/State";
import { States } from "../States/States";
import { Parameters } from '../Parameters';
import { GamepadInput } from './GamepadInput';
import { Settings } from "../../Settings";
import { useNative } from "../../playgroundRunner";

declare var document: any;

export class Input {
    dx: number = 0;
    dy: number = 0;
    shooting: boolean = false;
    launchMissile: boolean = false;
    burst: boolean = false;
    breaking: boolean = false;
    immelmann: boolean = false;

    public constrainInput() {
        this.dx = Math.max(Math.min(Parameters.playerTurnRate, this.dx), -Parameters.playerTurnRate);
        this.dy = Math.max(Math.min(Parameters.playerTurnRate, this.dy), -Parameters.playerTurnRate);
    }
}

// credit: https://stackoverflow.com/questions/4817029/whats-the-best-way-to-detect-a-touch-screen-device-using-javascript
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        ((navigator as any).msMaxTouchPoints > 0));
}

export class InputManager {
    private static _scene: Scene;
    private static _keyboardObserver: Nullable<Observer<KeyboardInfo>> = null;
    public static input: Input = new Input;
    // Support multiple player inputs; index 0 remains alias via `input`
    public static inputs: Input[] = [InputManager.input];
    private static _canvas: HTMLCanvasElement;
    public static deltaTime: number = 0;
    public static isTouch = false;
    // Patch navigator.getGamepads to avoid undefined id causing Babylon crash
    private static _patchedGamepads = false;

    public static getOrCreateInput(index: number): Input {
        while (InputManager.inputs.length <= index) {
            InputManager.inputs.push(new Input());
        }
        return InputManager.inputs[index];
    }
    private static sanitizeGamepadsSupport() {
        if (InputManager._patchedGamepads) return;
        try {
            const nav: any = navigator as any;
            if (nav && typeof nav.getGamepads === 'function') {
                const original = nav.getGamepads.bind(nav);
                nav.getGamepads = function () {
                    try {
                        const list = original() || [];
                        return Array.prototype.map.call(list, (gp: any) => {
                            if (!gp) return gp;
                            try {
                                return new Proxy(gp, {
                                    get(target, prop) {
                                        if (prop === 'id') {
                                            return typeof target.id === 'string' ? target.id : '';
                                        }
                                        return (target as any)[prop];
                                    }
                                });
                            } catch {
                                if (typeof gp.id !== 'string') {
                                    try { gp.id = ''; } catch { }
                                }
                                return gp;
                            }
                        });
                    } catch {
                        return [];
                    }
                }
                InputManager._patchedGamepads = true;
            }
        } catch { }
    }

    constructor(scene: Scene, canvas: HTMLCanvasElement) {
        InputManager._scene = scene;
        InputManager._canvas = canvas;

        InputManager.isTouch = isTouchDevice();

        // Ensure gamepad id is always a string to prevent Babylon GamepadManager errors
        InputManager.sanitizeGamepadsSupport();

        InputManager.setupPointerLock();

        scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN:
                    /*if (kbInfo.event.keyCode == 39) {
                        InputManager.input.shooting = true;
                    } else if (kbInfo.event.keyCode == 40) {
                        InputManager.input.launchMissile = true;
                    } else*/ if (kbInfo.event.keyCode == 87) {
                        InputManager.input.burst = true;
                    } else if (kbInfo.event.keyCode == 83) {
                        InputManager.input.breaking = true;
                    } else if (kbInfo.event.keyCode == 81) {
                        InputManager.input.immelmann = true;
                    }
                    break;
                case KeyboardEventTypes.KEYUP:
                    /*if (kbInfo.event.keyCode == 39) {
                        InputManager.input.shooting = false;
                    } else if (kbInfo.event.keyCode == 40) {
                        InputManager.input.launchMissile = false;
                    } else*/ if (kbInfo.event.keyCode == 87) {
                        InputManager.input.burst = false;
                    } else if (kbInfo.event.keyCode == 83) {
                        InputManager.input.breaking = false;
                    } else if (kbInfo.event.keyCode == 81) {
                        InputManager.input.immelmann = false;
                    }
                    break;
            }
        });

        try {
            GamepadInput.initialize();
        } catch (e) {
            console.warn('Gamepad initialization failed, continuing without gamepad:', e);
        }
    }

    static mouseMove(e: any) {
        if (InputManager.isTouch) {
            return;
        }
        // Do not suppress mouse when a gamepad is connected; allow keyboard+mouse co-op
        const deltaTime = InputManager.deltaTime;//._scene.getEngine().getDeltaTime();

        var movementX = e.movementX ||
            e.mozMovementX ||
            e.webkitMovementX ||
            0;

        var movementY = e.movementY ||
            e.mozMovementY ||
            e.webkitMovementY ||
            0;

        const input = InputManager.getOrCreateInput(0);
        input.dx = movementX * Parameters.mouseSensitivty * deltaTime;
        input.dy = movementY * Parameters.mouseSensitivty * deltaTime;
        if (Settings.invertY) {
            input.dy *= -1;
        }
        input.constrainInput();
        input.shooting = e.buttons == 1;
        input.launchMissile = e.buttons == 2;
    }

    private static _isRequestingPointerLock: boolean = false;

    static changeCallback(e: any) {
        const pointerEventType = Tools.IsSafari() ? "mouse" : "pointer";
        if (document.pointerLockElement === InputManager._canvas ||
            document.mozPointerLockElement === InputManager._canvas ||
            document.webkitPointerLockElement === InputManager._canvas
        ) {
            // we've got a pointerlock for our element, add a mouselistener
            InputManager._isRequestingPointerLock = false;
            document.addEventListener(`${pointerEventType}move`, InputManager.mouseMove, false);
            document.addEventListener(`${pointerEventType}down`, InputManager.mouseMove, false);
            document.addEventListener(`${pointerEventType}up`, InputManager.mouseMove, false);
        } else {
            // pointer lock is no longer active, remove the callback
            document.removeEventListener(`${pointerEventType}move`, InputManager.mouseMove, false);
            document.removeEventListener(`${pointerEventType}down`, InputManager.mouseMove, false);
            document.removeEventListener(`${pointerEventType}up`, InputManager.mouseMove, false);

            // Only transition to in-game menu if we're not in the middle of requesting pointer lock
            // and if we are not in a game-ending state (Dead or Victory)
            if (!InputManager._isRequestingPointerLock) {
                if (State.currentState !== States.dead && State.currentState !== States.victory) {
                    State.setCurrent(States.inGameMenu);
                }
            }
        }
    };

    public static disablePointerLock() {
        if (!useNative && !InputManager.isTouch) {
            if (document.exitPointerLock) {
                document.exitPointerLock();
            }
            var canvas = InputManager._canvas;
            if (canvas) {
                canvas.onclick = function () { };
            }
        }
    }

    public static setupPointerLock() {

        if (!useNative && !InputManager.isTouch) {
            // register the callback when a pointerlock event occurs
            document.addEventListener('pointerlockchange', InputManager.changeCallback, false);
            document.addEventListener('mozpointerlockchange', InputManager.changeCallback, false);
            document.addEventListener('webkitpointerlockchange', InputManager.changeCallback, false);

            // when element is clicked, we're going to request a
            // pointerlock
            var canvas = InputManager._canvas;
            canvas.onclick = function () {
                InputManager._isRequestingPointerLock = true;
                canvas.requestPointerLock =
                    canvas.requestPointerLock ||
                    canvas.mozRequestPointerLock ||
                    canvas.webkitRequestPointerLock
                    ;

                // Ask the browser to lock the pointer)
                const promise = (canvas.requestPointerLock() as any);
                if (promise && typeof promise.catch === 'function') {
                    promise.catch((e: any) => {
                        console.warn("Pointer lock failed", e);
                        InputManager._isRequestingPointerLock = false;
                    });
                }
            };
        }
    }

    dispose() {
        InputManager.disablePointerLock();
        InputManager._scene.onKeyboardObservable.remove(InputManager._keyboardObserver);
    }

}