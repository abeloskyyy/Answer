const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ANDROID_SDK_PATH = 'C:\\Users\\Abelosky\\Documents\\Abelosky\\DEV\\Android';
const JAVA_HOME_PATH = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.7.6-hotspot';

process.env.ANDROID_HOME = ANDROID_SDK_PATH;
process.env.ANDROID_SDK_ROOT = ANDROID_SDK_PATH;
process.env.JAVA_HOME = JAVA_HOME_PATH;

const extraPaths = [
    path.join(ANDROID_SDK_PATH, 'platform-tools'),
    path.join(ANDROID_SDK_PATH, 'cmdline-tools', 'latest', 'bin'),
    path.join(ANDROID_SDK_PATH, 'cmdline-tools', 'bin'),
    path.join(ANDROID_SDK_PATH, 'emulator'),
    path.join(JAVA_HOME_PATH, 'bin')
];

process.env.PATH = extraPaths.join(path.delimiter) + path.delimiter + process.env.PATH;

const gradlew = path.join(__dirname, 'mobile-app', 'platforms', 'android', 'gradlew.bat');

if (fs.existsSync(gradlew)) {
    console.log("Bootstraping Gradle via Wrapper...");
    try {
        execSync(`"${gradlew}" -v`, { stdio: 'inherit' });
        console.log("Gradle bootstrapped successfully!");
    } catch (e) {
        console.error("Gradle bootstrap failed.");
    }
} else {
    console.log("Gradlew not found. Cordova platform might not be ready.");
}
