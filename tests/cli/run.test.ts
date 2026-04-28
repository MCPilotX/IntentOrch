import { Command } from 'commander';
import fs from 'fs/promises';
import { runCommand } from '../../src/cli/run';
import { getAIConfig } from '../../src/utils/config';
import { getRegistryClient } from '../../src/registry/client';
import { getProcessManager } from '../../src/process-manager/manager';
import { getWorkflowManager } from '../../src/workflow/manager';
import { WorkflowEngine } from '../../src/workflow/engine';
import { getToolRegistry } from '../../src/tool-registry/registry';
import { AutoStartManager } from '../../src/utils/auto-start-manager';

jest.mock('fs/promises');
jest.mock('../../src/utils/config');
jest.mock('../../src/registry/client');
jest.mock('../../src/process-manager/manager');
jest.mock('../../src/workflow/manager');
jest.mock('../../src/workflow/engine');
jest.mock('../../src/tool-registry/registry');
jest.mock('../../src/utils/auto-start-manager');
jest.mock('@mcpilotx/core', () => ({
  intentorch: {
    configureAI: jest.fn(),
    initCloudIntentEngine: jest.fn(),
    connectMCPServer: jest.fn(),
    executeWorkflowWithTracking: jest.fn(),
    getConnectedServers: jest.fn(),
    disconnectMCPServer: jest.fn()
  }
}));
// Mock intentorch adapter instead of @mcpilotx/core
const mockedIntentorch = {
  configureAI: jest.fn(),
  initCloudIntentEngine: jest.fn(),
  connectMCPServer: jest.fn(),
  executeWorkflowWithTracking: jest.fn(),
  getConnectedServers: jest.fn(),
  disconnectMCPServer: jest.fn()
} as any;

