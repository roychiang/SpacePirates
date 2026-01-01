import "dotenv/config";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { monitor } from "@colyseus/monitor";
import { GameRoom } from "./rooms/GameRoom";
import { LobbyRoom } from "colyseus";
import crypto from "crypto";
import type { Server as HttpServer } from "http";

if (process.env.NODE_ENV === "production") {
    console.log = function() {};
    console.debug = function() {};
    console.info = function() {};
}

// Minimal JWT decode without verification for prototype; replace with real verify using SP_JWT_PUBLIC_KEY
function decodeJwt(token?: string): any | undefined {
  try {
    if (!token) return undefined;
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch { return undefined; }
}

const port = Number(process.env.PORT || 2567);
const app = express();

const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => { if (!origin || allowed.includes("*") || allowed.includes(origin)) { cb(null, true) } else { cb(null, false) } }, credentials: true }));
app.use(express.json());

const httpServer: HttpServer = createServer(app);
const transport = new WebSocketTransport({
    perMessageDeflate: false,
    noServer: true,
    pingInterval: 0,
    pingMaxRetries: 0,
});
(transport as any).wss?.on?.("wsClientError", (err: any, _socket: any, req: any) => {
});
(transport as any).server = httpServer;
const gameServer = new Server({ transport });

let peerUpgradeHandler: Function | undefined;

try {
    const peer = require("peer") as any;
    const ExpressPeerServer = peer?.ExpressPeerServer as any;
    if (typeof ExpressPeerServer === "function") {
        // Create a fake server to intercept PeerJS's WebSocket upgrade handler
        const fakeServer = {
            on: (event: string, callback: Function) => {
                if (event === "upgrade") {
                    peerUpgradeHandler = callback;
                }
            },
            listeners: (event: string) => [],
            removeAllListeners: (event: string) => {},
            address: () => httpServer.address(),
            listen: () => {},
            close: () => {},
            emit: () => {},
        };
        
        const peerServer = ExpressPeerServer(fakeServer, { path: "/" });
        app.use("/peerjs", peerServer);
    }
} catch (e) {
    console.error("[Peer] Failed to attach PeerServer:", e);
}

httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    // console.log("[WS] Upgrade request:", url);

    if (url.startsWith("/peerjs")) {
        if (peerUpgradeHandler) {
            peerUpgradeHandler(req, socket, head);
        } else {
            socket.destroy();
        }
        return;
    }

    try {
        const wss = (transport as any).wss;
        wss.handleUpgrade(req, socket, head, (ws: any) => wss.emit("connection", ws, req));
    } catch (e) {
        console.error("[WS] Upgrade error:", e);
        try { socket.destroy(); } catch { }
    }
});

gameServer.define("lobby", LobbyRoom);

import { TaloService } from "./services/TaloService";

// Register GameRoom
gameServer.define("game_room", GameRoom)
    .enableRealtimeListing();

app.get("/api/leaderboard/:alias", async (req, res) => {
    const alias = req.params.alias;
    try {
        const identifier = typeof req.query.identifier === "string" ? String(req.query.identifier) : undefined;
        const data = await TaloService.getLeaderboardEntries(alias, identifier);
        if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
            res.status(502).json(data);
            return;
        }
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});

