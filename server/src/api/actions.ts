import { Router } from "express";
import { matchMaker } from "colyseus";
import crypto from "crypto";

const router = Router();

// Middleware to check Auth
// Phase 3: Verify Bearer Token
const checkAuth = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ 
            status: "ERROR", 
            error: { code: "UNAUTHORIZED", message: "Missing or invalid Bearer token", retryable: false } 
        });
    }

    const token = authHeader.split(" ")[1];
    
    // DEV: Allow simple API Key for testing
    // To enable, set SP_DEV_API_KEY in .env
    const devKey = process.env.SP_DEV_API_KEY;
    if (devKey && token === devKey) {
        req.agent = { sub: "dev-user", name: "Developer" };
        return next();
    }

    // In a real environment, verify signature using SP_JWT_PUBLIC_KEY
    // For now, we decode and check structure/expiry
    try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token format");
        
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
    } catch (e) {
        return res.status(401).json({ 
            status: "ERROR", 
            error: { code: "UNAUTHORIZED", message: "Invalid token", retryable: false } 
        });
    }
};

// Common error response
const errorResponse = (res: any, code: number, errorCode: string, message: string, retryable: boolean = false) => {
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
router.post("/get_state", checkAuth, async (req, res) => {
    try {
        const { room_id } = req.body;
        if (!room_id) return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");

        const rooms = await matchMaker.query({ roomId: room_id });
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

    } catch (e: any) {
        console.error("[API] get_state error:", e);
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
});

// POST /api/actions/create_session
router.post("/create_session", checkAuth, async (req, res) => {
    try {
        const { mode, max_players, min_players_to_start, visibility, metadata } = req.body;
        
        const validModes = ["co-op", "pvp", "quick", "quick_solo", "quick_squad", "quick_battle"];
        if (mode && !validModes.includes(mode)) {
            return errorResponse(res, 400, "INVALID_ARGUMENT", "Invalid mode");
        }

        let gameMode = "coop";
        let mission: string | undefined;
        let defaultMax = 4;
        let defaultMin = 2;
        let roomName = "Agent Room";

        if (mode === "pvp") {
             gameMode = "pvp";
             roomName = "PVP Match";
        } else if (mode === "quick_solo") {
             gameMode = "quick";
             mission = "solo";
             defaultMax = 1;
             defaultMin = 1;
             roomName = "Solo Mission";
        } else if (mode === "quick_squad") {
             gameMode = "quick";
             mission = "squad";
             roomName = "Squad Mission";
        } else if (mode === "quick_battle") {
             gameMode = "quick";
             mission = "battle";
             roomName = "Quick Battle";
        } else if (mode === "quick") {
             gameMode = "quick";
        }

        // Special handling for Quick/Local modes:
        // Do not create a server-side room. Instead, return a deep link to client-side mode.
        if (gameMode === "quick") {
            let url = "https://www.spacepirates.app/?mode=quick";
            if (mission) {
                url += `&mission=${mission}`;
            }
            
            return res.json({
                status: "SUCCESS",
                result: {
                    room_id: "local_session", // Placeholder for schema compliance
                    host_player_id: "local_user"
                },
                next: {
                    open_url: url
                }
            });
        }

        const roomOptions = {
            name: (metadata && metadata.name) || roomName,
            game_mode: gameMode,
            maxPlayers: max_players || defaultMax,
            minPlayers: min_players_to_start || defaultMin,
            properties: {
                ...metadata,
                created_by: "agent"
            }
        };

        if (mission) {
            (roomOptions.properties as any).mission = mission;
        }

        const reservation = await matchMaker.create("game_room", roomOptions);

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

    } catch (e: any) {
        console.error("[API] create_session error:", e);
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
});

// POST /api/actions/join_session
router.post("/join_session", checkAuth, async (req, res) => {
    try {
        const { room_id, role, display_name } = req.body;
        if (!room_id) return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");

        const seat = await matchMaker.joinById(room_id, {
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

    } catch (e: any) {
        console.error("[API] join_session error:", e);
        if (e.message.includes("not found")) {
            return errorResponse(res, 404, "NOT_FOUND", "Room not found");
        }
        if (e.message.includes("locked") || e.message.includes("full")) {
            return errorResponse(res, 409, "SESSION_FULL", "Room is full or locked");
        }
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
});

// POST /api/actions/start
router.post("/start", checkAuth, async (req, res) => {
    try {
        const { room_id } = req.body;
        if (!room_id) return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id is required");

        const hasRoom = await matchMaker.remoteRoomCall(room_id, "forceStart");

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
    } catch (e: any) {
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
});

// POST /api/actions/send_chat
router.post("/send_chat", checkAuth, async (req, res) => {
    try {
        const { room_id, message } = req.body;
        if (!room_id || !message) return errorResponse(res, 400, "INVALID_ARGUMENT", "room_id and message required");

        // Construct chat payload
        const payload = {
            senderId: (req as any).agent?.playerId || "agent",
            name: (req as any).agent?.nick || "AI Agent",
            text: message,
            timestamp: Date.now()
        };

        const success = await matchMaker.remoteRoomCall(room_id, "handleRemoteChat", [payload]);

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

    } catch (e: any) {
        errorResponse(res, 500, "SERVER_ERROR", e.message, true);
    }
});

export const actionsRouter = router;
