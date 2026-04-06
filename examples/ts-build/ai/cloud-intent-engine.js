/**
 * Cloud LLM Intent Engine
 * Cloud LLM-based intent parsing and MCP capability auto-mapping engine
 *
 * Core capabilities:
 * 1. Decompose natural language instructions into atomic intents (with parameters)
 * 2. Infer dependencies between atomic intents (generate DAG)
 * 3. Select the most appropriate tool from MCP tools for each atomic intent
 * 4. Map intent parameters to tool input parameters
 * 5. Execute tool calls in dependency order
 */
import { logger } from '../core/logger';
import { SimpleAI } from './ai';
// ==================== Main Engine Class ====================
export class CloudIntentEngine {
    ai;
    config;
    availableTools = [];
    toolCache = new Map();
    constructor(config) {
        this.config = {
            llm: {
                provider: 'openai',
                temperature: 0.1,
                maxTokens: 2048,
                timeout: 30000,
                maxRetries: 3,
                ...config.llm,
            },
            execution: {
                maxConcurrentTools: 3,
                timeout: 60000,
                retryAttempts: 2,
                retryDelay: 1000,
                ...config.execution,
            },
            fallback: {
                enableKeywordMatching: true,
                askUserOnFailure: false,
                defaultTools: {},
                ...config.fallback,
            },
        };
        this.ai = new SimpleAI();
    }
    /**
     * Initialize the engine
     */
    async initialize() {
        try {
            // Configure AI service
            await this.ai.configure({
                provider: this.config.llm.provider,
                apiKey: this.config.llm.apiKey,
                endpoint: this.config.llm.endpoint,
                model: this.config.llm.model,
            });
            logger.info('[CloudIntentEngine] Engine initialized successfully');
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Failed to initialize: ${error}`);
            throw error;
        }
    }
    /**
     * Set available tools list
     */
    setAvailableTools(tools) {
        this.availableTools = tools;
        this.toolCache.clear();
        // Build tool cache
        tools.forEach(tool => {
            this.toolCache.set(tool.name, tool);
        });
        logger.info(`[CloudIntentEngine] Set ${tools.length} available tools`);
    }
    /**
     * Parse natural language instruction into atomic intents and dependencies
     */
    async parseIntent(query) {
        logger.info(`[CloudIntentEngine] Parsing intent: "${query}"`);
        try {
            // Build prompt
            const prompt = this.buildIntentParsePrompt(query);
            // Call LLM to parse intent
            const llmResponse = await this.callLLM(prompt, {
                temperature: 0.1,
                maxTokens: 1024,
            });
            // Parse LLM response
            const parsedResult = this.parseIntentResponse(llmResponse);
            logger.info(`[CloudIntentEngine] Parsed ${parsedResult.intents.length} intents with ${parsedResult.edges.length} dependencies`);
            return parsedResult;
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Intent parsing failed: ${error}`);
            // Fallback: use simple rule-based parsing
            return this.fallbackIntentParse(query);
        }
    }
    /**
     * Select the most appropriate tool for each intent
     */
    async selectTools(intents) {
        logger.info(`[CloudIntentEngine] Selecting tools for ${intents.length} intents`);
        const results = [];
        // Process intents in parallel (limited by concurrency)
        const batchSize = this.config.execution.maxConcurrentTools || 3;
        for (let i = 0; i < intents.length; i += batchSize) {
            const batch = intents.slice(i, i + batchSize);
            const batchPromises = batch.map(intent => this.selectToolForIntent(intent));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        // Count selection results
        const successfulSelections = results.filter(r => r.confidence > 0.5).length;
        logger.info(`[CloudIntentEngine] Tool selection completed: ${successfulSelections}/${intents.length} successful`);
        return results;
    }
    /**
     * Execute workflow
     */
    async executeWorkflow(intents, toolSelections, edges, toolExecutor) {
        logger.info(`[CloudIntentEngine] Executing workflow with ${intents.length} steps`);
        const context = {
            results: new Map(),
            variables: new Map(),
        };
        const stepResults = [];
        // Build dependency graph
        const dependencyGraph = this.buildDependencyGraph(intents, edges);
        // Topological sort
        const executionOrder = this.topologicalSort(dependencyGraph);
        if (!executionOrder) {
            return {
                success: false,
                stepResults: [],
                finalResult: 'Circular dependency detected in workflow',
            };
        }
        // Execute in order
        for (const intentId of executionOrder) {
            const intent = intents.find(i => i.id === intentId);
            const toolSelection = toolSelections.find(s => s.intentId === intentId);
            if (!intent || !toolSelection) {
                stepResults.push({
                    intentId,
                    toolName: 'unknown',
                    success: false,
                    error: 'Intent or tool selection not found',
                });
                continue;
            }
            try {
                // Prepare parameters (support variable substitution)
                const resolvedParams = this.resolveParameters(toolSelection.mappedParameters, context);
                // Execute tool
                const result = await toolExecutor(toolSelection.toolName, resolvedParams);
                // Save result to context
                context.results.set(intentId, result);
                stepResults.push({
                    intentId,
                    toolName: toolSelection.toolName,
                    success: true,
                    result,
                });
                logger.info(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) completed successfully`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                stepResults.push({
                    intentId,
                    toolName: toolSelection.toolName,
                    success: false,
                    error: errorMessage,
                });
                logger.error(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) failed: ${errorMessage}`);
                // Decide whether to continue based on configuration
                if (this.config.execution.retryAttempts) {
                    // Retry logic can be added here
                }
            }
        }
        // Calculate final result
        const success = stepResults.every(step => step.success);
        const finalResult = success ? context.results.get(executionOrder[executionOrder.length - 1]) : undefined;
        return {
            success,
            finalResult,
            stepResults,
        };
    }
    /**
     * Parse and plan workflow (without execution)
     */
    async parseAndPlan(query) {
        logger.info(`[CloudIntentEngine] Parsing and planning workflow: "${query}"`);
        const startTime = Date.now();
        try {
            // Parse intent
            const intentResult = await this.parseIntent(query);
            // Select tools
            const toolSelections = await this.selectTools(intentResult.intents);
            // Build dependency graph and get execution order
            const dependencyGraph = this.buildDependencyGraph(intentResult.intents, intentResult.edges);
            const executionOrder = this.topologicalSort(dependencyGraph);
            if (!executionOrder) {
                throw new Error('Circular dependency detected in workflow');
            }
            const plan = {
                query,
                parsedIntents: intentResult.intents,
                dependencies: intentResult.edges,
                toolSelections,
                executionOrder,
                estimatedSteps: intentResult.intents.length,
                createdAt: new Date(),
            };
            const duration = Date.now() - startTime;
            logger.info(`[CloudIntentEngine] Workflow plan created in ${duration}ms with ${intentResult.intents.length} steps`);
            return plan;
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Failed to parse and plan workflow: ${error}`);
            throw error;
        }
    }
    /**
     * Execute workflow with enhanced tracking
     */
    async executeWorkflowWithTracking(intents, toolSelections, edges, toolExecutor, callbacks) {
        logger.info(`[CloudIntentEngine] Executing workflow with enhanced tracking for ${intents.length} steps`);
        const startTime = Date.now();
        const context = {
            results: new Map(),
            variables: new Map(),
        };
        const executionSteps = [];
        // Build dependency graph
        const dependencyGraph = this.buildDependencyGraph(intents, edges);
        // Topological sort
        const executionOrder = this.topologicalSort(dependencyGraph);
        if (!executionOrder) {
            return {
                success: false,
                parsedIntents: intents,
                dependencies: edges,
                toolSelections,
                executionSteps: [],
                statistics: {
                    totalSteps: intents.length,
                    successfulSteps: 0,
                    failedSteps: intents.length,
                    totalDuration: Date.now() - startTime,
                    averageStepDuration: 0,
                    llmCalls: 0,
                },
                finalResult: 'Circular dependency detected in workflow',
            };
        }
        let successfulSteps = 0;
        let failedSteps = 0;
        let totalStepDuration = 0;
        // Execute in order
        for (const intentId of executionOrder) {
            const intent = intents.find(i => i.id === intentId);
            const toolSelection = toolSelections.find(s => s.intentId === intentId);
            if (!intent || !toolSelection) {
                const errorStep = {
                    intentId,
                    intentDescription: 'Unknown intent',
                    intentType: 'unknown',
                    intentParameters: {},
                    toolName: 'unknown',
                    toolDescription: 'No tool selected',
                    mappedParameters: {},
                    confidence: 0,
                    success: false,
                    error: 'Intent or tool selection not found',
                    startedAt: new Date(),
                    completedAt: new Date(),
                    duration: 0,
                };
                executionSteps.push(errorStep);
                failedSteps++;
                continue;
            }
            const stepStartTime = Date.now();
            const stepStartedAt = new Date();
            // Notify step started
            if (callbacks?.onStepStarted) {
                callbacks.onStepStarted({
                    intentId,
                    toolName: toolSelection.toolName,
                    intentDescription: intent.description,
                });
            }
            try {
                // Prepare parameters (support variable substitution)
                const resolvedParams = this.resolveParameters(toolSelection.mappedParameters, context);
                // Execute tool
                const result = await toolExecutor(toolSelection.toolName, resolvedParams);
                // Save result to context
                context.results.set(intentId, result);
                const stepDuration = Date.now() - stepStartTime;
                totalStepDuration += stepDuration;
                const successStep = {
                    intentId,
                    intentDescription: intent.description,
                    intentType: intent.type,
                    intentParameters: intent.parameters,
                    toolName: toolSelection.toolName,
                    toolDescription: toolSelection.toolDescription,
                    mappedParameters: toolSelection.mappedParameters,
                    confidence: toolSelection.confidence,
                    success: true,
                    result,
                    startedAt: stepStartedAt,
                    completedAt: new Date(),
                    duration: stepDuration,
                };
                executionSteps.push(successStep);
                successfulSteps++;
                // Notify step completed
                if (callbacks?.onStepCompleted) {
                    callbacks.onStepCompleted(successStep);
                }
                logger.info(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) completed in ${stepDuration}ms`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const stepDuration = Date.now() - stepStartTime;
                totalStepDuration += stepDuration;
                const failedStep = {
                    intentId,
                    intentDescription: intent.description,
                    intentType: intent.type,
                    intentParameters: intent.parameters,
                    toolName: toolSelection.toolName,
                    toolDescription: toolSelection.toolDescription,
                    mappedParameters: toolSelection.mappedParameters,
                    confidence: toolSelection.confidence,
                    success: false,
                    error: errorMessage,
                    startedAt: stepStartedAt,
                    completedAt: new Date(),
                    duration: stepDuration,
                };
                executionSteps.push(failedStep);
                failedSteps++;
                // Notify step failed
                if (callbacks?.onStepFailed) {
                    callbacks.onStepFailed(failedStep);
                }
                logger.error(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) failed in ${stepDuration}ms: ${errorMessage}`);
                // Decide whether to continue based on configuration
                if (this.config.execution.retryAttempts) {
                    // Retry logic can be added here
                }
            }
        }
        const totalDuration = Date.now() - startTime;
        const averageStepDuration = executionSteps.length > 0 ? totalStepDuration / executionSteps.length : 0;
        // Calculate final result
        const success = executionSteps.every(step => step.success);
        const finalResult = success ? context.results.get(executionOrder[executionOrder.length - 1]) : undefined;
        return {
            success,
            finalResult,
            parsedIntents: intents,
            dependencies: edges,
            toolSelections,
            executionSteps,
            statistics: {
                totalSteps: intents.length,
                successfulSteps,
                failedSteps,
                totalDuration,
                averageStepDuration,
                llmCalls: 0, // This would need to be tracked during parsing and tool selection
            },
        };
    }
    /**
     * Preview workflow plan (parse and select tools only)
     */
    async previewPlan(query) {
        return await this.parseAndPlan(query);
    }
    /**
     * Confirm and execute workflow plan
     */
    async confirmAndExecute(plan, toolExecutor, callbacks) {
        logger.info(`[CloudIntentEngine] Confirming and executing workflow plan with ${plan.estimatedSteps} steps`);
        return await this.executeWorkflowWithTracking(plan.parsedIntents, plan.toolSelections, plan.dependencies, toolExecutor, callbacks);
    }
    // ==================== Private Methods ====================
    /**
     * Build intent parsing prompt
     */
    buildIntentParsePrompt(query) {
        return `You are a workflow parser. Please decompose the following natural language instruction into atomic intents and infer their dependencies.

User instruction: "${query}"

Please output JSON format with the following fields:
1. "intents": Array of atomic intents, each containing:
   - "id": Unique identifier (e.g., A1, A2, A3...)
   - "type": Short action name (e.g., open_web, search, screenshot, send_email)
   - "description": Human-readable step description
   - "parameters": Parameter dictionary extracted from instruction (e.g., {"url": "https://www.baidu.com", "keyword": "mcp service"})

2. "edges": Array of dependency edges, each containing:
   - "from": Source intent ID
   - "to": Target intent ID

Dependencies should be inferred based on common sense (e.g., open webpage before searching, get results before taking screenshot).

Example output:
{
  "intents": [
    {"id": "A1", "type": "open_web", "description": "Open Baidu", "parameters": {"url": "https://www.baidu.com"}},
    {"id": "A2", "type": "search", "description": "Search for mcp service", "parameters": {"keyword": "mcp service"}},
    {"id": "A3", "type": "extract_results", "description": "Get top 10 search results", "parameters": {"count": 10}},
    {"id": "A4", "type": "screenshot", "description": "Take screenshot", "parameters": {}},
    {"id": "A5", "type": "send_email", "description": "Send image to xx.com email", "parameters": {"recipient": "xx.com"}}
  ],
  "edges": [
    {"from": "A1", "to": "A2"},
    {"from": "A2", "to": "A3"},
    {"from": "A3", "to": "A4"},
    {"from": "A4", "to": "A5"}
  ]
}

Output only JSON, no other content.`;
    }
    /**
     * Call LLM
     */
    async callLLM(prompt, options) {
        try {
            // Use SimpleAI's raw API call
            const response = await this.ai.callRawAPI({
                messages: [
                    {
                        role: 'system',
                        content: 'You are a workflow parser, please output strictly in JSON format as required.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: options?.temperature || 0.1,
                maxTokens: options?.maxTokens || 1024,
                responseFormat: { type: 'json_object' },
            });
            // Extract text content from response based on provider
            let text = '';
            if (response.choices && response.choices[0]?.message?.content) {
                // OpenAI, Azure, DeepSeek format
                text = response.choices[0].message.content;
            }
            else if (response.content && response.content[0]?.text) {
                // Anthropic format
                text = response.content[0].text;
            }
            else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
                // Google format
                text = response.candidates[0].content.parts[0].text;
            }
            else if (response.response) {
                // Ollama format
                text = response.response;
            }
            else if (response.text) {
                // Generic format
                text = response.text;
            }
            if (!text) {
                throw new Error('Empty response from LLM');
            }
            return text;
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] LLM call failed: ${error}`);
            throw error;
        }
    }
    /**
     * Parse intent response
     */
    parseIntentResponse(response) {
        try {
            // Extract JSON part (handle possible extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate structure
            if (!Array.isArray(parsed.intents) || !Array.isArray(parsed.edges)) {
                throw new Error('Invalid response structure');
            }
            return {
                intents: parsed.intents,
                edges: parsed.edges,
            };
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Failed to parse intent response: ${error}`);
            throw error;
        }
    }
    /**
     * Fallback: use simple rule-based intent parsing
     */
    fallbackIntentParse(query) {
        const queryLower = query.toLowerCase();
        const intents = [];
        const edges = [];
        // Simple rule matching
        if (queryLower.includes('open') && queryLower.includes('web')) {
            intents.push({
                id: 'A1',
                type: 'open_web',
                description: 'Open webpage',
                parameters: { url: this.extractUrl(query) || 'https://www.example.com' },
            });
        }
        if (queryLower.includes('search')) {
            intents.push({
                id: 'A2',
                type: 'search',
                description: 'Search content',
                parameters: { keyword: this.extractKeyword(query) || 'default' },
            });
            // Add dependency if there's an open web intent
            if (intents.some(i => i.type === 'open_web')) {
                edges.push({ from: 'A1', to: 'A2' });
            }
        }
        if (queryLower.includes('screenshot') || queryLower.includes('capture')) {
            intents.push({
                id: 'A3',
                type: 'screenshot',
                description: 'Take screenshot',
                parameters: {},
            });
            // Add dependency if there's a search intent
            if (intents.some(i => i.type === 'search')) {
                edges.push({ from: 'A2', to: 'A3' });
            }
        }
        // If no intent matched, create a generic intent
        if (intents.length === 0) {
            intents.push({
                id: 'A1',
                type: 'process',
                description: 'Process query',
                parameters: { query },
            });
        }
        return { intents, edges };
    }
    /**
     * Select tool for a single intent
     */
    async selectToolForIntent(intent) {
        // If tool list is empty, return default result
        if (this.availableTools.length === 0) {
            return {
                intentId: intent.id,
                toolName: 'unknown',
                toolDescription: 'No tools available',
                mappedParameters: intent.parameters,
                confidence: 0,
            };
        }
        try {
            // Build tool selection prompt
            const prompt = this.buildToolSelectionPrompt(intent);
            // Call LLM to select tool
            const llmResponse = await this.callLLM(prompt, {
                temperature: 0.1,
                maxTokens: 512,
            });
            // Parse tool selection result
            const selection = this.parseToolSelectionResponse(llmResponse, intent);
            return selection;
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Tool selection for intent ${intent.id} failed: ${error}`);
            // Fallback: use keyword matching
            return this.fallbackToolSelection(intent);
        }
    }
    /**
     * Build tool selection prompt
     */
    buildToolSelectionPrompt(intent) {
        // Format tool list as string
        const toolsDescription = this.availableTools.map(tool => {
            return `- ${tool.name}: ${tool.description}\n  Input parameters: ${JSON.stringify(tool.inputSchema)}`;
        }).join('\n\n');
        return `Please select the most appropriate tool for the following intent:

Intent description: ${intent.description}
Intent type: ${intent.type}
Intent parameters: ${JSON.stringify(intent.parameters, null, 2)}

Available tools:
${toolsDescription}

Please select the best matching tool and map intent parameters to tool parameters.
Output JSON format:
{
  "tool_name": "selected_tool_name",
  "arguments": {
    // Map intent parameters to tool parameters
  },
  "confidence": 0.9 // Matching confidence (0-1)
}

Output only JSON, no other content.`;
    }
    /**
     * Parse tool selection response
     */
    parseToolSelectionResponse(response, intent) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate structure
            if (!parsed.tool_name || !parsed.arguments || typeof parsed.confidence !== 'number') {
                throw new Error('Invalid tool selection response structure');
            }
            // Get tool details from cache
            const tool = this.toolCache.get(parsed.tool_name);
            return {
                intentId: intent.id,
                toolName: parsed.tool_name,
                toolDescription: tool?.description || 'No description available',
                mappedParameters: parsed.arguments,
                confidence: parsed.confidence,
            };
        }
        catch (error) {
            logger.error(`[CloudIntentEngine] Failed to parse tool selection response: ${error}`);
            throw error;
        }
    }
    /**
     * Fallback tool selection using keyword matching
     */
    fallbackToolSelection(intent) {
        // Simple keyword matching
        const intentLower = intent.description.toLowerCase();
        let bestMatch = null;
        for (const tool of this.availableTools) {
            let score = 0;
            // Check tool name
            if (tool.name.toLowerCase().includes(intent.type.toLowerCase())) {
                score += 3;
            }
            // Check tool description
            if (tool.description.toLowerCase().includes(intent.type.toLowerCase())) {
                score += 2;
            }
            // Check for keyword matches
            const keywords = ['open', 'search', 'read', 'write', 'create', 'delete', 'list', 'get'];
            for (const keyword of keywords) {
                if (intentLower.includes(keyword) && tool.description.toLowerCase().includes(keyword)) {
                    score += 1;
                }
            }
            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { tool, score };
            }
        }
        if (bestMatch) {
            return {
                intentId: intent.id,
                toolName: bestMatch.tool.name,
                toolDescription: bestMatch.tool.description,
                mappedParameters: this.simpleParameterMapping(intent.parameters, bestMatch.tool),
                confidence: Math.min(bestMatch.score / 5, 0.7), // Normalize to 0-0.7 range
            };
        }
        // Use default tool if configured
        const defaultToolName = this.config.fallback.defaultTools?.[intent.type];
        if (defaultToolName) {
            const defaultTool = this.availableTools.find(t => t.name === defaultToolName);
            if (defaultTool) {
                return {
                    intentId: intent.id,
                    toolName: defaultTool.name,
                    toolDescription: defaultTool.description,
                    mappedParameters: intent.parameters,
                    confidence: 0.3,
                };
            }
        }
        // Return unknown tool
        return {
            intentId: intent.id,
            toolName: 'unknown',
            toolDescription: 'No matching tool found',
            mappedParameters: intent.parameters,
            confidence: 0,
        };
    }
    /**
     * Enhanced parameter mapping with better handling of parameter name mismatches
     */
    simpleParameterMapping(intentParams, tool) {
        const mapped = {};
        const schema = tool.inputSchema;
        // Common parameter name mappings (intent param -> tool param)
        // Also include reverse mappings for better coverage
        const commonMappings = {
            // File operations
            'filename': ['path', 'file', 'filepath', 'filename', 'name'],
            'path': ['path', 'filepath', 'filename', 'directory', 'name'],
            'directory': ['directory', 'path', 'folder', 'dir', 'name'],
            'content': ['content', 'text', 'data', 'body'],
            'file': ['path', 'filename', 'filepath', 'name'],
            'name': ['name', 'path', 'filename', 'filepath', 'directory'],
            // Git operations
            'repo': ['repository', 'repo', 'repo_path', 'path'],
            'repository': ['repo', 'repository', 'path'],
            'branch': ['branch', 'ref', 'target'],
            'target': ['branch', 'ref', 'target'],
            'message': ['message', 'commit_message', 'msg'],
            'commit_message': ['message', 'commit_message', 'msg'],
            // Shell operations
            'command': ['command', 'cmd', 'shell_command'],
            'cmd': ['command', 'cmd', 'shell_command'],
            'args': ['args', 'arguments', 'parameters'],
            'arguments': ['args', 'arguments', 'parameters'],
            'parameters': ['args', 'arguments', 'parameters'],
            // Web operations
            'url': ['url', 'uri', 'link', 'address'],
            'uri': ['url', 'uri', 'link', 'address'],
            'method': ['method', 'http_method', 'verb'],
            'http_method': ['method', 'http_method', 'verb'],
            'headers': ['headers', 'http_headers'],
            'http_headers': ['headers', 'http_headers'],
            'body': ['body', 'data', 'content', 'payload'],
            'data': ['body', 'data', 'content', 'payload'],
            'payload': ['body', 'data', 'content', 'payload'],
        };
        // Also build a reverse lookup for tool parameter names
        const toolParamNames = Object.keys(schema.properties);
        const toolParamLookup = new Set(toolParamNames);
        // Try to map based on parameter names
        for (const [paramName, paramValue] of Object.entries(intentParams)) {
            let mappedParamName;
            // 1. Direct match (case-insensitive)
            const directMatch = toolParamNames.find(toolParam => toolParam.toLowerCase() === paramName.toLowerCase());
            if (directMatch) {
                mappedParamName = directMatch;
            }
            // 2. Check common mappings
            else if (commonMappings[paramName]) {
                for (const possibleName of commonMappings[paramName]) {
                    if (toolParamLookup.has(possibleName)) {
                        mappedParamName = possibleName;
                        break;
                    }
                }
            }
            // 3. Try to find similar parameter name (fuzzy match with better logic)
            if (!mappedParamName) {
                // First, check if any tool parameter is in the common mappings for this param
                for (const toolParam of toolParamNames) {
                    if (commonMappings[toolParam]?.includes(paramName)) {
                        mappedParamName = toolParam;
                        break;
                    }
                }
                // If still not found, try fuzzy matching
                if (!mappedParamName) {
                    const similarParam = toolParamNames.find(toolParam => {
                        // Remove underscores and normalize
                        const normalizedToolParam = toolParam.toLowerCase().replace(/_/g, '');
                        const normalizedIntentParam = paramName.toLowerCase().replace(/_/g, '');
                        // Check for various similarity patterns
                        return (
                        // Exact match after normalization
                        normalizedToolParam === normalizedIntentParam ||
                            // One contains the other
                            normalizedToolParam.includes(normalizedIntentParam) ||
                            normalizedIntentParam.includes(normalizedToolParam) ||
                            // Common abbreviations
                            (paramName === 'cmd' && toolParam === 'command') ||
                            (paramName === 'uri' && toolParam === 'url') ||
                            (paramName === 'target' && toolParam === 'branch') ||
                            // Check for common suffixes
                            toolParam.toLowerCase().endsWith(paramName.toLowerCase()) ||
                            paramName.toLowerCase().endsWith(toolParam.toLowerCase()) ||
                            // Check for common prefixes
                            toolParam.toLowerCase().startsWith(paramName.toLowerCase()) ||
                            paramName.toLowerCase().startsWith(toolParam.toLowerCase()));
                    });
                    if (similarParam) {
                        mappedParamName = similarParam;
                    }
                }
            }
            // 4. If still not found, check if we can use the parameter anyway
            // (if additionalProperties is true or not specified)
            if (!mappedParamName) {
                if (schema.additionalProperties !== false) {
                    // Allow unknown parameters if additionalProperties is not explicitly false
                    mappedParamName = paramName;
                }
                else {
                    // Log warning but don't fail - let tool validation handle it
                    console.warn(`Parameter "${paramName}" not found in tool schema for "${tool.name}". Tool may reject this parameter.`);
                    continue;
                }
            }
            // Map the parameter
            if (mappedParamName) {
                mapped[mappedParamName] = paramValue;
            }
        }
        return mapped;
    }
    /**
     * Extract URL from query
     */
    extractUrl(query) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const match = query.match(urlRegex);
        return match ? match[0] : null;
    }
    /**
     * Extract keyword from query
     */
    extractKeyword(query) {
        // Simple extraction: look for content after "search for" or similar phrases
        const patterns = [
            /search\s+for\s+["']?([^"'\s]+)["']?/i,
            /search\s+["']?([^"'\s]+)["']?/i,
            /find\s+["']?([^"'\s]+)["']?/i,
            /look\s+for\s+["']?([^"'\s]+)["']?/i,
        ];
        for (const pattern of patterns) {
            const match = query.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }
    /**
     * Build dependency graph
     */
    buildDependencyGraph(intents, edges) {
        const graph = new Map();
        // Initialize graph with all intents
        intents.forEach(intent => {
            graph.set(intent.id, new Set());
        });
        // Add edges
        edges.forEach(edge => {
            const dependencies = graph.get(edge.to);
            if (dependencies) {
                dependencies.add(edge.from);
            }
        });
        return graph;
    }
    /**
     * Topological sort (Kahn's algorithm)
     */
    topologicalSort(graph) {
        const sorted = [];
        const indegree = new Map();
        const queue = [];
        // Calculate indegree for each node
        graph.forEach((dependencies, node) => {
            indegree.set(node, dependencies.size);
            if (dependencies.size === 0) {
                queue.push(node);
            }
        });
        // Process nodes with zero indegree
        while (queue.length > 0) {
            const node = queue.shift();
            sorted.push(node);
            // Decrease indegree of neighbors
            graph.forEach((dependencies, neighbor) => {
                if (dependencies.has(node)) {
                    const newIndegree = (indegree.get(neighbor) || 0) - 1;
                    indegree.set(neighbor, newIndegree);
                    if (newIndegree === 0) {
                        queue.push(neighbor);
                    }
                }
            });
        }
        // Check for cycles
        if (sorted.length !== graph.size) {
            return null; // Cycle detected
        }
        return sorted;
    }
    /**
     * Resolve parameters with variable substitution
     */
    resolveParameters(parameters, context) {
        const resolved = {};
        for (const [key, value] of Object.entries(parameters)) {
            if (typeof value === 'string') {
                // Simple variable substitution: {{intentId.result}}
                const varMatch = value.match(/\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/);
                if (varMatch) {
                    const [, intentId, field] = varMatch;
                    const result = context.results.get(intentId);
                    if (result && typeof result === 'object' && field in result) {
                        resolved[key] = result[field];
                    }
                    else {
                        resolved[key] = value; // Keep original if substitution fails
                    }
                }
                else {
                    resolved[key] = value;
                }
            }
            else {
                resolved[key] = value;
            }
        }
        return resolved;
    }
    /**
     * Get engine status
     */
    getStatus() {
        return {
            initialized: this.ai.getStatus().enabled,
            toolsCount: this.availableTools.length,
            llmProvider: this.config.llm.provider,
            llmConfigured: !!this.config.llm.apiKey,
        };
    }
}
//# sourceMappingURL=cloud-intent-engine.js.map