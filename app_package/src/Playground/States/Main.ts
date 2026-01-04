import { Nullable } from "@babylonjs/core";
import { Control, Grid, StackPanel, Button, Image, TextBlock, InputText, ScrollViewer, Rectangle } from "@babylonjs/gui";
import { GameDefinition } from "../Game";
import { Parameters } from "../Parameters";
import { BattleSelect } from "./BattleSelect";
import { Diorama } from "./Diorama";
import { State } from "./State";
import { States } from "./States";
import { Leaderboard } from "./Leaderboard";
import { Assets } from "../Assets";
import { GuiFramework } from "../GuiFramework";
import { playService, authService, avatarService } from "../../Viverse/Viverse";
import { TaloClient } from "../../Integrations/Talo";
import { createChatInputOverlay } from "../ChatInputOverlay";

export class Main extends State {

    public static diorama: Nullable<Diorama> = null;
    public static playButton: Nullable<Button> = null;
    private _playersOnlineText?: TextBlock;
    private _playersTimer?: number;
    private _lobbyHandler?: any;
    private _panel: Nullable<StackPanel> = null;

    // Chat UI
    private _chatRoot?: Control;
    private _chatContent?: StackPanel;
    private _chatScroll?: ScrollViewer;
    private _chatOverlay?: { show: () => void, hide: () => void, toggle: () => void, dispose: () => void, el: HTMLInputElement };
    private _emojiPanel?: Control;
    // private _mentionPanel?: Control; // Removed
    // private _mentionListStack?: StackPanel; // Removed
    private _onlineListStack?: StackPanel; // New: Online List
    private _onlineCountText?: TextBlock; // New: Online Count Header
    private _chatOrb?: Button;
    private _notificationBadge?: Control; 
    private _keyboardHandler?: (e: KeyboardEvent) => void;
    private _inputBtnRef?: Button;

    private onChatReceived = (msg: { senderId: string, name: string, text: string }) => {
        if (!this._chatContent) return;
        
        // Identify Self
        const mySessionId = playService.globalLobbyRoom?.sessionId;
        const isMe = mySessionId && msg.senderId === mySessionId;
        
        // Check Mention
        // We look for "@MyName" in the text.
        // Get my current name
        const myName = playService.getActor()?.name || playService.getGuestIdentity();
        // Simple case-insensitive check. Note: names might have spaces, so handle carefully.
        // If "Guest_123" is mentioned as "@Guest_123".
        const isMentioned = myName && msg.text.toLowerCase().includes("@" + myName.toLowerCase());

        const textBlock = new TextBlock();
        textBlock.textWrapping = true;
        textBlock.resizeToFit = true;
        textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.paddingLeft = "5px";
        textBlock.fontSize = 18;
        
        // Formatting
        if (isMe) {
            textBlock.text = `[You]: ${msg.text}`;
            textBlock.color = "#a6fffa"; // Cyan/Teal for self
        } else {
            textBlock.text = `[${msg.name}]: ${msg.text}`;
            textBlock.color = "white"; // Default for others
        }
        
        // Highlight if mentioned (override color)
        if (!isMe && isMentioned) {
             textBlock.color = "#ffaa00"; // Orange/Gold for mentions
             textBlock.fontWeight = "bold";
        }

        this._chatContent.addControl(textBlock);
        
        // Notification Badge Logic
        if (!this._chatRoot?.isVisible && !isMe) {
            if (this._notificationBadge) {
                this._notificationBadge.isVisible = true;
            }
        }

        setTimeout(() => {
            if (this._chatScroll) this._chatScroll.verticalBar.value = 1;
        }, 50);
    };

    private createChatUI() {
        if (!this._adt) return;
        if (this._chatRoot) return;

        // Subscribe to global lobby updates for the list
        this._lobbyHandler = (players: any[]) => {
            this.updateOnlineList(players);
        };
        playService.on("globalLobbyUpdated", this._lobbyHandler);

        // Input Placeholder Button - RE-ADDED
        const inputBtn = Button.CreateSimpleButton("inputBtn", "Tap to chat...");
        inputBtn.color = "white";
        inputBtn.background = "rgba(0,0,0,0.3)";
        inputBtn.thickness = 1;
        inputBtn.cornerRadius = 10;
        inputBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        inputBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        inputBtn.height = "40px";
        inputBtn.width = "95%";
        if (inputBtn.textBlock) {
            inputBtn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        }
        inputBtn.onPointerUpObservable.add(() => {
            if (this._chatOverlay) {
                this._chatOverlay.el.focus();
                if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                    if (this._inputBtnRef.textBlock.text === "Tap to chat...") {
                        this._inputBtnRef.textBlock.text = "";
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                        this._inputBtnRef.textBlock.paddingLeft = "10px";
                    }
                }
            }
        });
        this._inputBtnRef = inputBtn;

