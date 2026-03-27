const fs = require('fs');
const content = fs.readFileSync('e:\\ANTIGRAVITY\\10X\\dashboard\\old_version.tsx', { encoding: 'utf16le' });
const match = content.match(/pass === ['"](.*?)['"]/);
console.log(match ? match[1] : 'Not found');
