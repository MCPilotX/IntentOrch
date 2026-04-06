import { Config } from './types';
export declare class ConfigValidator {
    static validate(config: any): Config;
    private static checkRequiredConfig;
    static getDefaultConfig(): Config;
    static mergeWithDefaults(userConfig: any): Config;
    static validateAIConfig(aiConfig: any): any;
}
//# sourceMappingURL=config-validator.d.ts.map