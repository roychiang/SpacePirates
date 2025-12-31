import { Engine, Vector2, Scene } from "@babylonjs/core";
import { Control, Button, Grid, StackPanel, Image, CornerHandle, AdvancedDynamicTexture, TextBlock, Rectangle, Slider, Checkbox, RadioButton, Ellipse } from "@babylonjs/gui";
import { Assets } from "./Assets";

export class GuiFramework {
    public static guiFont = {
        family: "magistral, sans-serif",
        book: "300",
        bold: "700",
        style: "normal"
    }

    public static isLandscape: boolean;
    public static screenWidth: number;
    public static screenHeight: number;
    public static screenRatio: number;
    public static ratioBreakPoint: number = 1.4;
    public static currentAdt: AdvancedDynamicTexture;
    public static globalOverlayAdt?: AdvancedDynamicTexture;
    public static cachedName?: string;
    public static cachedUrl?: string;

    public static updateGuiBasedOnOrientation(adt: AdvancedDynamicTexture) {
        let controls: any = adt.getDescendants(false);
        if (this.isLandscape === false) {
            for (let index in controls) {
                controls[index].alpha = 0
                controls[index].isEnabled = false;
            }
            let warning = adt.getControlByName("portraitWarning");
            if (warning) warning.alpha = 1.0;
        } else {
            for (let index in controls) {
                controls[index].alpha = 1
                controls[index].isEnabled = true;
            }
            let warning = adt.getControlByName("portraitWarning");
            if (warning) warning.alpha = 0.0;
        }
    }

    public static setOrientation(adt?: AdvancedDynamicTexture) {
        if (adt !== undefined) this.currentAdt = adt;
        this.isLandscape = (this.screenRatio > 1.4) ? true : false;
        if (this.currentAdt !== undefined) this.updateGuiBasedOnOrientation(this.currentAdt);
    };

    public static updateScreenRatio(engine: Engine) {
        this.screenWidth = engine.getRenderWidth(true);
        this.screenHeight = engine.getRenderHeight(true);
        this.screenRatio = this.screenWidth / this.screenHeight;
        this.setOrientation()
    }

    public static createBottomBar(adt: AdvancedDynamicTexture) {
        const fallbackUrl = window.location.href.includes('/docs/')
            ? window.location.origin + '/docs/'
            : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
        let bottomBarLeft: Image = new Image("bottomBarLeft", Assets.joinUrl(assetsHostUrl, "/assets/UI/bottomBarLeft.svg"));
        let bottomBarCenter: Image = new Image("bottomBarCenter", Assets.joinUrl(assetsHostUrl, "/assets/UI/bottomBarCenter.svg"));
        let bottomBarRight: Image = new Image("bottomBarRight", Assets.joinUrl(assetsHostUrl, "/assets/UI/bottomBarRight.svg"));
        let grid: Grid = new Grid();
        grid.addRowDefinition(270, true);
        grid.addColumnDefinition(645, true);
        grid.addColumnDefinition(1.0, false);
        grid.addColumnDefinition(790, true);
        grid.width = 0.914;
        grid.heightInPixels = 270;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        grid.addControl(bottomBarLeft, 0, 0);
        grid.addControl(bottomBarCenter, 0, 1);
        grid.addControl(bottomBarRight, 0, 2);
        adt.addControl(grid);

        // add in portrait warning... to do add portrait mode UI
        // let portraitWarning = new TextBlock ("portraitWarning", "Please play this game in landscape mode".toUpperCase());
        // this.setFont(portraitWarning, true, true);
        // portraitWarning.fontSize = "40px";
        // portraitWarning.color = "white";
        // portraitWarning.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        // portraitWarning.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        // portraitWarning.width = 1.0;
        // portraitWarning.height = 1.0;
        // portraitWarning.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        // portraitWarning.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        // portraitWarning.alpha = 0;
        // adt.addControl(portraitWarning);
    }

