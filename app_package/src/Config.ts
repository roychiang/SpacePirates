declare var process: { env: { [key: string]: string | undefined } };

export class Config {
    public static readonly PROD_ENDPOINT = "wss://spacepirates.duckdns.org/colyseus";
    public static readonly LOCAL_ENDPOINT = "ws://localhost:2567";
    public static readonly PEERJS_PATH = "/peerjs";
    public static readonly VIVERSE_CLIENT_ID = process.env.VIVERSE_CLIENT_ID || "4p4wmv9d5z"; // Fallback to dev ID if not set

    public static getColyseusEndpoint(): string {
        try {
            const params = new URLSearchParams(window.location.search || "");
            const override =
                params.get("wsEndpoint") ||
                params.get("colyseusEndpoint") ||
                params.get("colyseus") ||
                params.get("ws");
            if (override && (override.startsWith("ws://") || override.startsWith("wss://"))) {
                return override;
            }
        } catch { }

        const hostname = window.location.hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1") return Config.LOCAL_ENDPOINT;

        if (hostname && (hostname.endsWith(".duckdns.org") || hostname.includes("spacepirates"))) {
            const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
            return `${wsProto}//${window.location.host}/colyseus`;
        }

        return Config.PROD_ENDPOINT;
    }

    public static getPeerServerUrl(): string {
        const ws = new URL(Config.getColyseusEndpoint());
        const protocol = ws.protocol === "wss:" ? "https:" : "http:";
        const url = new URL(`${protocol}//${ws.host}`);
        url.pathname = Config.PEERJS_PATH;
        return url.toString();
    }
}