        // Input Area

        // Chat Input Overlay (HTML-based for IME support)
        if (!this._chatOverlay) {
            this._chatOverlay = createChatInputOverlay(
                (text) => {
                    console.log("[Main] Overlay onSend triggered:", text);
                    playService.sendGlobalChat(text);
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = "Tap to chat...";
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                        this._inputBtnRef.textBlock.paddingLeft = "0px";
                    }
                },
                (text) => {
                    // Sync text to button
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                         if (text && text.length > 0) {
                            this._inputBtnRef.textBlock.text = text;
                            this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                            this._inputBtnRef.textBlock.paddingLeft = "10px";
                         } else {
                            this._inputBtnRef.textBlock.text = "Tap to chat...";
                            this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                            this._inputBtnRef.textBlock.paddingLeft = "0px";
                         }
                    }
                },
                {
                    position: "absolute",
                    top: "-1000px", // Off-screen but focusable
                    left: "-1000px",
                    width: "1px",
                    height: "1px",
                    opacity: "0",
                    background: "transparent", 
                    border: "none",
                    color: "transparent",
                    fontSize: "16px",
                    zIndex: "10001",
                    outline: "none"
                }
            );

            // Revert to placeholder on blur if empty
            this._chatOverlay.el.addEventListener("blur", () => {
                if (this._chatOverlay && this._chatOverlay.el.value.length === 0) {
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = "Tap to chat...";
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                        this._inputBtnRef.textBlock.paddingLeft = "0px";
                    }
                }
            });
        }
        // 1. Chat Orb (Toggle Button)
            const orb = Button.CreateSimpleButton("chatOrb", "💬");
            orb.width = "60px";
            orb.height = "60px";
            orb.cornerRadius = 30;
            orb.color = "#a6fffa"; 
            orb.background = "#1b2b33ee"; 
            orb.thickness = 2;
            orb.fontSize = 28;
            
            // Align to Top Right (User Request)
            orb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            orb.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            orb.left = "-30px"; // Margin from right
            orb.top = "30px";   // Margin from top
            
            orb.zIndex = 20;
            orb.shadowColor = "#a6fffa";
            orb.shadowBlur = 10;
            
            orb.onPointerUpObservable.add(() => {
                if (this._chatRoot) {
                    this._chatRoot.isVisible = !this._chatRoot.isVisible;
                    if (this._chatRoot.isVisible) {
                        // Ensure connected when opening chat
                        playService.joinGlobalLobby();
                        
                        if (this._chatScroll) this._chatScroll.verticalBar.value = 1;
                        if (this._notificationBadge) this._notificationBadge.isVisible = false;
                        
                        // Update list immediately if data exists
                        if (playService.globalLobbyState && playService.globalLobbyState.players) {
                            this.updateOnlineList(playService.globalLobbyState.players);
                        }

                        // Show Input Overlay
                        if (this._chatOverlay) {
                             // Keep overlay in DOM but invisible/offscreen
                             this._chatOverlay.el.style.display = "block";
                             // Focus input button if needed
                        }
                    } else {
                        // Hide Input Overlay
                        if (this._chatOverlay) {
                             this._chatOverlay.el.style.display = "none";
                             this._chatOverlay.el.blur();
                        }
                    }
                }
            });
            this._adt.addControl(orb);
            this._chatOrb = orb;

            // Notification Badge
            const badge = new Rectangle("chatBadge");
            badge.width = "20px";
            badge.height = "20px";
            badge.cornerRadius = 10;
            badge.color = "red";
            badge.background = "red";
            badge.thickness = 0;
            
            badge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            badge.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            badge.left = "-30px"; // Match Orb left
            badge.top = "30px";   // Match Orb top (will sit on top/center of orb? No, let's offset it)
            // Actually, let's offset it to the top-right corner of the orb
            badge.left = "-25px"; 
            badge.top = "25px";
            
            badge.zIndex = 21;
            badge.isVisible = false;
        badge.isHitTestVisible = false;
        const badgeText = new TextBlock("badgeText", "!");
        badgeText.color = "white";
        badgeText.fontSize = 14;
        badgeText.fontWeight = "bold";
        badge.addControl(badgeText);
        this._adt.addControl(badge);
        this._notificationBadge = badge;

        // 2. Chat Container (Full Screen)
        const container = new Rectangle("chatContainer");
        container.width = "100%";
        container.height = "100%";
        container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.background = "#000000cc"; // Semi-transparent black
        container.thickness = 0;
        container.isVisible = false; // Hidden initially
        container.zIndex = 100; // Top layer
        this._adt.addControl(container);
        this._chatRoot = container;

        const mainGrid = new Grid();
        mainGrid.addRowDefinition(60, true);   // Header (Title + Close)
        mainGrid.addRowDefinition(1.0, false); // Content Area (Chat + List)
        mainGrid.addRowDefinition(60, true);   // Input area
        container.addControl(mainGrid);

        // Header
        const headerGrid = new Grid();
        headerGrid.addColumnDefinition(1.0, false);
        headerGrid.addColumnDefinition(60, true); // Close Btn
        mainGrid.addControl(headerGrid, 0, 0);

        const title = new TextBlock("chatTitle", "Global Chat");
        title.color = "#a6fffa";
        title.fontSize = 24;
        title.fontFamily = GuiFramework.guiFont.family;
        headerGrid.addControl(title, 0, 0);

        const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
        closeBtn.color = "white";
        closeBtn.background = "transparent";
        closeBtn.thickness = 0;
        closeBtn.fontSize = 24;
        closeBtn.onPointerUpObservable.add(() => {
            container.isVisible = false;
            if (this._chatOverlay) {
                this._chatOverlay.el.style.display = "none";
                this._chatOverlay.el.blur();
            }
        });
        headerGrid.addControl(closeBtn, 0, 1);

        // Content Area (Split Chat History and Online List)
        const contentGrid = new Grid();
        contentGrid.addColumnDefinition(0.75, false); // Chat History
        contentGrid.addColumnDefinition(0.25, false); // Online List
        mainGrid.addControl(contentGrid, 1, 0);

        // History (Column 0)
        const scroller = new ScrollViewer();
        scroller.width = "100%";
        scroller.height = "100%";
        scroller.thickness = 0;
        scroller.barSize = 10;
        scroller.barColor = "#a6fffa";
        scroller.background = "transparent";
        contentGrid.addControl(scroller, 0, 0);
        this._chatScroll = scroller;

        const stack = new StackPanel();
        stack.width = "100%";
        stack.paddingLeft = "20px";
        stack.paddingRight = "20px";
        scroller.addControl(stack);
        this._chatContent = stack;
        
        // Online List Panel (Column 1)
        const onlineGrid = new Grid();
        onlineGrid.addRowDefinition(40, true); // "Online (N)" Header
        onlineGrid.addRowDefinition(1.0, false); // List
        onlineGrid.background = "#051116aa"; // Slightly darker background
        contentGrid.addControl(onlineGrid, 0, 1);

        const onlineHeader = new TextBlock("onlineHeader", "Online (0)");
        onlineHeader.color = "#a6fffa";
        onlineHeader.fontSize = 18;
        onlineHeader.fontWeight = "bold";
        onlineGrid.addControl(onlineHeader, 0, 0);
        this._onlineCountText = onlineHeader;

        const onlineScroller = new ScrollViewer();
        onlineScroller.width = "100%";
        onlineScroller.height = "100%";
        onlineScroller.thickness = 0;
        onlineScroller.barSize = 5;
        onlineScroller.barColor = "#a6fffa";
        onlineGrid.addControl(onlineScroller, 1, 0);

        const onlineStack = new StackPanel();
        onlineStack.width = "100%";
        onlineScroller.addControl(onlineStack);
        this._onlineListStack = onlineStack;

        // Add welcome message
        this.onChatReceived({ senderId: "", name: "System", text: "Welcome to Global Chat!" });

        // Input Area
        const inputGrid = new Grid();
        inputGrid.height = "60px";
        inputGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // Align top of this row
        inputGrid.addColumnDefinition(50, true); // Emoji btn
        inputGrid.addColumnDefinition(1.0, false); // Input Button
        inputGrid.addColumnDefinition(80, true); // Send btn
        mainGrid.addControl(inputGrid, 2, 0);
        
        // Emoji Button
        const emojiBtn = Button.CreateSimpleButton("emojiBtn", "😀");
        emojiBtn.color = "#a6fffa";
        emojiBtn.background = "transparent";
        emojiBtn.thickness = 0;
        emojiBtn.fontSize = 24;
        emojiBtn.onPointerUpObservable.add(() => {
            if (this._emojiPanel) {
                this._emojiPanel.isVisible = !this._emojiPanel.isVisible;
            }
        });
        inputGrid.addControl(emojiBtn, 0, 0);

        // Input Button
        if (this._inputBtnRef) {
            inputGrid.addControl(this._inputBtnRef, 0, 1);
        }

        // Send Button
        const sendBtn = Button.CreateSimpleButton("sendBtn", "Send");
        sendBtn.color = "#1b2b33";
        sendBtn.background = "#a6fffa";
        sendBtn.thickness = 0;
        sendBtn.fontSize = 16;
        sendBtn.fontWeight = "bold";
        sendBtn.cornerRadius = 10;
        sendBtn.height = "50px";
        sendBtn.width = "70px";
        sendBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        sendBtn.onPointerUpObservable.add(() => {
            if (this._chatOverlay && this._chatOverlay.el) {
                const text = this._chatOverlay.el.value.trim();
                if (text) {
                    playService.sendGlobalChat(text);
                    this._chatOverlay.el.value = "";
                    this._chatOverlay.el.focus();
                    
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = "Tap to chat...";
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                        this._inputBtnRef.textBlock.paddingLeft = "0px";
                    }
                }
            }
        });
        inputGrid.addControl(sendBtn, 0, 2); 

        // Emoji Picker Panel
        const emojiContainer = new Rectangle("emojiContainer");
        emojiContainer.width = "300px";
        emojiContainer.height = "200px";
        emojiContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        emojiContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        emojiContainer.top = "-90px"; // Above input row
        emojiContainer.background = "#051116fa";
        emojiContainer.color = "#a6fffa";
        emojiContainer.thickness = 2;
        emojiContainer.isVisible = false;
        emojiContainer.zIndex = 101;
        emojiContainer.cornerRadius = 12;
        container.addControl(emojiContainer); 
        this._emojiPanel = emojiContainer;

        const emojiGrid = new Grid();
        emojiGrid.width = "1.0";
        emojiGrid.height = "1.0";
        emojiContainer.addControl(emojiGrid);

        // Emoji Menu Close Button
        const emoCloseBtn = Button.CreateSimpleButton("emoClose", "X");
        emoCloseBtn.width = "30px";
        emoCloseBtn.height = "30px";
        emoCloseBtn.color = "white";
        emoCloseBtn.background = "#ff0000aa";
        emoCloseBtn.cornerRadius = 15;
        emoCloseBtn.fontSize = 14;
        emoCloseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        emoCloseBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        emoCloseBtn.top = "-10px";
        emoCloseBtn.left = "10px";
        emoCloseBtn.onPointerUpObservable.add(() => {
            emojiContainer.isVisible = false;
        });
        emojiContainer.addControl(emoCloseBtn);

        const emojis = ["😀", "😂", "😍", "😎", "🤔", "😭", "👍", "👎", "🔥", "❤️", "🚀", "👋", "🙏", "💪", "🎉", "👻"];
        const cols = 4;
        const rows = 4;
        
        for (let i = 0; i < rows; i++) {
            emojiGrid.addRowDefinition(1.0 / rows, false);
        }
        for (let i = 0; i < cols; i++) {
            emojiGrid.addColumnDefinition(1.0 / cols, false);
        }

        emojis.forEach((emo, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const btn = Button.CreateSimpleButton("emo" + idx, emo);
            btn.color = "white";
            btn.background = "transparent";
            btn.thickness = 0;
            btn.fontSize = 24;
            btn.onPointerUpObservable.add(() => {
                if (this._chatOverlay) {
                    this._chatOverlay.el.value += emo;
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = this._chatOverlay.el.value;
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                        this._inputBtnRef.textBlock.paddingLeft = "10px";
                    }
                }
                if (this._emojiPanel) {
                    this._emojiPanel.isVisible = false;
                }
            });
            emojiGrid.addControl(btn, r, c);
        });

        // Mention Picker Panel - REMOVED
    }

    private updateOnlineList(players: any[]) {
        if (!this._onlineListStack || !this._onlineCountText) return;
        
        // Update Count
        this._onlineCountText.text = `Online (${players.length})`;
        
        // Clear List
        this._onlineListStack.clearControls();
        
        const myId = playService.globalLobbyRoom?.sessionId;
        
        if (players.length === 0) {
            // Should not happen if self is there, but handle empty
            return;
        }

        // Sort: Me first, then others alphabetically
        const sorted = [...players].sort((a, b) => {
            if (a.session_id === myId) return -1;
            if (b.session_id === myId) return 1;
            return a.name.localeCompare(b.name);
        });

        sorted.forEach(p => {
            const isMe = p.session_id === myId;
            const displayName = isMe ? `${p.name} (You)` : p.name;
            
            const btn = Button.CreateSimpleButton("player_" + p.session_id, displayName);
            btn.height = "40px";
            btn.width = "100%";
            btn.color = isMe ? "#a6fffa" : "white";
            btn.background = "transparent";
            btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.textBlock!.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.textBlock!.paddingLeft = "10px";
            
            // Mention Click Logic
            btn.onPointerUpObservable.add(() => {
                if (isMe) return; // Don't mention self

                if (this._chatOverlay) {
                    const current = this._chatOverlay.el.value;
                    const mention = `@${p.name} `;
                    
                    // Append if not already present or simple logic
                    this._chatOverlay.el.value = current + mention;
                    
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = this._chatOverlay.el.value;
                        this._inputBtnRef.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                        this._inputBtnRef.textBlock.paddingLeft = "10px";
                    }

                    // Focus
                    this._chatOverlay.el.focus();
                }
            });
            
            this._onlineListStack!.addControl(btn);
        });
    }

    // private sendChat() {} // Removed, handled by overlay callback

    public exit() {
        super.exit();
        this._panel = null;
        if (this._playersTimer) { window.clearInterval(this._playersTimer); this._playersTimer = undefined as any; }
        // _lobbyHandler no longer used for polling, but if we had one for events, clear it
        if (this._lobbyHandler) {
            playService.off("globalLobbyUpdated", this._lobbyHandler);
            this._lobbyHandler = undefined;
        }
        // Remove chat listener
        playService.off("globalChatReceived", this.onChatReceived);
        
        // Clean up Overlay
        if (this._chatOverlay) {
            this._chatOverlay.dispose();
            this._chatOverlay = undefined;
        }
        if (this._keyboardHandler) {
            window.removeEventListener("keydown", this._keyboardHandler);
            this._keyboardHandler = undefined;
        }
        
        // Clean up Chat UI Controls
        if (this._chatRoot) {
            this._chatRoot.dispose();
            this._chatRoot = undefined;
        }
        if (this._chatOrb) {
            this._chatOrb.dispose();
            this._chatOrb = undefined;
        }
        if (this._notificationBadge) {
            this._notificationBadge.dispose();
            this._notificationBadge = undefined;
        }
        
        if (this._adt && this._playersOnlineText) {
            const avatarGrid = GuiFramework.ensureGlobalTopLeftAvatar(this._adt);
            const t = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline");
            if (t) avatarGrid.removeControl(t);
            this._playersOnlineText = undefined;
        }
    }

    public enter() {
        super.enter();

        if (!this._adt) {
            return;
        }

        Main.diorama?.setEnable(this._adt);

        // Setup Keyboard Handler
        this._keyboardHandler = (e: KeyboardEvent) => {
            // Only if overlay is not already showing
            // if (this._chatOverlay && this._chatOverlay.el.style.display === "none") {
                if (e.key === "Enter") {
                    const active = document.activeElement;
                    const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
                    if (!isInput) {
                        e.preventDefault();
                        if (this._chatOverlay) {
                            this._chatOverlay.el.focus();
                        }
                    }
                }
            // }
        };
        window.addEventListener("keydown", this._keyboardHandler);

        playService.newMatchmakingClient("4p4wmv9d5z", true).then(() => { }).catch(() => { });

        // Force UI creation regardless of orientation for consistent Mobile/Desktop experience
        // Unified UI Logic (formerly "Landscape" mode)
        GuiFramework.createBottomBar(this._adt);
        var panel = new StackPanel();
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        let grid = new Grid();
        grid.paddingBottom = "100px";
        grid.paddingLeft = "100px";
        GuiFramework.formatButtonGrid(grid);
        grid.addControl(panel, 0, 0);
        this._panel = panel;

        const fallbackUrl = window.location.href.includes('/docs/')
            ? window.location.origin + '/docs/'
            : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
        let logo = new Image("spacePirates", Assets.joinUrl(assetsHostUrl, "/assets/UI/spacePiratesLogo.svg"));
        logo.width = 0.7;
        logo.fixedRatio = 340 / 1040;
        logo.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        logo.top = "100px";
        grid.addControl(logo, 0, 1);

        this.renderMainMenu();

        this._adt.addControl(grid);
        const existingAvatar = this._adt.getControlByName("globalPlayerListPanel");
        if (existingAvatar) {
            existingAvatar.dispose();
        }
        // Remove from global overlay if present to avoid duplication/fading issues
        const overlayAvatar = GuiFramework.globalOverlayAdt?.getControlByName("globalPlayerListPanel");
        if (overlayAvatar) overlayAvatar.dispose();

        // Force creation on this._adt to ensure it is on top of the Diorama fading layer
        const avatarGrid = GuiFramework.createTopLeftAvatar(this._adt);

        // Initialize Chat UI immediately
        this.createChatUI();
        playService.on("globalChatReceived", this.onChatReceived);

        // Check VIVERSE Auth
        authService.checkAuth().then(async (info) => {
            if (info) {
                try {
                    const profile = await avatarService.getProfile();
                    GuiFramework.updateTopLeftAvatar(profile.name || "Player", profile.activeAvatar?.headIconUrl, this._adt || undefined);
                    
                    // Set Actor for Talo/PlayService
                    const accountId = await authService.getAccountId();
                    playService.setActor({
                        session_id: accountId || (info as any).account_id || "User",
                        name: profile.name || "Player",
                        properties: { headIconUrl: profile.activeAvatar?.headIconUrl || "" }
                    });
                    playService.joinGlobalLobby();
                } catch (e) {
                    GuiFramework.updateTopLeftAvatar("Player", undefined, this._adt || undefined);
                }
            } else {
                const isViverseDomain = window.location.hostname.includes("viverse.com") || window.location.hostname.includes("htcvive.com");
                if (!isViverseDomain) {
                    // Login button temporarily disabled
                    // GuiFramework.attachLoginButton(() => { ... });
                }
                
                // Set Guest Actor
                if (!playService.getActor()) {
                    const guestId = playService.getGuestIdentity();
                    playService.setActor({
                        session_id: guestId,
                        name: guestId,
                        properties: {}
                    });
                }
                GuiFramework.updateTopLeftAvatar(playService.getActor()?.name || "Guest", undefined, this._adt || undefined);
                playService.joinGlobalLobby();
            }
        }).catch((e) => {
            // Set Guest Actor on failure too
            if (!playService.getActor()) {
                const guestId = playService.getGuestIdentity();
                playService.setActor({
                    session_id: guestId,
                    name: guestId,
                    properties: {}
                });
            }
            GuiFramework.updateTopLeftAvatar(playService.getActor()?.name || "Guest", undefined, this._adt || undefined);
            playService.joinGlobalLobby();
        });

        let playersText = avatarGrid.children.find((c: Control) => c.name === "globalPlayersOnline") as TextBlock;
        if (!playersText) {
            playersText = new TextBlock("globalPlayersOnline", "Players Online: --");
            GuiFramework.setFont(playersText, true, true);
            playersText.fontFamily = "Arial, Helvetica, sans-serif"; // Force standard font to avoid rendering artifacts
            playersText.color = "#a6fffa";
            playersText.fontSize = 24;
            playersText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            playersText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            playersText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            playersText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            playersText.isHitTestVisible = false;
            playersText.width = "300px";
            playersText.height = "30px";
            playersText.textWrapping = false;
            playersText.topInPixels = 26;
            // avatarGrid is now a StackPanel
            avatarGrid.addControl(playersText);
        }
        this._playersOnlineText = playersText;
        
        const updatePlayers = async () => {
             const total = await playService.getAllPlayersCount();
             if (this._playersOnlineText) {
                 this._playersOnlineText.text = `Players Online: ${total}`;
             }
        };
        
        updatePlayers();
        if (this._playersTimer) { window.clearInterval(this._playersTimer); }
        this._playersTimer = window.setInterval(updatePlayers, 5000); // Poll every 5 seconds
    }

    private renderMainMenu() {
        if (!this._panel) return;
        this._panel.clearControls();

        // Single Play
            Main.playButton = GuiFramework.addButton("Single", this._panel);
            Main.playButton.isVisible = Assets.loadingComplete;
            
            if (!Assets.loadingComplete) {
                const observer = Assets.onLoadingCompleteObservable.add(() => {
                    if (Main.playButton) {
                        Main.playButton.isVisible = true;
                    }
                    Assets.onLoadingCompleteObservable.remove(observer);
                });
            }

            Main.playButton.onPointerDownObservable.add(async () => {
                 const audioContext = this._adt?.getScene()?.getEngine().getAudioContext();
                 if (audioContext && audioContext.state === "suspended") {
                     await audioContext.resume();
                 }
                 if (!playService.getActor()) {
                     console.log("[Main] Play clicked but no actor set. Setting Guest.");
                     const guestId = playService.getGuestIdentity();
                     await playService.setActor({
                         session_id: guestId,
                         name: guestId,
                         properties: {}
                     });
                     GuiFramework.updateTopLeftAvatar(guestId, undefined, this._adt || undefined);
                 }
                 const gameDefinition = new GameDefinition();
                 gameDefinition.humanAllies = Parameters.allowSplitScreen ? 2 : 1;
                 gameDefinition.aiEnemies = Parameters.enemyCount;
                 gameDefinition.aiAllies = Parameters.allyCount;
                 BattleSelect.gameDefinition = gameDefinition;
                 State.setCurrent(States.battleSelect);
            });

        // CO-OP
        GuiFramework.addButton("CO-OP", this._panel).onPointerDownObservable.add(() => {
            States.matchmaking.pvpMode = false;
            State.setCurrent(States.matchmaking);
        });

        // Leaderboards (Submenu)
        GuiFramework.addButton("Leaderboards", this._panel).onPointerDownObservable.add(() => {
            this.renderLeaderboardMenu();
        });

        // Options
        GuiFramework.addButton("Options", this._panel).onPointerDownObservable.add(() => {
            States.options.backDestination = States.main;
            State.setCurrent(States.options);
        });

        // Credits
        GuiFramework.addButton("Credits", this._panel).onPointerDownObservable.add(() => {
            State.setCurrent(States.credits);
        });
    }

    private renderLeaderboardMenu() {
        if (!this._panel) return;
        this._panel.clearControls();

        // Leaderboard - Single Play
        GuiFramework.addButton("SINGLE", this._panel).onPointerDownObservable.add(() => {
             Leaderboard.leaderboardConfig = {
                 killsAlias: "TotalKillsSingle",
                 winsAlias: "TotalWinsSingle",
                 title: "Leaderboard (Single)"
             };
             States.leaderboard.backDestination = States.main;
             State.setCurrent(States.leaderboard);
        });

        // Leaderboard - CO-OP
        GuiFramework.addButton("CO-OP", this._panel).onPointerDownObservable.add(() => {
             Leaderboard.leaderboardConfig = {
                 killsAlias: "TotalKillsCoop",
                 winsAlias: "TotalWinsCoop",
                 title: "Leaderboard (CO-OP)"
             };
             States.leaderboard.backDestination = States.main;
             State.setCurrent(States.leaderboard);
        });

        // Back
        GuiFramework.addButton("Back", this._panel).onPointerDownObservable.add(() => {
            this.renderMainMenu();
        });
    }
}
