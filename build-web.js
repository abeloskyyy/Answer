const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, 'web-build');

// Files/Dirs to copy
const ASSETS = [
    'index.html',
    'styles.css',
    'scripts.js',
    'firebase-config.js',
    'client-config.js',
    'assets' // Directory
];

function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function build() {
    console.log('Building Web Version...');

    // Clean/Create Build Dir
    if (fs.existsSync(BUILD_DIR)) {
        fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BUILD_DIR);

    // Copy Assets
    ASSETS.forEach(item => {
        const srcPath = path.join(__dirname, item);
        const destPath = path.join(BUILD_DIR, item);

        if (fs.existsSync(srcPath)) {
            console.log(`Copying ${item}...`);
            copyRecursive(srcPath, destPath);
        } else {
            console.warn(`Warning: ${item} not found!`);
        }
    });

    console.log('Web Build Complete! Folder: web-build');
}

build();
