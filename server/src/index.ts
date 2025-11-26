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

app.use("/colyseus", monitor());

gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
