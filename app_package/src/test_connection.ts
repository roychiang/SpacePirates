import * as Colyseus from "colyseus.js";

declare var process: any;

async function test() {
    const client = new Colyseus.Client("ws://localhost:2567");
    console.log("Connecting...");

    try {
        const room = await client.create("game_room", { name: "Test Room" });
        console.log("Room created:", room.roomId);

        room.onMessage("input", (message: any) => {
            console.log("Received input:", message);
        });

        console.log("Sending input...");
        room.send("input", { x: 1, y: 1 });

        const available = await (client as any).getAvailableRooms("game_room");
        console.log("Available rooms:", available.length);
        available.forEach((r: any) => console.log(" -", r.roomId, r.metadata));

        setTimeout(() => {
            console.log("Leaving...");
            room.leave();
            process.exit(0);
        }, 1000);

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
