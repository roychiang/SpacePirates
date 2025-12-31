# Cloud Deployment Guide (Hetzner + VIVERSE)

This guide covers deploying the Game Server to **Hetzner** and the Client for **VIVERSE**.

## Part 1: Hetzner Server Deployment

### 1. Prepare Server
- **Server IP**: `46.224.54.46` (Example)
- **Domain**: `spacepirates.duckdns.org`
- **SSH Access**: Ensure you can `ssh root@46.224.54.46`.

### 2. Configure Project
1.  **Update Config**:
    - Ensure `app_package/src/Config.ts` has:
      ```typescript
      public static readonly PROD_ENDPOINT = "wss://spacepirates.duckdns.org";
      ```
2.  **Environment Variables**:
    - Create a local file named `server_env` (do not commit this) with:
      ```env
      PORT=2567
      MONITOR_TOKEN=admin-secret
      TALO_ACCESS_KEY=your-actual-talo-key
      ```

### 3. Deploy Files
1.  **Copy Files** to Hetzner:
    ```bash
    scp -r server app_package package.json DEPLOYMENT.md root@46.224.54.46:/opt/SpacePirates/
    ```
2.  **Copy Secrets**:
    ```bash
    scp server_env root@46.224.54.46:/opt/SpacePirates/server/.env
    ```

### 4. Install & Run (On Remote Server)
1.  **SSH into Server**:
    ```bash
    ssh root@46.224.54.46
    ```
2.  **Run Setup Script**:
    ```bash
    # Make sure the script is executable
    chmod +x /opt/SpacePirates/server/deploy/setup_hetzner.sh
    # Run it
    /opt/SpacePirates/server/deploy/setup_hetzner.sh
    ```
3.  **Verify**:
    - Check if Docker containers are running: `docker ps`
    - Check Caddy logs for SSL: `docker compose logs caddy`
    - Test Endpoint: `curl -I https://spacepirates.duckdns.org/colyseus`

---

## Part 2: VIVERSE Client Deployment

VIVERSE usually hosts the client content (WebGL build).

### 1. Build Client
1.  On your **Local Machine**:
    ```powershell
    cd app_package
    npm install
    npm run build
    ```
2.  This creates a `dist/` (or `public/`) folder with `index.html`, `bundle.js`, etc.

### 2. Upload to Hosting
- **Option A: VIVERSE Hosting** (If available): Upload the contents of `dist/` to your VIVERSE Creator Console.
- **Option B: External Hosting** (GitHub Pages / Netlify):
    1.  Push the `dist` folder to a gh-pages branch.
    2.  Or drag-and-drop `dist` folder to Netlify Drop.
    3.  **Get the URL**: e.g., `https://my-game.netlify.app`.

### 3. Link in VIVERSE
1.  Go to **VIVERSE Creator Console**.
2.  Create/Edit your **World**.
3.  Set the **Game URL** to your hosted client URL (from Step 2).

## Part 3: Verification

1.  **Enter VIVERSE World**: Launch your world in VIVERSE.
2.  **Check Connection**:
    - The game should load.
    - It should connect to `wss://spacepirates.duckdns.org` (Hetzner).
    - You should not see connection errors in the browser console (F12).
3.  **Test Gameplay**:
    - Play a round.
    - **Verify Leaderboard**: Finish a game and check if your score appears on the Leaderboard.
    - **Verify Anti-Cheat**: Since the server is handling scoring, if you see the score update, the secure pipeline is working!
