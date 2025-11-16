import { AdvancedDynamicTexture, StackPanel, TextBlock } from "@babylonjs/gui";
import { Nullable, Scene } from "@babylonjs/core";
import { GameSession } from "./GameSession";
import { GameState } from "./GameState";
import { Parameters } from "../Parameters";
import { GuiFramework } from "../GuiFramework";
import { authService, avatarService } from "../../Viverse/Viverse";
import { getViverse } from "../../Viverse/Viverse";

export class State {
    static currentState: Nullable<State> = null;
    protected _adt: Nullable<AdvancedDynamicTexture> = null;

    constructor() {
        this._resizeListener = this._resizeListener.bind(this);
    }
    
    public static setCurrent(newState: State): void {
        if (this.currentState === newState) {
            return;
        }
        if (this.currentState) {
            this.currentState.exit();
        }
        this.currentState = newState;
        if (this.currentState) {
            this.currentState.enter();
        }
    }

    public exit() {
        if (this._adt) {
            this._adt.dispose();
            window.removeEventListener("resize", this._resizeListener);
        }
    }

    public enter() {
        const scene = GameState.gameSession?.getScene();
        this._adt = AdvancedDynamicTexture.CreateFullscreenUI("Main", true, scene);
        this._adt.layer!.layerMask = 0x10000000;
        this._adt.idealHeight = 1440;
        window.addEventListener("resize", this._resizeListener);
        if (this._adt) {
            GuiFramework.setOrientation(this._adt)
            GuiFramework.ensureGlobalTopLeftAvatar(this._adt)
            ;(async () => {
                authService.initClient({ clientId: "v48pybqy7f", domain: "account.htcvive.com", cookieDomain: window.location.hostname })
                const attempt = async () => {
                    const ts = new Date().toISOString()
                    console.log("[Init] ts", ts)
                    const info = await authService.checkAuth()
                    const token = info ? info.access_token : undefined
                    const sdkAvailable = !!getViverse()
                    console.log("[SDK] available", sdkAvailable)
                    console.log("[Auth] token", !!token)
                    avatarService.init(token)
                    const t0 = performance.now()
                    const name = await authService.getDisplayName(token)
                    const profile = await avatarService.getProfile()
                    const url = avatarService.getHeadIconUrlOrDefault(profile)
                    const t1 = performance.now()
                    console.log("[Avatar] name", name, "url", url, "ts", new Date().toISOString(), "ms", Math.round(t1 - t0))
                    GuiFramework.updateTopLeftAvatar(name, url)
                    if (!token) {
                        try {
                            window.parent?.postMessage({ method: "initialize-auth" }, "*")
                            console.log("[Auth] initialize-auth posted to parent")
                        } catch {}
                    }
                }
                const hasClient = !!getViverse()?.client || !!(globalThis as any).viverseClient
                if (hasClient) {
                    await attempt()
                } else {
                    let tries = 5
                    const tick = async () => {
                        const available = !!getViverse()?.client || !!(globalThis as any).viverseClient
                        if (available) {
                            await attempt()
                        } else if (tries > 0) {
                            tries--
                            setTimeout(tick, 1000)
                        } else {
                            console.log("[SDK] not available after retries")
                        }
                }
                    setTimeout(tick, 1000)
                }
            })()
        }
    }

    // helpers
    protected _addText(text: string, panel: StackPanel): void {
        var textBlock = new TextBlock();
        textBlock.text = text.toUpperCase();
        textBlock.width = 0.6;
        textBlock.height = "20px";
        textBlock.color = "white";
        Parameters.setFont(textBlock, true);
        panel.addControl(textBlock);
    }

    private _resizeListener() {
        if (this._adt && this._adt.getScene()) {
            this._adt.scaleTo(this._adt.getScene()!.getEngine().getRenderWidth(), this._adt.getScene()!.getEngine().getRenderHeight());
        }
    }
}