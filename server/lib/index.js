"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const colyseus_1 = require("colyseus");
const ws_transport_1 = require("@colyseus/ws-transport");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const monitor_1 = require("@colyseus/monitor");
const GameRoom_1 = require("./rooms/GameRoom");
const colyseus_2 = require("colyseus");
const crypto_1 = __importDefault(require("crypto"));
if (process.env.NODE_ENV === "production") {
    console.log = function () { };
    console.debug = function () { };
    console.info = function () { };
}
// Minimal JWT decode without verification for prototype; replace with real verify using SP_JWT_PUBLIC_KEY
function decodeJwt(token) {
    try {
        if (!token)
            return undefined;
        const parts = token.split(".");
        if (parts.length !== 3)
            return undefined;
        const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        return JSON.parse(json);
    }
    catch (_a) {
        return undefined;
    }
}
const port = Number(process.env.PORT || 2567);
const app = (0, express_1.default)();
const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim()).filter(Boolean);
app.use((0, cors_1.default)({ origin: (origin, cb) => { if (!origin || allowed.includes("*") || allowed.includes(origin)) {
        cb(null, true);
    }
    else {
        cb(null, false);
    } }, credentials: true }));
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
const transport = new ws_transport_1.WebSocketTransport({
    perMessageDeflate: false,
    noServer: true,
    pingInterval: 0,
    pingMaxRetries: 0,
});
(_b = (_a = transport.wss) === null || _a === void 0 ? void 0 : _a.on) === null || _b === void 0 ? void 0 : _b.call(_a, "wsClientError", (err, _socket, req) => {
});
transport.server = httpServer;
const gameServer = new colyseus_1.Server({ transport });
let peerUpgradeHandler;
try {
    const peer = require("peer");
    const ExpressPeerServer = peer === null || peer === void 0 ? void 0 : peer.ExpressPeerServer;
    if (typeof ExpressPeerServer === "function") {
        // Create a fake server to intercept PeerJS's WebSocket upgrade handler
        const fakeServer = {
            on: (event, callback) => {
                if (event === "upgrade") {
                    peerUpgradeHandler = callback;
                }
            },
            listeners: (event) => [],
            removeAllListeners: (event) => { },
            address: () => httpServer.address(),
            listen: () => { },
            close: () => { },
            emit: () => { },
        };
        const peerServer = ExpressPeerServer(fakeServer, { path: "/" });
        app.use("/peerjs", peerServer);
    }
}
catch (e) {
    console.error("[Peer] Failed to attach PeerServer:", e);
}
httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    // console.log("[WS] Upgrade request:", url);
    if (url.startsWith("/peerjs")) {
        if (peerUpgradeHandler) {
            peerUpgradeHandler(req, socket, head);
        }
        else {
            socket.destroy();
        }
        return;
    }
    try {
        const wss = transport.wss;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    }
    catch (e) {
        console.error("[WS] Upgrade error:", e);
        try {
            socket.destroy();
        }
        catch (_a) { }
    }
});
gameServer.define("lobby", colyseus_2.LobbyRoom);
const TaloService_1 = require("./services/TaloService");
// Register GameRoom
gameServer.define("game_room", GameRoom_1.GameRoom)
    .enableRealtimeListing();
