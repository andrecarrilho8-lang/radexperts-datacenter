const fs = require('fs');
const content = fs.readFileSync('e:\\ANTIGRAVITY\\10X\\dashboard\\old_version.tsx', { encoding: 'utf16le' });
const match = content.match(/user === ['"](.*?)['"] && pass === ['"](.*?)['"]/);
console.log(match ? { user: match[1], pass: match[2] } : 'Not found');