    public static ensureGlobalOverlay(scene: Scene) {
        if (!this.globalOverlayAdt) {
            this.globalOverlayAdt = AdvancedDynamicTexture.CreateFullscreenUI("GlobalOverlay", true, scene);
            this.globalOverlayAdt.idealHeight = 1440;
        }
        return this.globalOverlayAdt;
    }

    public static ensureGlobalTopLeftAvatar(adt: AdvancedDynamicTexture) {
        const targetAdt = this.globalOverlayAdt || adt
        const existing = targetAdt.getControlByName("globalPlayerListPanel")
        if (!existing) {
            this.createTopLeftAvatar(targetAdt)
        }
        return targetAdt.getControlByName("globalPlayerListPanel") as StackPanel
    }

    public static createTopLeftAvatar(adt: AdvancedDynamicTexture) {
        // Main Container (StackPanel)
        const panel = new StackPanel("globalPlayerListPanel");
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        panel.topInPixels = 10;
        panel.leftInPixels = 80;
        panel.width = "400px"; // Give it enough width
        panel.isVertical = true;
        
        // We will populate this panel dynamically in updateTopLeftAvatar
        // But for compatibility with existing code that expects a "globalAvatarGrid",
        // we can create an initial placeholder or just handle the update logic.
        
        // Existing code expects "globalAvatarGrid" to exist for Login Button attachment?
        // Let's create a dummy or refactor attachLoginButton.
        // Actually, attachLoginButton uses "globalAvatarGrid". 
        // We should create a default "Local Player" entry here to match legacy behavior.
        
        const localEntry = this.createPlayerEntry("globalAvatar", "Player", "", true);
        panel.addControl(localEntry);

        adt.addControl(panel);
        
        // Ensure we display something even if cachedName is missing
        this.updateTopLeftAvatar(this.cachedName || "Player", this.cachedUrl || "", adt);
        
        return panel;
    }

