import * as fs from 'fs';
import * as path from 'path';

export type RuntimeType = 'node' | 'python' | 'docker' | 'java' | 'go' | 'rust' | 'binary';

export class RuntimeDetector {
  static detect(servicePath: string): RuntimeType {
    // 1. Detect Docker
    if (fs.existsSync(path.join(servicePath, 'Dockerfile'))) {
      return 'docker';
    }

    // 2. Detect Node.js
    if (fs.existsSync(path.join(servicePath, 'package.json'))) {
      return 'node';
    }

    // 3. Detect Python
    if (
      fs.existsSync(path.join(servicePath, 'requirements.txt')) ||
      fs.existsSync(path.join(servicePath, 'setup.py')) ||
      fs.existsSync(path.join(servicePath, 'pyproject.toml'))
    ) {
      return 'python';
    }

    // 4. Detect Go
    if (fs.existsSync(path.join(servicePath, 'go.mod'))) {
      return 'go';
    }

    // 5. Detect Rust
    if (fs.existsSync(path.join(servicePath, 'Cargo.toml'))) {
      return 'rust';
    }

    // 6. Detect Java (Maven/Gradle)
    if (
      fs.existsSync(path.join(servicePath, 'pom.xml')) ||
      fs.existsSync(path.join(servicePath, 'build.gradle'))
    ) {
      return 'java';
    }

    // 7. Check file extensions
    const files = fs.readdirSync(servicePath);
    for (const file of files) {
      const filePath = path.join(servicePath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        if (file.endsWith('.go')) {
          return 'go';
        }
        if (file.endsWith('.rs')) {
          return 'rust';
        }
        if (file.endsWith('.py')) {
          return 'python';
        }
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          return 'node';
        }
      }
    }

    // 8. Default to binary or script
    return 'binary';
  }
}