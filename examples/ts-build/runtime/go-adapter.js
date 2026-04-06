import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
export class GoAdapter {
    process = null;
    getSpawnArgs(config) {
        const goPath = this.findGoBinary(config);
        return {
            command: goPath,
            args: ['run', config.entry, ...(config.args || [])],
        };
    }
    async setup(config) {
        console.log(`[Go] Setting up service: ${config.name}`);
        // Check if Go is installed
        try {
            const { execSync } = require('child_process');
            execSync('go version', { stdio: 'ignore' });
            console.log('[Go] Go is installed');
        }
        catch (error) {
            throw new Error('Go is not installed or not in PATH. Please install Go from https://golang.org/dl/');
        }
        const servicePath = config.path || '.';
        // Check go.mod file
        const goModPath = path.join(servicePath, 'go.mod');
        if (!fs.existsSync(goModPath)) {
            console.log(`[Go] go.mod not found, creating basic go.mod for ${config.name}`);
            try {
                const { execSync } = require('child_process');
                execSync(`go mod init ${config.name}`, {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
            }
            catch (error) {
                console.warn(`[Go] Failed to create go.mod: ${error.message}`);
            }
        }
        // Download dependencies
        console.log('[Go] Downloading dependencies...');
        try {
            const { execSync } = require('child_process');
            execSync('go mod tidy', {
                stdio: 'inherit',
                cwd: servicePath,
            });
            console.log('[Go] Dependencies downloaded successfully');
        }
        catch (error) {
            console.warn(`[Go] Failed to download dependencies: ${error.message}`);
        }
        // Build executable (optional)
        if (config.build) {
            console.log('[Go] Building executable...');
            try {
                const { execSync } = require('child_process');
                const outputName = config.output || config.name;
                execSync(`go build -o ${outputName} ${config.entry}`, {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
                console.log(`[Go] Executable built: ${outputName}`);
            }
            catch (error) {
                console.warn(`[Go] Failed to build executable: ${error.message}`);
            }
        }
        console.log(`[Go] Setup completed for service: ${config.name}`);
    }
    findGoBinary(config) {
        // First check if there is a pre-built executable file
        if (config.binary) {
            const binaryPath = path.join(config.path || '.', config.binary);
            if (fs.existsSync(binaryPath)) {
                return binaryPath;
            }
        }
        // Check if there is a build output
        const possibleOutputs = [
            config.name,
            `./${config.name}`,
            path.join(config.path || '.', config.name),
            path.join(config.path || '.', 'main'),
        ];
        for (const output of possibleOutputs) {
            if (fs.existsSync(output) && this.isExecutable(output)) {
                return output;
            }
        }
        // Default to using go run
        return 'go';
    }
    isExecutable(filePath) {
        try {
            fs.accessSync(filePath, fs.constants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    async startService(config) {
        const { command, args } = this.getSpawnArgs(config);
        console.log(`[Go] Starting service: ${config.name}`);
        console.log(`[Go] Command: ${command} ${args.join(' ')}`);
        const childProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
            env: {
                ...process.env,
                ...config.env,
            },
            cwd: config.path || '.',
        });
        childProcess.stdout?.on('data', (data) => {
            console.log(`[Go:${config.name}] ${data.toString().trim()}`);
        });
        childProcess.stderr?.on('data', (data) => {
            console.error(`[Go:${config.name}] ERR: ${data.toString().trim()}`);
        });
        childProcess.on('error', (error) => {
            console.error(`[Go:${config.name}] Failed to start: ${error.message}`);
        });
        childProcess.on('exit', (code, signal) => {
            console.log(`[Go:${config.name}] Process exited with code ${code}, signal ${signal}`);
            this.process = null;
        });
        this.process = childProcess;
        return childProcess;
    }
    async stopService() {
        if (this.process) {
            console.log('[Go] Stopping service');
            this.process.kill();
            this.process = null;
        }
    }
    async getServiceStatus() {
        if (!this.process) {
            return 'stopped';
        }
        // Check if the process is still running
        if (this.process.exitCode !== null) {
            return 'exited';
        }
        try {
            // Send signal 0 to check if the process exists
            this.process.kill(0);
            return 'running';
        }
        catch (error) {
            return 'stopped';
        }
    }
    async compile(config) {
        console.log(`[Go] Compiling service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            const outputName = config.output || config.name;
            execSync(`go build -o ${outputName} ${config.entry}`, {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log(`[Go] Successfully compiled: ${outputName}`);
            return true;
        }
        catch (error) {
            console.error(`[Go] Compilation failed: ${error.message}`);
            return false;
        }
    }
    async test(config) {
        console.log(`[Go] Running tests for service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            execSync('go test ./...', {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log('[Go] Tests passed');
            return true;
        }
        catch (error) {
            console.error(`[Go] Tests failed: ${error.message}`);
            return false;
        }
    }
}
//# sourceMappingURL=go-adapter.js.map