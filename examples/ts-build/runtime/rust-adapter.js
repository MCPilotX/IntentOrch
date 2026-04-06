import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
export class RustAdapter {
    process = null;
    getSpawnArgs(config) {
        const rustBinary = this.findRustBinary(config);
        return {
            command: rustBinary,
            args: [...(config.args || [])],
        };
    }
    async setup(config) {
        console.log(`[Rust] Setting up service: ${config.name}`);
        // Check if Rust is installed
        try {
            const { execSync } = require('child_process');
            execSync('cargo --version', { stdio: 'ignore' });
            console.log('[Rust] Cargo is installed');
        }
        catch (error) {
            throw new Error('Rust/Cargo is not installed or not in PATH. Please install Rust from https://rustup.rs/');
        }
        const servicePath = config.path || '.';
        // Check Cargo.toml file
        const cargoTomlPath = path.join(servicePath, 'Cargo.toml');
        if (!fs.existsSync(cargoTomlPath)) {
            console.log('[Rust] Cargo.toml not found, checking if this is a binary crate');
            // Check if this is a single Rust file
            if (config.entry && config.entry.endsWith('.rs')) {
                console.log(`[Rust] Single Rust file detected: ${config.entry}`);
                // For a single Rust file, we can compile directly using rustc
            }
            else {
                console.log(`[Rust] Creating basic Cargo.toml for ${config.name}`);
                try {
                    const { execSync } = require('child_process');
                    execSync(`cargo init --name ${config.name} --bin`, {
                        stdio: 'inherit',
                        cwd: servicePath,
                    });
                }
                catch (error) {
                    console.warn(`[Rust] Failed to create Cargo.toml: ${error.message}`);
                }
            }
        }
        // Build project
        console.log('[Rust] Building project...');
        try {
            const { execSync } = require('child_process');
            const rustConfig = config.runtimeConfig?.rust;
            if (rustConfig?.release) {
                execSync('cargo build --release', {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
                console.log('[Rust] Release build completed');
            }
            else {
                execSync('cargo build', {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
                console.log('[Rust] Debug build completed');
            }
        }
        catch (error) {
            console.warn(`[Rust] Build failed: ${error.message}`);
            // Continue, might just be a warning
        }
        // Run tests (optional)
        const rustConfig = config.runtimeConfig?.rust;
        if (rustConfig?.test) {
            console.log('[Rust] Running tests...');
            try {
                const { execSync } = require('child_process');
                execSync('cargo test', {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
                console.log('[Rust] Tests passed');
            }
            catch (error) {
                console.warn(`[Rust] Tests failed: ${error.message}`);
            }
        }
        console.log(`[Rust] Setup completed for service: ${config.name}`);
    }
    findRustBinary(config) {
        const servicePath = config.path || '.';
        const rustConfig = config.runtimeConfig?.rust;
        // First check if there is a pre-built executable file
        if (rustConfig?.binary) {
            const binaryPath = path.join(servicePath, rustConfig.binary);
            if (fs.existsSync(binaryPath)) {
                return binaryPath;
            }
        }
        // Check for executable files in the target directory
        const buildType = rustConfig?.release ? 'release' : 'debug';
        const possiblePaths = [
            path.join(servicePath, 'target', buildType, config.name),
            path.join(servicePath, 'target', buildType, 'main'),
            path.join(servicePath, config.name),
            `./${config.name}`,
        ];
        for (const binaryPath of possiblePaths) {
            if (fs.existsSync(binaryPath) && this.isExecutable(binaryPath)) {
                return binaryPath;
            }
        }
        // If it's a single Rust file, compile and run using rustc
        if (config.entry && config.entry.endsWith('.rs')) {
            const outputName = rustConfig?.output || config.name;
            const outputPath = path.join(servicePath, outputName);
            console.log(`[Rust] Compiling single file: ${config.entry}`);
            try {
                const { execSync } = require('child_process');
                execSync(`rustc ${config.entry} -o ${outputPath}`, {
                    stdio: 'inherit',
                    cwd: servicePath,
                });
                if (fs.existsSync(outputPath)) {
                    return outputPath;
                }
            }
            catch (error) {
                console.warn(`[Rust] Failed to compile single file: ${error.message}`);
            }
        }
        // Finally try using cargo run
        return 'cargo';
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
        console.log(`[Rust] Starting service: ${config.name}`);
        console.log(`[Rust] Command: ${command} ${args.join(' ')}`);
        const finalArgs = command === 'cargo' ? ['run', '--', ...args] : args;
        const finalCommand = command === 'cargo' ? 'cargo' : command;
        const childProcess = spawn(finalCommand, finalArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
            env: {
                ...process.env,
                ...config.env,
                RUST_BACKTRACE: config.runtimeConfig?.rust?.debug ? 'full' : '0',
            },
            cwd: config.path || '.',
        });
        childProcess.stdout?.on('data', (data) => {
            console.log(`[Rust:${config.name}] ${data.toString().trim()}`);
        });
        childProcess.stderr?.on('data', (data) => {
            console.error(`[Rust:${config.name}] ERR: ${data.toString().trim()}`);
        });
        childProcess.on('error', (error) => {
            console.error(`[Rust:${config.name}] Failed to start: ${error.message}`);
        });
        childProcess.on('exit', (code, signal) => {
            console.log(`[Rust:${config.name}] Process exited with code ${code}, signal ${signal}`);
            this.process = null;
        });
        this.process = childProcess;
        return childProcess;
    }
    async stopService() {
        if (this.process) {
            console.log('[Rust] Stopping service');
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
        console.log(`[Rust] Compiling service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            const rustConfig = config.runtimeConfig?.rust;
            const buildArgs = rustConfig?.release ? ['build', '--release'] : ['build'];
            execSync(`cargo ${buildArgs.join(' ')}`, {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log('[Rust] Successfully compiled');
            return true;
        }
        catch (error) {
            console.error(`[Rust] Compilation failed: ${error.message}`);
            return false;
        }
    }
    async test(config) {
        console.log(`[Rust] Running tests for service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            execSync('cargo test', {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log('[Rust] Tests passed');
            return true;
        }
        catch (error) {
            console.error(`[Rust] Tests failed: ${error.message}`);
            return false;
        }
    }
    async check(config) {
        console.log(`[Rust] Running cargo check for service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            execSync('cargo check', {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log('[Rust] Check passed');
            return true;
        }
        catch (error) {
            console.error(`[Rust] Check failed: ${error.message}`);
            return false;
        }
    }
    async clippy(config) {
        console.log(`[Rust] Running cargo clippy for service: ${config.name}`);
        try {
            const { execSync } = require('child_process');
            execSync('cargo clippy', {
                stdio: 'inherit',
                cwd: config.path || '.',
            });
            console.log('[Rust] Clippy passed');
            return true;
        }
        catch (error) {
            console.error(`[Rust] Clippy failed: ${error.message}`);
            return false;
        }
    }
}
//# sourceMappingURL=rust-adapter.js.map