describe('run command', () => {
  let command: Command;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  const mockWorkflowManager = {
    exists: jest.fn(),
    load: jest.fn()
  };

  const mockProcessManager = {
    listRunning: jest.fn(),
    start: jest.fn()
  };

  const mockRegistryClient = {
    getCachedManifest: jest.fn(),
    fetchManifest: jest.fn()
  };

  const mockToolRegistry = {
    guessToolsForQuery: jest.fn()
  };

  const mockWorkflowEngineExecute = jest.fn();

  const mockAutoStartManager = {
    analyzeIntentForServers: jest.fn(),
    ensureServersRunning: jest.fn(),
    printResults: jest.fn(),
    areAllServersReady: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0 as any);

    (getWorkflowManager as jest.Mock).mockReturnValue(mockWorkflowManager);
    (getProcessManager as jest.Mock).mockReturnValue(mockProcessManager);
    (getRegistryClient as jest.Mock).mockReturnValue(mockRegistryClient);
    (getToolRegistry as jest.Mock).mockReturnValue(mockToolRegistry);
    (WorkflowEngine as unknown as jest.Mock).mockImplementation(() => ({
      execute: mockWorkflowEngineExecute
    }));
    (AutoStartManager as unknown as jest.Mock).mockImplementation(() => mockAutoStartManager);
    (getAIConfig as jest.Mock).mockResolvedValue({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini'
    });

    mockWorkflowManager.exists.mockResolvedValue(false);
    mockProcessManager.listRunning.mockResolvedValue([]);
    mockToolRegistry.guessToolsForQuery.mockResolvedValue([]);
    mockedIntentorch.executeWorkflowWithTracking.mockResolvedValue({
      success: true,
      executionSteps: [],
      result: { content: [{ type: 'text', text: 'done' }] }
    });
    mockedIntentorch.getConnectedServers.mockReturnValue([]);
    mockAutoStartManager.analyzeIntentForServers.mockResolvedValue([]);
    mockAutoStartManager.ensureServersRunning.mockResolvedValue([]);
    mockAutoStartManager.areAllServersReady.mockReturnValue(true);

    command = runCommand();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it('creates command with expected metadata', () => {
    expect(command.name()).toBe('run');
    expect(command.description()).toContain('Execute natural language workflow');
    expect(command.helpInformation()).toContain('--simulate');
    expect(command.helpInformation()).toContain('--auto-start');
  });

  it('reports invalid JSON params and exits action early', async () => {
    await command.parseAsync(['node', 'test', 'query', '--params', '{invalid-json']);

    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Invalid JSON params');
    expect(mockWorkflowManager.exists).not.toHaveBeenCalled();
  });

  it('executes workflow from JSON file input', async () => {
    const workflow = { name: 'wf', steps: [] };
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(workflow));
    mockWorkflowEngineExecute.mockResolvedValue({ success: true });

    await command.parseAsync(['node', 'test', 'workflow.json', '--params', '{"city":"shanghai"}']);

    expect(fs.readFile).toHaveBeenCalledWith('workflow.json', 'utf-8');
    expect(mockWorkflowEngineExecute).toHaveBeenCalledWith(workflow, { city: 'shanghai' });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Executing workflow from file'));
  });

  it('executes named workflow when workflow exists', async () => {
    const namedWorkflow = { name: 'book_ticket', steps: [{ tool: 'search_tickets' }] };
    mockWorkflowManager.exists.mockResolvedValue(true);
    mockWorkflowManager.load.mockResolvedValue(namedWorkflow);
    mockWorkflowEngineExecute.mockResolvedValue({ success: true });

    await command.parseAsync(['node', 'test', 'book_ticket', '--params', '{"date":"2026-05-01"}']);

    expect(mockWorkflowManager.exists).toHaveBeenCalledWith('book_ticket');
    expect(mockWorkflowManager.load).toHaveBeenCalledWith('book_ticket');
    expect(mockWorkflowEngineExecute).toHaveBeenCalledWith(namedWorkflow, { date: '2026-05-01' });
  });

  it('warns when AI config is missing and skips NL execution', async () => {
    (getAIConfig as jest.Mock).mockResolvedValue({ provider: '', apiKey: '' });

    await command.parseAsync(['node', 'test', 'check weather for me']);

    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ AI configuration not set');
    expect(mockedIntentorch.configureAI).not.toHaveBeenCalled();
  });

  it('runs natural-language flow in simulate + silent mode and prints final json', async () => {
    mockedIntentorch.executeWorkflowWithTracking.mockResolvedValue({
      success: true,
      executionSteps: [
        {
          success: true,
          toolName: 'get_weather',
          result: { content: [{ type: 'text', text: 'sunny' }] }
        }
      ],
      result: { content: [{ type: 'text', text: 'final answer' }] }
    });

    await command.parseAsync(['node', 'test', 'weather in shanghai', '--simulate', '--silent']);

    expect(mockedIntentorch.configureAI).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini'
    });
    expect(mockedIntentorch.initCloudIntentEngine).toHaveBeenCalled();
    expect(mockedIntentorch.executeWorkflowWithTracking).toHaveBeenCalledWith('weather in shanghai');
    expect(consoleLogSpy).toHaveBeenCalledWith('"final answer"');
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('returns early when no running servers and no suggested tools', async () => {
    mockProcessManager.listRunning.mockResolvedValue([]);
    mockToolRegistry.guessToolsForQuery.mockResolvedValue([]);

    await command.parseAsync(['node', 'test', 'book high speed rail']);

    expect(mockToolRegistry.guessToolsForQuery).toHaveBeenCalledWith('book high speed rail');
    expect(consoleErrorSpy).toHaveBeenCalledWith('   No suitable tools found for query');
    expect(mockedIntentorch.executeWorkflowWithTracking).not.toHaveBeenCalled();
  });

  it('stops when auto-start fails to prepare required servers', async () => {
    mockAutoStartManager.analyzeIntentForServers.mockResolvedValue(['a/server']);
    mockAutoStartManager.ensureServersRunning.mockResolvedValue([
      { serverName: 'a/server', success: false }
    ]);
    mockAutoStartManager.areAllServersReady.mockReturnValue(false);

    await command.parseAsync(['node', 'test', 'query', '--auto-start']);

    expect(mockAutoStartManager.analyzeIntentForServers).toHaveBeenCalledWith('query');
    expect(mockAutoStartManager.ensureServersRunning).toHaveBeenCalledWith(['a/server']);
    expect(consoleErrorSpy).toHaveBeenCalledWith('\n❌ Some required servers failed to start');
    expect(mockedIntentorch.executeWorkflowWithTracking).not.toHaveBeenCalled();
  });

  it('connects to running servers and disconnects during cleanup', async () => {
    mockProcessManager.listRunning.mockResolvedValue([{ serverName: 'acme/weather', pid: 1234 }]);
    mockRegistryClient.getCachedManifest.mockResolvedValue({
      runtime: { command: 'node', args: ['server.js'] }
    });
    mockedIntentorch.getConnectedServers.mockReturnValue([
      { name: 'acme/weather' },
      { name: 'acme/other' }
    ]);
    mockedIntentorch.executeWorkflowWithTracking.mockResolvedValue({
      success: true,
      executionSteps: [],
      result: { result: 'ok' }
    });

    await command.parseAsync(['node', 'test', 'weather query']);

    expect(mockedIntentorch.connectMCPServer).toHaveBeenCalledWith({
      name: 'acme/weather',
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['server.js']
      }
    });
    expect(mockedIntentorch.disconnectMCPServer).toHaveBeenCalledWith('acme/weather');
    expect(mockedIntentorch.disconnectMCPServer).toHaveBeenCalledWith('acme/other');
  });

  it('skips local-path servers and exits when nothing is connected', async () => {
    mockProcessManager.listRunning.mockResolvedValue([{ serverName: './local-server.json', pid: 11 }]);

    await command.parseAsync(['node', 'test', 'query']);

    expect(mockedIntentorch.connectMCPServer).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('\n❌ Failed to connect to any MCP Server');
    expect(mockedIntentorch.executeWorkflowWithTracking).not.toHaveBeenCalled();
  });

  it('tries fallback fetchManifest when cached manifest is missing', async () => {
    mockProcessManager.listRunning.mockResolvedValue([{ serverName: 'acme/missing', pid: 10 }]);
    mockRegistryClient.getCachedManifest.mockResolvedValue(null);
    mockRegistryClient.fetchManifest.mockResolvedValue({ name: 'acme/missing', version: '1.0.0' });

    await command.parseAsync(['node', 'test', 'query']);

    expect(mockRegistryClient.fetchManifest).toHaveBeenCalledWith('acme/missing');
    expect(mockedIntentorch.connectMCPServer).not.toHaveBeenCalled();
  });

  it('prints failed step details when workflow execution fails', async () => {
    mockProcessManager.listRunning.mockResolvedValue([{ serverName: 'acme/weather', pid: 100 }]);
    mockRegistryClient.getCachedManifest.mockResolvedValue({
      runtime: { command: 'node', args: [] }
    });
    mockedIntentorch.executeWorkflowWithTracking.mockResolvedValue({
      success: false,
      error: 'tool timeout',
      executionSteps: [
        { success: false, toolName: 'search_tickets', error: 'timeout' },
        { success: true, toolName: 'other_tool' }
      ]
    });

    await command.parseAsync(['node', 'test', 'query']);

    expect(consoleLogSpy).toHaveBeenCalledWith('❌ Execution failed');
    expect(consoleLogSpy).toHaveBeenCalledWith('tool timeout');
    expect(consoleLogSpy).toHaveBeenCalledWith('  ❌ search_tickets');
    expect(consoleLogSpy).toHaveBeenCalledWith('     Error: timeout');
  });

  it('keeps connections alive when keep-alive is enabled', async () => {
    mockProcessManager.listRunning.mockResolvedValue([{ serverName: 'acme/weather', pid: 1234 }]);
    mockRegistryClient.getCachedManifest.mockResolvedValue({
      runtime: { command: 'node', args: ['server.js'] }
    });
    mockedIntentorch.getConnectedServers.mockReturnValue([{ name: 'acme/weather' }]);
    mockedIntentorch.executeWorkflowWithTracking.mockResolvedValue({
      success: true,
      executionSteps: [],
      result: { result: 'ok' }
    });

    await command.parseAsync(['node', 'test', 'weather query', '--keep-alive']);

    expect(mockedIntentorch.disconnectMCPServer).not.toHaveBeenCalled();
  });
});
