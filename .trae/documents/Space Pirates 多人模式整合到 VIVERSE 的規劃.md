## 目標與範圍
- 以現有專案設計風格與UI元件為基礎，交付「配對頁面」與「遊戲大廳」的元件規格、介面契約與原型交互草稿。
- 登入狀態僅以 VIVERSE `checkAuth()` 被動檢查，不使用任何會重導或刷新頁面的登入；名稱與頭像由 Avatar SDK 取得；未登入一律顯示名稱 `guest` 與預設圓形頭像。
- 遠端雙人模式優先，取消本地雙人模式，沿用本地玩法規則為網路同步版本。

## SDK 原則與識別
- VIVERSE Client：`clientId = "v48pybqy7f"`, `domain = 'account.htcvive.com'`，僅用 `checkAuth()`。
- Avatar SDK：以 `getToken()` 拿到 `access_token`，用 `avatar.getProfile()` 讀取 `name` 與 `headIconUrl`；未登入時使用預設圓形頭像。
- Play SDK：`playClient.newMatchmakingClient(appId = 'v48pybqy7f')`；用 `setActor`、`createRoom`、`joinRoom`、`getMyRoomActors` 等 API 對接配對與大廳。

## 前端服務介面契約（Service 層）
- AuthService（VIVERSE）
  - `initClient(config: { clientId: string; domain: string; cookieDomain?: string }): void`
  - `checkAuth(): Promise<{ access_token: string; account_id: string; expires_in: number; state?: string } | undefined>`
  - `getToken(): Promise<string | undefined>`
  - `getDisplayName(token?: string): Promise<string>`（登入→Avatar `name`；未登入→`guest`）
  - `isGuest(): Promise<boolean>`
- AvatarService（VIVERSE）
  - `init(token?: string): void`
  - `getProfile(): Promise<{ name: string; activeAvatar: { headIconUrl: string; vrmUrl?: string } | null }>`
  - `getActiveAvatar(): Promise<{ headIconUrl: string; vrmUrl: string }>`
  - `getPublicAvatarList(): Promise<Avatar[]>`
  - `getAvatarFileWithSDK(url: string): Promise<ArrayBuffer>`
  - `getHeadIconUrlOrDefault(profile?: Profile): string`（未登入或無頭像→返回預設）
- PlayService（VIVERSE）
  - `init(): void` / `newMatchmakingClient(appId: string, debug?: boolean): Promise<MatchmakingClient>`
  - `setActor(actor: { session_id: string; name: string; properties: Record<string, number | string> }): Promise<{ success: boolean; message?: string }>`
  - `createRoom(cfg: { name: string; mode: 'team'; maxPlayers: number; minPlayers: number; properties?: Record<string, any> }): Promise<CreateRoomResult>`
  - `joinRoom(roomId: string): Promise<JoinRoomResult>`
  - `leaveRoom(): Promise<{ success: boolean; message?: string }>`
  - `closeRoom(): Promise<{ success: boolean; message?: string }>`
  - `getAvailableRooms(): Promise<{ success: boolean; rooms: Room[] }>`
  - `getMyRoomActors(): Promise<{ success: boolean; actors: Actor[] }>`
  - 事件訂閱（若SDK提供）：`on(event: 'roomUpdated' | 'actorJoined' | 'actorLeft' | 'readyStateChanged', handler)`

## UI 元件規格（沿用既有設計語言）
- AvatarBadge
  - 屬性：`size: 'sm'|'md'|'lg'`、`src: string`、`fallbackSrc: string`、`ring: 'none'|'thin'|'glow'`
  - 事件：`onClick()`
  - 狀態：`loading`、`error`、`guest`
  - 規範：圓形邊框、內陰影與輕微外光暈；符合既有色彩與光效。
- PlayerCard
  - 屬性：`name: string`、`headIconUrl: string`、`ready: boolean`、`attributes: Record<string, number|string>`
  - 事件：`onToggleReady(nextReady: boolean)`、`onSelect()`
  - 狀態：`idle`、`updating`、`disabled`
  - 規範：卡片式布局、圓形頭像、右上角準備狀態綠勾標記。
- PlayerList
  - 屬性：`players: PlayerCardProps[]`
  - 事件：`onPlayerAction(playerId, action)`
  - 狀態：`empty`、`populated`
  - 規範：自動換行栅格；加入/離開時有≤200ms的過渡動畫。
- ReadyToggle
  - 屬性：`ready: boolean`、`disabled: boolean`
  - 事件：`onChange(nextReady: boolean)`
  - 狀態：`toggling`、`error`
  - 規範：與現有3D按鈕一致；切換時提供明確回饋。
- RoomHeader
  - 屬性：`room: { id; name; mode; maxPlayers; minPlayers; isClosed; properties }`
  - 事件：`onEditProperties(changes)`（房主）
  - 狀態：`loading`、`ready`
  - 規範：標題、模式徽章、玩家數、公開狀態。
- RoomControls
  - 屬性：`isMasterClient: boolean`、`allReady: boolean`
  - 事件：`onStartGame()`（房主）`onCloseRoom()`（房主）`onLeaveRoom()`
  - 狀態：`disabled`（非房主）
  - 規範：主操作採橙色主按鈕；非房主禁用與提示。
- QueuePanel
  - 屬性：`status: 'idle'|'queueing'|'matched'|'error'`、`estimatedWaitTime?: number`、`positionInQueue?: number`
  - 事件：`onCancelQueue()`
  - 狀態：`updating`、`timeout`
  - 規範：星塵進度條、數值展示；成功時彈性動畫提示。
