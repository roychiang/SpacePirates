# Local Testing Guide

This guide explains how to test all game functions locally (Gameplay, Multiplayer, Leaderboard, Anti-Cheat) without deploying to the cloud.

## 1. Prerequisites
- **Node.js** v18+ installed.
- **Docker** (Optional, but recommended for server).
- **Talo Account**: You need a Talo account for Leaderboards.

## 2. Setup Environment

### A. Server Configuration
1.  Navigate to `server/`.
2.  Create a `.env` file if it doesn't exist:
    ```env
    PORT=2567
    TALO_ACCESS_KEY=your-talo-access-key-here
    ```
    *(Note: For local testing, you can skip `TALO_ACCESS_KEY` if you are okay with the server using the hardcoded fallback dev key, OR ensure the fallback key in `TaloService.ts` is valid for your dev environment.)*

### B. Client Configuration
1.  Open `app_package/src/Config.ts`.
2.  Ensure `LOCAL_ENDPOINT` is set to `ws://localhost:2567`.
    ```typescript
    public static readonly LOCAL_ENDPOINT = "ws://localhost:2567";
    ```

## 3. Running the Project Locally

You can run the entire project (Client + Server) in a **single terminal window** from the project root.

1.  Navigate to the **Project Root** (`m:\Project\SpacePirates`):
    ```powershell
    cd m:\Project\SpacePirates
    ```
2.  Install dependencies (if first time):
    ```powershell
    npm install
    npm run recursive-install
    ```
    *(This installs dependencies for the root, app_package, server, and test_package all at once)*
3.  Start the project:
    ```powershell
    npm run dev
    ```
    *This command concurrently starts:*
    - **Game Server**: Listening on `ws://localhost:2567`
    - **Game Client**: Available at `http://localhost:8080`
    - **App Package Compiler**: Watches for changes in game logic.

4.  Open your browser at `http://localhost:8080` (or whatever port is displayed by webpack).

*(Note: `app_package` is just the game logic library. `test_package` is the actual runner that serves the game in the browser. Running `npm run dev` from the root handles everything.)*

## 4. Verification Checklist

### ✅ Multiplayer
- Open **two browser tabs** to `http://localhost:8080`.
- Click "Play" on both.
- **Verify**: You should see both ships in the same game world. Moving one ship should update on the other screen.

### ✅ Anti-Cheat & Scoring
- Play the game and destroy an enemy ship.
- **Verify Server Logs**: In Terminal 1 (Server), you should see logs like:
    ```
    [TaloService] Reporting score for sessionXYZ: Score=100...
    ```
- **Verify Client**: The "Total Kills" on the main menu (or Leaderboard) should update after you return to the menu (refresh might be needed if using local storage fallback).

### ✅ Leaderboard
- Navigate to the **Leaderboard** screen in the game.
- **Verify**: You should see entries populated from Talo (if your server key is valid).
- *Note*: If Talo is not configured, it might show empty or cached data.

### ❌ Viverse Login
- Login functionality will likely fail or show "Guest" because VIVERSE Auth often requires specific allowed domains (localhost might be allowed, but usually requires specific setup).
- **This is expected** as per your request.

## 5. Windows Environment Specifics

If you are developing on Windows, here are some specific tips:

### Terminal Setup
- We recommend using **PowerShell** (built into Windows) or **Git Bash** (if you prefer Linux-style commands).
- The commands in this guide (`cd`, `npm install`, `npm start`) work natively in PowerShell.

### Firewall Prompts
- When you first run `npm start` in the `server/` directory, Windows Defender Firewall may pop up asking to allow **Node.js** to access the network.
- **Action**: Check both "Private" and "Public" networks (or at least "Private") and click **Allow Access**.
- If you accidentally click "Cancel", you can manually add an exception for `node.exe` in "Windows Defender Firewall with Advanced Security".

### Port Conflicts
- If you see `Error: listen EADDRINUSE: address already in use :::2567`:
    - This means the server is already running or didn't close properly.
    - **Fix**: Open Task Manager (`Ctrl+Shift+Esc`), look for `Node.js JavaScript Runtime`, and End Task.
    - Alternatively, in PowerShell: `Stop-Process -Name node -Force` (Warning: this kills ALL running Node processes).

### Installing Node.js on Windows
- If you haven't installed Node.js yet:
    1.  Download the **LTS** version from [nodejs.org](https://nodejs.org/).
    2.  Run the installer (.msi).
    3.  Restart your terminal (PowerShell/VS Code) to update your PATH.
    4.  Verify by running `node -v` and `npm -v`.
