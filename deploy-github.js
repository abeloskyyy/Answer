const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Iniciando despliegue en GitHub Pages...');

// 1. Ejecutar el build primero para asegurar que tenemos lo último
console.log('📦 Generando build...');
execSync('node build-web.js', { stdio: 'inherit' });

const buildPath = path.join(__dirname, 'web-build');

try {
    // 2. Inicializar git en la carpeta web-build si no existe
    if (!fs.existsSync(path.join(buildPath, '.git'))) {
        console.log('🔧 Inicializando repo en web-build...');
        execSync('git init', { cwd: buildPath, stdio: 'inherit' });

        // Obtener la URL del remoto actual para usarla en la carpeta build
        const remoteUrl = execSync('git remote get-url origin').toString().trim();
        execSync(`git remote add origin ${remoteUrl}`, { cwd: buildPath, stdio: 'inherit' });
    }

    // 3. Crear o cambiar a rama gh-pages dentro de web-build
    console.log('🌿 Preparando rama gh-pages...');
    try {
        execSync('git checkout -b gh-pages', { cwd: buildPath, stdio: 'ignore' });
    } catch (e) {
        // Si ya existe la rama localmente
        execSync('git checkout gh-pages', { cwd: buildPath, stdio: 'ignore' });
    }

    // 4. Asegurar que el dominio custom no se borre
    const CUSTOM_DOMAIN = "answer.abelosky.com"; // CAMBIA ESTO por tu dominio real
    fs.writeFileSync(path.join(buildPath, 'CNAME'), CUSTOM_DOMAIN);
    console.log(`📌 Dominio custom configurado: ${CUSTOM_DOMAIN}`);

    // 5. Hacer commit y push forzado
    console.log('📤 Subiendo cambios a GitHub...');
    execSync('git add -A', { cwd: buildPath, stdio: 'inherit' });

    // Solo hacemos commit si hay cambios
    try {
        execSync('git commit -m "Deploy automatico con CNAME"', { cwd: buildPath, stdio: 'inherit' });
    } catch (e) {
        console.log('✅ No hay cambios nuevos que subir.');
    }

    // Push forzado a la rama gh-pages del remoto
    execSync('git push origin gh-pages --force', { cwd: buildPath, stdio: 'inherit' });

    console.log('\n✨ ¡Despliegue completado con éxito!');
    console.log('Tu web se actualizará en unos instantes en: https://abeloskyyy.github.io/Answer/');

} catch (error) {
    console.error('\n❌ Error durante el despliegue:', error.message);
}
