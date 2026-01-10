const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_NAME = 'mobile-app';
const APP_ID = 'com.abelosky.answer';
const APP_TITLE = 'Answer';

const MOBILE_DIR = path.join(__dirname, PROJECT_NAME);
const WEB_BUILD_DIR = path.join(__dirname, 'web-build');
const WWW_DIR = path.join(MOBILE_DIR, 'www');
const RELEASES_DIR = path.join(__dirname, 'mobile-releases');
const LOGO_SQUARE = path.join(__dirname, 'assets/img/logo/logo-square.png');
const LOGO_RECT = path.join(__dirname, 'assets/img/logo/logo.png');
const GOOGLE_SERVICES_JSON = path.join(__dirname, 'google-services.json');
const WEB_CLIENT_ID = "894472877590-1v7gpel3b3g1en187vrji33krfk8q97j.apps.googleusercontent.com";

// ==========================================
// CONFIGURACIÓN DE ENTORNO (AUTOMÁTICA)
// ==========================================
// Detectado automáticamente según tus rutas:
const ANDROID_SDK_PATH = 'C:\\Users\\Abelosky\\Documents\\Abelosky\\DEV\\Android';
const JAVA_HOME_PATH = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot';

if (fs.existsSync(ANDROID_SDK_PATH)) {
    console.log(`Setting up Android Environment: ${ANDROID_SDK_PATH}`);
    process.env.ANDROID_HOME = ANDROID_SDK_PATH;
    process.env.ANDROID_SDK_ROOT = ANDROID_SDK_PATH;

    // Configurar PATH
    const extraPaths = [
        path.join(ANDROID_SDK_PATH, 'platform-tools'),
        path.join(ANDROID_SDK_PATH, 'cmdline-tools', 'latest', 'bin'),
        path.join(ANDROID_SDK_PATH, 'cmdline-tools', 'bin'),
        path.join(ANDROID_SDK_PATH, 'build-tools'),
        path.join(ANDROID_SDK_PATH, 'emulator'),
        path.join(JAVA_HOME_PATH, 'bin')
    ];

    process.env.JAVA_HOME = JAVA_HOME_PATH;
    process.env.PATH = extraPaths.join(path.delimiter) + path.delimiter + process.env.PATH;
} else {
    console.warn("Advertencia: No se encontró la carpeta Android en la ruta esperada.");
}

// ==========================================
// CONFIGURACIÓN (EDITAR AQUI)
// ==========================================
// Poner la IP de tu PC o URL de tu servidor (ej: "http://192.168.1.34:3000")
// Si usas "localhost", el emulador de Android NO conectará (usa 10.0.2.2 o tu IP local)
const SERVER_URL = "https://answer-63ef.onrender.com";
// ==========================================