    public static createPlayerEntry(prefix: string, name: string, url: string, isLocal: boolean = false): Grid {
        const grid = new Grid(prefix + "Grid");
        grid.height = "70px";
        grid.width = "100%";
        grid.addColumnDefinition(80, true);
        grid.addColumnDefinition(1.0, false);
        
        const avatarWrapper = new Rectangle(prefix + "Wrapper");
        avatarWrapper.width = "64px";
        avatarWrapper.height = "64px";
        avatarWrapper.thickness = 0;
        avatarWrapper.cornerRadius = 32;
        avatarWrapper.clipChildren = true;
        avatarWrapper.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        avatarWrapper.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT; // Fix alignment
        
        const guestBg = new Rectangle(prefix + "Bg");
        guestBg.width = "64px";
        guestBg.height = "64px";
        guestBg.thickness = 0;
        guestBg.background = "#1b2b33";
        guestBg.cornerRadius = 32;
        
        const avatarImage = new Image(prefix + "Image", url || "");
        avatarImage.width = "64px";
        avatarImage.height = "64px";
        avatarImage.alpha = (url && url.length > 0) ? 1 : 0;
        guestBg.alpha = (url && url.length > 0) ? 0 : 1;

        const guestQuestion = new TextBlock(prefix + "Q");
        this.setFont(guestQuestion, true, true);
        guestQuestion.color = "#4f73ff";
        guestQuestion.fontSize = 36;
        guestQuestion.text = "?";
        guestQuestion.alpha = (url && url.length > 0) ? 0 : 1;
        
        avatarWrapper.addControl(guestBg);
        avatarWrapper.addControl(guestQuestion);
        avatarWrapper.addControl(avatarImage);
        
        const avatarRing = new Ellipse(prefix + "Ring");
        avatarRing.width = "64px";
        avatarRing.height = "64px";
        avatarRing.color = "#a6fffa";
        avatarRing.thickness = 2;
        avatarRing.background = "#688899"; // Wait, background fills the ring?
        // Original code had background #688899. 
        // But the Wrapper is inside a "Cell" StackPanel in original code.
        
        // Replicating structure:
        const avatarCell = new StackPanel(prefix + "Cell");
        avatarCell.width = "64px";
        avatarCell.height = "64px";
        avatarCell.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        avatarCell.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        avatarCell.addControl(avatarWrapper);
        avatarCell.addControl(avatarRing); // Ring over wrapper? Or under? 
        // Original: grid.addControl(avatarCell, 0, 0). 
        // And avatarCell added Wrapper then Ring. So Ring is on top (if same Z).
        // But Ring has background? If Ring has background it covers wrapper.
        // Let's assume original Ring background was transparent or behind.
        avatarRing.alpha = 0; // Hide ring by default if it blocks? 
        // Actually original code: avatarRing.background = "#688899".
        // If it's on top, it blocks. 
        // Let's check original code order:
        // avatarCell.addControl(avatarWrapper)
        // avatarCell.addControl(avatarRing)
        // StackPanel stacks VERTICALLY by default.
        // So Ring is BELOW Wrapper in Y-axis?
        // Original avatarCell was StackPanel (vertical).
        // Wrapper (64px) + Ring (64px) = 128px height?
        // But row definition was 80px.
        // This implies they were stacked vertically.
        // This seems wrong for a "Ring around avatar".
        // Usually you use a Grid to overlay.
        // Let's use a Grid for the Cell to overlay them.
        
        const cellGrid = new Grid();
        cellGrid.width = "64px";
        cellGrid.height = "64px";
        cellGrid.addControl(avatarRing); // Background
        cellGrid.addControl(avatarWrapper); // Foreground content
        
        grid.addControl(cellGrid, 0, 0);

        const nameCtrl = new TextBlock(prefix + "Name", name);
        this.setFont(nameCtrl, true, true);
        nameCtrl.color = "white";
        nameCtrl.fontSize = 24;
        nameCtrl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameCtrl.paddingLeft = "10px";
        
        grid.addControl(nameCtrl, 0, 1);
        
        return grid;
    }

    public static updateTopLeftAvatar(data: string | {name: string, url?: string}[], url?: string, targetAdt?: AdvancedDynamicTexture) {
        let adt = targetAdt || this.globalOverlayAdt || this.currentAdt;
        if (!adt) {
             // Fallback: Check if we can find any ADT from the scene or create a temporary one?
             // Better to just log warning, or if we are in Main/Game, maybe we can find one.
             // But let's try to ensure global overlay exists if we have a scene reference?
             // We don't have scene reference here.
             // But we can check if Main.adt exists? No Main is a state.
             
             // If we really need to update, maybe we should return.
             // But the user request implies we should "add a fallback ADT creation".
             // We need a scene to create ADT.
             return;
        }
        
        const panel = adt.getControlByName("globalPlayerListPanel") as StackPanel;
        if (!panel) return;

        // Determine list of players
        let players: {name: string, url?: string}[] = [];
        if (Array.isArray(data)) {
            players = data;
        } else {
            // Legacy single player update
            this.cachedName = data;
            this.cachedUrl = url;
            players.push({ name: data, url: url });
        }
        
        // If no players, at least show "Player"
        if (players.length === 0) {
             players.push({ name: "Player", url: "" });
        }

        // Clear existing children except potentially "Players Online" text if it was added manually?
        // Main.ts adds "playersOnlineText" to the container.
        // We should preserve controls that are NOT player entries.
        // Player entries start with "pEntry_" or "globalAvatar"
        
        // Filter out controls to keep
        const extras: Control[] = [];
        panel.children.forEach(c => {
             // Keep "globalPlayersOnline" and potentially other UI elements not related to player list
             if (c.name === "globalPlayersOnline" || (!c.name.startsWith("globalAvatar") && !c.name.startsWith("pEntry_"))) {
                 extras.push(c);
             }
        });
        
        panel.clearControls();

        // Restore extras
        extras.forEach(c => {
            panel.addControl(c);
        });
        
        players.forEach((p, index) => {
            // Use specific ID for first player to match legacy "globalAvatarName" lookups if needed
            // But better to just create fresh.
            // Main.ts might look for "globalAvatarName".
            // Let's support legacy lookup for the FIRST player.
            const prefix = index === 0 ? "globalAvatar" : `pEntry_${index}`;
            const entry = this.createPlayerEntry(prefix, p.name, p.url || "");
            panel.addControl(entry);
        });
        
        // Re-add extras
        extras.forEach(e => panel.addControl(e));
    }

