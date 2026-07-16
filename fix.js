const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
content = content.replace(/-₱\{/g, '-${');
fs.writeFileSync('app.js', content);
console.log('Fixed app.js');
