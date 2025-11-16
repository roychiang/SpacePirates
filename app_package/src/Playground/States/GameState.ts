import { Nullable } from "@babylonjs/core";
import { State } from "./State";
import { GameSession } from "./GameSession";
import { Main } from "./Main";
import { GameDefinition } from "../Game";

export class GameState extends State {

    public static gameSession: Nullable<GameSession> = null;
    public static gameDefinition: Nullable<GameDefinition> = null;

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
        }
    }
}