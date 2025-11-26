export class Config {
    // Replace this with your actual Hetzner IP or Domain
    public static readonly PROD_ENDPOINT = "wss://colyseus.spacepirates.duckdns.org";
    public static readonly LOCAL_ENDPOINT = "ws://localhost:2567";

    public static getColyseusEndpoint(): string {
        const hostname = window.location.hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return Config.LOCAL_ENDPOINT;
        }
        return Config.PROD_ENDPOINT;
    }
}
