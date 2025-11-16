## 概述與目標
- 以現有 Space Pirates UI 設計語言（Babylon GUI、深色太空主題、3D按鈕、卡片式面板）為基礎，交付多人模式的完整 UI/UX 與功能。
- 核心需求：
  - 登入系統：使用 VIVERSE SDK 的 `checkAuth()`（禁止 redirect），成功登入後取得玩家名稱與頭像，未登入顯示 `guest`。
  - 頭像顯示：所有 2D 頭像使用圓形邊框；未登入使用預設(default)圖像。
  - 玩家模式：取消本地雙人；沿用本地雙人玩法規則，實作遠端雙人模式。
  - 連線功能：使用 VIVERSE 的配對（Matchmaking）與多人網路連線（Play SDK）；`AppID/ClientID = "v48pybqy7f"`。
- 測試限制：VIVERSE SDK 功能需上傳至 viverse.com 後才能完整測試。

## 範圍
- 頁面：主頁（玩家狀態/模式選擇/快速配對）、配對頁、遊戲大廳、多人戰鬥頁、結果頁。
- SDK 整合：Auth、Avatar、Play（Matchmaking/Networking）。
- UI 元件：重用並擴充現有按鈕、卡片、列表、HUD、文字面板等。

## 依賴與限制
- SDK：VIVERSE Login & Authentication、Avatar SDK、Play SDK（Matchmaking/Networking）。
- 現有程式：Babylon.js GUI + TypeScript；UI 資產位於 `test_package/public/assets/UI`；字體由 Typekit 載入 `magistral`。
- 文件對齊：主頁需顯示玩家狀態（登入、等級、統計摘要）（`m:\Project\SpacePirates\.trae\documents\multiplayer_product_requirements.md:32`）。

## 使用者體驗原則
- 非重導登入：僅被動檢查 `checkAuth()`；不觸發 `loginWithWorlds()` 或任何會刷新頁面的流程。
- 即時回饋與穩定：所有操作提供 Loading/禁用/錯誤提示；斷線可恢復流程。
- 一致性：色彩、字體、按鈕/卡片、陰影與動畫與既有風格一致。

## 設計風格規範（沿用現有）
- 字體：`magistral, sans-serif`；字重 `300/700`；陰影 `black`、偏移 `(2,2)`；以 `setFont(element, isBold, hasShadow)` 套用。
- 色彩：
  - 主文字/按鈕：`#a6fffa`
  - 控件底色/邊框：`#688899`
  - 滑桿主色：`#269ad4`
  - HUD 條色：血量 `#af2d0e`、速度 `#e8b410`、冷卻 `#05d000`；背景 `#878787`
- 資產：`menuButton.svg`、`spacePiratesLogo.svg`、`statsPanel.svg`、`textPanel*.svg`、`bottomBar*.svg`、`trackerIcon.svg`、`missileLockIcon.svg`
- 圓形語言：以 Babylon GUI `Ellipse` 與 `Slider` 圓形拇指表現；頭像採圓形容器與遮罩實作。

## 功能需求
- 登入與玩家資訊
  - 初始化：`viverse.client({ clientId: "v48pybqy7f", domain: "account.htcvive.com" })`
  - 檢查：`checkAuth()` → `{ access_token, account_id, expires_in, state? } | undefined`
  - 名稱/頭像：登入時以 `getToken()` 取得 token，Avatar `getProfile()` → `name`、`headIconUrl`；未登入顯示 `guest` 與預設頭像。
- 頭像顯示
  - 所有 2D 頭像以圓形邊框展示，尺寸統一（40/64/96），陰影與光暈輕量。
  - 未登入使用預設(default)圖像，風格與既有資產一致。
- 遠端雙人模式
  - 沿用本地雙人玩法：輸入、武器、傷害、敵人波次等；新增 NetSync 層（輸入驅動 + 狀態增量；客戶端預測 + 房主權威修正）。
- 配對與連線
  - `playClient = new viverse.play()`；`matchmakingClient = await playClient.newMatchmakingClient("v48pybqy7f", debug)`
  - `setActor({ session_id, name, properties })`；`createRoom({ mode: 'team', maxPlayers: 2, minPlayers: 2 })`；`joinRoom(room_id)`；`getAvailableRooms()`；`getMyRoomActors()`；`leaveRoom()`；`closeRoom()`。

## 頁面需求
- 主頁
  - 玩家狀態：顯示登入狀態、名稱、圓形頭像；未登入為 `guest` 與預設頭像（`multiplayer_product_requirements.md:32`）。
  - 模式選擇：卡片式（遠端雙人優先）；快速配對按鈕大型橙色 3D。
- 配對頁
  - 頂端狀態列（名稱與圓形頭像）。
  - `QueuePanel`：星塵進度條、隊列位置、預估等待時間；建立/加入/取消配對。
  - `RoomJoinForm`：房間 ID 輸入檢查與 Enter 提交；錯誤提示非侵入式。
- 遊戲大廳
  - `RoomHeader`：房名、模式、人數上/下限、公開狀態、房主標記。
  - `PlayerList`：圓形頭像卡片，名稱、準備綠勾、屬性標籤；即時加入/離開過渡動畫。
  - `RoomControls`：房主 `開始遊戲`/`關閉房間`；所有玩家 `離開房間`；權限提示。
