#!/usr/bin/env node

/**
 * Documentation Synchronization Script
 * 
 * This script ensures documentation consistency between:
 * 1. GitHub repository (full documentation)
 * 2. NPM package (minimal documentation)
 * 3. Generated API documentation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  // Files to always include in npm package
  npmEssentialFiles: [
    'README.md',
    'LICENSE'
  ],
  
  // Documentation files in docs/ directory to include in npm
  npmDocsFiles: [
    'README.ZH_CN.md',
    'api.md',
    'architecture.md',
    'development.md'
  ],
  
  // Documentation directories to sync
  docDirs: [
    'docs'
  ],
  
  // Files to exclude from npm package
  excludeFromNpm: [
    'docs/api-generated', // Generated API docs (can be large)
    'docs/.temp',
    'docs/*.bak',
    'docs/*.tmp'
  ],
  
  // Minimum documentation files required
  requiredDocs: [
    'README.md',
    'docs/README.ZH_CN.md',
    'docs/api.md',
    'docs/architecture.md',
    'docs/development.md'
  ]
};

/**
 * Validate that all required documentation files exist
 */
async function validateRequiredDocs() {
  console.log('🔍 Validating required documentation files...');
  
  const missingFiles = [];
  
  for (const docFile of CONFIG.requiredDocs) {
    const filePath = path.join(rootDir, docFile);
    try {
      await fs.access(filePath);
      console.log(`  ✅ ${docFile}`);
    } catch (error) {
      console.log(`  ❌ ${docFile} - MISSING`);
      missingFiles.push(docFile);
    }
  }
  
  if (missingFiles.length > 0) {
    console.error('\n❌ Missing required documentation files:');
    missingFiles.forEach(file => console.error(`  - ${file}`));
    throw new Error('Missing required documentation files');
  }
  
  console.log('✅ All required documentation files exist\n');
}

/**
 * Prepare documentation for npm package
 */
async function prepareNpmDocs() {
  console.log('📦 Preparing documentation for npm package...');
  
  const npmDocsDir = path.join(rootDir, '.npm-docs-temp');
  
  try {
    // Clean up any existing temp directory
    await fs.rm(npmDocsDir, { recursive: true, force: true });
    await fs.mkdir(npmDocsDir, { recursive: true });
    
    // Copy essential files
    for (const file of CONFIG.npmEssentialFiles) {
      const source = path.join(rootDir, file);
      const dest = path.join(npmDocsDir, file);
      
      try {
        await fs.copyFile(source, dest);
        console.log(`  📄 Copied: ${file}`);
      } catch (error) {
        console.warn(`  ⚠️  Could not copy ${file}: ${error.message}`);
      }
    }
    
    // Create docs directory in temp
    const npmDocsSubDir = path.join(npmDocsDir, 'docs');
    await fs.mkdir(npmDocsSubDir, { recursive: true });
    
    // Copy documentation files (excluding generated files)
    const docsSourceDir = path.join(rootDir, 'docs');
    
    try {
      const files = await fs.readdir(docsSourceDir);
      
      for (const file of files) {
        const source = path.join(docsSourceDir, file);
        const dest = path.join(npmDocsSubDir, file);
        
        // Check if file should be excluded
        const shouldExclude = CONFIG.excludeFromNpm.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(file);
          }
          return file === pattern;
        });
        
        if (shouldExclude) {
          console.log(`  ⏭️  Skipped: docs/${file} (excluded from npm)`);
          continue;
        }
        
        const stat = await fs.stat(source);
        
        if (stat.isDirectory()) {
          // Skip directories that are excluded
          if (!CONFIG.excludeFromNpm.includes(`docs/${file}`)) {
            await fs.cp(source, dest, { recursive: true });
            console.log(`  📁 Copied directory: docs/${file}/`);
          }
        } else {
          await fs.copyFile(source, dest);
          console.log(`  📄 Copied: docs/${file}`);
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not copy docs directory: ${error.message}`);
    }
    
    // Create npm-specific documentation index
    const npmIndexContent = `# MCPilot SDK Core Documentation (NPM Package)

This package includes essential documentation for getting started with MCPilot SDK Core.

## 📚 Available Documentation

### Essential Files
- **[README.md](../README.md)** - Main documentation and quick start guide
- **[README.ZH_CN.md](README.ZH_CN.md)** - Chinese documentation (中文文档)

### Detailed Documentation
- **[API Reference](api.md)** - Complete API documentation
- **[Architecture Guide](architecture.md)** - System architecture and design decisions
- **[Development Guide](development.md)** - Contributing and building from source

## 🔗 Online Resources

For complete documentation including examples, tutorials, and the latest updates, please visit:

- **GitHub Repository**: https://github.com/MCPilotX/sdk-core
- **Issue Tracker**: https://github.com/MCPilotX/sdk-core/issues
- **NPM Package**: https://www.npmjs.com/package/@mcpilotx/sdk-core

## 🆘 Getting Help

If you need assistance:

1. **Check the examples**: See the \`examples/\` directory in the GitHub repository
2. **Review API documentation**: The \`docs/api.md\` file contains detailed API reference
3. **Search existing issues**: Many common questions are already answered
4. **Open a new issue**: For bugs or feature requests

## 📦 Package Information

- **Package Name**: @mcpilotx/sdk-core
- **Version**: ${await getPackageVersion()}
- **License**: Apache 2.0
- **TypeScript Support**: Full type definitions included

---

*This documentation is included in the npm package for offline reference. For the most up-to-date documentation, please visit the GitHub repository.*
`;
    
    await fs.writeFile(
      path.join(npmDocsSubDir, 'INDEX.md'),
      npmIndexContent
    );
    
    console.log('  📝 Created: docs/INDEX.md (npm-specific index)');
    
    // Create a summary file
    const summary = {
      preparedAt: new Date().toISOString(),
      packageVersion: await getPackageVersion(),
      includedFiles: await listFilesInDir(npmDocsDir),
      note: 'This directory contains documentation prepared for npm package publication'
    };
    
    await fs.writeFile(
      path.join(npmDocsDir, 'SUMMARY.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('\n✅ NPM documentation prepared successfully');
    console.log(`📁 Location: ${npmDocsDir}`);
    
    return npmDocsDir;
    
  } catch (error) {
    console.error('❌ Error preparing npm documentation:', error);
    throw error;
  }
}

/**
 * Update package.json to include documentation
 */
async function updatePackageJsonForNpm() {
  console.log('📄 Updating package.json for npm publication...');
  
  const packageJsonPath = path.join(rootDir, 'package.json');
  
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    // Ensure files field includes documentation
    const requiredFiles = [
      'dist/**/*.js',
      'dist/**/*.d.ts',
      ...CONFIG.npmEssentialFiles,
      'docs/'
    ];
    
    // Remove duplicates and sort
    packageJson.files = [...new Set([...requiredFiles])].sort();
    
    // Ensure publishConfig is set
    if (!packageJson.publishConfig) {
      packageJson.publishConfig = {
        access: 'public',
        registry: 'https://registry.npmjs.org/'
      };
    }
    
    // Write updated package.json
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2)
    );
    
    console.log('✅ Updated package.json files field:', packageJson.files);
    
    return packageJson;
    
  } catch (error) {
    console.error('❌ Error updating package.json:', error);
    throw error;
  }
}

