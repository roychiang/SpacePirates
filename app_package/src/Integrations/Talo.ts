import { Config } from "../Config";

export class TaloClient {
    // Client-side Talo integration via Server Proxy
    // No Access Key here!
    
    public static _playerAlias: any = null;
    private static _identity: string = "";

    public static init(accessKey?: string) {
        // No-op: Client no longer handles keys
        console.warn("[Talo] Client init called, but keys are now managed server-side.");
    }

    public static identify(identifier: string) {
        // No-op: Identity is handled by GameRoom auth
        this._identity = identifier;
        console.log(`[Talo] Identified locally as ${identifier}`);
    }

    private static async syncPlayer() {
        // No-op
    }

    public static async getLeaderboard(alias: string): Promise<any> {
        console.log(`[Talo] getLeaderboard: Requesting leaderboard "${alias}" via Proxy`);
        try {
            // Use Server Proxy
            let endpoint = Config.getColyseusEndpoint().replace("wss://", "https://").replace("ws://", "http://");
            
            // If endpoint is invalid or undefined, fallback to window.location.origin + /api
            if (!endpoint || endpoint.includes("undefined")) {
                 endpoint = window.location.origin; // e.g. http://localhost:8080
            }
            
            const url = `${endpoint}/api/leaderboard/${alias}`;
            
            console.log(`[Talo] Fetching ${url}`);
            const entriesRes = await fetch(url);

            if (!entriesRes.ok) {
                // If 404 or 502, it usually means leaderboard doesn't exist yet or proxy issue.
                // Return empty entries to avoid scary error messages in UI.
                console.warn(`[Talo] getLeaderboard: Failed to fetch. Status: ${entriesRes.status}`);
                return { entries: [] };
            }
            const entriesData = await entriesRes.json();
            console.log(`[Talo] getLeaderboard: Retrieved ${entriesData.entries?.length || 0} entries.`);
            return entriesData;
        } catch (e) {
            console.error("[Talo] getLeaderboard failed with exception:", e);
            return { entries: [] };
        }
    }

    private static async updateLeaderboard(alias: string, score: number) {
        console.warn("[Talo] updateLeaderboard called on client. This is now handled by the Server securely.");
    }

    public static async getPlayerStats(): Promise<{ kills: number, wins: number }> {
        console.log("[Talo] getPlayerStats: Requesting player stats from Leaderboards...");
        if (this._identity) await this.syncPlayer();
        
        try {
            const killsSingle = await this.getLeaderboard("TotalKillsSingle");
            const killsCoop = await this.getLeaderboard("TotalKillsCoop");
            const winsSingle = await this.getLeaderboard("TotalWinsSingle");
            const winsCoop = await this.getLeaderboard("TotalWinsCoop");
            
            const findScore = (lb: any) => {
                 if (!lb || !lb.entries) return 0;
                 // Match by identifier (if available) or alias if mapped
                 // Talo entries usually have 'playerAlias' object or 'playerIdentifier' string
                 const entry = lb.entries.find((e: any) => 
                    e.playerIdentifier === this._identity || 
                    (e.playerAlias && e.playerAlias.identifier === this._identity)
                 );
                 return entry ? parseFloat(entry.score) : 0;
            };

            const k = findScore(killsSingle) + findScore(killsCoop);
            const w = findScore(winsSingle) + findScore(winsCoop);
            console.log(`[Talo] Player Stats Found: Kills=${k} (S:${findScore(killsSingle)}+C:${findScore(killsCoop)}), Wins=${w}`);
            return { kills: k, wins: w };
        } catch (e) {
            console.error("[Talo] Failed to fetch player stats from leaderboards", e);
            return { kills: 0, wins: 0 };
        }
    }

    public static async addEvent(eventName: string, props: any) {
        console.log("[Talo] addEvent", eventName, props);
        // Client-side event tracking via Proxy
        try {
            let endpoint = Config.getColyseusEndpoint().replace("wss://", "https://").replace("ws://", "http://");
            if (!endpoint || endpoint.includes("undefined")) {
                 endpoint = window.location.origin;
            }
            const url = `${endpoint}/api/events`;
            
            const body = {
                eventName,
                props,
                identity: this._identity
            };

            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } catch (e) {
             console.error("[Talo] addEvent failed", e);
        }
    }
}
