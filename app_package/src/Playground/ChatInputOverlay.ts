export function createChatInputOverlay(
    onSend: (text: string) => void,
    onInput?: (text: string) => void,
    styleOverrides?: Partial<CSSStyleDeclaration>
) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type message…";
    input.autocomplete = "off";
    input.spellcheck = false;
  
    // 位置與樣式
    Object.assign(input.style, {
      position: "fixed",
      left: "50%",
      bottom: "100px", // Adjusted to be slightly higher to avoid overlapping with bottom bar if any
      transform: "translateX(-50%)",
      width: "520px",
      maxWidth: "92vw",
      height: "40px",
      padding: "0 12px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.25)",
      outline: "none",
      background: "rgba(0,0,0,0.85)", // Slightly darker for better visibility
      color: "white",
      fontSize: "18px",
      zIndex: "9999",
      display: "block", // Changed from "none" to "block" for Always On
      ...styleOverrides
    } as CSSStyleDeclaration);
  
    document.body.appendChild(input);
  
    let isComposing = false; // IME 組字中（中文注音/拼音）
  
    input.addEventListener("compositionstart", () => (isComposing = true));
    input.addEventListener("compositionend", () => (isComposing = false));

    input.addEventListener("input", () => {
        if (onInput) onInput(input.value);
    });
  
    input.addEventListener("keydown", (e) => {
      // Enter 送出（IME 組字中不要送）
      if (e.key === "Enter" && !isComposing) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) onSend(text);
        input.value = "";
        if (onInput) onInput("");
        // Keep visible for multiple messages? Or hide? 
        // User behavior: usually send -> hide in games, or keep focus.
        // Let's keep focus for now if desktop, hide if mobile? 
        // For now, follow previous logic: hide.
        // hide(); // Disable hide for Always On
      }
  
      // ESC 取消
      if (e.key === "Escape") {
        e.preventDefault();
        input.value = "";
        if (onInput) onInput("");
        input.blur(); // Just blur instead of hide
        // hide(); 
      }
  
      // 防止你的 Babylon 控制鍵也吃到
      e.stopPropagation();
    });
    
    // Mobile/Touch support: prevent canvas from stealing focus or clicks
    input.addEventListener("touchstart", (e) => e.stopPropagation());
    input.addEventListener("touchend", (e) => e.stopPropagation());
  
    function show() {
      input.style.display = "block";
      // Small delay to ensure display is applied before focus
      setTimeout(() => {
          input.focus();
          // input.select(); // Optional: select all text on open
      }, 10);
    }
  
    function hide() {
      // input.blur();
      // input.style.display = "none";
    }
  
    function toggle() {
      // if (input.style.display === "none") show();
      // else hide();
    }
  
    function dispose() {
        if (input.parentNode) {
            input.parentNode.removeChild(input);
        }
    }
  
    return { show, hide, toggle, dispose, el: input };
  }
