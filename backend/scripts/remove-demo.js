// npm run remove-demo  -> deletes ONLY the demo (isDemo) donors, requests and camps
require("../utils/env");
const { removeDemoRecords } = require("../utils/demo-data");
const r = removeDemoRecords();
for (const [file, n] of Object.entries(r)) console.log(`${file}: removed ${n} demo record(s); real records kept.`);
