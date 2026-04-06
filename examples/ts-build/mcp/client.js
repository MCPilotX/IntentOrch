/**
 * MCP Client Core Class
 * Provides complete MCP protocol client functionality
 */
import { EventEmitter } from 'events';
import { MCP_METHODS, } from './types';
import { TransportFactory } from './transport';
export class MCPClient extends EventEmitter {
    config;
    transport;
    connected = false;
    requestId = 0;
    pendingRequests = new Map();
    // State
    tools = [];
    resources = [];
    prompts = [];
    sessionId;
    constructor(config) {
        super();
        this.config = {
            autoConnect: false, // Default disable auto-connect requests to avoid server not being ready
            timeout: 30000,
            maxRetries: 3,
            ...config,
        };
        this.transport = TransportFactory.create(config.transport);
        this.setupTransportListeners();
    }
    // ==================== Connection Management ====================
    async connect() {
        if (this.connected) {
            return;
        }
        try {
            await this.transport.connect();
            this.connected = true;
            this.emitEvent('connected');
            // Automatically fetch tool list after connection
            if (this.config.autoConnect) {
                await this.refreshTools();
                await this.refreshResources();
                await this.refreshPrompts();
            }
        }
        catch (error) {
            this.emitEvent('error', error);
            throw error;
        }
    }
    async disconnect() {
        if (!this.connected) {
            return;
        }
        try {
            await this.transport.disconnect();
            this.connected = false;
            // Clean up all pending requests
            this.pendingRequests.forEach(({ reject, timeout }) => {
                clearTimeout(timeout);
                reject(new Error('Disconnected'));
            });
            this.pendingRequests.clear();
            this.emitEvent('disconnected');
        }
        catch (error) {
            this.emitEvent('error', error);
            throw error;
        }
    }
    isConnected() {
        return this.connected && this.transport.isConnected();
    }
    // ==================== Tool Related Methods ====================
    async listTools() {
        const response = await this.sendRequest(MCP_METHODS.TOOLS_LIST);
        const toolList = response;
        this.tools = toolList.tools;
        this.emitEvent('tools_updated', this.tools);
        return this.tools;
    }
    async callTool(toolName, arguments_) {
        const toolCall = {
            name: toolName,
            arguments: arguments_,
        };
        const response = await this.sendRequest(MCP_METHODS.TOOLS_CALL, { call: toolCall });
        // Ensure response is a valid ToolResult
        const toolResult = response;
        // Check if the tool execution failed (isError flag)
        if (toolResult.isError) {
            // Create a proper error from the tool result content
            const errorMessage = toolResult.content?.[0]?.text || 'Tool execution failed';
            throw new Error(`Tool "${toolName}" execution failed: ${errorMessage}`);
        }
        return toolResult;
    }
    async refreshTools() {
        await this.listTools();
    }
    getTools() {
        return [...this.tools];
    }
    findTool(name) {
        return this.tools.find(tool => tool.name === name);
    }
    // ==================== Resource Related Methods ====================
    async listResources() {
        const response = await this.sendRequest(MCP_METHODS.RESOURCES_LIST);
        const resourceList = response;
        this.resources = resourceList.resources;
        this.emitEvent('resources_updated', this.resources);
        return this.resources;
    }
    async readResource(uri) {
        const response = await this.sendRequest(MCP_METHODS.RESOURCES_READ, { uri });
        return response;
    }
    async refreshResources() {
        await this.listResources();
    }
    getResources() {
        return [...this.resources];
    }
    // ==================== Prompt Related Methods ====================
    async listPrompts() {
        const response = await this.sendRequest(MCP_METHODS.PROMPTS_LIST);
        const promptList = response;
        this.prompts = promptList.prompts;
        this.emitEvent('prompts_updated', this.prompts);
        return this.prompts;
    }
    async getPrompt(name, arguments_) {
        const response = await this.sendRequest(MCP_METHODS.PROMPTS_GET, {
            name,
            arguments: arguments_,
        });
        return response;
    }
    async refreshPrompts() {
        await this.listPrompts();
    }
    getPrompts() {
        return [...this.prompts];
    }
    // ==================== Core Request Methods ====================
    async sendRequest(method, params) {
        if (!this.isConnected()) {
            throw new Error('Not connected to MCP server');
        }
        const requestId = this.generateRequestId();
        const request = {
            jsonrpc: '2.0',
            id: requestId,
            method,
            params,
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);
            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            this.transport.send(request).catch(error => {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
    generateRequestId() {
        return `req_${++this.requestId}_${Date.now()}`;
    }
    // ==================== Transport Layer Event Handling ====================
    setupTransportListeners() {
        this.transport.on('message', this.handleTransportMessage.bind(this));
        this.transport.on('error', this.handleTransportError.bind(this));
        this.transport.on('connected', () => {
            this.connected = true;
            this.emitEvent('connected');
        });
        this.transport.on('disconnected', () => {
            this.connected = false;
            this.emitEvent('disconnected');
        });
    }
    handleTransportMessage(message) {
        try {
            const response = message;
            // Handle request response
            if (response.id && this.pendingRequests.has(response.id)) {
                const { resolve, reject, timeout } = this.pendingRequests.get(response.id);
                clearTimeout(timeout);
                this.pendingRequests.delete(response.id);
                if (response.error) {
                    const error = new Error(response.error.message);
                    error.code = response.error.code;
                    error.data = response.error.data;
                    reject(error);
                }
                else {
                    resolve(response.result);
                }
            }
            // Handle server-pushed notifications (messages without id)
            else if (!response.id) {
                this.handleNotification(response);
            }
        }
        catch (error) {
            this.emitEvent('error', error);
        }
    }
    handleTransportError(error) {
        this.emitEvent('error', error);
    }
    handleNotification(response) {
        // Handle server-pushed notifications
        // For example: tools/changed, resources/changed, etc.
        if (response.result) {
            // Can handle different types of notifications based on method field
            console.log('Received notification:', response);
        }
    }
    // ==================== Event Emission ====================
    emitEvent(type, data) {
        const event = {
            type,
            data,
            timestamp: Date.now(),
        };
        this.emit(type, event);
        this.emit('event', event);
    }
    // ==================== Utility Methods ====================
    async withRetry(operation) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt < this.config.maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
        }
        throw lastError;
    }
    // ==================== Status Query ====================
    getStatus() {
        return {
            connected: this.connected,
            toolsCount: this.tools.length,
            resourcesCount: this.resources.length,
            promptsCount: this.prompts.length,
            sessionId: this.sessionId,
        };
    }
    // ==================== Cleanup ====================
    destroy() {
        this.disconnect().catch(() => {
            // Ignore errors when disconnecting
        });
        this.removeAllListeners();
        this.pendingRequests.clear();
        this.tools = [];
        this.resources = [];
        this.prompts = [];
    }
}
//# sourceMappingURL=client.js.map