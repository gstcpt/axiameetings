const fs = require('fs');
const path = require('path');
function findDir(dir, target) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    if (files.includes(target)) return path.join(dir, target);
    for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
            const res = findDir(fullPath, target);
            if (res) return res;
        }
    }
    return null;
}
console.log('Login Dir:', findDir('src/app', 'login'));
console.log('API Auth Dir:', findDir('src/app/api', 'auth'));
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const userMatch = schema.match(/model users \{[^}]+\}/);
console.log('Users schema:', userMatch ? userMatch[0] : 'not found');