- ModeCard（遠端雙人）
  - 屬性：`title`、`description`、`icon`
  - 事件：`onSelect(mode)`
  - 規範：沿用現有三卡片樣式（參照需求文件UI概覽）。
- StatusBar（主頁/配對）
  - 屬性：`auth: { isGuest: boolean; name: string; headIconUrl: string }`
  - 規範：與主頁玩家狀態一致（`multiplayer_product_requirements.md:32`）。
- RoomJoinForm
  - 屬性：`value: string`、`error?: string`
  - 事件：`onSubmit(roomId)`、`onChange(value)`
  - 規範：格式檢查、Enter提交、錯誤提示非侵入式。

## 頁面原型與交互草稿
- 配對頁（Matchmaking）
  - 版面：頂端 StatusBar → 模式 ModeCard 區 → QueuePanel → RoomJoinForm → 操作按鈕（建立房間/取消配對）。
  - 初始狀態：`auth = guest`、`QueuePanel.status = 'idle'`。
  - 主要流程：
    - 進入頁面→`checkAuth()`→`getToken()`→`getProfile()`→填充 StatusBar（無token時為guest）。
    - 選擇模式→呼叫 `newMatchmakingClient` → `setActor({ name, properties })`。
    - 建立房間→`createRoom({ mode: 'team', maxPlayers: 2, minPlayers: 2 })`→跳轉大廳。
    - 加入房間→`joinRoom(roomId)`→跳轉大廳。
    - 快速配對→`QueuePanel.status = 'queueing'`→顯示 `estimatedWaitTime`/`positionInQueue` →匹配成功跳轉大廳。
    - 取消配對→`leaveRoom()` 或停止隊列→回到 `idle`。
  - 錯誤/超時：顯示提示條；保留已輸入資料與 Actor 設定；提供重試入口。
  - 鍵盤操作：RoomJoinForm 支援 Enter；按鈕有焦點態與快捷鍵。
- 遊戲大廳（Lobby）
  - 版面：RoomHeader → PlayerList → ReadyToggle（每個玩家）→ RoomControls。
  - 初始狀態：載入房間資料與 `getMyRoomActors()`；PlayerList空態顯示。
  - 主要流程：
    - 玩家加入/離開：PlayerList動態更新與過渡動畫。
    - 準備機制：本地切換→同步到房內狀態；全部準備→房主 `onStartGame()` 觸發切換到遊戲。
    - 房主控制：`closeRoom()`、調整 `properties`（難度、其他）→同步到所有客戶端。
  - 權限：非房主操作禁用；工具提示說明原因。
  - 退出：`onLeaveRoom()` 回到配對頁面；保留最近房間資訊以便重連。

## 狀態機定義
- Matchmaking：`Idle → Selecting → SettingActor → Queueing → Matched → Lobby`；錯誤支線 `Error → Idle`；取消支線 `Queueing → Idle`。
- Lobby：`Loading → ReadyPartial → ReadyAll → Starting → Game`；退出支線 `ReadyPartial → Leaving → Matchmaking`。

## 資料模型契約（UI 層）
- `UserProfile`: `{ name: string; headIconUrl: string; activeAvatar?: Avatar | null }`（未登入時 `name = 'guest'`、`headIconUrl = default`）
- `Actor`: `{ session_id: string; name: string; properties: Record<string, number | string> }`
- `Room`: `{ id: string; app_id: string; mode: 'team'; name: string; actors: Actor[]; max_players: number; min_players: number; is_closed: boolean; properties: Record<string, any>; master_client_id: string; game_session: string; created_by_me: boolean }`
- `PlayerUI`: `{ id: string; name: string; headIconUrl: string; ready: boolean; attributes: Record<string, number | string> }`

## 視覺樣式規範
- 圓形頭像：`border-radius: 50%`、內陰影與微光暈；尺寸規格 `sm=40px`、`md=64px`、`lg=96px`；全列表統一對齊。
- 色彩：深色背景、橙色主按鈕、藍色隊友元素；字體與現有科技感一致；3D按鈕投影與hover態沿用現有規範。
- 動畫：配對成功/玩家準備切換 ≤200ms；非阻塞且可中斷；Loading採輕量骨架屏。

## 可測試性與限制
- 本地：以 UI 假資料與 Service stub 驗證交互；避免直接調用 SDK 真實登入（符合僅 viverse.com 完整測試的限制）。
- 正式：上傳 viverse.com 後以 `checkAuth()`、Avatar 與 Play SDK 進行端到端驗證。

## 風險與緩解
- 禁止重導登入：嚴格僅用 `checkAuth()`；本地預設為 guest，正式環境依賴容器 SSO。
- 斷線與重連：在 Matchmaking/Lobby 狀態機內提供恢復支線；保留房間資訊用於重入。
- 權限與房主變更：房主離開時的處理依 SDK 能力設計（轉移或關閉）；UI 明確提示。

## 驗收清單
- 配對頁：建立/加入/取消流程完整；進度資訊與狀態更新正確；無重導登入；UI風格與既有一致。
- 大廳：玩家列表與準備機制正確；房主控制權限明確；頭像圓形統一；錯誤與斷線回饋清晰。
- 整體：遠端雙人可從配對進入大廳並開始一局；未登入顯示 `guest` 與預設圓形頭像；性能與交互達到規範。