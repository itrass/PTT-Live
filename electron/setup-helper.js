/**
 * PTT Live Desktop - Setup Helper
 * Automatise l'installation des dépendances et certificats
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const execPromise = promisify(exec);

/**
 * Vérifie si mkcert est installé
 */
async function isMkcertInstalled() {
  try {
    await execPromise('mkcert -version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Installe mkcert automatiquement
 */
async function installMkcert() {
  const platform = os.platform();

  console.log('📦 Installation de mkcert...');

  try {
    if (platform === 'darwin') {
      // macOS - via Homebrew
      if (await isHomebrewInstalled()) {
        await execPromise('brew install mkcert nss');
        console.log('✅ mkcert installé via Homebrew');
        return true;
      } else {
        throw new Error('Homebrew requis sur macOS');
      }
    } else if (platform === 'linux') {
      // Linux - téléchargement direct
      await execPromise('curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"');
      await execPromise('chmod +x mkcert-v*-linux-amd64');
      await execPromise('sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert');
      console.log('✅ mkcert installé');
      return true;
    } else {
      throw new Error(`Plateforme non supportée: ${platform}`);
    }
  } catch (error) {
    console.error('❌ Erreur installation mkcert:', error.message);
    return false;
  }
}

/**
 * Vérifie si Homebrew est installé
 */
async function isHomebrewInstalled() {
  try {
    await execPromise('brew --version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Installe la CA locale
 */
async function installCA() {
  try {
    console.log('🔑 Installation de la Certificate Authority locale...');
    await execPromise('mkcert -install');
    console.log('✅ CA locale installée');
    return true;
  } catch (error) {
    console.error('❌ Erreur installation CA:', error.message);
    return false;
  }
}

/**
 * Détecte l'IP réseau locale
 */
function getNetworkIP() {
  const interfaces = os.networkInterfaces();

  // Priorité : WiFi > Ethernet
  const priority = ['en0', 'en1', 'eth0', 'wlan0'];

  for (const name of priority) {
    const iface = interfaces[name];
    if (iface) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // Fallback : première IP non-interne
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return '192.168.1.100'; // Fallback ultime
}

/**
 * Génère les certificats SSL
 */
async function generateCertificates(certsDir) {
  try {
    const networkIP = getNetworkIP();
    const hostname = os.hostname();

    console.log('📜 Génération des certificats...');
    console.log(`   IP réseau : ${networkIP}`);

    // Créer répertoire si nécessaire
    if (!existsSync(certsDir)) {
      await execPromise(`mkdir -p "${certsDir}"`);
    }

    // Générer certificats
    const cmd = `cd "${certsDir}" && mkcert localhost 127.0.0.1 ::1 "${networkIP}" "*.local" "${hostname}.local"`;
    await execPromise(cmd);

    // Renommer pour simplifier
    const files = await execPromise(`ls "${certsDir}"/*.pem`);
    const fileList = files.stdout.trim().split('\n');

    // Trouver les fichiers générés
    const certFile = fileList.find(f => !f.includes('-key.pem'));
    const keyFile = fileList.find(f => f.includes('-key.pem'));

    if (certFile && keyFile) {
      // Copier avec noms standards
      await execPromise(`cp "${certFile}" "${join(certsDir, 'localhost.pem')}"`);
      await execPromise(`cp "${keyFile}" "${join(certsDir, 'localhost-key.pem')}"`);
    }

    console.log('✅ Certificats générés');
    return { networkIP, certPath: join(certsDir, 'localhost.pem'), keyPath: join(certsDir, 'localhost-key.pem') };
  } catch (error) {
    console.error('❌ Erreur génération certificats:', error.message);
    return null;
  }
}

/**
 * Vérifie si les certificats existent et sont valides
 */
function certificatesExist(certsDir) {
  const certPath = join(certsDir, 'localhost.pem');
  const keyPath = join(certsDir, 'localhost-key.pem');

  return existsSync(certPath) && existsSync(keyPath);
}

/**
 * Setup complet automatique
 */
async function autoSetup(projectRoot) {
  const certsDir = join(projectRoot, 'certs');

  console.log('🚀 Configuration automatique PTT Live...\n');

  // 1. Vérifier certificats existants
  if (certificatesExist(certsDir)) {
    console.log('✅ Certificats déjà présents');
    return { success: true, needsRestart: false };
  }

  console.log('⚠️  Certificats SSL non trouvés\n');

  // 2. Vérifier mkcert
  const hasMkcert = await isMkcertInstalled();

  if (!hasMkcert) {
    console.log('📦 mkcert non installé, installation...\n');

    const installed = await installMkcert();
    if (!installed) {
      return {
        success: false,
        error: 'Installation mkcert échouée',
        manual: true,
        instructions: 'Installez mkcert manuellement : https://github.com/FiloSottile/mkcert'
      };
    }
  } else {
    console.log('✅ mkcert déjà installé\n');
  }

  // 3. Installer CA locale
  const caInstalled = await installCA();
  if (!caInstalled) {
    return {
      success: false,
      error: 'Installation CA échouée',
      manual: true
    };
  }

  console.log('');

  // 4. Générer certificats
  const result = await generateCertificates(certsDir);
  if (!result) {
    return {
      success: false,
      error: 'Génération certificats échouée',
      manual: true
    };
  }

  console.log('\n✅ Configuration terminée !');
  console.log(`   Certificats : ${certsDir}`);
  console.log(`   IP réseau : ${result.networkIP}\n`);

  return {
    success: true,
    needsRestart: false,
    networkIP: result.networkIP,
    certPath: result.certPath,
    keyPath: result.keyPath
  };
}

module.exports = {
  isMkcertInstalled,
  installMkcert,
  installCA,
  generateCertificates,
  certificatesExist,
  getNetworkIP,
  autoSetup
};
