// ==========================================================
// ROUTES/CHAT.JS - the AI Assistant (POST /api/chat)
// ----------------------------------------------------------
// The browser sends the conversation; THIS SERVER adds the
// website knowledge and asks Claude (Anthropic API). The API key
// stays in backend/.env - it is never sent to the browser.
//
//   ANTHROPIC_API_KEY=sk-ant-...      (required)
//   CHAT_MODEL=claude-haiku-5-5       (optional, fast and low-cost)
//
// Request:  { messages: [{ role: "user"|"assistant", content }], page }
// Response: { reply }   or an error { code, message }
// ==========================================================

const express = require("express");
const { CHAT_KNOWLEDGE } = require("../utils/chat-knowledge");
const { sessionUser } = require("../utils/auth");

const MAX_TURNS = 12;          // only the last 12 messages are sent
const MAX_CHARS = 1500;        // per message
const LIMIT = 20, WINDOW_MS = 10 * 60 * 1000;   // 20 questions per 10 minutes per visitor
const hits = new Map();

function tooMany(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => t > now - WINDOW_MS);
    if (list.length >= LIMIT) { hits.set(ip, list); return true; }
    list.push(now); hits.set(ip, list);
    return false;
}

module.exports = function createChatRouter() {
    const router = express.Router();

    router.get("/status", (req, res) => res.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }));

    router.post("/", async (req, res) => {
        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({ code: "not_configured", message: "The AI Assistant is not set up on this server yet (ANTHROPIC_API_KEY is missing in backend/.env)." });
        }
        if (tooMany(req.ip)) {
            return res.status(429).json({ code: "rate_limited", message: "You are asking very quickly. Please wait a few minutes and try again." });
        }

        // ---- Check the conversation ----
        const raw = Array.isArray((req.body || {}).messages) ? req.body.messages : [];
        const messages = raw.slice(-MAX_TURNS)
            .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
            .map(m => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }));
        while (messages.length && messages[0].role !== "user") messages.shift();   // must start with the user
        if (!messages.length || messages[messages.length - 1].role !== "user") {
            return res.status(400).json({ code: "invalid_request", message: "Please type a question." });
        }

        // ---- Context: page + (if logged in) first name and role only ----
        const user = sessionUser(req);
        const page = String((req.body || {}).page || "").replace(/[^a-z0-9 ._-]/gi, "").slice(0, 40);
        const context = `\n\nCONTEXT: The visitor is on the "${page || "unknown"}" page. ` + (user
            ? `They are logged in as ${user.fullName.split(" ")[0]} (role: ${{ donor: "Blood Donor", finder: "Blood Finder", organizer: "Camp Organizer" }[user.role]}).`
            : "They are not logged in.");

        try {
            const response = await fetch(process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": process.env.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    model: process.env.CHAT_MODEL || "claude-haiku-5-5",
                    max_tokens: 700,
                    system: CHAT_KNOWLEDGE + context,
                    messages
                }),
                signal: AbortSignal.timeout(45000)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                // Log the reason for the developer (never the key or the conversation)
                console.error(`[chat] Anthropic API ${response.status}: ${(data.error && data.error.type) || "error"}`);
                const busy = response.status === 429 || response.status === 529;
                return res.status(502).json({ code: busy ? "busy" : "upstream_error", message: busy ? "The AI is busy right now. Please try again in a minute." : "The AI could not answer right now. Please try again." });
            }
            const reply = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("").trim();
            if (!reply) return res.status(502).json({ code: "empty", message: "The AI gave an empty answer. Please ask again in other words." });
            res.json({ reply, truncated: data.stop_reason === "max_tokens" });
        } catch (error) {
            console.error("[chat] request failed:", error.name);
            res.status(502).json({ code: "upstream_error", message: "Could not reach the AI service. Check the internet connection and try again." });
        }
    });

    return router;
};