app.post("/api/events", async (req, res) => {
    try {
        const { eventName, props, identity } = req.body;
        if (!eventName || !identity) {
            res.status(400).json({ error: "Missing eventName or identity" });
            return;
        }

        // 1. Always track the event
        await TaloService.addEvent(eventName, props, identity);

        // 2. Special handling for game_end to update leaderboards (Mirroring Server GameRoom logic)
        // This ensures Single Player (Offline) games also update leaderboards via this API proxy.
        if (eventName === "game_end" && props) {
            const kills = Number(props.kills) || 0;
            const win = !!props.win;
            const score = Number(props.score) || 0; 

            if (kills > 0) {
                await TaloService.incrementLeaderboardScore("TotalKillsSingle", kills, identity);
            }
            if (win) {
                await TaloService.incrementLeaderboardScore("TotalWinsSingle", 1, identity);
            }
            if (score > 0) {
                 await TaloService.submitToLeaderboard("HighScore", score, identity);
            }
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error("[API] Event error:", e);
        res.status(500).json({ error: "Internal Error" });
    }
});

// Colyseus Monitor (Protected by MONITOR_TOKEN)
const monitorToken = process.env.MONITOR_TOKEN;
app.use("/colyseus", (req, res, next) => {
    if (monitorToken && req.query.token !== monitorToken) {
        res.status(403).send("Forbidden: Invalid MONITOR_TOKEN");
        return;
    }
    next();
}, monitor());

// Auth API skeleton
const memoryPlayers: Map<string, { id: string; nickname: string; avatar_url: string; viverse_user_id?: string }> = new Map();
const memoryIdentities: Map<string, string> = new Map();

function base64url(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(payload: any): string {
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24;
    const data = { ...payload, iat: now, exp };
    const encHeader = base64url(JSON.stringify(header));
    const encPayload = base64url(JSON.stringify(data));
    const signingInput = `${encHeader}.${encPayload}`;
    const key = process.env.SP_JWT_PRIVATE_KEY || "";
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    const signature = signer.sign(key);
    return `${signingInput}.${base64url(signature)}`;
}

async function getDiscovery(): Promise<any> {
    const url = process.env.VIVERSE_OIDC_DISCOVERY_URL || "";
    const res = await fetch(url);
    return await res.json();
}

async function exchangeCode(code: string, redirectUri: string): Promise<{ access_token?: string; id_token?: string }> {
    const disc = await getDiscovery();
    const endpoint = disc.token_endpoint;
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", process.env.VIVERSE_CLIENT_ID || "");
    body.set("client_secret", process.env.VIVERSE_CLIENT_SECRET || "");
    body.set("redirect_uri", redirectUri);
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    return await res.json();
}

async function getUserInfo(accessToken: string): Promise<any> {
    const disc = await getDiscovery();
    const endpoint = disc.userinfo_endpoint;
    const res = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` } });
    return await res.json();
}

function ensurePlayer(providerUserId: string, nickname: string, avatarUrl: string): { id: string } {
    const key = `viverse:${providerUserId}`;
    let playerId = memoryIdentities.get(key);
    if (!playerId) {
        playerId = crypto.randomUUID();
        memoryIdentities.set(key, playerId);
        memoryPlayers.set(playerId, { id: playerId, nickname, avatar_url: avatarUrl, viverse_user_id: providerUserId });
    } else {
        const p = memoryPlayers.get(playerId);
        if (p) { p.nickname = nickname || p.nickname; p.avatar_url = avatarUrl || p.avatar_url; }
    }
    return { id: playerId };
}

app.get("/auth/login", async (req, res) => {
    const disc = await getDiscovery();
    const authEndpoint = disc.authorization_endpoint;
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const url = new URL(authEndpoint);
    url.searchParams.set("client_id", process.env.VIVERSE_CLIENT_ID || "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile");
    res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
    const code = String(req.query.code || "");
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    const info = tokens.access_token ? await getUserInfo(tokens.access_token) : {};
    const providerUserId = String(info.sub || "");
    const nickname = String(info.name || "Player");
    const avatarUrl = String(info.picture || "");
    const player = ensurePlayer(providerUserId, nickname, avatarUrl);
    const jwt = signJwt({ playerId: player.id, nick: nickname, avatar_url: avatarUrl });
    const fe = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const dest = new URL(fe);
    dest.searchParams.set("token", jwt);
    res.redirect(dest.toString());
});

app.post("/auth/token/exchange", async (req, res) => {
    const viverseToken = String((req.body && req.body.token) || "");
    const info = viverseToken ? await getUserInfo(viverseToken) : {};
    const providerUserId = String(info.sub || "");
    const nickname = String(info.name || "Player");
    const avatarUrl = String(info.picture || "");
    const player = ensurePlayer(providerUserId, nickname, avatarUrl);
    const jwt = signJwt({ playerId: player.id, nick: nickname, avatar_url: avatarUrl });
    res.json({ token: jwt });
});

app.get("/me", (req, res) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const payload = decodeJwt(token);
    if (!payload) return res.status(401).json({ error: "invalid token" });
    return res.json({ playerId: payload.playerId || "", nickname: payload.nick || "", avatar_url: payload.avatar_url || "" });
});

gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
