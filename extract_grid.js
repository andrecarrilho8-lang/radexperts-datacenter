const fs = require('fs');
const content = fs.readFileSync('e:\\ANTIGRAVITY\\10X\\dashboard\\old_version.tsx', { encoding: 'utf16le' });
const startIdx = content.indexOf("!campDetail ? (");
const endIdx = content.indexOf(": ("); // Beginning of detail view
console.log(content.substring(startIdx, endIdx));
