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

    public static async getLeaderboard(alias: string, identifier?: string): Promise<any> {
        console.log(`[Talo] getLeaderboard: Requesting leaderboard "${alias}" via Proxy` + (identifier ? ` for ${identifier}` : ""));
        try {
            // Use Server Proxy
            let endpoint = Config.getColyseusEndpoint().replace("wss://", "https://").replace("ws://", "http://");
            
            // If endpoint is invalid or undefined, fallback to window.location.origin + /api
            if (!endpoint || endpoint.includes("undefined")) {
                 endpoint = window.location.origin; // e.g. http://localhost:8080
            }
            
            const url = `${endpoint}/api/leaderboard/${alias}` + (identifier ? `?identifier=${encodeURIComponent(identifier)}` : "");
            
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

    public static async getPlayerStats(mode?: "single" | "coop"): Promise<{ kills: number, wins: number }> {
        console.log(`[Talo] getPlayerStats: Requesting player stats from Leaderboards (Mode: ${mode || "All"})...`);
        if (this._identity) await this.syncPlayer();
        
        try {
            // Helper to get score for a specific board and current identity
            const getScore = async (alias: string) => {
                // If no identity is set, do not fetch leaderboard or return 0 immediately
                if (!this._identity) return 0;
                
                const data = await this.getLeaderboard(alias, this._identity);
                if (data && data.entries && data.entries.length > 0) {
                     // Talo returns array with the user's entry if found
                     // If multiple (unlikely with aliasId), find matching
                     const entry = data.entries.find((e: any) => 
                        e.playerIdentifier === this._identity || 
                        (e.playerAlias && e.playerAlias.identifier === this._identity)
                     );
                     
                     // Only return score if we actually found the user
                     return entry ? parseFloat(entry.score) || 0 : 0;
                }
                return 0;
            };

            let k = 0;
            let w = 0;

            if (mode === "single" || !mode) {
                 k += await getScore("TotalKillsSingle");
                 w += await getScore("TotalWinsSingle");
            }
            
            if (mode === "coop" || !mode) {
                 k += await getScore("TotalKillsCoop");
                 w += await getScore("TotalWinsCoop");
            }

            console.log(`[Talo] Player Stats Found: Kills=${k}, Wins=${w}`);
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
