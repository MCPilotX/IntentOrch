import { RuntimeType, DetectionResult } from '../core/types';
export declare class EnhancedRuntimeDetector {
    /**
     * Run both old and new detectors in parallel, select the best result
     */
    static detect(servicePath: string): Promise<DetectionResult>;
    /**
     * Run traditional detector
     */
    private static runLegacyDetector;
    /**
     * Run enhanced detection
     */
    private static runEnhancedDetection;
    /**
     * Analyze executable files
     */
    private static analyzeExecutables;
    /**
     * Analyze project configuration files
     */
    private static analyzeProjectFiles;
    /**
     * Analyze file statistics
     */
    private static analyzeFileStatistics;
    /**
     * Analyze file extensions
     */
    private static analyzeFileExtensions;
    /**
     * Determine runtime type from evidence
     */
    private static determineRuntimeFromEvidence;
    /**
     * Generate low confidence warning
     */
    private static generateLowConfidenceWarning;
    /**
     * Generate runtime suggestions
     */
    private static generateRuntimeSuggestions;
    /**
     * Find Python configuration files
     */
    private static findPythonConfigFiles;
    /**
     * Find Java configuration files
     */
    private static findJavaConfigFiles;
    /**
     * Quick detection (for CLI interaction)
     */
    static quickDetect(servicePath: string): {
        runtime: RuntimeType;
        confidence: number;
    };
}
//# sourceMappingURL=detector-advanced.d.ts.map