/**
 * Verify what will be included in npm package
 */
async function verifyNpmPackageContents() {
  console.log('🔍 Verifying npm package contents...');
  
  try {
    // Read package.json to see what files will be included
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    console.log('\n📦 Files that will be included in npm package:');
    console.log('=============================================');
    
    for (const pattern of packageJson.files) {
      console.log(`  ${pattern}`);
    }
    
    // Check if essential files exist
    console.log('\n🔎 Checking essential file existence:');
    
    for (const essentialFile of CONFIG.npmEssentialFiles) {
      const filePath = path.join(rootDir, essentialFile);
      try {
        await fs.access(filePath);
        console.log(`  ✅ ${essentialFile}`);
      } catch (error) {
        console.log(`  ❌ ${essentialFile} - MISSING`);
      }
    }
    
    // Check docs directory
    const docsPath = path.join(rootDir, 'docs');
    try {
      const stats = await fs.stat(docsPath);
      if (stats.isDirectory()) {
        console.log('  ✅ docs/ directory');
      }
    } catch (error) {
      console.log('  ❌ docs/ directory - MISSING');
    }
    
    console.log('\n✅ NPM package verification completed\n');
    
  } catch (error) {
    console.error('❌ Error verifying npm package:', error);
    throw error;
  }
}

/**
 * Get package version from package.json
 */
async function getPackageVersion() {
  try {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * List files in a directory recursively
 */
async function listFilesInDir(dir, baseDir = dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (entry.isDirectory()) {
        files.push(...await listFilesInDir(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }
  } catch (error) {
    // Ignore errors for non-existent directories
  }
  
  return files.sort();
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 MCPilot SDK Core Documentation Sync Script');
  console.log('=============================================\n');
  
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    
    switch (command) {
      case 'validate':
        await validateRequiredDocs();
        break;
        
      case 'prepare-npm':
        await validateRequiredDocs();
        await prepareNpmDocs();
        break;
        
      case 'update-package':
        await updatePackageJsonForNpm();
        break;
        
      case 'verify':
        await verifyNpmPackageContents();
        break;
        
      case 'all':
      default:
        console.log('Running full documentation sync process...\n');
        await validateRequiredDocs();
        await updatePackageJsonForNpm();
        await prepareNpmDocs();
        await verifyNpmPackageContents();
        break;
    }
    
    console.log('\n✨ Documentation sync completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Documentation sync failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  validateRequiredDocs,
  prepareNpmDocs,
  updatePackageJsonForNpm,
  verifyNpmPackageContents
};