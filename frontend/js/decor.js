// =====================================================================
// LifeDrop visual identity: illustrations, icons and small animations
// ---------------------------------------------------------------------
// Everything here is decoration. It never changes a form, a search or a
// map feature. If this file is missing, the website still works.
//
//  - [data-art="camps"]  -> draws an SVG illustration (see ART below)
//  - [data-floaters]     -> adds softly floating blood drops and hearts
//  - nav + footer links  -> get a matching line icon (Lucide style)
//  - donor cards         -> get an illustrated avatar + blood-group drop
//  - buttons             -> ripple + tiny heart burst on click
// All illustrations are original SVG drawn for this project.
// Animations stop when the visitor prefers reduced motion.
// =====================================================================
(function () {
    "use strict";
    const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Line icons (24 x 24, stroke = currentColor) ----------
    const ICON_PATHS = {
        home: '<path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.3-4.3"/>',
        tent: '<path d="M12 3.5 2.5 20.5h19z"/><path d="M12 12.5l-3.6 8M12 12.5l3.6 8"/>',
        heartHand: '<path d="M12 8.2c-1.3-2.4-5-2.2-5 .7 0 2.4 5 5.6 5 5.6s5-3.2 5-5.6c0-2.9-3.7-3.1-5-.7z"/><path d="M2 15.5h3.2l3 2h4.6a1.6 1.6 0 0 1 0 3.2H9"/><path d="M12.8 20.7h4.6l4.6-4.6"/>',
        siren: '<path d="M7 18v-5.5a5 5 0 0 1 10 0V18"/><rect x="4" y="18" width="16" height="3.5" rx="1.2"/><path d="M12 2.5v2M20.5 9H22M2 9h1.5M18.4 4.6l1-1M4.6 3.6l1 1"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 13.5-4.5"/><path d="M19 13v6M16 16h6"/>',
        login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
        dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
        bloodBag: '<rect x="6" y="3" width="12" height="14.5" rx="3.5"/><path d="M12 17.5V21"/><path d="M9.3 10.2h5.4M12 7.5v5.4"/>',
        hospital: '<path d="M4 21V8l8-4.5L20 8v13"/><path d="M2 21h20"/><path d="M12 8.5v5M9.5 11h5"/><path d="M10 21v-3.5h4V21"/>',
        phone: '<path d="M5.5 3.5h3.3l1.8 4.6-2.3 1.5a11.5 11.5 0 0 0 6.1 6.1l1.5-2.3 4.6 1.8v3.3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1z"/>',
        ambulance: '<path d="M10 17h4V6H2v11h2.5"/><path d="M14 9h4.5l3.5 4.5V17h-1.5"/><circle cx="7.5" cy="17.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/><path d="M6 9.5v4M4 11.5h4"/>',
        drop: '<path d="M12 2.8C9 7.2 6 10.2 6 14.2a6 6 0 0 0 12 0c0-4-3-7-6-11.4z"/>',
        pin: '<path d="M19.5 10c0 6.2-7.5 12-7.5 12S4.5 16.2 4.5 10a7.5 7.5 0 0 1 15 0z"/><circle cx="12" cy="10" r="2.8"/>',
        calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
        heart: '<path d="M12 20.5s-8.5-5-8.5-11.2A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.2-8.5 11.2-8.5 11.2z"/>',
        shield: '<path d="M12 21.5s7.5-3.6 7.5-9.5V5.3L12 2.5 4.5 5.3V12c0 5.9 7.5 9.5 7.5 9.5z"/><path d="m9 12 2 2 4-4"/>',
        file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4.5"/>',
        sparkles: '<path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.3l-1.9-5.5-5.6-1.9L9.1 9z"/><path d="M19 3v4M17 5h4"/>',
        arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
        chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
        route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>'
    };
    function icon(name, cls) {
        const p = ICON_PATHS[name] || ICON_PATHS.drop;
        return `<svg class="${cls || "ico"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
    }

    // ---------- Illustrations ----------
    // Colours: red #c8102e / #8f0b21 / #5e0a1b, white, warm cream #fff8f1 / #fde9dc,
    // soft coral #f4846f / #fbd3c9, green #187a4e / #34b27b / #e3f4eb
    const DROP = (x, y, s, fill) => `<path transform="translate(${x} ${y}) scale(${s})" d="M12 2.8C9 7.2 6 10.2 6 14.2a6 6 0 0 0 12 0c0-4-3-7-6-11.4z" fill="${fill}"/>`;
    // (animated parts sit in an outer <g> so the CSS animation doesn't replace their position)
    const HEART = (x, y, s, fill, cls) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="${cls || ""}" d="M12 20.5s-8.5-5-8.5-11.2A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.2-8.5 11.2-8.5 11.2z" fill="${fill}"/></g>`;
    const GLOW = '<circle cx="130" cy="100" r="92" fill="#fff" opacity=".12"/><circle cx="130" cy="100" r="66" fill="#fff" opacity=".08"/>';

    const ART = {
        // Blood camp: medical tent, flag, calendar, location pin, hearts
        camps: `<svg viewBox="0 0 260 200">${GLOW}
            <ellipse cx="128" cy="180" rx="108" ry="8" fill="#5e0a1b" opacity=".28"/>
            <path d="M44 177 122 64l78 113z" fill="#fff8f1"/>
            <path d="M122 64l78 113h-36z" fill="#fde9dc"/>
            <path d="M122 106 98 177h48z" fill="#8f0b21"/>
            <path d="M122 106 88 177h10z" fill="#f4846f"/><path d="M122 106 156 177h-10z" fill="#f4846f"/>
            <circle cx="82" cy="148" r="12" fill="#c8102e"/><path d="M82 141.5v13M75.5 148h13" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>
            <path d="M122 64V32" stroke="#fff8f1" stroke-width="3.2" stroke-linecap="round"/>
            <path class="art-flag" d="M123.5 32h29l-7 8.5 7 8.5h-29z" fill="#34b27b"/>
            <path d="M134.5 36.5v8M130.5 40.5h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
            <g transform="translate(182 94) rotate(7)">
                <rect width="60" height="56" rx="11" fill="#fff"/>
                <path d="M0 11A11 11 0 0 1 11 0h38a11 11 0 0 1 11 11v8H0z" fill="#c8102e"/>
                <path d="M17-5v10M43-5v10" stroke="#fde9dc" stroke-width="4" stroke-linecap="round"/>
                <g fill="#f9c9d3"><circle cx="13" cy="30" r="3"/><circle cx="25" cy="30" r="3"/><circle cx="37" cy="30" r="3"/><circle cx="49" cy="30" r="3"/><circle cx="13" cy="43" r="3"/><circle cx="25" cy="43" r="3"/><circle cx="49" cy="43" r="3"/></g>
                ${HEART(30.5, 35.5, .55, "#c8102e")}
            </g>
            <g transform="translate(36 36)"><g class="art-bob">
                <path d="M19 0a19 19 0 0 1 19 19c0 14-19 31-19 31S0 33 0 19A19 19 0 0 1 19 0z" fill="#f4846f"/>
                ${DROP(10, 7, .75, "#fff")}
            </g></g>
            ${HEART(208, 40, .9, "#fbd3c9", "art-heart")}${HEART(222, 66, .55, "#fff", "art-heart d2")}
        </svg>`,

        // Find a donor: map card, pins, magnifier, route
        find: `<svg viewBox="0 0 260 200">${GLOW}
            <g transform="rotate(-6 130 104)">
                <rect x="44" y="40" width="172" height="130" rx="22" fill="#fff8f1"/>
                <path d="M44 124c40-12 70 12 112-6s42-24 60-20" stroke="#f9dce3" stroke-width="11" fill="none"/>
                <path d="M108 40c-7 40 10 72 0 130" stroke="#f9dce3" stroke-width="9" fill="none"/>
                <circle cx="182" cy="142" r="15" fill="#e3f4eb"/><circle cx="72" cy="66" r="10" fill="#e3f4eb"/>
                <path d="M74 150c22-22 34-30 56-38s38-22 44-40" stroke="#187a4e" stroke-width="3.4" stroke-dasharray="1 8" stroke-linecap="round" fill="none"/>
                <circle cx="74" cy="150" r="7.5" fill="#34b27b" stroke="#fff" stroke-width="3.5"/>
            </g>
            <g class="art-bob"><path d="M128 76a15 15 0 0 1 15 15c0 11-15 25-15 25s-15-14-15-25a15 15 0 0 1 15-15z" fill="#c8102e"/>${DROP(121.5, 82, .55, "#fff")}</g>
            <g class="art-bob d2"><path d="M86 92a11 11 0 0 1 11 11c0 8-11 18-11 18s-11-10-11-18a11 11 0 0 1 11-11z" fill="#f4846f"/></g>
            <circle cx="178" cy="74" r="27" fill="#fff" opacity=".28"/>
            <circle cx="178" cy="74" r="27" fill="none" stroke="#fff" stroke-width="8"/>
            <path d="M198 94l20 20" stroke="#fde9dc" stroke-width="12" stroke-linecap="round"/>
            ${DROP(166, 60, 1, "#c8102e")}
            ${HEART(30, 28, .8, "#fbd3c9", "art-heart")}
        </svg>`,

        // Become a donor: one person handing a blood drop to another, big heart behind
        register: `<svg viewBox="0 0 260 200">${GLOW}
            <path d="M130 168C68 128 48 96 58 66c9-27 46-31 72-3 26-28 63-24 72 3 10 30-10 62-72 102z" fill="#fbd3c9" opacity=".95"/>
            <ellipse cx="130" cy="192" rx="100" ry="6" fill="#5e0a1b" opacity=".28"/>
            <path d="M48 194c0-30 13-46 32-46s32 16 32 46z" fill="#fff8f1"/>
            ${DROP(72, 158, .62, "#c8102e")}
            <path d="M148 194c0-30 13-46 32-46s32 16 32 46z" fill="#34b27b"/>
            <path d="M101 160c10-4 16-12 19-22" stroke="#fff8f1" stroke-width="10" stroke-linecap="round" fill="none"/>
            <path d="M159 160c-10-4-16-12-19-22" stroke="#34b27b" stroke-width="10" stroke-linecap="round" fill="none"/>
            <circle cx="120" cy="136" r="6.5" fill="#e8b08f"/><circle cx="140" cy="136" r="6.5" fill="#b9805e"/>
            <circle cx="80" cy="124" r="17" fill="#e8b08f"/>
            <path d="M63 122c0-12 7-19 17-19s17 7 17 17c-4-4-9-6-17-6s-12 3-17 8z" fill="#3b1f1d"/>
            <circle cx="75" cy="126" r="1.8" fill="#3b1f1d"/><circle cx="86" cy="126" r="1.8" fill="#3b1f1d"/>
            <path d="M75 132c3 2.4 7.5 2.4 10.5 0" stroke="#3b1f1d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
            <circle cx="180" cy="124" r="17" fill="#b9805e"/>
            <path d="M162 128c0-15 7-24 18-24s18 9 18 24v15c-3-3-5-9-5-13-6-2-10-5-13-10-3 5-8 8-13 9 0 5-1 10-5 14z" fill="#2a1513"/>
            <circle cx="175" cy="126" r="1.8" fill="#2a1513"/><circle cx="186" cy="126" r="1.8" fill="#2a1513"/>
            <path d="M175 132c3 2.4 7.5 2.4 10.5 0" stroke="#2a1513" stroke-width="1.8" fill="none" stroke-linecap="round"/>
            <g class="art-bob">
                <path d="M130 88c-9 12-15 18-15 27a15 15 0 0 0 30 0c0-9-6-15-15-27z" fill="#c8102e" stroke="#fff" stroke-width="3.5"/>
                ${HEART(123.5, 106, .55, "#fff")}
            </g>
            <path d="M100 84v8M96 88h8M162 78v8M158 82h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round" class="art-twinkle"/>
        </svg>`,

        // Emergency: siren with a blood drop and a heartbeat line
        sos: `<svg viewBox="0 0 200 200">
            <g class="sos-rays" stroke="#fff" stroke-width="7" stroke-linecap="round"><path d="M100 26V10"/><path d="M58 42 47 31"/><path d="M142 42l11-11"/><path d="M38 82H22"/><path d="M162 82h16"/></g>
            <path d="M58 136V98a42 42 0 0 1 84 0v38z" fill="#c8102e" stroke="#fff" stroke-width="6"/>
            <path d="M76 100a24 24 0 0 1 17-22" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6" fill="none"/>
            ${DROP(88, 90, 1, "#fff")}
            <rect x="42" y="134" width="116" height="22" rx="9" fill="#fff8f1"/>
            <path class="sos-ecg" d="M8 182h52l10-18 14 32 12-26 8 12h88" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,

        // Login / sign-up: a friendly blood bag with a heart
        auth: `<svg viewBox="0 0 220 230">
            <circle cx="110" cy="112" r="98" fill="#fff" opacity=".1"/>
            <circle cx="110" cy="14" r="7" fill="none" stroke="#fff8f1" stroke-width="4"/><path d="M110 21v12" stroke="#fff8f1" stroke-width="5" stroke-linecap="round"/>
            <path d="M62 110c-15-2-24-12-26-24" stroke="#fff8f1" stroke-width="8" stroke-linecap="round" fill="none" class="art-wave"/>
            <circle cx="35" cy="83" r="7" fill="#fff8f1" class="art-wave"/>
            <rect x="62" y="32" width="96" height="126" rx="30" fill="#fff8f1"/>
            <path d="M62 98q12-8 24 0t24 0 24 0 24 0v30a30 30 0 0 1-30 30h-36a30 30 0 0 1-30-30z" fill="#e0324d"/>
            <rect x="82" y="47" width="56" height="28" rx="9" fill="#fff" stroke="#f2bcc8" stroke-width="2"/>
            <path d="M110 53v16M102 61h16" stroke="#c8102e" stroke-width="4" stroke-linecap="round"/>
            <circle cx="95" cy="116" r="6.5" fill="#fff"/><circle cx="125" cy="116" r="6.5" fill="#fff"/>
            <circle cx="96" cy="117" r="3.3" fill="#5e0a1b"/><circle cx="126" cy="117" r="3.3" fill="#5e0a1b"/>
            <path d="M100 130q10 9 20 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
            <circle cx="83" cy="130" r="5" fill="#fbd3c9" opacity=".85"/><circle cx="137" cy="130" r="5" fill="#fbd3c9" opacity=".85"/>
            <path d="M158 112c14 0 22-8 25-20" stroke="#fff8f1" stroke-width="8" stroke-linecap="round" fill="none"/>
            <g class="art-bob">${HEART(168, 60, 1.6, "#c8102e")}<path d="M180 82c0-3 2-5 5-5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/></g>
            <path d="M110 158v18c0 14 22 13 22 28" stroke="#fff8f1" stroke-width="5" fill="none" stroke-linecap="round"/>
            ${DROP(124, 196, 0.68, "#fff")}
        </svg>`,

        // Dashboard: a chart card with bars, a pie and a blood drop
        stats: `<svg viewBox="0 0 260 200">${GLOW}
            <rect x="48" y="44" width="164" height="124" rx="20" fill="#fff8f1"/>
            <path d="M68 148h124" stroke="#f2bcc8" stroke-width="3" stroke-linecap="round"/>
            <rect class="art-bar b1" x="76" y="112" width="18" height="36" rx="5" fill="#f28c28"/>
            <rect class="art-bar b2" x="102" y="92" width="18" height="56" rx="5" fill="#c8102e"/>
            <rect class="art-bar b3" x="128" y="102" width="18" height="46" rx="5" fill="#0f8b8d"/>
            <rect class="art-bar b4" x="154" y="78" width="18" height="70" rx="5" fill="#187a4e"/>
            <path d="M74 96 104 76l26 10 40-30" stroke="#8f0b21" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="170" cy="56" r="5" fill="#8f0b21"/>
            <g transform="translate(192 118)"><g class="art-bob">
                <circle r="30" fill="#fff" stroke="#fde9dc" stroke-width="4"/>
                <path d="M0 0V-26A26 26 0 0 1 24.7 8z" fill="#c8102e"/><path d="M0 0 24.7 8A26 26 0 0 1-14 22z" fill="#0f8b8d"/><path d="M0 0-14 22A26 26 0 0 1 0-26z" fill="#f28c28"/>
            </g></g>
            ${DROP(30, 26, 1.3, "#fbd3c9")}${HEART(214, 30, .8, "#fff", "art-heart")}
        </svg>`,

        // Terms & privacy: shield with a heart and a green check
        terms: `<svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="#fff" opacity=".1"/>
            <path d="M100 20 156 40v46c0 44-30 74-56 88-26-14-56-44-56-88V40z" fill="#fff8f1"/>
            <path d="M100 20 156 40v46c0 44-30 74-56 88z" fill="#fde9dc"/>
            ${HEART(73, 62, 2.25, "#c8102e", "art-heart")}
            <circle cx="148" cy="146" r="20" fill="#34b27b" stroke="#fff" stroke-width="4"/>
            <path d="m139 146 6 6 12-12" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`
    };
    const ART_LABELS = {
        camps: "Illustration: a medical tent for a blood donation camp, with a calendar and a location pin",
        find: "Illustration: a map with donor location pins and a magnifying glass",
        register: "Illustration: a donor handing a blood drop to a person in need, in front of a heart",
        sos: "Emergency symbol: a siren with a blood drop and a heartbeat line",
        auth: "Illustration: a smiling blood bag holding a heart",
        terms: "Illustration: a shield with a heart and a check mark",
        stats: "Illustration: a chart card with bars, a pie chart and a blood drop"
    };

    // ---------- Illustrated donor avatars (generic, not real people) ----------
    const AVATAR = [
        { bg: "#fde9dc", shirt: "#c8102e", skin: "#e8b08f", hair: "#3b1f1d", style: "short" },
        { bg: "#e3f4eb", shirt: "#187a4e", skin: "#b9805e", hair: "#2a1513", style: "long" },
        { bg: "#f9dce3", shirt: "#8f0b21", skin: "#d39a76", hair: "#4a2a22", style: "bun" },
        { bg: "#fff1e8", shirt: "#f4846f", skin: "#a8704f", hair: "#1f1110", style: "curly" }
    ];
    const HAIR = {
        short: '<path d="M17 25c0-8 5-12.5 11-12.5S39 17 39 24c-3-3-7-4.5-11-4.5S20 21.5 17 25z"/>',
        long: '<path d="M16 28c0-10 5-15.5 12-15.5S40 18 40 28v10c-2-2-3-6-3-9-4-1.5-7-4-9-7-2 3-5.5 5.5-9 6.5 0 4-1 7.5-3 9.5z"/>',
        bun: '<circle cx="28" cy="12" r="5"/><path d="M17 25c0-8 5-12 11-12s11 4 11 12c-3-3.5-7-5-11-5s-8 1.5-11 5z"/>',
        curly: '<path d="M16.5 25.5a11.5 11.5 0 0 1 23 0c-2-1.6-4-1.6-5.6-.6-2-2-5-2-7 0-2.6-1.2-6-1-10.4.6z"/><circle cx="18" cy="21" r="3.4"/><circle cx="23" cy="15.8" r="3.6"/><circle cx="29.5" cy="14.4" r="3.6"/><circle cx="35.5" cy="17.6" r="3.4"/><circle cx="38.6" cy="23" r="3"/>'
    };
    function avatar(seed) {
        let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const a = AVATAR[h % AVATAR.length];
        return `<svg class="donor-avatar" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
            <rect width="56" height="56" rx="16" fill="${a.bg}"/>
            <path d="M9 56c2-10 9.5-15.5 19-15.5S45 46 47 56z" fill="${a.shirt}"/>
            <circle cx="28" cy="27" r="10.5" fill="${a.skin}"/>
            <g fill="${a.hair}">${HAIR[a.style]}</g>
            <circle cx="24.2" cy="28" r="1.25" fill="#2a1513"/><circle cx="31.8" cy="28" r="1.25" fill="#2a1513"/>
            <path d="M24.8 32c1.9 1.5 4.5 1.5 6.4 0" stroke="#2a1513" stroke-width="1.3" fill="none" stroke-linecap="round"/>
        </svg>`;
    }

    // ---------- Which icon goes with which link ----------
    function iconFor(a) {
        const href = (a.getAttribute("href") || "").toLowerCase();
        const view = (a.dataset.view || "").toLowerCase();
        const text = (a.textContent || "").trim().toLowerCase();
        if (a.id === "navLogout" || /logout/.test(text)) return "logout";
        if (a.hasAttribute("data-banks-view") || href.includes("view=banks")) return "bloodBag";
        if (href.includes("#feedback") || a.dataset.scroll === "feedback") return "heart";
        if (a.id === "navAccount") return /dashboard/.test(text) ? "dashboard" : "user";
        const key = view || href.replace(/^#/, "").replace(/\.html.*$/, "");
        const map = {
            home: "home", index: "home", "": "home", find: "search", "find-donor": "search", camps: "tent",
            register: "heartHand", emergency: "siren", login: "login", signup: "userPlus", dashboard: "dashboard",
            terms: "file", welcome: "sparkles", statistics: "chart", stats: "chart"
        };
        return map[key] || (/dashboard/.test(text) ? "dashboard" : null);
    }
    function addLinkIcon(a, name) {
        if (!name || a.querySelector(":scope > .ico")) return;
        a.insertAdjacentHTML("afterbegin", icon(name));
        a.classList.add("has-ico");
    }
    function decorateLinks(root) {
        root.querySelectorAll(".nav-links a, .footer a").forEach(a => {
            if (a.classList.contains("logo")) return;
            addLinkIcon(a, iconFor(a));
        });
        // footer lines without a link (emergency numbers)
        root.querySelectorAll(".footer li").forEach(li => {
            if (li.querySelector("a") || li.querySelector(":scope > .ico")) return;
            const t = li.textContent.toLowerCase();
            const name = t.includes("ambulance") ? "ambulance" : /emergency|112/.test(t) ? "phone" : null;
            if (name) { li.insertAdjacentHTML("afterbegin", icon(name)); li.classList.add("has-ico"); }
        });
    }

    // ---------- Illustrations + floaters ----------
    function renderArt(root) {
        root.querySelectorAll("[data-art]").forEach(el => {
            if (el.dataset.artDone) return;
            const key = el.dataset.art;
            if (!ART[key]) return;
            el.innerHTML = ART[key];
            el.dataset.artDone = "1";
            const svg = el.querySelector("svg");
            if (el.hasAttribute("data-art-hidden")) { svg.setAttribute("aria-hidden", "true"); }
            else { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", ART_LABELS[key]); }
        });
    }
    // fixed positions so the layout is the same on every visit
    const FLOAT_SPOTS = [
        [6, 18, "drop", 1.0, 0], [16, 72, "heart", .8, 2.2], [30, 8, "heart", .6, 4.1], [48, 86, "drop", .7, 1.3],
        [64, 12, "drop", .55, 3.4], [78, 64, "heart", .9, .6], [90, 26, "drop", .75, 2.8], [94, 84, "heart", .6, 5]
    ];
    function renderFloaters(root) {
        root.querySelectorAll("[data-floaters]").forEach(host => {
            if (host.querySelector(":scope > .floaters")) return;
            const n = Math.min(FLOAT_SPOTS.length, parseInt(host.dataset.floaters, 10) || 6);
            const items = FLOAT_SPOTS.slice(0, n).map(([x, y, kind, s, d]) =>
                `<span class="floater ${kind}" style="left:${x}%;top:${y}%;--s:${s};--d:${d}s">${icon(kind === "drop" ? "drop" : "heart", "floater-svg")}</span>`).join("");
            host.insertAdjacentHTML("afterbegin", `<div class="floaters" aria-hidden="true">${items}</div>`);
            host.classList.add("has-floaters");
        });
    }

    // ---------- Donor cards: avatar + blood-group drop ----------
    function decorateCards(root) {
        root.querySelectorAll(".donor-card").forEach(card => {
            if (card.classList.contains("bank-card") || card.classList.contains("camp-card") || card.classList.contains("profile-card")) return;
            const badge = card.querySelector(":scope > .donor-badge");
            if (!badge || badge.dataset.decor || badge.classList.contains("profile-badge")) return;
            const group = badge.textContent.trim();
            const name = (card.querySelector("h3") || {}).textContent || group;
            badge.dataset.decor = "1";
            badge.classList.add("has-avatar");
            badge.setAttribute("aria-label", "Blood group " + group);
            badge.setAttribute("title", "Blood group " + group);
            badge.innerHTML = avatar(name) + `<b class="group-drop" aria-hidden="true"><span>${group.replace(/[<>&"]/g, "")}</span></b>`;
        });
    }

    function decorate(root) {
        if (!root || !root.querySelectorAll) return;
        decorateLinks(root); renderArt(root); renderFloaters(root); decorateCards(root);
    }

    // ---------- Click feedback: ripple + tiny heart burst ----------
    document.addEventListener("pointerdown", e => {
        const btn = e.target.closest(".btn, .popup-btn, .tabs button, .dash-tabs button");
        if (!btn || reduceMotion()) return;
        const r = btn.getBoundingClientRect(), size = Math.max(r.width, r.height) * 1.6;
        const ink = document.createElement("span");
        ink.className = "ripple";
        ink.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        btn.classList.add("ripple-host");
        if (getComputedStyle(btn).position === "static") btn.classList.add("ripple-rel");
        btn.appendChild(ink);
        setTimeout(() => ink.remove(), 650);
    }, { passive: true });
    document.addEventListener("click", e => {
        const btn = e.target.closest(".btn-primary, .btn-glow, [data-heart-burst]");
        if (!btn || reduceMotion() || !e.clientX) return;
        for (let i = 0; i < 4; i++) {
            const h = document.createElement("span");
            h.className = "heart-burst";
            h.setAttribute("aria-hidden", "true");
            h.innerHTML = icon("heart", "floater-svg");
            h.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--dx:${(i - 1.5) * 18}px;--rot:${(i - 1.5) * 14}deg;animation-delay:${i * 40}ms`;
            document.body.appendChild(h);
            setTimeout(() => h.remove(), 1000);
        }
    });

    // ---------- Start + keep up with lists that are redrawn ----------
    function start() {
        decorate(document);
        let queued = false;
        new MutationObserver(muts => {
            if (queued) return;
            if (!muts.some(m => m.addedNodes.length)) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; decorate(document); });
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

    window.LifeDropDecor = { icon, ART, avatar, decorate };
})();
