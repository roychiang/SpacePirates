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
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionsRouter = void 0;
const express_1 = require("express");
const colyseus_1 = require("colyseus");
const router = (0, express_1.Router)();
// Middleware to check Auth
// Phase 3: Verify Bearer Token
const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            status: "ERROR",
            error: { code: "UNAUTHORIZED", message: "Missing or invalid Bearer token", retryable: false }
        });
    }
    const token = authHeader.split(" ")[1];
    // In a real environment, verify signature using SP_JWT_PUBLIC_KEY
    // For now, we decode and check structure/expiry
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            throw new Error("Invalid token format");
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return res.status(401).json({
                status: "ERROR",
                error: { code: "UNAUTHORIZED", message: "Token expired", retryable: false }
            });
        }
        // Attach agent info to request
        req.agent = payload;
        next();
    }
    catch (e) {
        return res.status(401).json({
            status: "ERROR",
            error: { code: "UNAUTHORIZED", message: "Invalid token", retryable: false }
        });
    }
};
// Common error response
const errorResponse = (res, code, errorCode, message, retryable = false) => {
    res.status(code).json({
        status: "ERROR",
        error: {
            code: errorCode,
            message,
            retryable
        }
    });
};
// POST /api/actions/get_state
router.post("/get_state", checkAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { room_id } = req.body;
        if (!room_id)
            return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");
        const rooms = yield colyseus_1.matchMaker.query({ roomId: room_id });
        const room = rooms[0];
        if (!room) {
            return errorResponse(res, 404, "NOT_FOUND", "Room not found");
        }
        // Map Colyseus metadata to SessionState
        const metadata = room.metadata || {};
        const isPlaying = metadata.playing || metadata.game_started;
        const phase = isPlaying ? "IN_GAME" : (room.locked ? "ENDED" : "LOBBY");
        const playerCount = metadata.playerCount || room.clients;
        const minPlayers = metadata.minPlayers || 2;
        let derivedPhase = phase;
        if (phase === "LOBBY" && playerCount >= minPlayers) {
            derivedPhase = "READY";
        }
        res.json({
            status: "SUCCESS",
            result: {
                state: {
                    room_id: room.roomId,
                    phase: derivedPhase,
                    max_players: room.maxClients,
                    min_players_to_start: minPlayers,
                    startable: derivedPhase === "READY",
                    players: [],
                    updated_at: new Date().toISOString()
                }
            },
            next: {
                open_url: `https://www.spacepirates.app/?join=${room.roomId}`
            }
        });
    }
    catch (e) {
        console.error("[API] get_state error:", e);
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
}));
// POST /api/actions/create_session
router.post("/create_session", checkAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { mode, max_players, min_players_to_start, visibility, metadata } = req.body;
        if (mode && !["co-op", "pvp", "quick"].includes(mode)) {
            return errorResponse(res, 400, "INVALID_ARGUMENT", "Invalid mode");
        }
        const roomOptions = {
            name: (metadata && metadata.name) || "Agent Room",
            game_mode: mode === "pvp" ? "pvp" : "coop",
            maxPlayers: max_players || 4,
            minPlayers: min_players_to_start || 2,
            properties: Object.assign(Object.assign({}, metadata), { created_by: "agent" })
        };
        const reservation = yield colyseus_1.matchMaker.create("game_room", roomOptions);
        res.json({
            status: "SUCCESS",
            result: {
                room_id: reservation.room.roomId,
                host_player_id: reservation.sessionId
            },
            next: {
                open_url: `https://www.spacepirates.app/?join=${reservation.room.roomId}`
            }
        });
    }
    catch (e) {
        console.error("[API] create_session error:", e);
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
}));
// POST /api/actions/join_session
router.post("/join_session", checkAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { room_id, role, display_name } = req.body;
        if (!room_id)
            return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");
        const seat = yield colyseus_1.matchMaker.joinById(room_id, {
            name: display_name || "Agent",
            role: role || "player"
        });
        res.json({
            status: "SUCCESS",
            result: {
                room_id: seat.room.roomId,
                player_id: seat.sessionId,
                role: role || "player"
            },
            next: {
                open_url: `https://www.spacepirates.app/?join=${seat.room.roomId}`
            }
        });
    }
    catch (e) {
        console.error("[API] join_session error:", e);
        if (e.message.includes("not found")) {
            return errorResponse(res, 404, "NOT_FOUND", "Room not found");
        }
        if (e.message.includes("locked") || e.message.includes("full")) {
            return errorResponse(res, 409, "SESSION_FULL", "Room is full or locked");
        }
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
}));
// POST /api/actions/start
router.post("/start", checkAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { room_id } = req.body;
        if (!room_id)
            return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");
        const hasRoom = yield colyseus_1.matchMaker.remoteRoomCall(room_id, "forceStart");
        if (!hasRoom) {
            return errorResponse(res, 404, "NOT_FOUND", "Room not found or action failed");
        }
        res.json({
            status: "SUCCESS",
            result: {
                room_id: room_id,
                phase: "IN_GAME"
            },
            next: {
                instruction: "Game started."
            }
        });
    }
    catch (e) {
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
}));
// POST /api/actions/send_chat
router.post("/send_chat", checkAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { room_id, message } = req.body;
        if (!room_id || !message)
            return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id and message required");
        // Construct chat payload
        const payload = {
            senderId: ((_a = req.agent) === null || _a === void 0 ? void 0 : _a.playerId) || "agent",
            name: ((_b = req.agent) === null || _b === void 0 ? void 0 : _b.nick) || "AI Agent",
            text: message,
            timestamp: Date.now()
        };
        const success = yield colyseus_1.matchMaker.remoteRoomCall(room_id, "handleRemoteChat", [payload]);
        if (!success) {
            return errorResponse(res, 404, "NOT_FOUND", "Room not found");
        }
        res.json({
            status: "SUCCESS",
            result: {
                room_id: room_id,
                accepted: true
            }
        });
    }
    catch (e) {
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
}));
exports.actionsRouter = router;
//# sourceMappingURL=actions.js.map