function runCommand(command, cwd) {
    console.log(`Running: ${command}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
    } catch (e) {
        console.error(`Error executing command: ${command}`);
        process.exit(1);
    }
}

function buildMobile() {
    console.log('Starting Mobile Build Process...');

    // 1. Build Web Assets first
    runCommand('node build-web.js', __dirname);

    // 2. Check/Create Cordova Project
    if (!fs.existsSync(MOBILE_DIR)) {
        console.log('Creating Cordova Project...');
        // Check if cordova is available
        try {
            execSync('cordova --version', { stdio: 'ignore' });
        } catch (e) {
            console.error('Cordova not found! Please install it globally: npm install -g cordova');
            process.exit(1);
        }

        runCommand(`cordova create ${PROJECT_NAME} ${APP_ID} "${APP_TITLE}"`, __dirname);
    } else {
        console.log('Cordova project already exists.');
    }

    // Ensure Android platform is added
    const androidPlatformPath = path.join(MOBILE_DIR, 'platforms', 'android');
    if (!fs.existsSync(androidPlatformPath)) {
        console.log('Adding Android platform...');
        runCommand('cordova platform add android', MOBILE_DIR);
    }

    // NOTE: Google Auth in Cordova requires native plugins and Firebase configuration (SHA-1).
    const pluginsDir = path.join(MOBILE_DIR, 'plugins');
    if (!fs.existsSync(path.join(pluginsDir, 'cordova-plugin-googleplus'))) {
        console.log('Adding Native Google login plugins...');

        // The core native plugin for Google Login in Android/iOS
        // For Android, we use the WEB_CLIENT_ID to get the ID token back
        runCommand(`cordova plugin add cordova-plugin-googleplus --variable WEB_CLIENT_ID="${WEB_CLIENT_ID}"`, MOBILE_DIR);

        // Plugin to help with google-services.json integration
        runCommand('cordova plugin add cordova-support-google-services', MOBILE_DIR);
    }

    // 3. Clear 'www' and Copy Web Build
    console.log('Updating mobile assets...');
    // We keep config.xml and res, but we want to replace www content
    // Standard cordova create makes a www with js/css/img. We replace it.

    // Safety check: Don't delete if it's not the cordova www
    if (fs.existsSync(WWW_DIR)) {
        // fs.rmSync(WWW_DIR, { recursive: true, force: true });
        // Instead of deleting the folder (which might break cordova link), delete contents
        const files = fs.readdirSync(WWW_DIR);
        for (const file of files) {
            fs.rmSync(path.join(WWW_DIR, file), { recursive: true, force: true });
        }
    } else {
        fs.mkdirSync(WWW_DIR);
    }

    // Copy web-build content to mobile-app/www
    // We duplicate the copyRecursive logic or just assume build-web did it 
    // Easier to just recursively copy from web-build
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

    fs.readdirSync(WEB_BUILD_DIR).forEach(child => {
        copyRecursive(path.join(WEB_BUILD_DIR, child), path.join(WWW_DIR, child));
    });

    // 3.5 Copy Mobile Resources (Icon & Splash)
    console.log('Updating mobile resources (icons & splash)...');
    const resDir = path.join(MOBILE_DIR, 'res');
    const resourcesDir = path.join(MOBILE_DIR, 'resources');

    if (!fs.existsSync(resDir)) fs.mkdirSync(resDir);
    if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir);

    // Copy to 'res' (Directly used by config.xml in my setup)
    if (fs.existsSync(LOGO_SQUARE)) {
        fs.copyFileSync(LOGO_SQUARE, path.join(resDir, 'icon.png'));
        fs.copyFileSync(LOGO_SQUARE, path.join(resourcesDir, 'icon.png'));
        console.log('✔ Icon assets (and Splash Icon) updated.');
    }

    // 4. Inject Mobile Config
    console.log('Injecting Mobile Configuration...');
    const configPath = path.join(WWW_DIR, 'client-config.js');
    const mobileConfig = `
window.GAME_CONFIG = {
    SERVER_URL: "${SERVER_URL}"
};
`;
    // We append or overwrite? Overwrite is safer for mobile specific
    fs.writeFileSync(configPath, mobileConfig);

    // 5. Inject Cordova Script
    // We need to add <script src="cordova.js"></script> to index.html
    const indexHtmlPath = path.join(WWW_DIR, 'index.html');
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    if (!indexHtml.includes('cordova.js')) {
        indexHtml = indexHtml.replace('</body>', '<script src="cordova.js"></script></body>');
        fs.writeFileSync(indexHtmlPath, indexHtml);
    }

    // 6. Build APK
    console.log('Checking Cordova requirements...');
    try {
        runCommand('cordova requirements', MOBILE_DIR);
    } catch (e) {
        console.warn('Warning: Some Cordova requirements failed, but attempting build anyway...');
    }

    console.log('Building Android APK...');

    // Last check for google-services.json location before build
    const googleDest = path.join(MOBILE_DIR, 'platforms/android/app/google-services.json');
    if (fs.existsSync(GOOGLE_SERVICES_JSON) && fs.existsSync(path.dirname(googleDest))) {
        console.log('Injecting google-services.json into Android build path...');
        fs.copyFileSync(GOOGLE_SERVICES_JSON, googleDest);
    }

    runCommand('cordova build android', MOBILE_DIR);

    // 7. Move APK to releases folder
    console.log('Moving APK to releases folder...');
    if (!fs.existsSync(RELEASES_DIR)) {
        fs.mkdirSync(RELEASES_DIR);
    }

    const apkSrc = path.join(MOBILE_DIR, 'platforms/android/app/build/outputs/apk/debug/app-debug.apk');
    const apkDest = path.join(RELEASES_DIR, `${APP_TITLE.toLowerCase()}-debug.apk`);

    if (fs.existsSync(apkSrc)) {
        fs.copyFileSync(apkSrc, apkDest);
        console.log('Mobile Build Complete!');
        console.log(`APK moved to: ${apkDest}`);
    } else {
        console.error('Error: APK not found after build!');
    }

    console.log('NOTA: Si la app no conecta, edita la variable SERVER_URL en build-mobile.js y vuelve a ejecutar.');
}

buildMobile();
