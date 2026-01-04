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
    private _mentionPanel?: Control;
    private _mentionListStack?: StackPanel;
    private _chatOrb?: Button;
    private _notificationBadge?: Control; // New: Notification Badge
    private _keyboardHandler?: (e: KeyboardEvent) => void;
    private _inputBtnRef?: Button; // Keep ref to update text

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

        // Input Placeholder Button (Ref needed early for sync)
        const inputBtn = Button.CreateSimpleButton("inputBtn", "Tap to chat...");
        this._inputBtnRef = inputBtn;
        
        // Ensure text doesn't block button click
        if (inputBtn.textBlock) {
            inputBtn.textBlock.isHitTestVisible = false;
            inputBtn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            inputBtn.textBlock.paddingLeft = "20px";
        }

        // Chat Input Overlay (HTML-based for IME support)
        if (!this._chatOverlay) {
            this._chatOverlay = createChatInputOverlay(
                (text) => {
                    console.log("[Main] Overlay onSend triggered:", text);
                    // Sync text to Babylon UI button
                    if (inputBtn.textBlock) {
                        inputBtn.textBlock.text = text || "Tap to chat...";
                    }
                    playService.sendGlobalChat(text);
                },
                (text) => {
                    // Sync text to Babylon UI button
                    if (inputBtn.textBlock) {
                        inputBtn.textBlock.text = text || "Tap to chat...";
                    }
                },
                {
                    left: "50%",
                    right: "auto",
                    bottom: "35px", // Match new position
                    transform: "translateX(-50%)",
                    width: "calc(100% - 200px)", // Match new width logic
                    maxWidth: "600px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "rgba(0,0,0,0.5)", 
                    border: "1px solid #a6fffa",
                    fontSize: "16px",
                    textAlign: "left",
                    display: "none" // Initially hidden until chat opens
                }
            );
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
                        
                        // Show Input Overlay
                        if (this._chatOverlay) {
                             this._chatOverlay.el.style.display = "block";
                             this._chatOverlay.el.focus();
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
        mainGrid.addRowDefinition(1.0, false); // Chat history
        mainGrid.addRowDefinition(80, true);   // Input area
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

        // History
        const scroller = new ScrollViewer();
        scroller.width = "100%";
        scroller.height = "100%";
        scroller.thickness = 0;
        scroller.barSize = 10;
        scroller.barColor = "#a6fffa";
        scroller.background = "transparent";
        mainGrid.addControl(scroller, 1, 0);
        this._chatScroll = scroller;

        const stack = new StackPanel();
        stack.width = "100%";
        stack.paddingLeft = "20px";
        stack.paddingRight = "20px";
        scroller.addControl(stack);
        this._chatContent = stack;
        
        // Add welcome message
        this.onChatReceived({ senderId: "", name: "System", text: "Welcome to Global Chat!" });

        // Input Area
        const inputGrid = new Grid();
        inputGrid.height = "60px";
        inputGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; // Align top of this row
        inputGrid.addColumnDefinition(50, true); // Emoji btn
        inputGrid.addColumnDefinition(50, true); // Mention btn
        inputGrid.addColumnDefinition(1.0, false); // Input Spacer for HTML Overlay
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
                if (this._mentionPanel) this._mentionPanel.isVisible = false;
            }
        });
        inputGrid.addControl(emojiBtn, 0, 0);

        // Mention Button
        const mentionBtn = Button.CreateSimpleButton("mentionBtn", "@");
        mentionBtn.color = "#a6fffa";
        mentionBtn.background = "transparent";
        mentionBtn.thickness = 0;
        mentionBtn.fontSize = 24;
        mentionBtn.fontWeight = "bold";
        mentionBtn.onPointerUpObservable.add(() => {
             if (this._mentionPanel) {
                 this._mentionPanel.isVisible = !this._mentionPanel.isVisible;
                 if (this._emojiPanel) this._emojiPanel.isVisible = false;
                 
                 // Refresh list
                 if (this._mentionPanel.isVisible) {
                     this.refreshMentionList();
                 }
             }
        });
        inputGrid.addControl(mentionBtn, 0, 1);

        // Input Button (The trigger) - REMOVED for Always On
        // ... (previous removal code)
        
        // Update Overlay Position to match this spacer
        // We need to do this dynamically or just hardcode it to fit in the center
        if (this._chatOverlay && this._chatOverlay.el) {
            // Re-apply style to fit inside the grid row
            Object.assign(this._chatOverlay.el.style, {
                position: "absolute", // Relative to window, but we need to position it carefully
                left: "50%",
                bottom: "28px", // Align with bottom of chat container roughly
                transform: "translateX(-50%)", // Centered
                width: "calc(100% - 200px)", // Account for buttons (50+50+80 + padding)
                maxWidth: "600px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(0,0,0,0.5)", 
                border: "1px solid #a6fffa",
                fontSize: "16px",
                textAlign: "left",
                zIndex: "10001" // Above everything
            });
            
            // Move it to be a child of the container if possible? No, it's document.body.
            // We just need to make sure it shows/hides with the chat container.
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
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = "Tap to chat...";
                    }
                    // Keep visible for Always On
                    this._chatOverlay.el.focus();
                    // this._chatOverlay.hide();
                }
            }
        });
        inputGrid.addControl(sendBtn, 0, 3);

        // Emoji Picker Panel (Overlay inside container, centered)
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
                    // Update UI text immediately
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = this._chatOverlay.el.value;
                    }
                    // Do NOT call show() to avoid keyboard popup
                }
            });
            emojiGrid.addControl(btn, r, c);
        });

        // Mention Picker Panel
        const mentionContainer = new Rectangle("mentionContainer");
        mentionContainer.width = "300px";
        mentionContainer.height = "250px"; // Taller for list
        mentionContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        mentionContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        mentionContainer.top = "-90px"; // Above input row
        mentionContainer.background = "#051116fa";
        mentionContainer.color = "#a6fffa";
        mentionContainer.thickness = 2;
        mentionContainer.isVisible = false;
        mentionContainer.zIndex = 101;
        mentionContainer.cornerRadius = 12;
        container.addControl(mentionContainer); 
        this._mentionPanel = mentionContainer;

        const mentionScroll = new ScrollViewer();
        mentionScroll.width = "100%";
        mentionScroll.height = "100%";
        mentionScroll.thickness = 0;
        mentionScroll.barSize = 5;
        mentionScroll.barColor = "#a6fffa";
        mentionContainer.addControl(mentionScroll);
        
        const mentionStack = new StackPanel();
        mentionStack.width = "100%";
        mentionScroll.addControl(mentionStack);
        this._mentionListStack = mentionStack;
    }

    private refreshMentionList() {
        if (!this._mentionListStack) return;
        this._mentionListStack.clearControls();
        
        // Get players from global lobby
        const players = playService.globalLobbyState.players || [];
        const myId = playService.globalLobbyRoom?.sessionId;
        
        if (players.length === 0) {
            const noOne = new TextBlock("noOne", "No one else online");
            noOne.height = "40px";
            noOne.color = "gray";
            noOne.fontSize = 16;
            this._mentionListStack.addControl(noOne);
            return;
        }

        players.forEach(p => {
            // Don't mention self
            if (p.session_id === myId) return;

            const btn = Button.CreateSimpleButton("mention_" + p.session_id, "@" + p.name);
            btn.height = "40px";
            btn.width = "100%";
            btn.color = "white";
            btn.background = "transparent";
            btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.textBlock!.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.textBlock!.paddingLeft = "10px";
            
            btn.onPointerUpObservable.add(() => {
                if (this._chatOverlay) {
                    this._chatOverlay.el.value += "@" + p.name + " ";
                    // Update UI text immediately
                    if (this._inputBtnRef && this._inputBtnRef.textBlock) {
                        this._inputBtnRef.textBlock.text = this._chatOverlay.el.value;
                    }
                }
                if (this._mentionPanel) this._mentionPanel.isVisible = false;
            });
            this._mentionListStack!.addControl(btn);
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
            if (this._chatOverlay && this._chatOverlay.el.style.display === "none") {
                if (e.key === "Enter") {
                    const active = document.activeElement;
                    const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
                    if (!isInput) {
                        e.preventDefault();
                        this._chatOverlay.show();
                    }
                }
            }
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
