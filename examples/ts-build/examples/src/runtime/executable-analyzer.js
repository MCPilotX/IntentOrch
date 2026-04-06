import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { logger } from '../core/logger';
export class ExecutableAnalyzer {
    /**
     * Analyze executable file type
     */
    static analyze(filePath) {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return null;
        }
        // Check if file is executable
        if (!this.isExecutable(filePath)) {
            return null;
        }
        // Try different detection methods (by priority)
        const analyses = [
            this.analyzeWithFileCommand(filePath),
            this.analyzeWithMagicNumbers(filePath),
            this.analyzeShebang(filePath),
            this.analyzeByPermissions(filePath),
            this.analyzeByExtension(filePath),
        ].filter(analysis => analysis !== null);
        if (analyses.length === 0) {
            return null;
        }
        // Select analysis result with highest confidence
        const bestAnalysis = analyses.reduce((best, current) => current.confidence > best.confidence ? current : best);
        logger.debug(`Executable analysis for ${filePath}:`, {
            type: bestAnalysis.type,
            confidence: bestAnalysis.confidence,
            method: bestAnalysis.details.method,
        });
        return bestAnalysis;
    }
    /**
     * Use file command to detect file type (highest priority)
     */
    static analyzeWithFileCommand(filePath) {
        try {
            const output = execSync(`file -b "${filePath}"`, { encoding: 'utf-8' }).trim();
            let type = 'binary';
            let confidence = 0.8;
            let details = '';
            if (output.includes('ELF')) {
                type = 'binary';
                confidence = 0.9;
                details = 'ELF executable';
            }
            else if (output.includes('Mach-O')) {
                type = 'binary';
                confidence = 0.9;
                details = 'Mach-O executable';
            }
            else if (output.includes('PE32+') || output.includes('PE32')) {
                type = 'binary';
                confidence = 0.9;
                details = 'Windows PE executable';
            }
            else if (output.includes('Node.js')) {
                type = 'node';
                confidence = 0.95;
                details = 'Node.js script';
            }
            else if (output.includes('Python')) {
                type = 'python';
                confidence = 0.95;
                details = 'Python script';
            }
            else if (output.includes('Bourne-Again shell script')) {
                type = 'binary';
                confidence = 0.85;
                details = 'Bash script';
            }
            else if (output.includes('POSIX shell script')) {
                type = 'binary';
                confidence = 0.85;
                details = 'Shell script';
            }
            else {
                // Unrecognized type
                return null;
            }
            return {
                type,
                confidence,
                details: {
                    method: 'fileCommand',
                    result: details,
                    rawOutput: output,
                },
            };
        }
        catch (error) {
            // file command unavailable or failed
            return null;
        }
    }
    /**
     * Detect file type via magic numbers
     */
    static analyzeWithMagicNumbers(filePath) {
        try {
            const buffer = fs.readFileSync(filePath, { flag: 'r' });
            // Only read first few bytes for magic number detection
            const header = buffer.slice(0, 16);
            const hex = header.toString('hex');
            // ELF file: 7f 45 4c 46
            if (hex.startsWith('7f454c46')) {
                return {
                    type: 'binary',
                    confidence: 0.85,
                    details: {
                        method: 'magicNumber',
                        result: 'ELF executable',
                        rawOutput: hex.substring(0, 8),
                    },
                };
            }
            // Mach-O (64-bit): cf fa ed fe
            // Mach-O (32-bit): ce fa ed fe
            if (hex.startsWith('cffaedfe') || hex.startsWith('cefaedfe')) {
                return {
                    type: 'binary',
                    confidence: 0.85,
                    details: {
                        method: 'magicNumber',
                        result: 'Mach-O executable',
                        rawOutput: hex.substring(0, 8),
                    },
                };
            }
            // PE file: 4d 5a (MZ)
            if (hex.startsWith('4d5a')) {
                return {
                    type: 'binary',
                    confidence: 0.85,
                    details: {
                        method: 'magicNumber',
                        result: 'Windows PE executable',
                        rawOutput: hex.substring(0, 4),
                    },
                };
            }
            // Java class file: ca fe ba be
            if (hex.startsWith('cafebabe')) {
                return {
                    type: 'java',
                    confidence: 0.9,
                    details: {
                        method: 'magicNumber',
                        result: 'Java class file',
                        rawOutput: hex.substring(0, 8),
                    },
                };
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Analyze Shebang line
     */
    static analyzeShebang(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const firstLine = content.split('\n')[0].trim();
            if (!firstLine.startsWith('#!')) {
                return null;
            }
            const shebang = firstLine.substring(2).toLowerCase();
            let type = 'binary';
            let confidence = 0.8;
            if (shebang.includes('node') || shebang.includes('bun')) {
                type = 'node';
                confidence = 0.9;
            }
            else if (shebang.includes('python')) {
                type = 'python';
                confidence = 0.9;
            }
            else if (shebang.includes('bash') || shebang.includes('sh')) {
                type = 'binary';
                confidence = 0.85;
            }
            else if (shebang.includes('perl')) {
                type = 'binary';
                confidence = 0.8;
            }
            else if (shebang.includes('ruby')) {
                type = 'binary';
                confidence = 0.8;
            }
            else {
                // Unknown interpreter
                type = 'binary';
                confidence = 0.7;
            }
            return {
                type,
                confidence,
                details: {
                    method: 'shebang',
                    result: shebang,
                    rawOutput: firstLine,
                },
            };
        }
        catch (error) {
            // File may not be a text file
            return null;
        }
    }
    /**
     * Detect by file permissions
     */
    static analyzeByPermissions(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const mode = stats.mode;
            const isExecutable = (mode & 0o111) !== 0;
            if (isExecutable) {
                return {
                    type: 'binary',
                    confidence: 0.6,
                    details: {
                        method: 'permissions',
                        result: 'Executable file',
                        rawOutput: `mode: 0o${mode.toString(8)}`,
                    },
                };
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Detect by file extension (last resort)
     */
    static analyzeByExtension(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const extensionMap = {
            '.exe': { type: 'binary', confidence: 0.7 },
            '.bin': { type: 'binary', confidence: 0.7 },
            '.app': { type: 'binary', confidence: 0.7 },
            '.out': { type: 'binary', confidence: 0.6 },
            '.js': { type: 'node', confidence: 0.5 },
            '.ts': { type: 'node', confidence: 0.5 },
            '.py': { type: 'python', confidence: 0.5 },
            '.go': { type: 'go', confidence: 0.5 },
            '.rs': { type: 'rust', confidence: 0.5 },
            '.java': { type: 'java', confidence: 0.5 },
            '.class': { type: 'java', confidence: 0.6 },
            '.jar': { type: 'java', confidence: 0.6 },
        };
        const mapping = extensionMap[ext];
        if (mapping) {
            return {
                type: mapping.type,
                confidence: mapping.confidence,
                details: {
                    method: 'extension',
                    result: `File extension: ${ext}`,
                    rawOutput: ext,
                },
            };
        }
        return null;
    }
    /**
     * Check if file is executable
     */
    static isExecutable(filePath) {
        try {
            const stats = fs.statSync(filePath);
            // Check Unix execution permissions
            if (process.platform !== 'win32') {
                const mode = stats.mode;
                const isExecutable = (mode & 0o111) !== 0;
                if (isExecutable) {
                    return true;
                }
            }
            // Check file extensions (Windows)
            if (process.platform === 'win32') {
                const ext = path.extname(filePath).toLowerCase();
                const executableExtensions = ['.exe', '.bat', '.cmd', '.ps1', '.com'];
                if (executableExtensions.includes(ext)) {
                    return true;
                }
            }
            // Check shebang (script files)
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.startsWith('#!')) {
                    return true;
                }
            }
            catch {
                // File may not be a text file
            }
            return false;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Find executable files in directory
     */
    static findExecutables(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return [];
        }
        try {
            const files = fs.readdirSync(dirPath);
            const executables = [];
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (!stats.isFile()) {
                        continue;
                    }
                    if (this.isExecutable(filePath)) {
                        executables.push(filePath);
                    }
                }
                catch (error) {
                    // Ignore inaccessible files
                    continue;
                }
            }
            return executables;
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Get the most likely executable file in directory
     */
    static getPrimaryExecutable(dirPath) {
        const executables = this.findExecutables(dirPath);
        if (executables.length === 0) {
            return null;
        }
        // Prefer files without extensions (Unix convention)
        const noExtension = executables.filter(p => path.extname(p) === '');
        if (noExtension.length > 0) {
            return noExtension[0];
        }
        // Then choose common executable extensions
        const commonExtensions = ['.exe', '.bin', '.app', '.out'];
        for (const ext of commonExtensions) {
            const withExt = executables.filter(p => path.extname(p).toLowerCase() === ext);
            if (withExt.length > 0) {
                return withExt[0];
            }
        }
        // Return first executable file
        return executables[0];
    }
    /**
     * Batch analyze executable files in directory
     */
    static analyzeDirectory(dirPath) {
        const executables = this.findExecutables(dirPath);
        const results = [];
        for (const executable of executables) {
            const analysis = this.analyze(executable);
            if (analysis) {
                results.push({
                    file: path.relative(dirPath, executable),
                    analysis,
                });
            }
        }
        return results;
    }
}
