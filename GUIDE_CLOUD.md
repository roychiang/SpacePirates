# Cloud Deployment Guide (Hetzner + VIVERSE)

This guide covers deploying the Game Server to **Hetzner** and the Client for **VIVERSE**.

## Part 1: Hetzner Server Deployment

### 1. Prepare Server
- **Server IP**: `46.224.54.46` (Example)
- **Domain**: `www.spacepirates.app` (Previously spacepirates.duckdns.org)
- **SSH Access**: Ensure you can `ssh root@<server-ip>`.

### 2. Configure Project
1.  **Update Config**:
    - Ensure `app_package/src/Config.ts` has:
      ```typescript
      public static readonly PROD_ENDPOINT = "wss://www.spacepirates.app";
      ```
2.  **Environment Variables**:
    - Create a local file named `server_env` (do not commit this) with:
      ```env
      PORT=2567
      MONITOR_TOKEN=admin-secret
      TALO_ACCESS_KEY=your-actual-talo-key
      VIVERSE_CLIENT_ID=...
      VIVERSE_CLIENT_SECRET=...
      SPACEPIRATES_DOMAIN=www.spacepirates.app
      ```

### 3. Deploy Files
1.  **Copy Files** to Hetzner:
    ```bash
    # Copy the entire project (excluding node_modules etc via .gitignore logic usually, but here we copy explicit folders)
    # We recommend using git on the server, but for manual copy:
    scp -r server test_package app_package package.json GUIDE_CLOUD.md root@<server-ip>:/opt/SpacePirates/
    ```
2.  **Copy Secrets**:
    ```bash
    scp server_env root@<server-ip>:/opt/SpacePirates/server/.env
    ```

### 4. Install & Run (On Remote Server)
1.  **SSH into Server**:
    ```bash
    ssh root@<server-ip>
    ```
2.  **Run Setup Script**:
    This script installs Docker, builds the client, and starts the server.
    ```bash
    # Make sure the script is executable
    chmod +x /opt/SpacePirates/server/deploy/setup_hetzner.sh
    # Run it
    /opt/SpacePirates/server/deploy/setup_hetzner.sh
    ```
3.  **Verify**:
    - Check if Docker containers are running: `docker ps`
    - Check Caddy logs for SSL: `docker compose logs caddy`
    - Test Endpoint: `curl -I https://www.spacepirates.app/colyseus`

---

## Part 2: Agent Verification

To verify that the Agent API is discoverable by GPTs:

1.  **Manifest Check**:
    - Visit `https://www.spacepirates.app/.well-known/agent.json`
    - It should return a JSON object with `id: "spacepirates"` and `actions`.

2.  **OpenAPI Spec**:
    - Visit `https://www.spacepirates.app/openapi.yaml`
    - It should return the API definition.

3.  **GPT Action Test**:
    - In your GPT configuration, import the OpenAPI spec from URL or text.
    - Test the `get_state` or `create_session` actions.

---

## Part 3: VIVERSE Client Deployment

VIVERSE usually hosts the client content (WebGL build).

### 1. Build Client
1.  On your **Local Machine** (or Server if using Caddy to host):
    ```powershell
    cd test_package
    npm install
    npm run build
    ```
2.  This creates a `../docs` folder with `index.html`, `bundle.js`, etc.
    - In our Docker setup, this `docs` folder is mounted to Caddy and served at `https://www.spacepirates.app/`.

### 2. Verify Client
- Visit `https://www.spacepirates.app/`
- It should load the game and connect to the server.