    public static attachLoginButton(callback: () => void) {
        const adt = this.globalOverlayAdt || this.currentAdt
        if (!adt) {
            console.warn("[GuiFramework] attachLoginButton failed: No ADT available");
            return;
        }
        
        // Ensure the avatar grid exists
        this.ensureGlobalTopLeftAvatar(adt);
        
        const grid = adt.getControlByName("globalAvatarGrid") as Grid
        if (!grid) {
             console.warn("[GuiFramework] attachLoginButton failed: globalAvatarGrid not found after ensure");
             return;
        }

        let loginBtn = grid.children.find(c => c.name === "globalLoginBtn") as Button
        if (!loginBtn) {
            console.log("[GuiFramework] Creating new login button");
            loginBtn = Button.CreateSimpleButton("globalLoginBtn", "Log In")
            loginBtn.width = "100px"
            loginBtn.height = "36px"
            loginBtn.color = "#a6fffa"
            loginBtn.cornerRadius = 18
            loginBtn.background = "#1b2b33"
            loginBtn.thickness = 2
            loginBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
            loginBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
            loginBtn.fontSize = 16
            this.setFont(loginBtn, true, false)
            
            // Layout: 
            // Column 0: Avatar (64px + padding)
            // Column 1: Name (Rest)
            // We want to put the button to the right of the name or in place of it if empty?
            // Current createTopLeftAvatar defines:
            // grid.addColumnDefinition(200, true) // 0: Avatar cell (which is StackPanel)
            // grid.addColumnDefinition(1.0, false) // 1: Name
            
            // Wait, createTopLeftAvatar definition:
            // grid.addColumnDefinition(200, true) -> This is actually huge for just avatar (64px). 
            // The avatarCell is added at 0,0.
            // The name is added at 0,1.
            
            // Let's verify grid definition in createTopLeftAvatar:
            // grid.addColumnDefinition(200, true)
            // grid.addColumnDefinition(1.0, false)
            
            // So column 0 is 200px wide. Avatar is 64px. 
            // If we add button to column 1, it overlaps with Name.
            // Let's add it to column 1 but push it right.
            
            loginBtn.paddingLeft = "10px"; // Give some space from the start of the column
            
            // But wait, if name is present, we might want it next to it?
            // Let's just put it in column 1 for now, assuming name might be "Guest" or hidden.
            
            // If we want it strictly "next to avatar", we should put it in column 1.
            // But the name is also in column 1.
            
            // Let's check if we can adjust the grid.
            // Ideally we add a 3rd column.
            
            // Babylon.js GUI Grid doesn't expose columnDefinitions length directly in older versions or types might be strict.
            // We can just blindly add a column definition, it appends.
            // But we don't want to keep adding it if called multiple times.
            // We are already checking if loginBtn exists, so this block runs only once per button creation.
            // However, the grid might persist across sessions if we are not careful (but GuiFramework seems to reuse).
            
            // Let's assume we need to add a column for the button.
            // grid.addColumnDefinition(120, true);
            
            // Actually, let's keep it simple. The previous code had paddingLeft 150px in column 1.
            // Column 0 is Avatar (200px).
            // Column 1 is Name (1.0 star).
            // If we put button in Column 1 with paddingLeft 150px, it assumes the Name is shorter than 150px?
            // Or it overlaps.
            
            // Better approach:
            // Put it in Column 1.
            // Align it LEFT.
            // Give it a large left margin to push it past the name? No, name length varies.
            
            // Let's use a StackPanel in Column 1?
            // If the grid cell 1 already contains the TextBlock for name.
            // We can't easily wrap them in a stack panel without removing the name first.
            
            // Let's just place it at the top right of the screen or fixed position?
            // No, it should be next to avatar.
            
            // Let's add a new column at index 2.
            try {
                grid.addColumnDefinition(120, true);
                grid.addControl(loginBtn, 0, 2);
            } catch (e) {
                // Fallback if addColumnDefinition fails or index 2 is invalid logic
                console.log("[GuiFramework] Error adding column, falling back to col 1", e);
                loginBtn.paddingLeft = "150px";
                grid.addControl(loginBtn, 0, 1);
            }
            
            // Ensure zIndex is high
            loginBtn.zIndex = 10;
        } else {
             console.log("[GuiFramework] Login button already exists");
        }

        loginBtn.onPointerUpObservable.clear()
        loginBtn.onPointerUpObservable.add(callback)
        loginBtn.isVisible = true
    }



