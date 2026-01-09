const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Deploying to GitHub Pages...');

// 1. Build web version
console.log('Building web version...');
execSync('node build-web.js', { stdio: 'inherit' });

// 2. Create/switch to gh-pages branch
try {
    execSync('git checkout gh-pages', { stdio: 'inherit' });
} catch (e) {
    console.log('Creating gh-pages branch...');
    execSync('git checkout --orphan gh-pages', { stdio: 'inherit' });
}

// 3. Clear everything except web-build
console.log('Clearing old files...');
const files = fs.readdirSync('.');
files.forEach(file => {
    if (file !== 'web-build' && file !== '.git' && file !== 'node_modules') {
        try {
            fs.rmSync(file, { recursive: true, force: true });
        } catch (e) { }
    }
});

// 4. Move web-build contents to root
console.log('Moving web-build to root...');
const webBuildFiles = fs.readdirSync('web-build');
webBuildFiles.forEach(file => {
    fs.renameSync(path.join('web-build', file), file);
});
fs.rmdirSync('web-build');

// 5. Commit and push
console.log('Committing and pushing...');
execSync('git add -A', { stdio: 'inherit' });
try {
    execSync('git commit -m "Deploy to GitHub Pages"', { stdio: 'inherit' });
    execSync('git push -u origin gh-pages --force', { stdio: 'inherit' });
} catch (e) {
    console.log('No changes to commit or push failed');
}

// 6. Return to main branch
execSync('git checkout main', { stdio: 'inherit' });

console.log('\n✅ Deployment complete!');
console.log('Your site will be available at: https://abeloskyyy.github.io/Answer/');
console.log('(May take a few minutes to go live)');
