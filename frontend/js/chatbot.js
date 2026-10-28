// ==========================================================
// CHATBOT.JS - floating "AI Assistant" on every page
// ----------------------------------------------------------
// One self-contained component: it adds its own HTML, so pages
// only need to load js/chatbot.js (after common.js).
// The answers come from a real AI:
//   - this project: POST /api/chat (backend/routes/chat.js asks
//     Claude with the API key kept on the server)
//   - another host can pass window.ChatbotConfig = { ask, go, page }
// Styles: section 21 of css/style.css.
// ==========================================================
(function () {
    if (document.querySelector(".cb-root")) return;           // only one chatbot per page

    // ---------- Where the chat's links go ----------
    const PAGES = {
        welcome: "welcome.html", home: "index.html", find: "find-donor.html", camps: "camps.html",
        banks: "camps.html?view=banks", register: "register.html", emergency: "emergency.html",
        login: "login.html", signup: "signup.html", dashboard: "dashboard.html", profile: "dashboard.html#profile", terms: "terms.html"
    };

    // ---------- Default: ask our own server ----------
    const defaults = {
        page: () => (location.pathname.split("/").pop() || "welcome.html").replace(".html", ""),
        go: key => { location.href = PAGES[key]; },
        async ask(messages, { onText, page }) {
            let response;
            try {
                response = await fetch(`${typeof API_URL !== "undefined" ? API_URL : "/api"}/chat`, {
                    method: "POST", credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ messages, page })
                });
            } catch (e) { throw { code: "offline", message: "Cannot reach the server. Is node server.js running?" }; }
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw { code: data.code || "error", message: data.message || "The AI could not answer right now." };
            onText(data.reply);
            return data.reply;
        }
    };
    const cfg = Object.assign({}, defaults, window.ChatbotConfig || {});
    const LINK_KEYS = Object.keys(PAGES);

    // ---------- Saved conversation (this browser tab only) ----------
    const STORE = "lifedrop_chat_v1", DISMISS = "lifedrop_chat_bubble_dismissed";
    const store = {
        get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
        set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    };
    let history = (store.get(STORE) || []).filter(m => m && m.role && m.content);   // [{role, content}]
    let busy = false;

    // ---------- HTML ----------
    const root = document.createElement("div");
    root.className = "cb-root";
    root.innerHTML = `
        <div class="cb-bubble" id="cbBubble" hidden>
            <button type="button" class="cb-bubble-text" id="cbBubbleOpen">Hi there! ❤️ Need help finding a blood camp or learning how to donate blood?</button>
            <button type="button" class="cb-bubble-x" id="cbBubbleX" aria-label="Dismiss message">×</button>
        </div>
        <button type="button" class="cb-launcher" id="cbLauncher" aria-label="Open AI Assistant (Dr. Asha)" aria-expanded="false" aria-controls="cbPanel">
            <svg class="cb-icon-chat cb-doc" viewBox="0 0 60 60" aria-hidden="true">
                <!-- Dr. Asha's face (the same doctor as on the home page) -->
                <path d="M14 30 Q12 56 22 58 L38 58 Q48 56 46 30Z" fill="#3a2520"/>
                <ellipse cx="30" cy="31" rx="15" ry="16.5" fill="#ffd9bf"/>
                <path d="M15 30 Q14 13 30 12 Q46 13 45 30 Q42 22 36 20 Q30 25 20 22 Q17 25 15 30Z" fill="#3a2520"/>
                <g class="cb-doc-eyes"><ellipse cx="25" cy="32" rx="2.1" ry="2.6" fill="#2b1d1d"/><ellipse cx="35" cy="32" rx="2.1" ry="2.6" fill="#2b1d1d"/></g>
                <ellipse cx="21" cy="37" rx="2.6" ry="1.6" fill="#f28ca0" opacity=".45"/><ellipse cx="39" cy="37" rx="2.6" ry="1.6" fill="#f28ca0" opacity=".45"/>
                <path d="M26 39 q4 3.5 8 0" stroke="#8f0b21" stroke-width="1.8" fill="none" stroke-linecap="round"/>
                <path d="M19 54 Q30 46 41 54" stroke="#e8d0d6" stroke-width="3" fill="none"/>
            </svg>
            <span class="cb-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/></svg></span>
            <svg class="cb-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <section class="cb-panel" id="cbPanel" role="dialog" aria-modal="false" aria-labelledby="cbTitle" aria-hidden="true">
            <header class="cb-head">
                <div class="cb-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2C9 7 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-4-8-7-13z"/></svg></div>
                <div class="cb-title"><h2 id="cbTitle">AI Assistant</h2><span><i class="cb-dot"></i> LifeDrop help · AI</span></div>
                <button type="button" class="cb-head-btn" id="cbNew" aria-label="Start a new conversation" title="New conversation">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button type="button" class="cb-head-btn" id="cbClose" aria-label="Close AI Assistant" title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
            </header>
            <div class="cb-messages" id="cbMessages" aria-live="polite"></div>
            <div class="cb-chips" id="cbChips">
                <button type="button">How do I find camps near my PIN code?</button>
                <button type="button">Who can donate blood?</button>
                <button type="button">How do I register as a donor?</button>
                <button type="button">I need blood urgently</button>
            </div>
            <form class="cb-form" id="cbForm" autocomplete="off">
                <label for="cbInput" class="cb-sr">Your message</label>
                <textarea id="cbInput" rows="1" maxlength="1000" placeholder="Type your question…"></textarea>
                <button type="submit" class="cb-send" id="cbSend" aria-label="Send">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
                    <span>Send</span>
                </button>
            </form>
            <p class="cb-foot">AI answers can be wrong. Emergency? Call <b>108</b> / <b>112</b>.</p>
        </section>`;
    document.body.appendChild(root);
    const $c = id => root.querySelector("#" + id);
    const panel = $c("cbPanel"), list = $c("cbMessages"), input = $c("cbInput"), sendBtn = $c("cbSend");

    // ---------- Safe formatting: **bold**, - lists, [label](go:key) ----------
    function escapeText(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
    function format(text) {
        const lines = escapeText(text).split(/\n/);
        let html = "", inList = false;
        for (const raw of lines) {
            let line = raw
                .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
                .replace(/\[([^\]]{1,60})\]\(go:([a-z]+)\)/g, (m, label, key) => LINK_KEYS.includes(key) ? `<a href="#" class="cb-link" data-go="${key}">${label} →</a>` : label)
                .replace(/\[([^\]]{1,60})\]\((https?:\/\/[^)\s]+)\)/g, "$1");          // no outside links
            const item = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
            if (item) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${item[1]}</li>`; continue; }
            if (inList) { html += "</ul>"; inList = false; }
            html += line.trim() ? `<p>${line}</p>` : "";
        }
        return html + (inList ? "</ul>" : "");
    }

    // ---------- Messages ----------
    function addMessage(role, content, extraClass = "") {
        const row = document.createElement("div");
        row.className = `cb-msg ${role === "user" ? "cb-user" : "cb-bot"} ${extraClass}`;
        const bubble = document.createElement("div");
        bubble.className = "cb-text";
        if (role === "user") bubble.textContent = content; else bubble.innerHTML = format(content);
        row.appendChild(bubble);
        list.appendChild(row);
        list.scrollTop = list.scrollHeight;
        return bubble;
    }
    function renderAll() {
        list.innerHTML = "";
        addMessage("assistant", "Hello! 👋 How may I help you today?\nAsk me about blood donation camps, blood banks, donating blood or how to use this website.");
        history.forEach(m => addMessage(m.role, m.content));
        $c("cbChips").hidden = history.length > 0;
    }
    function typing() {
        const row = document.createElement("div");
        row.className = "cb-msg cb-bot cb-typing";
        row.innerHTML = '<div class="cb-text" aria-label="AI Assistant is typing"><span></span><span></span><span></span></div>';
        list.appendChild(row);
        list.scrollTop = list.scrollHeight;
        return row;
    }

    async function send(text) {
        text = String(text || "").trim();
        if (!text || busy) return;
        busy = true; sendBtn.disabled = true; input.value = ""; autosize();
        $c("cbChips").hidden = true;
        addMessage("user", text);
        const turns = [...history, { role: "user", content: text }];
        const dots = typing();
        let bubble = null;
        try {
            const reply = await cfg.ask(turns.slice(-12), {
                page: cfg.page(),
                onText(t) {                              // streams when the host supports it
                    if (!bubble) { dots.remove(); bubble = addMessage("assistant", ""); }
                    bubble.innerHTML = format(t);
                    list.scrollTop = list.scrollHeight;
                }
            });
            if (!bubble) { dots.remove(); addMessage("assistant", reply); }
            else bubble.innerHTML = format(reply);
            history = [...turns, { role: "assistant", content: reply }].slice(-24);
            store.set(STORE, history);
        } catch (err) {
            dots.remove();
            if (bubble) bubble.closest(".cb-msg").remove();
            const row = addMessage("assistant", (err && err.message) || "Sorry, something went wrong. Please try again.", "cb-error").closest(".cb-msg");
            const retry = document.createElement("button");
            retry.type = "button"; retry.className = "cb-retry"; retry.textContent = "Try again";
            retry.addEventListener("click", () => { row.remove(); list.lastElementChild && list.lastElementChild.classList.contains("cb-user") && list.lastElementChild.remove(); send(text); });
            row.appendChild(retry);
        } finally {
            busy = false; sendBtn.disabled = false;
            if (panel.classList.contains("open")) input.focus();
        }
    }

    // ---------- Open / close ----------
    function hideBubble(remember) {
        $c("cbBubble").classList.remove("show");
        setTimeout(() => { $c("cbBubble").hidden = true; }, 250);
        if (remember) store.set(DISMISS, true);
    }
    function openChat() {
        hideBubble(true);
        panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
        root.classList.add("cb-is-open");
        $c("cbLauncher").setAttribute("aria-expanded", "true");
        $c("cbLauncher").setAttribute("aria-label", "Close AI Assistant");
        setTimeout(() => input.focus(), 200);
    }
    function closeChat() {
        panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true");
        root.classList.remove("cb-is-open");
        $c("cbLauncher").setAttribute("aria-expanded", "false");
        $c("cbLauncher").setAttribute("aria-label", "Open AI Assistant (Dr. Asha)");
        $c("cbLauncher").focus();
    }
    $c("cbLauncher").addEventListener("click", () => panel.classList.contains("open") ? closeChat() : openChat());
    $c("cbBubbleOpen").addEventListener("click", openChat);
    $c("cbBubbleX").addEventListener("click", () => hideBubble(true));
    $c("cbClose").addEventListener("click", closeChat);
    $c("cbNew").addEventListener("click", () => { if (busy) return; history = []; store.set(STORE, history); renderAll(); input.focus(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && panel.classList.contains("open")) closeChat(); });

    // ---------- Typing area ----------
    function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; }
    input.addEventListener("input", autosize);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    $c("cbForm").addEventListener("submit", e => { e.preventDefault(); send(input.value); });
    $c("cbChips").addEventListener("click", e => { const b = e.target.closest("button"); if (b) send(b.textContent); });
    list.addEventListener("click", e => {
        const a = e.target.closest("[data-go]"); if (!a) return;
        e.preventDefault();
        if (window.matchMedia("(max-width: 600px)").matches) closeChat();   // show the page on phones
        cfg.go(a.dataset.go);
    });

    // Other parts of the site (e.g. the doctor on the home page) can open the chat
    window.LifeDropChat = { open: openChat, close: closeChat, ask: q => { openChat(); send(q); } };

    // ---------- Start ----------
    renderAll();
    if (!store.get(DISMISS)) {
        setTimeout(() => {
            if (panel.classList.contains("open")) return;
            $c("cbBubble").hidden = false;
            requestAnimationFrame(() => $c("cbBubble").classList.add("show"));
            // hide again after a while so it never stays over the page (the button stays)
            setTimeout(() => { if (!$c("cbBubble").matches(":hover, :focus-within")) hideBubble(false); }, 12000);
        }, 1200);
    }
})();
