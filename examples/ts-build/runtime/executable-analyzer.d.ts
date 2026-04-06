import { RuntimeType } from '../core/types';
export interface ExecutableAnalysis {
    type: RuntimeType;
    confidence: number;
    details: {
        method: 'fileCommand' | 'magicNumber' | 'shebang' | 'permissions' | 'extension';
        result: string;
        rawOutput?: string;
    };
}
export declare class ExecutableAnalyzer {
    /**
     * Analyze executable file type
     */
    static analyze(filePath: string): ExecutableAnalysis | null;
    /**
     * Use file command to detect file type (highest priority)
     */
    private static analyzeWithFileCommand;
    /**
     * Detect file type via magic numbers
     */
    private static analyzeWithMagicNumbers;
    /**
     * Analyze Shebang line
     */
    private static analyzeShebang;
    /**
     * Detect by file permissions
     */
    private static analyzeByPermissions;
    /**
     * Detect by file extension (last resort)
     */
    private static analyzeByExtension;
    /**
     * Check if file is executable
     */
    private static isExecutable;
    /**
     * Find executable files in directory
     */
    static findExecutables(dirPath: string): string[];
    /**
     * Get the most likely executable file in directory
     */
    static getPrimaryExecutable(dirPath: string): string | null;
    /**
     * Batch analyze executable files in directory
     */
    static analyzeDirectory(dirPath: string): Array<{
        file: string;
        analysis: ExecutableAnalysis;
    }>;
}
//# sourceMappingURL=executable-analyzer.d.ts.map