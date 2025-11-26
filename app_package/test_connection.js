"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Colyseus = __importStar(require("colyseus.js"));
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new Colyseus.Client("ws://localhost:2567");
        console.log("Connecting...");
        try {
            const room = yield client.create("game_room", { name: "Test Room" });
            console.log("Room created:", room.roomId);
            room.onMessage("input", (message) => {
                console.log("Received input:", message);
            });
            console.log("Sending input...");
            room.send("input", { x: 1, y: 1 });
            const available = yield client.getAvailableRooms("game_room");
            console.log("Available rooms:", available.length);
            available.forEach((r) => console.log(" -", r.roomId, r.metadata));
            setTimeout(() => {
                console.log("Leaving...");
                room.leave();
                process.exit(0);
            }, 1000);
        }
        catch (e) {
            console.error("Error:", e);
            process.exit(1);
        }
    });
}
test();
//# sourceMappingURL=test_connection.js.map