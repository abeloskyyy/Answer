const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function runCommand(command) {
    console.log(`\n> Ejecutando: ${command}`);
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (e) {
        // Ignorar error si es git commit y no hay cambios
        if (command.includes('git commit') && e.status === 1) {
            console.log('ℹ️ Nada que commitear (sin cambios).');
            return true;
        }
        console.error(`\n❌ Error ejecutando el comando: ${command}`);
        return false;
    }
}

async function main() {
    console.log('=========================================');
    process.stdout.write('🚀 INICIANDO PROCESO DE CONSTRUCCIÓN GLOBAL\n');
    console.log('=========================================');

    // 1. Ejecutar build-web.js
    if (!runCommand('node build-web.js')) process.exit(1);

    // 2. Ejecutar build-mobile.js
    if (!runCommand('node build-mobile.js')) process.exit(1);

    // 3. Ejecutar deploy-github.js
    if (!runCommand('node deploy-github.js')) process.exit(1);

    // 4. git add .
    console.log('\n📦 Preparando cambios para GitHub...');
    runCommand('git add .');

    // 5. Preguntar por el nombre del commit
    rl.question('\n📝 Introduce el mensaje del commit (Enter para "Update"): ', (answer) => {
        const commitMsg = answer.trim() || "Update";

        // 6. git commit -m ""
        runCommand(`git commit -m "${commitMsg}"`);

        // 7. git push
        console.log('\n📤 Subiendo código al repositorio principal...');
        if (runCommand('git push')) {
            console.log('\n=========================================');
            console.log('✨ ¡TODO COMPLETADO CON ÉXITO!');
            console.log('✅ Web construida');
            console.log('✅ APK generado y movido a releases');
            console.log('✅ GitHub Pages actualizado');
            console.log('✅ Código subido a GitHub');
            console.log('=========================================');
        }

        rl.close();
    });
}

main();
