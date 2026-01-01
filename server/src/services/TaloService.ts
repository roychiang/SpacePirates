export class TaloService {
    static get baseUrl() {
        return process.env.TALO_BASE_URL || "https://api.trytalo.com/v1";
    }

    static get accessKey() {
        return process.env.TALO_ACCESS_KEY || "";
    }

    private static aliasIdCache = new Map<string, number>();
    private static blockedReason: string | null = null;

    private static requireAccessKey(): string {
        const k = this.accessKey;
        if (!k) {
            // Log once and return empty to prevent hard crashes if key is missing in dev
            if (!this.blockedReason) {
                console.warn("[TaloService] TALO_ACCESS_KEY is not set. Leaderboard/Stats will be disabled.");
                this.blockedReason = "TALO_ACCESS_KEY is not set";
            }
            return "";
        }
        return k;
    }

    private static async identifyAliasId(identifier: string): Promise<number> {
        if (this.blockedReason) throw new Error(this.blockedReason);

        const normalized = String(identifier || "").trim();
        if (!normalized) throw new Error("Missing player identifier");

        const cached = this.aliasIdCache.get(normalized);
        if (typeof cached === "number") return cached;

        const service = String(process.env.TALO_IDENTITY_SERVICE || "username");
        const url = new URL(`${this.baseUrl}/players/identify`);
        url.searchParams.set("service", service);
        url.searchParams.set("identifier", normalized);

        const res = await fetch(url.toString(), {
            headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            if (res.status === 403 && text.includes("Missing access key scope: read:players")) {
                this.blockedReason = "Talo access key is missing scope: read:players";
            }
            throw new Error(`Identify failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
        }

        const data: any = await res.json().catch(() => ({}));
        const aliasIdRaw = data?.alias?.id ?? data?.playerAlias?.id ?? data?.player_alias?.id ?? data?.id;
        const aliasId = typeof aliasIdRaw === "number" ? aliasIdRaw : Number(aliasIdRaw);
        if (!Number.isFinite(aliasId) || aliasId <= 0) {
            throw new Error(`Identify returned no alias id: ${JSON.stringify(data)}`);
        }

        this.aliasIdCache.set(normalized, aliasId);
        return aliasId;
    }

    static async updatePlayer(identifier: string, name: string) {
        try {
            if (this.blockedReason) return;
            const service = String(process.env.TALO_IDENTITY_SERVICE || "username");
            
            // 1. Identify to get Player ID
            const urlIdentify = new URL(`${this.baseUrl}/players/identify`);
            urlIdentify.searchParams.set("service", service);
            urlIdentify.searchParams.set("identifier", identifier);

            const resIdentify = await fetch(urlIdentify.toString(), {
                headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
            });

            if (!resIdentify.ok) return;
            const dataIdentify = await resIdentify.json();
            const playerId = dataIdentify?.player?.id;

            if (!playerId) return;

            // 2. Update Player Properties
            const urlUpdate = `${this.baseUrl}/players/${playerId}`;
            await fetch(urlUpdate, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.requireAccessKey()}`
                },
                body: JSON.stringify({
                    props: {
                        name: name
                    }
                })
            });
            console.log(`[TaloService] Updated player name for ${identifier} to ${name}`);
        } catch (e) {
            console.error("[TaloService] updatePlayer failed", e);
        }
    }

    static async reportScore(sessionId: string, score: number, kills: number, wins: number, playerIdentifier: string, mode: "single" | "coop" = "coop") {
        try {
            if (this.blockedReason) return;
            console.log(`[TaloService] Reporting score for ${sessionId} (ID: ${playerIdentifier}): Score=${score}, Kills=${kills}, Wins=${wins}, Mode=${mode}`);
            // 1. Send Game End Event
            await this.addEvent("game_end", { kills, win: wins > 0, mode }, playerIdentifier);
            
            // 2. Update Leaderboards
            const killsBoard = mode === "single" ? "TotalKillsSingle" : "TotalKillsCoop";
            const winsBoard = mode === "single" ? "TotalWinsSingle" : "TotalWinsCoop";

            // Update Total Kills
            await this.incrementLeaderboardScore(killsBoard, kills, playerIdentifier);

            // Update Total Wins
            if (wins > 0) {
                await this.incrementLeaderboardScore(winsBoard, wins, playerIdentifier);
            }
            
            // HighScore (Max)
            await this.submitToLeaderboard("HighScore", score, playerIdentifier);
        } catch (e) {
        }
    }

    static async incrementLeaderboardScore(alias: string, incrementBy: number, playerIdentifier: string) {
        if (incrementBy <= 0) return;
        
        try {
            if (this.blockedReason) return;
            console.log(`[TaloService] Incrementing ${alias} for ${playerIdentifier} by ${incrementBy}`);
            // 1. Fetch current entry to add to it (simulating Sum)
            let currentScore = 0;
            try {
                const aliasId = await this.identifyAliasId(playerIdentifier);
                const url = `${this.baseUrl}/leaderboards/${alias}/entries?page=0&aliasId=${encodeURIComponent(String(aliasId))}`;
            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.entries && data.entries.length > 0) {
                    const first = data.entries[0];
                    currentScore = parseFloat(first?.score) || 0;
                } else {
                }
            } else {
            }
        } catch (fetchErr) {
        }

        const newScore = currentScore + incrementBy;
        
        await this.submitToLeaderboard(alias, newScore, playerIdentifier);
    } catch (e) {
    }
}

    static async getLeaderboardEntries(alias: string, identifier?: string) {
        try {
            if (this.blockedReason) return { entries: [], error: this.blockedReason };
            if (!alias || typeof alias !== "string") {
                return { entries: [], error: "missing alias" };
            }
            const url = new URL(`${this.baseUrl}/leaderboards/${alias}/entries`);
            url.searchParams.set("page", "0");
            if (identifier) {
                const aliasId = await this.identifyAliasId(identifier);
                url.searchParams.set("aliasId", String(aliasId));
            }

            const res = await fetch(url.toString(), {
                headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
            });
            
            if (!res.ok) {
                 const text = await res.text().catch(() => "");
                 return { entries: [], error: `upstream ${res.status}` };
            }

            const data = await res.json();
            return data;
        } catch (e) {
            return { entries: [], error: (e as any)?.message ? String((e as any).message) : String(e) };
        }
    }

    static async getLeaderboards() {
        try {
            const res = await fetch(`${this.baseUrl}/leaderboards`, {
                headers: { "Authorization": `Bearer ${this.requireAccessKey()}` }
            });
            const data = await res.json();
            return data.leaderboards || [];
        } catch (e) {
            return [];
        }
    }

    static async submitToLeaderboard(alias: string, score: number, playerIdentifier: string) {
        try {
            if (this.blockedReason) return;
            const aliasId = await this.identifyAliasId(playerIdentifier);
            const res = await fetch(`${this.baseUrl}/leaderboards/${alias}/entries`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.requireAccessKey()}`,
                    "x-talo-alias": String(aliasId)
                },
                body: JSON.stringify({
                    score: score
                })
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`Submit failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
            }
        } catch (e) {
        }
    }

    static async addEvent(eventName: string, props: any, playerIdentifier: string) {
        try {
            if (this.blockedReason) return;
            const aliasId = await this.identifyAliasId(playerIdentifier);
            const res = await fetch(`${this.baseUrl}/events`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.requireAccessKey()}`,
                    "x-talo-alias": String(aliasId)
                },
                body: JSON.stringify({
                    key: eventName,
                    props: props
                })
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`Event failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
            }
            console.log(`[TaloService] Event ${eventName} sent`);
        } catch (e) {
            console.error("[TaloService] addEvent failed", e);
        }
    }
}
