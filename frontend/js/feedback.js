// =====================================================================
// LifeDrop FEEDBACK FORM  ("❤️ Help Us Save More Lives!")
// ---------------------------------------------------------------------
//  - <div data-feedback="home"></div>  -> draws the full form there
//  - LifeDropFeedback.nudge("after-registration") -> a small, dismissible
//    card (bottom-left) that opens the same form. Used only AFTER a
//    process is finished (donor registered, request marked fulfilled),
//    never during an emergency request.
// Saving:
//  - default: POST /api/feedback (the Node server's JSON database)
//  - online preview: window.LifeDropFeedbackConfig.submit (see lifedrop.html)
// No name, e-mail, phone or location is asked for or stored.
// =====================================================================
(function () {
    "use strict";
    const QUESTIONS = [
        { key: "usedFor", n: 1, text: "What did you use our website for?", options: [
            ["find-donor", "🩸", "Finding a blood donor"], ["request-blood", "❤️", "Requesting blood"],
            ["register-donor", "🤝", "Registering as a donor"], ["find-camp-bank", "🏥", "Finding a blood camp or blood bank"]] },
        { key: "helped", n: 2, text: "Did our website help you?", options: [
            ["yes", "✅", "Yes, I got the help I needed"], ["partial", "👍", "Partially, I received some help"], ["not-yet", "🔍", "Not yet, I am still looking for help"]] },
        { key: "ease", n: 3, text: "How easy was the website to use?", options: [
            ["very-easy", "😍", "Very easy"], ["easy", "🙂", "Easy"], ["average", "😐", "Average"], ["difficult", "😕", "Difficult"]] },
        { key: "recommend", n: 4, text: "Would you recommend our website to others?", options: [
            ["definitely", "💚", "Definitely"], ["maybe", "👍", "Maybe"], ["no", "👎", "No"]] }
    ];
    const MAX = 200, SENT_KEY = "lifedrop_feedback_sent", NUDGE_KEY = "lifedrop_feedback_nudge_hidden";
    const THANKS = "Thank you for sharing your feedback! ❤️ Your response helps us improve our mission to connect blood donors with people in need.";
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const store = { get: (s, k) => { try { return s.getItem(k); } catch (e) { return null; } }, set: (s, k, v) => { try { s.setItem(k, v); } catch (e) { } } };
    const API = (typeof API_URL !== "undefined" ? API_URL : (location.protocol.startsWith("http") ? location.origin + "/api" : "http://localhost:5000/api"));
    let count = 0;

    async function defaultSubmit(data) {
        const res = await fetch(API + "/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "Your feedback could not be sent. Please try again.");
        return { saved: "server" };
    }
    const submitFn = () => (window.LifeDropFeedbackConfig && window.LifeDropFeedbackConfig.submit) || defaultSubmit;

    const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8C9 7.2 6 10.2 6 14.2a6 6 0 0 0 12 0c0-4-3-7-6-11.4z"/></svg>';
    const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8.5-5-8.5-11.2A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.2-8.5 11.2-8.5 11.2z"/></svg>';

    function formHTML(id, context, compact) {
        const note = window.LifeDropFeedbackConfig && window.LifeDropFeedbackConfig.note;
        return `<div class="fb-card ${compact ? "compact" : ""}" data-fb-root>
            <span class="fb-deco d1">${HEART}</span><span class="fb-deco d2">${DROP}</span><span class="fb-deco d3">${HEART}</span>
            <div class="fb-head">
                <span class="fb-badge" aria-hidden="true">${HEART}</span>
                <h2 id="${id}-title">❤️ Help Us Save More Lives!</h2>
                <p>Your feedback helps us make blood donation easier and more accessible.</p>
                <small class="fb-time">⏱️ 4 quick taps · under a minute · no name or phone number needed</small>
                ${note ? `<p class="fb-note">${esc(note)}</p>` : ""}
            </div>
            <form class="fb-form" novalidate aria-labelledby="${id}-title" data-context="${esc(context)}">
                ${QUESTIONS.map(q => `
                <fieldset class="fb-q" data-q="${q.key}">
                    <legend><span class="fb-num">${q.n}</span><span>${q.text} <span class="fb-req">(choose one)</span></span></legend>
                    <div class="fb-options ${q.options.length === 4 ? "four" : "three"}">
                        ${q.options.map(([value, emoji, label]) => `
                        <label class="fb-opt"><input type="radio" name="${q.key}" value="${value}" required>
                            <span class="fb-opt-box"><span class="fb-emoji" aria-hidden="true">${emoji}</span><span class="fb-label">${label}</span><span class="fb-tick" aria-hidden="true">✓</span></span></label>`).join("")}
                    </div>
                    <p class="fb-error" id="${id}-${q.key}-err" hidden>Please choose an answer.</p>
                </fieldset>`).join("")}
                <div class="fb-q">
                    <label class="fb-legend" for="${id}-sugg"><span class="fb-num">5</span><span>Any suggestions? <span class="fb-req">(optional)</span></span></label>
                    <textarea id="${id}-sugg" name="suggestion" maxlength="${MAX}" rows="2" placeholder="Share a suggestion (optional)" aria-describedby="${id}-count ${id}-privacy"></textarea>
                    <div class="fb-under"><small id="${id}-privacy">Please don't include names, phone numbers or medical details.</small><small class="fb-count" id="${id}-count" aria-live="polite">0 / ${MAX}</small></div>
                </div>
                <div class="fb-alert" role="alert" hidden></div>
                <button type="submit" class="btn btn-primary fb-submit">Submit Feedback 💌</button>
            </form>
            <div class="fb-thanks" tabindex="-1" hidden>
                <div class="fb-thanks-art" aria-hidden="true">${HEART}<span>${DROP}</span></div>
                <p class="fb-thanks-text">${esc(THANKS)}</p>
                <p class="fb-saved"></p>
            </div>
        </div>`;
    }

    function mount(el, context, compact) {
        if (!el || el.dataset.fbReady) return;
        el.dataset.fbReady = "1";
        const id = "fb" + (++count);
        el.innerHTML = formHTML(id, context || el.dataset.feedback || "page", compact);
        const root = el.querySelector("[data-fb-root]"), form = root.querySelector("form");
        const ta = form.elements.suggestion, counter = root.querySelector(".fb-count");
        ta.addEventListener("input", () => { counter.textContent = `${ta.value.length} / ${MAX}`; });
        form.addEventListener("change", e => {
            const fs = e.target.closest(".fb-q");
            if (fs && e.target.type === "radio") { fs.classList.remove("invalid"); fs.querySelector(".fb-error").hidden = true; fs.removeAttribute("aria-invalid"); }
        });
        form.addEventListener("submit", async e => {
            e.preventDefault();
            const alertBox = root.querySelector(".fb-alert"); alertBox.hidden = true;
            let firstMissing = null;
            const data = { context: form.dataset.context };
            QUESTIONS.forEach(q => {
                const picked = form.querySelector(`input[name="${q.key}"]:checked`);
                const fs = form.querySelector(`[data-q="${q.key}"]`);
                if (!picked) {
                    fs.classList.add("invalid"); fs.setAttribute("aria-invalid", "true"); fs.querySelector(".fb-error").hidden = false;
                    if (!firstMissing) firstMissing = fs;
                } else data[q.key] = picked.value;
            });
            if (firstMissing) {
                alertBox.textContent = "Please answer questions 1 to 4. Question 5 is optional.";
                alertBox.hidden = false;
                firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
                firstMissing.querySelector("input").focus({ preventScroll: true });
                return;
            }
            data.suggestion = ta.value.trim().slice(0, MAX);
            const btn = form.querySelector(".fb-submit");
            btn.disabled = true; btn.textContent = "Sending…";
            try {
                const result = await submitFn()(data);
                store.set(localStorage, SENT_KEY, new Date().toISOString());
                form.hidden = true;
                const thanks = root.querySelector(".fb-thanks");
                root.querySelector(".fb-saved").textContent = result && result.note ? result.note : "";
                thanks.hidden = false; thanks.focus();
                root.classList.add("sent");
                const n = document.getElementById("fbNudge"); if (n && !n.contains(root)) n.remove();
            } catch (er) {
                alertBox.textContent = er.message || "Your feedback could not be sent. Please try again.";
                alertBox.hidden = false;
                btn.disabled = false; btn.textContent = "Submit Feedback 💌";
            }
        });
    }

    // Small card after a finished process. Never during an emergency request.
    function nudge(context, message) {
        if (store.get(localStorage, SENT_KEY) || store.get(sessionStorage, NUDGE_KEY) || document.getElementById("fbNudge")) return;
        const box = document.createElement("aside");
        box.id = "fbNudge"; box.className = "fb-nudge"; box.setAttribute("aria-label", "Feedback");
        box.innerHTML = `<button type="button" class="fb-nudge-x" aria-label="Close">×</button>
            <div class="fb-nudge-intro"><span class="fb-badge small" aria-hidden="true">${HEART}</span><p><b>${esc(message || "Thank you!")}</b><br>Got a minute to tell us how it went?</p>
            <div class="fb-nudge-acts"><button type="button" class="btn btn-primary btn-sm" data-fb-open>Give feedback</button><button type="button" class="btn btn-light btn-sm" data-fb-later>Not now</button></div></div>
            <div class="fb-nudge-form" hidden></div>`;
        document.body.appendChild(box);
        const close = () => { store.set(sessionStorage, NUDGE_KEY, "1"); box.remove(); };
        box.querySelector(".fb-nudge-x").addEventListener("click", close);
        box.querySelector("[data-fb-later]").addEventListener("click", close);
        box.querySelector("[data-fb-open]").addEventListener("click", () => {
            box.classList.add("open");
            box.querySelector(".fb-nudge-intro").hidden = true;
            const holder = box.querySelector(".fb-nudge-form"); holder.hidden = false;
            mount(holder, context, true);
            holder.querySelector("input").focus();
        });
        box.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    }

    function scan() { document.querySelectorAll("[data-feedback]").forEach(el => mount(el)); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
    // After the Node registration page redirects, show the card on the next page
    function pending() {
        const p = store.get(sessionStorage, "lifedrop_feedback_pending");
        if (!p) return;
        try { sessionStorage.removeItem("lifedrop_feedback_pending"); } catch (e) { }
        const [context, message] = p.split("|");
        setTimeout(() => nudge(context, message), 1500);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pending); else pending();

    window.LifeDropFeedback = {
        QUESTIONS, mount, nudge, scan,
        later(context, message) { store.set(sessionStorage, "lifedrop_feedback_pending", `${context}|${message || ""}`); }
    };
})();
