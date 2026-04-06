import * as fs from 'fs';
import * as path from 'path';
import { RuntimeDetector } from './detector';
import { ExecutableAnalyzer } from './executable-analyzer';
import { logger } from '../core/logger';
export class EnhancedRuntimeDetector {
    /**
     * Run both old and new detectors in parallel, select the best result
     */
    static async detect(servicePath) {
        if (!fs.existsSync(servicePath)) {
            throw new Error(`Service path does not exist: ${servicePath}`);
        }
        logger.info(`Detecting runtime for: ${servicePath}`);
        // Run detectors in parallel
        const [legacyResult, enhancedResult] = await Promise.all([
            this.runLegacyDetector(servicePath),
            this.runEnhancedDetection(servicePath),
        ]);
        // Record detection results
        logger.debug('Detection results:', {
            legacy: { runtime: legacyResult.runtime, confidence: legacyResult.confidence },
            enhanced: { runtime: enhancedResult.runtime, confidence: enhancedResult.confidence },
        });
        // Select best result (based on confidence)
        let finalResult;
        if (enhancedResult.confidence >= 0.7) {
            // Enhanced detector has high confidence, use its result
            finalResult = enhancedResult;
        }
        else if (legacyResult.confidence >= 0.5) {
            // Traditional detector has some confidence, but add warning
            finalResult = {
                ...legacyResult,
                source: 'legacy',
                warning: 'Using traditional detector, suggest manual verification or use --runtime parameter to explicitly specify',
            };
        }
        else {
            // Both have low confidence, require user to explicitly specify
            finalResult = {
                runtime: 'binary', // Safe default value
                confidence: Math.max(legacyResult.confidence, enhancedResult.confidence),
                evidence: {
                    fileExtensions: {
                        extensions: [],
                        confidence: 0,
                    },
                },
                source: 'enhanced',
                warning: this.generateLowConfidenceWarning(legacyResult, enhancedResult),
                suggestions: this.generateRuntimeSuggestions(servicePath),
            };
        }
        logger.info(`Final detection result: ${finalResult.runtime} (confidence: ${finalResult.confidence.toFixed(2)}, source: ${finalResult.source})`);
        if (finalResult.warning) {
            logger.warn(finalResult.warning);
        }
        return finalResult;
    }
    /**
     * Run traditional detector
     */
    static runLegacyDetector(servicePath) {
        try {
            const runtime = RuntimeDetector.detect(servicePath);
            // Traditional detector confidence is based on detection method reliability
            let confidence = 0.5; // Base confidence
            const evidence = {
                fileExtensions: {
                    extensions: [],
                    confidence: 0.3,
                },
            };
            // Adjust confidence based on detected runtime type
            switch (runtime) {
                case 'docker':
                    confidence = 0.8; // Dockerfile is usually clear
                    evidence.projectFiles = {
                        files: ['Dockerfile'],
                        confidence: 0.8,
                    };
                    break;
                case 'node':
                    confidence = 0.7; // package.json is usually clear
                    evidence.projectFiles = {
                        files: ['package.json'],
                        confidence: 0.7,
                    };
                    break;
                case 'go':
                    confidence = 0.7; // go.mod is usually clear
                    evidence.projectFiles = {
                        files: ['go.mod'],
                        confidence: 0.7,
                    };
                    break;
                case 'rust':
                    confidence = 0.7; // Cargo.toml is usually clear
                    evidence.projectFiles = {
                        files: ['Cargo.toml'],
                        confidence: 0.7,
                    };
                    break;
                case 'python':
                    confidence = 0.6; // May have multiple configuration files
                    evidence.projectFiles = {
                        files: this.findPythonConfigFiles(servicePath),
                        confidence: 0.6,
                    };
                    break;
                case 'java':
                    confidence = 0.6; // May have multiple build systems
                    evidence.projectFiles = {
                        files: this.findJavaConfigFiles(servicePath),
                        confidence: 0.6,
                    };
                    break;
                default:
                    // binary or other, lower confidence
                    confidence = 0.4;
            }
            return {
                runtime,
                confidence,
                evidence,
                source: 'legacy',
            };
        }
        catch (error) {
            logger.error(`Legacy detector failed: ${error.message}`);
            return {
                runtime: 'binary',
                confidence: 0.1,
                evidence: {},
                source: 'legacy',
                warning: `Traditional detector failed: ${error.message}`,
            };
        }
    }
    /**
     * Run enhanced detection
     */
    static runEnhancedDetection(servicePath) {
        try {
            const evidence = {};
            let totalWeight = 0;
            let weightedSum = 0;
            // 1. Executable file analysis (weight: 0.4)
            const executableAnalysis = this.analyzeExecutables(servicePath);
            if (executableAnalysis) {
                evidence.executableAnalysis = executableAnalysis;
                weightedSum += 0.4 * executableAnalysis.confidence;
                totalWeight += 0.4;
            }
            // 2. Project configuration file analysis (weight: 0.3)
            const projectFilesAnalysis = this.analyzeProjectFiles(servicePath);
            if (projectFilesAnalysis) {
                evidence.projectFiles = projectFilesAnalysis;
                weightedSum += 0.3 * projectFilesAnalysis.confidence;
                totalWeight += 0.3;
            }
            // 3. File statistics (weight: 0.2)
            const fileStatsAnalysis = this.analyzeFileStatistics(servicePath);
            if (fileStatsAnalysis) {
                evidence.fileStatistics = fileStatsAnalysis;
                weightedSum += 0.2 * fileStatsAnalysis.confidence;
                totalWeight += 0.2;
            }
            // 4. File extensions (weight: 0.1)
            const extensionAnalysis = this.analyzeFileExtensions(servicePath);
            if (extensionAnalysis) {
                evidence.fileExtensions = extensionAnalysis;
                weightedSum += 0.1 * extensionAnalysis.confidence;
                totalWeight += 0.1;
            }
            // Calculate final confidence and runtime type
            const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
            const runtime = this.determineRuntimeFromEvidence(evidence, confidence);
            // If confidence is too low, add warning
            let warning;
            if (confidence < 0.4) {
                warning = 'Detection confidence too low, suggest using --runtime parameter to explicitly specify';
            }
            return {
                runtime,
                confidence,
                evidence,
                source: 'enhanced',
                warning,
                suggestions: this.generateRuntimeSuggestions(servicePath),
            };
        }
        catch (error) {
            logger.error(`Enhanced detector failed: ${error.message}`);
            return {
                runtime: 'binary',
                confidence: 0.1,
                evidence: {},
                source: 'enhanced',
                warning: `Enhanced detector failed: ${error.message}`,
            };
        }
    }
    /**
     * Analyze executable files
     */
    static analyzeExecutables(servicePath) {
        const executables = ExecutableAnalyzer.findExecutables(servicePath);
        if (executables.length === 0) {
            return null;
        }
        // Analyze main executable file
        const primaryExecutable = ExecutableAnalyzer.getPrimaryExecutable(servicePath);
        if (!primaryExecutable) {
            return null;
        }
        const analysis = ExecutableAnalyzer.analyze(primaryExecutable);
        if (!analysis) {
            return null;
        }
        return {
            type: analysis.type,
            confidence: analysis.confidence,
            details: analysis.details,
        };
    }
    /**
     * Analyze project configuration files
     */
    static analyzeProjectFiles(servicePath) {
        const configFiles = [];
        // Check various configuration files
        const configPatterns = [
            'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
            'package.json', 'package-lock.json', 'yarn.lock', 'bun.lock',
            'go.mod', 'go.sum',
            'Cargo.toml', 'Cargo.lock',
            'requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile',
            'pom.xml', 'build.gradle', 'build.gradle.kts',
            'Makefile', 'CMakeLists.txt',
            'mcp-service.json', // Custom configuration file
        ];
        for (const pattern of configPatterns) {
            const filePath = path.join(servicePath, pattern);
            if (fs.existsSync(filePath)) {
                configFiles.push(pattern);
            }
        }
        if (configFiles.length === 0) {
            return null;
        }
        // Calculate confidence based on quantity and quality of configuration files
        let confidence = 0.5;
        if (configFiles.includes('Dockerfile')) {
            confidence = 0.9; // Dockerfile is very clear
        }
        else if (configFiles.includes('package.json')) {
            confidence = 0.8; // Node.js project clear
        }
        else if (configFiles.includes('go.mod')) {
            confidence = 0.8; // Go project clear
        }
        else if (configFiles.includes('Cargo.toml')) {
            confidence = 0.8; // Rust project clear
        }
        else if (configFiles.length >= 2) {
            confidence = 0.7; // Multiple configuration files increase confidence
        }
        return {
            files: configFiles,
            confidence,
        };
    }
    /**
     * Analyze file statistics
     */
    static analyzeFileStatistics(servicePath) {
        try {
            const files = fs.readdirSync(servicePath);
            const extensions = {};
            for (const file of files) {
                const filePath = path.join(servicePath, file);
                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                    const ext = path.extname(file).toLowerCase();
                    if (ext) {
                        extensions[ext] = (extensions[ext] || 0) + 1;
                    }
                }
            }
            if (Object.keys(extensions).length === 0) {
                return null;
            }
            // Calculate confidence based on main file type
            const totalFiles = Object.values(extensions).reduce((a, b) => a + b, 0);
            const mainExtensions = Object.entries(extensions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
            let confidence = 0.4;
            const mainExtension = mainExtensions[0];
            if (mainExtension && mainExtension[1] / totalFiles > 0.5) {
                // If one extension dominates, increase confidence
                confidence = 0.6;
            }
            return {
                extensions,
                confidence,
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Analyze file extensions
     */
    static analyzeFileExtensions(servicePath) {
        try {
            const files = fs.readdirSync(servicePath);
            const extensions = [];
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (ext && !extensions.includes(ext)) {
                    extensions.push(ext);
                }
            }
            if (extensions.length === 0) {
                return null;
            }
            // File extensions have lower confidence
            return {
                extensions,
                confidence: 0.3,
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Determine runtime type from evidence
     */
    static determineRuntimeFromEvidence(evidence, confidence) {
        // Prefer executable file analysis results
        if (evidence.executableAnalysis && evidence.executableAnalysis.confidence > 0.7) {
            // Convert string to RuntimeType
            const type = evidence.executableAnalysis.type;
            const runtimeTypes = ['node', 'python', 'docker', 'java', 'go', 'rust', 'binary'];
            if (runtimeTypes.includes(type)) {
                return type;
            }
        }
        // Then use project configuration files
        if (evidence.projectFiles) {
            const files = evidence.projectFiles.files;
            if (files.includes('Dockerfile')) {
                return 'docker';
            }
            if (files.includes('package.json')) {
                return 'node';
            }
            if (files.includes('go.mod')) {
                return 'go';
            }
            if (files.includes('Cargo.toml')) {
                return 'rust';
            }
            if (files.some(f => f.includes('python') || f.endsWith('.py'))) {
                return 'python';
            }
            if (files.includes('pom.xml') || files.includes('build.gradle')) {
                return 'java';
            }
        }
        // Finally use file statistics
        if (evidence.fileStatistics) {
            const extensions = evidence.fileStatistics.extensions;
            const extensionMap = {
                '.js': 'node',
                '.ts': 'node',
                '.py': 'python',
                '.go': 'go',
                '.rs': 'rust',
                '.java': 'java',
                '.class': 'java',
            };
            for (const [ext, runtime] of Object.entries(extensionMap)) {
                if (extensions[ext] && extensions[ext] > 0) {
                    return runtime;
                }
            }
        }
        // Default value
        return 'binary';
    }
    /**
     * Generate low confidence warning
     */
    static generateLowConfidenceWarning(legacyResult, enhancedResult) {
        return 'Cannot reliably determine runtime type.\n' +
            `Traditional detector result: ${legacyResult.runtime} (confidence: ${legacyResult.confidence.toFixed(2)})\n` +
            `Enhanced detector result: ${enhancedResult.runtime} (confidence: ${enhancedResult.confidence.toFixed(2)})\n` +
            'Please use --runtime parameter to explicitly specify runtime type.\n' +
            'Available options: node, python, docker, go, rust, java, binary';
    }
    /**
     * Generate runtime suggestions
     */
    static generateRuntimeSuggestions(servicePath) {
        const suggestions = [];
        // Check common patterns
        if (fs.existsSync(path.join(servicePath, 'index.js')) ||
            fs.existsSync(path.join(servicePath, 'app.js'))) {
            suggestions.push('Detected JavaScript file, may be Node.js service');
        }
        if (fs.existsSync(path.join(servicePath, 'main.py')) ||
            fs.existsSync(path.join(servicePath, 'app.py'))) {
            suggestions.push('Detected Python file, may be Python service');
        }
        const executables = ExecutableAnalyzer.findExecutables(servicePath);
        if (executables.length > 0) {
            suggestions.push(`Found ${executables.length} executable files, may be binary service`);
        }
        return suggestions;
    }
    /**
     * Find Python configuration files
     */
    static findPythonConfigFiles(servicePath) {
        const files = [];
        const pythonConfigs = ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'];
        for (const config of pythonConfigs) {
            if (fs.existsSync(path.join(servicePath, config))) {
                files.push(config);
            }
        }
        return files;
    }
    /**
     * Find Java configuration files
     */
    static findJavaConfigFiles(servicePath) {
        const files = [];
        const javaConfigs = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
        for (const config of javaConfigs) {
            if (fs.existsSync(path.join(servicePath, config))) {
                files.push(config);
            }
        }
        return files;
    }
    /**
     * Quick detection (for CLI interaction)
     */
    static quickDetect(servicePath) {
        try {
            // First check explicit configuration files
            if (fs.existsSync(path.join(servicePath, 'Dockerfile'))) {
                return { runtime: 'docker', confidence: 0.9 };
            }
            if (fs.existsSync(path.join(servicePath, 'package.json'))) {
                return { runtime: 'node', confidence: 0.8 };
            }
            if (fs.existsSync(path.join(servicePath, 'go.mod'))) {
                return { runtime: 'go', confidence: 0.8 };
            }
            if (fs.existsSync(path.join(servicePath, 'Cargo.toml'))) {
                return { runtime: 'rust', confidence: 0.8 };
            }
            // Check executable files
            const primaryExecutable = ExecutableAnalyzer.getPrimaryExecutable(servicePath);
            if (primaryExecutable) {
                const analysis = ExecutableAnalyzer.analyze(primaryExecutable);
                if (analysis && analysis.confidence > 0.6) {
                    return { runtime: analysis.type, confidence: analysis.confidence };
                }
            }
            // Default
            return { runtime: 'binary', confidence: 0.3 };
        }
        catch (error) {
            return { runtime: 'binary', confidence: 0.1 };
        }
    }
}
//# sourceMappingURL=detector-advanced.js.map