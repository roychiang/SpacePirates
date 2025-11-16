import { Engine, MorphTargetManager, NativeEngine, WebGPUEngine } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { CreatePlaygroundScene } from "./Playground/playground";
import { Main } from "./Playground/States/Main";
import { Parameters } from "./Playground/Parameters";
import { GuiFramework } from "./Playground/GuiFramework";

export const useWebGPU = false;
export var useNative = false;
declare var _native : any;

export interface InitializeBabylonAppOptions {
    canvas: HTMLCanvasElement;
    assetsHostUrl?: string;
}

export async function initializeBabylonApp(options: InitializeBabylonAppOptions) {

    Parameters.initialize();
    console.log("[App] init start")

    useNative = !!_native;

    if (useNative) {
        options.assetsHostUrl = "app://";
    } else {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        // Only set assetsHostUrl if it's not already provided
        if (!options.assetsHostUrl) {
            // Extract only the directory part, not the full URL with filename
            options.assetsHostUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            if (!options.assetsHostUrl) {
                options.assetsHostUrl = "";
            }
        }
        Parameters.starfieldHeavyShader = urlParams.get("heavyStarfield")! === "yes";
    }
    if (options.assetsHostUrl) {
        console.log("[App] assetsHostUrl", options.assetsHostUrl!);
    } else {
        console.log("[App] no assetsHostUrl");
    }

    if (!useNative) {
        document.body.style.width = "100%";
        document.body.style.height = "100%";
        document.body.style.margin = "0";
        document.body.style.padding = "0";
        const div = document.createElement("div");
        div.style.width = "100%";
        div.style.height = "100%";
        document.body.appendChild(div);

        const canvas = document.createElement("canvas");
        canvas.id = "renderCanvas";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        canvas.oncontextmenu = () => false;
        div.appendChild(canvas);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        options.canvas = canvas;
    } else {
        (options as any).canvas = {};
        MorphTargetManager.EnableTextureStorage = false;
    }

    const canvas = options.canvas;
    

    let engine: Engine | WebGPUEngine | NativeEngine;
    if (useNative) {
        engine = new NativeEngine();
        console.log("[App] engine", "NativeEngine")
    } else if (useWebGPU) {
        engine = new WebGPUEngine(canvas, {
            deviceDescriptor: {
                requiredFeatures: [
                    "depth-clip-control",
                    "depth24unorm-stencil8",
                    "depth32float-stencil8",
                    "texture-compression-bc",
                    "texture-compression-etc2",
                    "texture-compression-astc",
                    "timestamp-query",
                    "indirect-first-instance",
                ],
            },
        });
        await (engine as WebGPUEngine).initAsync();
        engine.compatibilityMode = false;
        console.log("[App] engine", "WebGPUEngine")
    } else {
        const badOS = /iPad/i.test(navigator.userAgent) || /iPhone/i.test(navigator.userAgent);
        engine = new Engine(canvas, !badOS);
        console.log("[App] engine", "Engine")
    }

    (window as any).engine = engine;

    const scene = CreatePlaygroundScene(engine, options.assetsHostUrl!, canvas);
    console.log("[App] scene created")
    GuiFramework.updateScreenRatio(engine);
    engine.runRenderLoop(() => {
        scene.render();
    });
    console.log("[App] render loop started")
    window.addEventListener("resize", () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        engine.resize();
        GuiFramework.updateScreenRatio(engine);
    });
}