    public static createTextPanel(parentGrid: Grid) {
        const fallbackUrl = window.location.href.includes('/docs/')
            ? window.location.origin + '/docs/'
            : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
        let textPanelUL: Image = new Image("bottomBarLeft", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelUL.svg"));
        let textPanelUC: Image = new Image("bottomBarCenter", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelUC.svg"));
        let textPanelUR: Image = new Image("bottomBarRight", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelUR.svg"));
        let textPanelCL: Image = new Image("bottomBarLeft", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelCL.svg"));
        let textPanelCC: Image = new Image("bottomBarCenter", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelCC.svg"));
        let textPanelCR: Image = new Image("bottomBarRight", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelCR.svg"));
        let textPanelLL: Image = new Image("bottomBarLeft", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelLL.svg"));
        let textPanelLC: Image = new Image("bottomBarCenter", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelLC.svg"));
        let textPanelLR: Image = new Image("bottomBarRight", Assets.joinUrl(assetsHostUrl, "/assets/UI/textPanelLR.svg"));
        let grid: Grid = new Grid();
        grid.clipChildren = false;
        grid.addRowDefinition(170, true);
        grid.addRowDefinition(1.0, false);
        grid.addRowDefinition(220, true);
        grid.addColumnDefinition(340, true);
        grid.addColumnDefinition(1.0, false);
        grid.addColumnDefinition(440, true);
        grid.topInPixels = 50;
        grid.width = 0.9;
        grid.height = 0.8;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        grid.addControl(textPanelUL, 0, 0);
        grid.addControl(textPanelUC, 0, 1);
        grid.addControl(textPanelUR, 0, 2);
        grid.addControl(textPanelCL, 1, 0);
        grid.addControl(textPanelCC, 1, 1);
        grid.addControl(textPanelCR, 1, 2);
        grid.addControl(textPanelLL, 2, 0);
        grid.addControl(textPanelLC, 2, 1);
        grid.addControl(textPanelLR, 2, 2);
        parentGrid.addControl(grid, 0, 1);
        return grid;
    }

    public static createPageTitle(title: string, grid: Grid) {
        let textBlock = new TextBlock("panelTitle", title.toUpperCase());
        this.setFont(textBlock, true, true);
        textBlock.fontSize = 35;
        textBlock.color = "#a6fffa";
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        textBlock.topInPixels = 5;
        grid.addControl(textBlock, 0, 1);
    }

    public static debugCell(grid: Grid, cell: Vector2) {
        let rect = new Rectangle();
        rect.background = "red";
        rect.color = "orange";
        rect.thickness = 3;
        rect.width = 1.0;
        rect.height = 1.0;
        rect.alpha = 0.3;
        grid.addControl(rect, cell.x, cell.y);
    }

    public static createRadioButton(checked?: boolean) {
        let radio = new RadioButton();
        radio.color = "#ffffff";
        radio.background = "#688899";
        radio.thickness = 2;
        radio.shadowOffsetX = 2;
        radio.shadowOffsetY = 2;
        radio.shadowColor = "black";
        radio.height = 0.4;
        radio.checkSizeRatio = 0.5;
        radio.fixedRatio = 1.0;
        radio.leftInPixels = 20;
        radio.isChecked = (checked) ? checked : false;
        return radio;
    }

    public static createCheckbox() {
        let checkbox = new Checkbox();
        checkbox.color = "#ffffff"
        checkbox.background = "#688899"
        checkbox.thickness = 2;
        checkbox.shadowOffsetX = 2;
        checkbox.shadowOffsetY = 2;
        checkbox.shadowColor = "black";
        checkbox.height = 0.4;
        checkbox.fixedRatio = 1.0;
        checkbox.checkSizeRatio = 0.5;
        checkbox.leftInPixels = 20;
        return checkbox;
    }

    public static createSlider(min: number, max: number, startValue?: number) {
        let slider = new Slider();
        slider.minimum = min;
        slider.maximum = max;
        slider.height = 0.35;
        slider.color = "#269ad4";
        slider.background = "#688899"
        slider.thumbColor = "#a6fffa";
        slider.shadowOffsetX = 2;
        slider.shadowOffsetY = 2;
        slider.shadowColor = "black";
        slider.isThumbCircle = true;
        slider.value = (startValue) ? startValue : min;
        return slider;
    }

    public static createStatText(string: string) {
        let textBlock = new TextBlock("", string);
        this.setFont(textBlock, true, true);
        textBlock.color = "#a6fffa";
        textBlock.fontSize = 24;
        textBlock.leftInPixels = 20;
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        return textBlock;
    }

    public static createSplashText(string: string) {
        let textBlock = new TextBlock("", string.toUpperCase());
        this.setFont(textBlock, true, true);
        textBlock.color = "#a6fffa";
        textBlock.fontSize = 30;
        textBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        return textBlock;
    }

    public static createScreenshotText(grid: Grid, cell: Vector2, string: string, leftAlign?: boolean) {
        let textBlock = new TextBlock("", string.toUpperCase());
        this.setFont(textBlock, true, true);
        textBlock.color = "white";
        textBlock.fontSize = 16;
        textBlock.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        textBlock.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        if (leftAlign) {
            textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        } else {
            textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        }
        grid.addControl(textBlock, cell.x, cell.y);
        return textBlock;
    }

    public static createScreenshotGrid() {
        let grid = new Grid();
        for (let i = 0; i < 9; i++) {
            grid.addRowDefinition(0.1, false);
        }
        grid.addColumnDefinition(0.4, false);
        grid.addColumnDefinition(0.6, false);
        grid.height = 0.4;
        grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        return grid;
    }

    public static createRecapGrid() {
        let grid = new Grid();
        grid.addRowDefinition(0.1, false);
        grid.addRowDefinition(0.9, false);
        grid.addColumnDefinition(1.0, false);
        grid.topInPixels = 250;
        grid.height = 0.6;
        grid.width = 0.9;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        return grid;
    }

    public static createStatsGrid() {
        let grid: Grid = new Grid();
        grid.addColumnDefinition(0.5, false);
        grid.addColumnDefinition(0.5, false);
        grid.width = 1.0;
        grid.topInPixels = 0;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        grid.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        return grid;
    }

    public static createParametersGrid() {
        let grid: Grid = new Grid();
        grid.addColumnDefinition(0.4, false);
        grid.addColumnDefinition(0.6, false);
        grid.width = 0.6;
        grid.topInPixels = -100;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        return grid;
    }

    public static createParameter(grid: Grid, label: string, controlType: Control, currentValue?: number) {
        let rowHeight = 60;
        grid.addRowDefinition(rowHeight, true);
        let totalRows: number = grid.rowCount;
        grid.heightInPixels = totalRows * rowHeight;
        let parameterLabel = new TextBlock("", label.toUpperCase());
        this.setFont(parameterLabel, true, true);
        parameterLabel.color = "white";
        parameterLabel.fontSize = 24;
        parameterLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        parameterLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        controlType.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

        if (controlType.typeName === "Checkbox") {
            let checkbox = controlType as Checkbox;
            if (currentValue) checkbox.isChecked = Boolean(currentValue.valueOf());
            grid.addControl(checkbox, totalRows - 1, 1);
        }
        if (controlType.typeName === "Slider") {
            let sliderGrid = new Grid();
            sliderGrid.addRowDefinition(1.0, false);
            sliderGrid.addColumnDefinition(0.1, false);
            sliderGrid.addColumnDefinition(0.9, false);
            let sliderValue = new TextBlock()
            this.setFont(sliderValue, true, true);
            sliderValue.color = "white";
            sliderValue.fontSize = 24;

            let slider = controlType as Slider;
            slider.onValueChangedObservable.add(() => {
                sliderValue.text = Math.floor(slider.value * 100) as unknown as string;
            });
            sliderGrid.addControl(sliderValue, 0, 0);
            sliderGrid.addControl(slider, 0, 1);
            grid.addControl(sliderGrid, totalRows - 1, 1);
            if (currentValue) slider.value = currentValue;
        }

        if (controlType.typeName === "TextBlock") {
            grid.addControl(controlType, totalRows - 1, 1);
        }
        grid.addControl(parameterLabel, totalRows - 1, 0);
        return controlType;
    }

    public static setFont(element: any, isBold: boolean, hasShadow: boolean) {
        element.fontFamily = this.guiFont.family;
        if (isBold) {
            element.fontWeight = this.guiFont.bold;
        } else {
            element.fontWeight = this.guiFont.book;
        }
        if (hasShadow) {
            element.shadowOffsetX = 2;
            element.shadowOffsetY = 2;
            element.shadowColor = "black";
        }
        element.fontStyle = this.guiFont.style;
    }

    public static addButton(label: string, panel: StackPanel): Button {
        const fallbackUrl = window.location.href.includes('/docs/')
            ? window.location.origin + '/docs/'
            : window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
        const assetsHostUrl = Assets.globalAssetsHostUrl || fallbackUrl;
        var button = Button.CreateImageButton("button", label.toUpperCase(), Assets.joinUrl(assetsHostUrl, "/assets/UI/menuButton.svg"));
        let image: any = button.image;
        image.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        image.width = "400px";
        image.height = "200px";
        image.topInPixels = 0;
        let text: any = button.textBlock;
        text.width = "400px";
        text.zIndex = 10;
        text.topInPixels = -5;
        text.paddingRightInPixels = 50;
        text.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        text.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        button.fontSize = "26px";
        button.width = "400px";
        button.height = "100px";
        button.color = "#a6fffa";
        button.thickness = 0;
        if (this.isLandscape) {
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        } else {
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        }
        this.setFont(button, true, false);
        button.onPointerEnterObservable.add(() => {
            image.topInPixels = -100;
            button.color = "#ffffff";
        });
        button.onPointerOutObservable.add(() => {
            image.topInPixels = 0;
            button.color = "#a6fffa";
        });
        panel.addControl(button);
        return button;
    }

    public static createImageButton(name: string, imageUrl: string): Button {
        var button = Button.CreateImageButton(name, "", imageUrl);
        button.thickness = 0;
        return button;
    }

    public static formatButtonGrid(grid: Grid) {
        grid.addRowDefinition(1.0, false);
        grid.addRowDefinition(140, true);
        grid.addColumnDefinition(0.23, false)
        grid.addColumnDefinition(0.77, false)
        grid.width = 0.914;
        grid.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    }
}