- 多人戰鬥頁
  - 沿用既有 HUD（血量/速度/冷卻）、共享目標系統；隊友狀態面板。
- 結果頁
  - 個人統計與隊伍成就；`再玩一次` 回到配對；樣式沿用控制面板風格。

## 互動規範
- 操作回饋：按鈕 Loading/Disabled 明確；匹配成功短促動畫；狀態切換平滑（≤200ms）。
- 錯誤處理：配對超時/權限錯誤清晰提示；保留輸入以便重試；斷線提供重連入口。
- 權限：房主與非房主操作區分；禁用時有工具提示說明。

## 介面契約（前端服務）
- AuthService：`initClient`、`checkAuth`、`getToken`、`getDisplayName`、`isGuest`
- AvatarService：`init`、`getProfile`、`getActiveAvatar`、`getPublicAvatarList`、`getAvatarFileWithSDK`、`getHeadIconUrlOrDefault`
- PlayService：`init`、`newMatchmakingClient`、`setActor`、`createRoom`、`joinRoom`、`leaveRoom`、`closeRoom`、`getAvailableRooms`、`getMyRoomActors`、`on`
- UI 模型：`UserProfile`、`Actor`、`Room`、`PlayerUI`

## 非功能需求
- 效能：60fps 目標（最低 30fps），載入戰鬥 ≤10s（與現有產品要求一致）。
- 網路：延遲目標 ≤100ms（可接受 ≤200ms）；斷線重連 5s 內恢復狀態。
- 相容性：Chrome 90+、Firefox 88+、Safari 14+；WebGL 2.0。

## 邊界情境
- 憑證失效：自動切換至 `guest` 顯示，保留 UI 操作（加入公開房）。
- 房間滿員：加入按鈕禁用並引導 `getAvailableRooms()`。
- 房主離開：若 SDK 支援房主轉移則自動轉移；否則提示房間關閉。

## 驗收標準
- 主頁正確顯示玩家狀態（登入顯示名稱與頭像；未登入為 `guest` 與預設頭像）。
- 所有 2D 頭像均為圓形邊框；樣式與現有資產一致。
- 配對頁可建立/加入/取消；進度與隊列資訊準確；錯誤回饋清晰。
- 大廳顯示玩家列表與準備機制；房主權限操作清晰；可開始遊戲。
- 遠端雙人可完整進行一局並展示結果；全流程於 viverse.com 上正常運作。

## 里程碑（Milestones）
- M1：PRD 與 UI 規格定稿（1 週）
  - 交付：本 PRD、介面契約與 UI 元件規範；頁面原型草圖（配對/大廳）。
- M2：Auth/Avatar 整合與主頁狀態（1 週）
  - 任務：`checkAuth`/`getToken`/`getProfile`；StatusBar 與圓形頭像；未登入 `guest` 與預設頭像。
  - 驗收：主頁準確顯示登入與頭像；無任何重導。
- M3：配對頁與 Play SDK 對接（1–2 週）
  - 任務：`newMatchmakingClient`、`setActor`、`createRoom`/`joinRoom`、QueuePanel/RoomJoinForm；取消配對與錯誤回饋。
  - 驗收：配對流程可建立/加入/取消，進度與隊列資訊正確。
- M4：大廳頁與準備機制（1–2 週）
  - 任務：PlayerList/RoomHeader/RoomControls；`getMyRoomActors`；房主開始遊戲。
  - 驗收：列表與準備狀態即時更新；房主權限操作生效。
- M5：遠端雙人 NetSync 整合（2 週）
  - 任務：輸入同步、狀態增量、預測/權威修正、斷線重連；沿用本地雙人玩法。
  - 驗收：雙人一局流暢，性能達標；重連可恢復。
- M6：結果頁與流程收斂（0.5 週）
  - 任務：個人/隊伍統計、再玩一次；樣式與現有一致。
- M7：viverse.com 環境 E2E 測試（1 週）
  - 任務：部署測試、修正授權與連線問題、邊界情境驗證。
- M8：優化與發佈準備（0.5–1 週）
  - 任務：性能優化、錯誤處理完善、監控與日誌、最終驗收。

## 風險與緩解
- 禁止重導登入：嚴格僅用 `checkAuth()`；本地維持 `guest`；正式由容器 SSO 提供憑證。
- 測試受限：本地以 UI 假資料與 stub 驗證交互；上傳 viverse.com 進行端到端測試。
- 網路同步複雜度：優先雙人模式，降低拓撲複雜度；採輸入驅動與增量同步，必要時降低頻率以保性能。
- 樣式一致性：所有新元件使用既有色彩與資產；新增資產需符合深色太空主題與 3D 立體風格。

## 交付與文檔
- PRD（本文件）：需求、流程、介面契約、UI 規範、里程碑。
- 原型：配對/大廳頁交互草圖與組件標注（尺寸、色彩、動效）。
- 測試計劃：本地 stub、viverse.com E2E、大廳與配對邊界情境用例。
- 驗收報告：按驗收標準列出通過項與修正項。