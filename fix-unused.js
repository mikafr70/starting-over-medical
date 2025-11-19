const fs = require('fs');
const { execSync } = require('child_process');

// Run build to get errors
try {
  execSync('npm.cmd run build', { stdio: 'pipe', encoding: 'utf8' });
} catch (e) {
  const output = e.stdout || e.stderr || '';
  const lines = output.split('\n');
  
  lines.forEach(line => {
    const match = line.match(/^\.\/src\/(.*?):(\d+):(\d+)/);
    if (match) {
      const filePath = `src/${match[1]}`;
      const lineNum = parseInt(match[2]);
      
      const content = fs.readFileSync(filePath, 'utf8').split('\n');
      const importLine = content[lineNum - 1];
      
      if (importLine && importLine.includes('import')) {
        // Try to identify and remove unused imports
        const nextLine = content[lineNum] || '';
        const typeErrorMatch = line.match(/Type error: '([^']+)' is declared but/);
        if (typeErrorMatch) {
          const unusedName = typeErrorMatch[1];
          const newLine = importLine.replace(new RegExp(`\\b${unusedName}\\b\\s*,?\\s*`), '').replace(/,\\s*$/, '');
          if (newLine.trim() !== 'import') {
            content[lineNum - 1] = newLine;
            fs.writeFileSync(filePath, content.join('\n'));
            console.log(`Fixed ${filePath}:${lineNum} - removed ${unusedName}`);
          }
        }
      }
    }
  });
}
