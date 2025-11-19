const fs = require('fs');
const path = require('path');

function fixAliases(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      fixAliases(full);
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      let content = fs.readFileSync(full, 'utf8');
      content = content.replace(/from ["']([^"']*?)@\d+\.\d+\.\d+["']/g, 'from "$1"');
      fs.writeFileSync(full, content);
      console.log('Fixed: ' + full);
    }
  });
}

fixAliases('src');
console.log('Done!');
