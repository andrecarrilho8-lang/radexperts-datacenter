const fs = require('fs');
const content = fs.readFileSync('e:\\ANTIGRAVITY\\10X\\dashboard\\old_version.tsx', { encoding: 'utf16le' });
const startIdx = content.indexOf("activeTab === 'CAMPANHAS'");
const endIdx = content.indexOf("activeTab === 'HOTMART'");
console.log(content.substring(startIdx, endIdx));
