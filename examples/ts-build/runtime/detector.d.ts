export type RuntimeType = 'node' | 'python' | 'docker' | 'java' | 'go' | 'rust' | 'binary';
export declare class RuntimeDetector {
    static detect(servicePath: string): RuntimeType;
}
//# sourceMappingURL=detector.d.ts.map