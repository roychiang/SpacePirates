import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { monitor } from "@colyseus/monitor";
import { GameRoom } from "./rooms/GameRoom";
import { LobbyRoom } from "colyseus";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const gameServer = new Server({
    server: createServer(app),
});

// Register LobbyRoom
gameServer.define("lobby", LobbyRoom);

// Register GameRoom
gameServer.define("game_room", GameRoom)
    .enableRealtimeListing();

import { Request, Response, NextFunction } from "express";

function tokenGuard(token: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        // 1. Check Query Param & Set Cookie
        if (req.query.token === token) {
            res.cookie("monitor_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
            return next();
        }

        // 2. Check Cookie
        const cookieHeader = req.headers.cookie || "";
        if (cookieHeader.includes(`monitor_token=${token}`)) {
            return next();
        }

        // 3. Check Header (for programmatic access)
        const headerValue = req.headers["x-monitor-token"];
        if (headerValue === token) return next();

        return res.status(403).send("Forbidden");
    };
}

app.use(
    "/colyseus",
    tokenGuard(process.env.MONITOR_TOKEN || "dev-token"),
    monitor()
);

gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
