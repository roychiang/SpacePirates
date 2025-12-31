# Cheating Evaluation & Mitigation Plan

## Current Security Evaluation

The current implementation is **highly vulnerable to cheating**.

1. **Exposed Secrets**: The Talo API Access Key is hardcoded in the client-side code (`app_package/src/Integrations/Talo.ts`). Any player can extract this key.
2. **Client-Side Trust**: The game result (kills, wins) is reported directly by the client to the Talo API. A player can easily send a fake HTTP request with an arbitrary high score.
3. **No Server Validation**: The Multiplayer Server (`GameRoom.ts`) currently acts only as a relay. It does not verify if the score is legitimate or if the game actually took place as reported.

## Proposed Solution: Move Authority to Server

To prevent cheating, we must move the sensitive operations (score tracking and submission) to the trusted server.

### Phase 1: Server-Side Talo Integration

1. **Create Server Talo Service**: Implement a `TaloService` in the server project to handle API calls securely.
2. **Secure Storage**: Move the API Key from the client code to server environment variables.

### Phase 2: Authoritative Game Logic (Server)

1. **Track Score on Server**: Modify `GameRoom.ts` to maintain a server-side score.
2. **Validate Actions**: Instead of the client sending "Current Score is 500", the client should send "I killed Enemy A". The server will then increment the score if valid.
3. **Server-Side Submission**: When the game ends, the **Server** will report the final stats to Talo, ensuring only verified results are recorded.

### Phase 3: Client Updates

1. **Remove Secrets**: Delete the API Key and direct reporting logic from the client.
2. **Update Flow**: Change `PlayService.ts` to notify the server of events (kills, game over) instead of updating the cloud directly.

## Implementation Steps

1. **Server**: Create `server/src/services/TaloService.ts` and implement `reportScore`.
2. **Server**: Update `server/src/rooms/GameRoom.ts` to:

   * Handle `enemyKilled` messages to track score.

   * Handle `gameEnd` to submit results via `TaloService`.
3. **Client**: Clean up `app_package/src/Integrations/Talo.ts` (remove key/write operations).
4. **Client**: Update `PlayService.ts` to send `enemyKilled` messages.

