"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const colyseus_1 = require("colyseus");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const monitor_1 = require("@colyseus/monitor");
const GameRoom_1 = require("./rooms/GameRoom");
const colyseus_2 = require("colyseus");
const port = Number(process.env.PORT || 2567);
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const gameServer = new colyseus_1.Server({
    server: (0, http_1.createServer)(app),
});
// Register LobbyRoom
gameServer.define("lobby", colyseus_2.LobbyRoom);
// Register GameRoom
gameServer.define("game_room", GameRoom_1.GameRoom)
    .enableRealtimeListing();
function tokenGuard(token) {
    return (req, res, next) => {
        const value = req.query.token || req.headers["x-monitor-token"];
        if (value === token)
            return next();
        return res.status(403).send("Forbidden");
    };
}
app.use("/colyseus", tokenGuard(process.env.MONITOR_TOKEN || "dev-token"), (0, monitor_1.monitor)());
gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
//# sourceMappingURL=index.js.map