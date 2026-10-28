// ==========================================================
// MASCOT.JS - "Dr. Asha", the animated doctor, and "Bindu",
// the little blood-drop mascot
// ----------------------------------------------------------
// Pure SVG + CSS animations (no images, no libraries).
//   <div data-doctor></div>              -> the doctor (hero sections)
//   <span data-drop-mascot="camp"></span> -> Bindu (poses: camp, donor, calendar)
// Buttons can talk to the doctor:
//   data-mascot-point="Find a camp near you!"  (hover/focus -> she points)
//   data-mascot-cheer="Be a Hero, Donate Blood!" (click -> thumbs-up, then go)
// Clicking the doctor opens the AI Assistant (js/chatbot.js).
// Styles: section 22 of css/style.css. Respects "reduce motion".
// ==========================================================
(function () {
    const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let uid = 0;

    // ---------------- The doctor (SVG) ----------------
    function doctorSVG() {
        const id = "d" + (++uid);
        // One arm, drawn hanging down from the shoulder (0,0). CSS rotates it.
        const arm = side => `
            <rect class="doc-arm-box" x="-22" y="-4" width="44" height="140" fill="none"/>
            <path d="M-17 4 Q-19 60 -15 92 L15 92 Q19 60 17 4 Q0 -8 -17 4Z" fill="url(#${id}coat)" stroke="#f0dce1" stroke-width="1.5"/>
            <rect x="-15" y="86" width="30" height="9" rx="4" fill="#f7e8ec"/>
            <g class="hand hand-open"><circle cx="0" cy="106" r="13" fill="url(#${id}skin)"/>
                <path d="M-9 112 q-3 9 1 11 M-3 115 q-1 9 3 10 M3 115 q2 8 5 8 M9 110 q5 6 7 4" stroke="#e2a87f" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
            <g class="hand hand-point"><circle cx="0" cy="104" r="12" fill="url(#${id}skin)"/>
                <rect x="-3.5" y="108" width="7" height="22" rx="3.5" fill="url(#${id}skin)"/></g>
            <g class="hand hand-thumb"><rect x="-12" y="94" width="24" height="22" rx="9" fill="url(#${id}skin)"/>
                <rect x="-4" y="110" width="8" height="18" rx="4" fill="url(#${id}skin)"/>
                <path d="M-10 101 h18 M-10 107 h18" stroke="#e2a87f" stroke-width="1.6" stroke-linecap="round"/></g>`;
        return `
        <svg class="doc-svg" viewBox="0 0 300 370" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${id}t">
            <title id="${id}t">Dr. Asha, the LifeDrop doctor</title>
            <defs>
                <radialGradient id="${id}skin" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe3cc"/><stop offset="1" stop-color="#f0b48c"/></radialGradient>
                <linearGradient id="${id}coat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6e7eb"/><stop offset=".35" stop-color="#ffffff"/><stop offset=".75" stop-color="#ffffff"/><stop offset="1" stop-color="#f0dce1"/></linearGradient>
                <linearGradient id="${id}hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3029"/><stop offset="1" stop-color="#2d1b17"/></linearGradient>
                <linearGradient id="${id}scrub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8213f"/><stop offset="1" stop-color="#a50d27"/></linearGradient>
            </defs>
            <ellipse class="doc-shadow" cx="150" cy="356" rx="86" ry="10" fill="#c8102e" opacity=".12"/>
            <g class="doc-body">
                <!-- back hair -->
                <path d="M92 118 Q88 190 108 214 L192 214 Q212 190 208 118 Z" fill="url(#${id}hair)"/>
                <!-- coat -->
                <path d="M100 196 Q150 182 200 196 Q222 206 228 236 L238 352 Q150 366 62 352 L72 236 Q78 206 100 196Z" fill="url(#${id}coat)" stroke="#f0dce1" stroke-width="1.5"/>
                <!-- scrubs V -->
                <path d="M128 192 L150 246 L172 192 Q150 186 128 192Z" fill="url(#${id}scrub)"/>
                <!-- lapels -->
                <path d="M128 192 L150 250 L138 262 L116 206 Z" fill="#fdf5f7" stroke="#f0dce1" stroke-width="1.5"/>
                <path d="M172 192 L150 250 L162 262 L184 206 Z" fill="#fdf5f7" stroke="#f0dce1" stroke-width="1.5"/>
                <path d="M150 262 L150 350" stroke="#f0dce1" stroke-width="2"/>
                <circle cx="158" cy="282" r="3" fill="#ebd3d9"/><circle cx="158" cy="312" r="3" fill="#ebd3d9"/>
                <!-- neck -->
                <path d="M136 160 h28 v30 q-14 10 -28 0z" fill="#eaa983"/>
                <!-- stethoscope -->
                <path d="M131 190 Q118 222 124 252" stroke="#3b2a2e" stroke-width="5" fill="none" stroke-linecap="round"/>
                <path d="M169 190 Q182 214 176 232" stroke="#3b2a2e" stroke-width="5" fill="none" stroke-linecap="round"/>
                <circle cx="125" cy="260" r="10" fill="#e8d0d6" stroke="#3b2a2e" stroke-width="4"/><circle cx="125" cy="260" r="4" fill="#c79aa6"/>
                <circle cx="176" cy="234" r="4" fill="#3b2a2e"/>
                <!-- red cross badge -->
                <g class="doc-badge"><rect x="174" y="262" width="34" height="34" rx="9" fill="#fff" stroke="#f2c4cc" stroke-width="2"/>
                    <path d="M191 269 v20 M181 279 h20" stroke="#c8102e" stroke-width="7" stroke-linecap="round"/></g>
                <!-- pocket with a pen -->
                <rect x="94" y="258" width="5" height="18" rx="2" fill="#c8102e"/>
                <path d="M86 270 h28 v22 q-14 6 -28 0z" fill="#fdf5f7" stroke="#f0dce1" stroke-width="1.5"/>
                <!-- arms (CSS turns them at the shoulder) -->
                <g transform="translate(82 208)"><g class="doc-arm doc-arm-left">${arm("l")}</g></g>
                <g transform="translate(218 208)"><g class="doc-arm doc-arm-right">${arm("r")}</g></g>
                <!-- head -->
                <g class="doc-head">
                    <circle cx="98" cy="126" r="11" fill="#eaa983"/><circle cx="202" cy="126" r="11" fill="#eaa983"/>
                    <ellipse cx="150" cy="118" rx="54" ry="58" fill="url(#${id}skin)"/>
                    <!-- hair front -->
                    <path d="M96 118 Q94 62 150 58 Q206 60 205 118 Q196 92 176 84 Q150 100 112 92 Q100 100 96 118Z" fill="url(#${id}hair)"/>
                    <path d="M150 58 Q186 54 196 80" stroke="#6b4a40" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>
                    <!-- eyebrows -->
                    <path class="doc-brow" d="M122 106 q10 -7 20 -1" stroke="#3b2622" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                    <path class="doc-brow" d="M158 105 q10 -6 20 1" stroke="#3b2622" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                    <!-- eyes -->
                    <g class="doc-eyes">
                        <g class="doc-eye"><ellipse cx="132" cy="124" rx="7" ry="8.5" fill="#2b1d1d"/><circle cx="134.5" cy="120.5" r="2.6" fill="#fff"/></g>
                        <g class="doc-eye"><ellipse cx="168" cy="124" rx="7" ry="8.5" fill="#2b1d1d"/><circle cx="170.5" cy="120.5" r="2.6" fill="#fff"/></g>
                    </g>
                    <g class="doc-eyes-happy"><path d="M124 125 q8 -9 16 0 M160 125 q8 -9 16 0" stroke="#2b1d1d" stroke-width="3.6" fill="none" stroke-linecap="round"/></g>
                    <!-- cheeks, nose, mouth -->
                    <ellipse cx="120" cy="140" rx="9" ry="5.5" fill="#f28ca0" opacity=".38"/>
                    <ellipse cx="180" cy="140" rx="9" ry="5.5" fill="#f28ca0" opacity=".38"/>
                    <path d="M147 134 q3 4 6 0" stroke="#d48a66" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                    <path class="doc-smile" d="M136 148 q14 12 28 0" stroke="#8f0b21" stroke-width="3.4" fill="none" stroke-linecap="round"/>
                    <g class="doc-smile-big"><path d="M133 146 q17 20 34 0 z" fill="#8f1d2c"/><path d="M141 155 q9 6 18 0 q-9 -4 -18 0z" fill="#ff7a8a"/></g>
                    <!-- head mirror (classic doctor) -->
                    <path d="M98 96 Q150 66 202 96" stroke="#e8d0d6" stroke-width="4" fill="none" opacity=".0"/>
                </g>
            </g>
        </svg>`;
    }

    // Small icons used around the doctor
    const DROP = '<svg viewBox="0 0 24 24"><path d="M12 2C9 7 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-4-8-7-13z" fill="currentColor"/><ellipse cx="9.5" cy="14" rx="1.6" ry="2.6" fill="#fff" opacity=".45"/></svg>';
    const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4 6.8 4c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3C21 4 23.1 8 21.6 11.6 19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>';
    const SPARK = '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor"/></svg>';

    const TIPS = ["Every Drop Counts!", "Be a Hero, Donate Blood!", "One donation can help save lives ❤️", "Find a blood camp near your PIN code!"];

    function mountDoctor(host) {
        if (host.dataset.mounted) return;
        host.dataset.mounted = "1";
        host.classList.add("doc-stage");
        host.innerHTML = `
            <span class="doc-deco doc-drop d1">${DROP}</span><span class="doc-deco doc-drop d2">${DROP}</span><span class="doc-deco doc-drop d3">${DROP}</span>
            <span class="doc-deco doc-heart h1">${HEART}</span><span class="doc-deco doc-heart h2">${HEART}</span>
            <span class="doc-deco doc-spark s1">${SPARK}</span><span class="doc-deco doc-spark s2">${SPARK}</span><span class="doc-deco doc-spark s3">${SPARK}</span>
            <span class="doc-morph" aria-hidden="true"><span class="m-drop">${DROP}</span><span class="m-heart">${HEART}</span></span>
            <button type="button" class="doc-char" aria-label="Dr. Asha, the LifeDrop doctor. Click to chat with the AI Assistant">${doctorSVG()}</button>
            <div class="doc-say" role="status" aria-live="polite"><span class="doc-say-text"></span></div>
            <div class="doc-burst" aria-hidden="true"></div>`;
        const root = host;
        const say = root.querySelector(".doc-say"), sayText = root.querySelector(".doc-say-text");
        let timer = null, tipTimer = null, tipIndex = 0, busyUntil = 0;

        function speak(text, ms = 3200) {
            sayText.textContent = text;
            say.classList.add("show");
            clearTimeout(timer);
            timer = setTimeout(() => say.classList.remove("show"), ms);
        }
        function pose(name, ms) {
            root.classList.remove("is-waving", "is-pointing", "is-cheering", "is-happy");
            if (name) root.classList.add(...name.split(" "));
            if (ms) { busyUntil = Date.now() + ms; setTimeout(() => { if (Date.now() >= busyUntil) root.classList.remove("is-waving", "is-pointing", "is-cheering", "is-happy"); }, ms); }
        }
        function burst() {
            const b = root.querySelector(".doc-burst");
            b.innerHTML = Array.from({ length: 7 }, (_, i) => `<span style="--i:${i}">${i % 3 ? HEART : SPARK}</span>`).join("");
            b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
        }

        // 1. Wave hello the first time she is seen (page open, or her section shown)
        let greeted = false;
        function greet() {
            if (greeted) return;
            greeted = true;
            setTimeout(() => { pose("is-waving is-happy", 2600); speak("Hello! 👋 Every drop counts!", 3400); }, 400);
        }

        // 2. Friendly tips now and then (only while visible); animations pause off-screen
        let visible = true;
        if ("IntersectionObserver" in window) {
            new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                root.classList.toggle("doc-paused", !visible);
                if (visible) greet();
            }).observe(root);
        } else greet();
        tipTimer = setInterval(() => {
            if (!visible || document.hidden || Date.now() < busyUntil || !root.offsetParent) return;
            tipIndex = (tipIndex + 1) % TIPS.length;
            speak(TIPS[tipIndex], 3000);
        }, 9000);

        // 3. Click the doctor -> open the AI Assistant
        root.querySelector(".doc-char").addEventListener("click", () => {
            pose("is-waving is-happy", 1800);
            speak("Hi there! ❤️ Ask me anything!", 2200);
            if (window.LifeDropChat) window.LifeDropChat.open();
        });

        root._doctor = { speak, pose, burst };
        return root._doctor;
    }

    // The doctor that belongs to an element (same section / page)
    function doctorFor(el) {
        const scope = el.closest(".view, section, main, body");
        const host = (scope && scope.querySelector("[data-doctor]")) || document.querySelector("[data-doctor]");
        return host && host._doctor && host.offsetParent ? host._doctor : null;
    }

    // Hover / focus a button -> point at it
    function onPoint(e) {
        const btn = e.target.closest && e.target.closest("[data-mascot-point]");
        if (!btn) return;
        const doc = doctorFor(btn); if (!doc) return;
        doc.pose("is-pointing", 1600);
        doc.speak(btn.dataset.mascotPoint, 1800);
    }
    document.addEventListener("mouseover", onPoint);
    document.addEventListener("focusin", onPoint);

    // Click "Find Blood Camp" / "Become a Donor" -> thumbs-up, then continue
    document.addEventListener("click", e => {
        const btn = e.target.closest && e.target.closest("[data-mascot-cheer]");
        if (!btn || btn.dataset.cheered) return;
        const doc = doctorFor(btn); if (!doc) return;
        doc.pose("is-cheering is-happy", 1400);
        doc.speak(btn.dataset.mascotCheer, 1600);
        doc.burst();
        if (reduceMotion()) return;              // no waiting for people who prefer less motion
        e.preventDefault(); e.stopPropagation();
        setTimeout(() => { btn.dataset.cheered = "1"; btn.click(); delete btn.dataset.cheered; }, 650);
    }, true);

    // ---------------- Bindu, the blood-drop mascot ----------------
    function dropSVG(pose) {
        const id = "b" + (++uid);
        const prop = {
            camp: `<g class="bd-prop"><path d="M86 50c-7 0-12 5-12 12 0 9 12 20 12 20s12-11 12-20c0-7-5-12-12-12z" fill="#187a4e"/><circle cx="86" cy="62" r="4.5" fill="#fff"/></g>`,
            donor: `<g class="bd-prop"><path d="M86 82s-13-8-13-17c0-5 4-8 8-8 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 8 3 8 8 0 9-13 17-13 17z" fill="#ff5c7a"/></g>`,
            calendar: `<g class="bd-prop"><rect x="72" y="52" width="28" height="26" rx="5" fill="#fff" stroke="#c8102e" stroke-width="2.5"/><rect x="72" y="52" width="28" height="8" rx="4" fill="#c8102e"/><path d="M79 67h3M86 67h3M93 67h3M79 73h3M86 73h3" stroke="#6b5d61" stroke-width="2.4" stroke-linecap="round"/></g>`
        }[pose] || "";
        return `<svg viewBox="0 0 110 110" aria-hidden="true">
            <defs><radialGradient id="${id}" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#ff4d68"/><stop offset="1" stop-color="#a50d27"/></radialGradient></defs>
            <ellipse cx="52" cy="104" rx="26" ry="4" fill="#c8102e" opacity=".14"/>
            <g class="bd-body">
                <path class="bd-arm-l" d="M26 66 q-12 -4 -16 -14" stroke="#a50d27" stroke-width="6" fill="none" stroke-linecap="round"/>
                <path class="bd-arm-r" d="M78 64 q6 -2 8 -4" stroke="#a50d27" stroke-width="6" fill="none" stroke-linecap="round"/>
                <path d="M52 6C40 26 22 40 22 64a30 30 0 0 0 60 0C82 40 64 26 52 6z" fill="url(#${id})"/>
                <ellipse cx="40" cy="48" rx="5" ry="10" fill="#fff" opacity=".35" transform="rotate(20 40 48)"/>
                <g class="bd-eyes"><ellipse cx="43" cy="64" rx="4" ry="5" fill="#2b1d1d"/><ellipse cx="61" cy="64" rx="4" ry="5" fill="#2b1d1d"/>
                    <circle cx="44.5" cy="62" r="1.5" fill="#fff"/><circle cx="62.5" cy="62" r="1.5" fill="#fff"/></g>
                <ellipse cx="36" cy="73" rx="4.5" ry="3" fill="#ffb3c0" opacity=".7"/><ellipse cx="68" cy="73" rx="4.5" ry="3" fill="#ffb3c0" opacity=".7"/>
                <path d="M45 75 q7 7 14 0" stroke="#5a0f1c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
                ${prop}
            </g></svg>`;
    }
    function mountDrops(rootEl = document) {
        rootEl.querySelectorAll("[data-drop-mascot]:not([data-mounted])").forEach(el => {
            el.dataset.mounted = "1";
            el.classList.add("bindu", "bindu-" + el.dataset.dropMascot);
            el.setAttribute("aria-hidden", "true");
            el.innerHTML = dropSVG(el.dataset.dropMascot);
        });
    }

    function init() {
        document.querySelectorAll("[data-doctor]").forEach(mountDoctor);
        mountDrops();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
    window.LifeDropMascot = { mountDoctor, mountDrops, doctorSVG };
})();
