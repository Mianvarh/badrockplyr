import fs from "fs";
import path from "path";
import { execSync } from "child_process";

async function main() {
  const rootDir = process.cwd();
  const themeDir = path.join(rootDir, "wordpress", "badrock-child-theme");
  const distDir = path.join(rootDir, "dist");
  const zipOutput = path.join(distDir, "badrock-child-theme.zip");

  console.log("==================================================");
  console.log("EMPAQUETANDO BADROCKPLYR CHILD THEME PARA CODESTER");
  console.log("==================================================");

  if (!fs.existsSync(themeDir)) {
    console.error(`Error: No se encontró la carpeta del theme en: ${themeDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  if (fs.existsSync(zipOutput)) {
    fs.unlinkSync(zipOutput);
  }

  // Compress theme using PowerShell Compress-Archive
  const psCommand = `Compress-Archive -Path "${themeDir}" -DestinationPath "${zipOutput}" -Force`;
  console.log(`Ejecutando compresión a: ${zipOutput}`);
  execSync(`powershell -Command "${psCommand}"`, { stdio: "inherit" });

  const presetsDir = path.join(rootDir, "wordpress", "presets");
  const presetsZip = path.join(distDir, "badrock-wordpress-presets.zip");
  if (fs.existsSync(presetsDir)) {
    const psPresetsCommand = `Compress-Archive -Path "${presetsDir}" -DestinationPath "${presetsZip}" -Force`;
    execSync(`powershell -Command "${psPresetsCommand}"`, { stdio: "inherit" });
    console.log(`✓ Presets para DooPlay y ToroFlix generados: ${presetsZip}`);
  }

  const stats = fs.statSync(zipOutput);
  console.log(`✓ Paquete generado exitosamente: ${zipOutput} (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log("Listo para ser distribuido a clientes de Codester / CodeCanyon!");
}

main().catch(console.error);