app.get("/api/leaderboard/:alias", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const alias = req.params.alias;
    try {
        const identifier = typeof req.query.identifier === "string" ? String(req.query.identifier) : undefined;
        const data = yield TaloService_1.TaloService.getLeaderboardEntries(alias, identifier);
        if (data && typeof data === "object" && "error" in data && data.error) {
            res.status(502).json(data);
            return;
        }
        res.json(data);
    }
    catch (e) {
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
}));
app.use("/colyseus", (0, monitor_1.monitor)());
// Auth API skeleton
const memoryPlayers = new Map();
const memoryIdentities = new Map();
function base64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function signJwt(payload) {
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24;
    const data = Object.assign(Object.assign({}, payload), { iat: now, exp });
    const encHeader = base64url(JSON.stringify(header));
    const encPayload = base64url(JSON.stringify(data));
    const signingInput = `${encHeader}.${encPayload}`;
    const key = process.env.SP_JWT_PRIVATE_KEY || "";
    const signer = crypto_1.default.createSign("RSA-SHA256");
    signer.update(signingInput);
    const signature = signer.sign(key);
    return `${signingInput}.${base64url(signature)}`;
}
function getDiscovery() {
    return __awaiter(this, void 0, void 0, function* () {
        const url = process.env.VIVERSE_OIDC_DISCOVERY_URL || "";
        const res = yield fetch(url);
        return yield res.json();
    });
}
function exchangeCode(code, redirectUri) {
    return __awaiter(this, void 0, void 0, function* () {
        const disc = yield getDiscovery();
        const endpoint = disc.token_endpoint;
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        body.set("client_id", process.env.VIVERSE_CLIENT_ID || "");
        body.set("client_secret", process.env.VIVERSE_CLIENT_SECRET || "");
        body.set("redirect_uri", redirectUri);
        const res = yield fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
        return yield res.json();
    });
}
function getUserInfo(accessToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const disc = yield getDiscovery();
        const endpoint = disc.userinfo_endpoint;
        const res = yield fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` } });
        return yield res.json();
    });
}
function ensurePlayer(providerUserId, nickname, avatarUrl) {
    const key = `viverse:${providerUserId}`;
    let playerId = memoryIdentities.get(key);
    if (!playerId) {
        playerId = crypto_1.default.randomUUID();
        memoryIdentities.set(key, playerId);
        memoryPlayers.set(playerId, { id: playerId, nickname, avatar_url: avatarUrl, viverse_user_id: providerUserId });
    }
    else {
        const p = memoryPlayers.get(playerId);
        if (p) {
            p.nickname = nickname || p.nickname;
            p.avatar_url = avatarUrl || p.avatar_url;
        }
    }
    return { id: playerId };
}
app.get("/auth/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const disc = yield getDiscovery();
    const authEndpoint = disc.authorization_endpoint;
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const url = new URL(authEndpoint);
    url.searchParams.set("client_id", process.env.VIVERSE_CLIENT_ID || "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile");
    res.redirect(url.toString());
}));
app.get("/auth/callback", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const code = String(req.query.code || "");
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    const tokens = yield exchangeCode(code, redirectUri);
    const info = tokens.access_token ? yield getUserInfo(tokens.access_token) : {};
    const providerUserId = String(info.sub || "");
    const nickname = String(info.name || "Player");
    const avatarUrl = String(info.picture || "");
    const player = ensurePlayer(providerUserId, nickname, avatarUrl);
    const jwt = signJwt({ playerId: player.id, nick: nickname, avatar_url: avatarUrl });
    const fe = process.env.FRONTEND_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const dest = new URL(fe);
    dest.searchParams.set("token", jwt);
    res.redirect(dest.toString());
}));
app.post("/auth/token/exchange", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const viverseToken = String((req.body && req.body.token) || "");
    const info = viverseToken ? yield getUserInfo(viverseToken) : {};
    const providerUserId = String(info.sub || "");
    const nickname = String(info.name || "Player");
    const avatarUrl = String(info.picture || "");
    const player = ensurePlayer(providerUserId, nickname, avatarUrl);
    const jwt = signJwt({ playerId: player.id, nick: nickname, avatar_url: avatarUrl });
    res.json({ token: jwt });
}));
app.get("/me", (req, res) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const payload = decodeJwt(token);
    if (!payload)
        return res.status(401).json({ error: "invalid token" });
    return res.json({ playerId: payload.playerId || "", nickname: payload.nick || "", avatar_url: payload.avatar_url || "" });
});
gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`);
//# sourceMappingURL=index.js.map