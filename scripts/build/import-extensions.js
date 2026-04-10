#!/usr/bin/env node

/**
 * Post-build script: Fix import statement extensions
 * Convert from './module' to './module.js'
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

console.log('🔧 Fixing import statement extensions...\n');

// Recursively get all .js files
function getAllJSFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJSFiles(filePath, fileList);
    } else if (extname(file) === '.js') {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Fix import statements in a single file
function fixImportsInFile(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    let originalContent = content;
    let changed = false;
    
    // Fix relative imports: convert from './module' to './module.js'
    // Use precise regex to avoid false matches
    const importRegex = /from\s+['"](\.{1,2}\/[^'"]+?)(?<!\.js)(?<!\.ts)(?<!\.json)(?<!\.js\.map)(?<!\.ts\.map)['"]/g;
    
    content = content.replace(importRegex, (match, importPath) => {
      // Check if import path points to a directory (has index.js file)
      const dirPath = join(dirname(filePath), importPath);
      const indexPath = join(dirPath, 'index.js');
      
      if (statSync(dirPath, { throwIfNoEntry: false })?.isDirectory() && 
          statSync(indexPath, { throwIfNoEntry: false })?.isFile()) {
        changed = true;
        return `from '${importPath}/index.js'`;
      } else {
        changed = true;
        return `from '${importPath}.js'`;
      }
    });
    
    if (changed) {
      writeFileSync(filePath, content);
      const relativePath = relative(projectRoot, filePath);
      console.log(`  ✓ Fixed ${relativePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`  ✗ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  const distPath = join(projectRoot, 'dist');
  
  // Check if dist directory exists
  try {
    const stat = statSync(distPath);
    if (!stat.isDirectory()) {
      console.error('❌ dist directory does not exist, please run npm run build first');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ dist directory does not exist, please run npm run build first');
    process.exit(1);
  }
  
  // Get all .js files
  const jsFiles = getAllJSFiles(distPath);
  console.log(`Found ${jsFiles.length} .js files\n`);
  
  // Fix all files
  let fixedCount = 0;
  for (const filePath of jsFiles) {
    if (fixImportsInFile(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Fix completed. Fixed ${fixedCount} files.`);
  
  // Test imports after fixing
  console.log('\n🧪 Testing fixed imports...');
  try {
    const testFile = join(distPath, 'index.js');
    if (statSync(testFile, { throwIfNoEntry: false })?.isFile()) {
      // Dynamic import test
      const testImport = `import { MCPilotSDK } from './dist/index.js'`;
      console.log('  Test import statement:', testImport);
      
      // Try to import
      const module = await import(testFile);
      console.log('  ✅ Import successful!');
      console.log(`  Exported keys: ${Object.keys(module).filter(k => !k.startsWith('__')).join(', ')}`);
    }
  } catch (error) {
    console.error('  ❌ Import test failed:', error.message);
    console.error('  Please check the fixed files.');
    process.exit(1);
  }
  
  console.log('\n🎉 All fixes completed!');
}

// Run main function
main().catch(error => {
  console.error('Script execution failed:', error);
  process.exit(1);
});