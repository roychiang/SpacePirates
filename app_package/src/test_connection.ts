declare var process: any;
declare var require: any;

async function test() {
    const NodeWebSocket = require("ws");
    (globalThis as any).WebSocket = NodeWebSocket;
    const Colyseus = require("colyseus.js");
    if (!(globalThis as any).__colyseusPatched) {
        (globalThis as any).__colyseusPatched = true;
        const originalConnect = Colyseus.Room.prototype.connect;
        Colyseus.Room.prototype.connect = function (endpoint: any, devModeCloseCallback: any, room: any, headers: any) {
            console.log("Room connecting WS:", endpoint);
            originalConnect.call(this, endpoint, devModeCloseCallback, room, headers);
            const targetRoom = room || this;
            try {
                const ws = targetRoom?.connection?.transport?.ws;
                if (ws) {
                    ws.onerror = (e: any) => {
                        const message =
                            e?.reason ||
                            e?.message ||
                            e?.error?.message ||
                            (typeof e === "string" ? e : undefined) ||
                            undefined;
                        console.warn("Room, onError suppressed", message);
                    };
                }
            } catch { }
        };
    }

    const wsEndpoint = (process && process.env && process.env.WS_ENDPOINT) ? String(process.env.WS_ENDPOINT) : "ws://localhost:2567";
    const httpEndpoint = wsEndpoint.replace("wss://", "https://").replace("ws://", "http://");
    const client = new Colyseus.Client(wsEndpoint);
    console.log("Connecting...");

    try {
        const userId1 = "p1_" + Date.now();
        const userId2 = "p2_" + Date.now();

        const room1 = await client.create("game_room", { name: "Conn Test Room", userId: userId1, displayName: userId1 });
        console.log("Room created:", room1.roomId);

        const client2 = new Colyseus.Client(wsEndpoint);
        const room2 = await client2.joinById(room1.roomId, { userId: userId2, displayName: userId2 });
        console.log("Room joined (client2):", room2.roomId);

        let done = false;
        const finish = (exitCode: number) => {
            if (done) return;
            done = true;
            try { room1.leave(); } catch { }
            try { room2.leave(); } catch { }
            setTimeout(() => process.exit(exitCode), 250);
        };

        room2.onMessage("input", (message: any) => {
            console.log("Client2 received input:", message);
            finish(0);
        });

        setTimeout(() => {
            room1.send("input", {
                dx: 0,
                dy: 0,
                shooting: false,
                burst: false,
                breaking: false,
                launchMissile: true,
                missileTarget: 7,
                immelmann: false
            });
        }, 250);

        setTimeout(() => {
            if (!done) {
                console.error("Timed out waiting for input broadcast.");
                finish(1);
            }
        }, 5000);

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
