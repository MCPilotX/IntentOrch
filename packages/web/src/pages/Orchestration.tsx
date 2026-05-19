import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AIChatPanel from '../components/orchestration/AIChatPanel';
import StepPreviewBoard from '../components/orchestration/StepPreviewBoard';
import ExecutionResultPanel from '../components/orchestration/ExecutionResultPanel';
import TraceInspector from '../components/orchestration/TraceInspector';
import StepEditorModal from '../components/orchestration/StepEditorModal';
import ToolLibraryDrawer from '../components/orchestration/ToolLibraryDrawer';
import { Toast } from '../components/ui';
import { apiService } from '../services/api';
import { outputFormattingService } from '../services/output-formatting';
import { executeNaturalLanguageStream, type StepStreamEvent } from '../services/ai-service';
import { useChatHistory } from '../hooks/useChatHistory';
import { useOutputFormatting } from '../hooks';
import { useLanguage } from '../contexts/LanguageContext';
import type { WorkflowStep, Workflow } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  metadata?: {
    isStreaming?: boolean;
    isResult?: boolean;
    executionSteps?: StepResult[];
    totalDuration?: number;
  };
}

interface StepResult {
  name?: string;
  toolName?: string;
  serverName?: string;
  success: boolean;
  error?: string;
  duration?: number;
  output?: string;
  result?: unknown;
}

const Orchestration: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'success' | 'capability_missing' | 'partial' | 'error'>('idle');
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [actionSelection, setActionSelection] = useState<'execute' | 'save' | 'edit'>('execute');
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Execution results state
  const [executionResults, setExecutionResults] = useState<StepResult[] | null>(null);
  const [executionTotalDuration, setExecutionTotalDuration] = useState(0);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [isTraceInspectorOpen, setIsTraceInspectorOpen] = useState(false);

  // Tool library state
  const [isToolLibraryOpen, setIsToolLibraryOpen] = useState(false);
  const [insertedText, setInsertedText] = useState<string | null>(null);

  // Step editor state
  const [editingStep, setEditingStep] = useState<{ step: WorkflowStep; index: number } | null>(null);

  const handleInsertTool = (toolName: string) => {
    setInsertedText(toolName);
  };

  // Chat history persistence
  const { addMessages: persistMessages, createSession } = useChatHistory();
  const hasInitialized = useRef(false);

  // Output formatting hook
  const { formatExecutionResult: formatWithNewSystem } = useOutputFormatting({
    debug: process.env.NODE_ENV === 'development',
    autoInitialize: true,
    defaultOptions: {
      detailLevel: 'standard',
      language: 'en'
    }
  });

  // Initialize chat session
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      createSession();
    }
  }, [createSession]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      persistMessages(messages);
    }
  }, [messages, persistMessages]);

  // Mutation to save the generated workflow
  const saveWorkflowMutation = useMutation({
    mutationFn: (workflowData: any) => apiService.saveWorkflow(workflowData),
    onSuccess: (savedWorkflow: Workflow) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showToast(`Workflow "${savedWorkflow.name}" saved successfully!`, 'success');
      return savedWorkflow;
    },
    onError: (error) => {
      showToast(`Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    },
  });

  const handleSendMessage = async (content: string) => {
    setIsAnalyzing(true);
    setAnalysisStatus(t('orchestration.analyzing'));
    setStatus('idle');
    setExecutionResults(null);
    
    try {
      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Add a streaming/loading assistant message
      const loadingMessageId = (Date.now() + 1).toString();
      const loadingMessage: Message = {
        id: loadingMessageId,
        role: 'assistant',
        content: '',
        metadata: { isStreaming: true },
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, loadingMessage]);
      
      setAnalysisStatus('Executing query via natural language engine...');
      
      // Use the streaming SSE endpoint — each step result is displayed as it arrives
      const stepResultsAccum: StepResult[] = [];
      
      const streamResult = await executeNaturalLanguageStream(
        content,
        (event: StepStreamEvent) => {
          if (event.type === 'step_result') {
            // Format the step result using the formatting system
            let stepText = '';
            try {
              const fmtResult = outputFormattingService.format(event.result, {
                toolName: event.toolName,
              });
              // Extract plain text from formatted output (strip markdown)
              stepText = fmtResult.output
                .replace(/\*\*/g, '')
                .replace(/`/g, '')
                .replace(/#{1,6}\s/g, '')
                .substring(0, 300)
                .trim();
            } catch {
              // Fallback: extract raw text
              const result = event.result as any;
              if (typeof result === 'string') {
                stepText = result.substring(0, 300);
              } else if (result?.content && Array.isArray(result.content)) {
                stepText = result.content
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join('\n')
                  .substring(0, 300);
              }
            }
            
            const stepName = event.toolName || 'Unknown step';
            const status = event.success ? '✅' : '❌';
            const stepContent = `**${status} ${stepName}**${stepText ? `\n> ${stepText}` : ''}${event.error ? `\n> Error: ${event.error}` : ''}`;
            
            // Accumulate step result for ExecutionResultPanel
            stepResultsAccum.push({
              name: stepName,
              toolName: stepName,
              success: event.success || false,
              error: event.error,
              duration: event.duration,
              result: event.result,
            });
            
            // Update the loading message with accumulated step results
            setMessages(prev => prev.map(m =>
              m.id === loadingMessageId ? {
                ...m,
                content: m.content + '\n' + stepContent,
                metadata: {
                  isStreaming: true,
                  executionSteps: [...stepResultsAccum],
                },
              } : m
            ));
          }
        },
        { autoStart: true, silent: true },
      );
      
      if (streamResult.success) {
        setStatus('success');
        
        const totalDuration = stepResultsAccum.reduce((sum, s) => sum + (s.duration || 0), 0);
        
        setExecutionResults(stepResultsAccum);
        setExecutionTotalDuration(totalDuration);
        
        // Extract traceId if available
        if ((streamResult as any).traceId) {
          setCurrentTraceId((streamResult as any).traceId);
        }
        
        // Format the final result using the formatting system
        let finalFormatted = '';
        try {
          if (streamResult.result) {
            const fmtResult = outputFormattingService.format(streamResult.result, {
              userQuery: content,
            });
            finalFormatted = fmtResult.output;
          } else {
            finalFormatted = '✅ Execution completed successfully.';
          }
        } catch {
          finalFormatted = typeof streamResult.result === 'string'
            ? streamResult.result
            : '✅ Execution completed successfully.';
        }
        
        // Append the final formatted result after the step records,
        // separated by a divider. This preserves the streaming step experience
        // while also showing the well-formatted final output.
        setMessages(prev => prev.map(m =>
          m.id === loadingMessageId ? {
            ...m,
            content: m.content + `\n\n---\n\n${finalFormatted}`,
            metadata: {
              isResult: true,
              executionSteps: stepResultsAccum,
              totalDuration,
            },
          } : m
        ));
        
        // Create draft steps from accumulated results
        const workflowSteps = createWorkflowStepsFromResult({
          executionSteps: stepResultsAccum.map(s => ({
            toolName: s.toolName,
            arguments: {},
            success: s.success,
            result: s.result,
          })),
        });
        if (workflowSteps.length > 0) {
          setDraftSteps(workflowSteps);
        }
        
        showToast('Query executed successfully!', 'success');
      } else {
        setStatus('error');
        
        setMessages(prev => prev.map(m =>
          m.id === loadingMessageId ? {
            ...m,
            content: `❌ **Execution Failed**\n\n${streamResult.error || 'Unknown error occurred'}\n\n💡 **Suggestions:**\n1. Make sure AI configuration is set (provider & API key)\n2. Make sure required MCP servers are running\n3. Try rephrasing your query`,
          } : m
        ));
        
        if (stepResultsAccum.length > 0) {
          setExecutionResults(stepResultsAccum);
          setExecutionTotalDuration(stepResultsAccum.reduce((sum, s) => sum + (s.duration || 0), 0));
        }
      }
    } catch (error) {
      setStatus('error');
      
      const errorContent = getErrorMessage(error);
      
      // Update the loading message with error content
      setMessages(prev => prev.map(m =>
        m.metadata?.isStreaming ? {
          ...m,
          content: errorContent,
        } : m
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Format result for display in chat — shows only the final result
  // If there are multiple steps, only the LLM's summary (result.result) is shown.
  // Step-by-step details are available in the ExecutionResultPanel on the right.
  const formatResultForDisplay = (result: any, query: string): string => {
    // Step 1: LLM's final summary — this is the single best thing to show
    if (result.result && typeof result.result === 'string') {
      return result.result;
    }
    
    // Step 2: If there's only one step with text output, show it directly
    const steps = result.executionSteps || [];
    const successfulSteps = steps.filter((s: any) => s.success);
    if (successfulSteps.length === 1) {
      const singleStep = successfulSteps[0];
      const stepResult = singleStep.result || singleStep.output;
      if (stepResult) {
        const text = extractResultText(stepResult);
        if (text && text.length > 0) {
          return text;
        }
      }
    }
    
    // Step 3: Use the output formatting system
    try {
      const formatted = formatWithNewSystem(result, query);
      if (formatted && formatted.length > 0) {
        return formatted;
      }
    } catch {
      // Fall through
    }
    
    // Step 4: Simple final summary
    if (steps.length > 0) {
      const successCount = successfulSteps.length;
      const totalSteps = steps.length;
      if (successCount === totalSteps) {
        return `✅ Execution completed successfully.`;
      } else {
        return `⚠️ Execution completed with ${totalSteps - successCount} failed step(s).`;
      }
    }
    
    return '✅ Execution completed successfully.';
  };
  // Extract readable text from result
  const extractResultText = (result: any): string => {
    if (!result) return '';
    
    // MCP response format: { content: [{ type: "text", text: "..." }] }
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');
    }
    
    // Direct text
    if (typeof result === 'string') return result;
    
    // Nested result
    if (result.result) return extractResultText(result.result);
    
    // JSON object - truncate if too long
    const json = JSON.stringify(result, null, 2);
    return json.length > 2000 ? json.substring(0, 2000) + '\n... (truncated)' : json;
  };

  // Simplified error message generation
  const getErrorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) {
      return t('orchestration.errorGeneric');
    }
    
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
      return t('orchestration.errorNetwork');
    }
    if (msg.includes('auth') || msg.includes('401') || msg.includes('token')) {
      return t('orchestration.errorAuth');
    }
    if (msg.includes('server') || msg.includes('mcp')) {
      return t('orchestration.errorServer');
    }
    return `❌ **Error:** ${error.message}`;
  };

  // Handle the selected action
  const handleAction = async (action: 'execute' | 'save' | 'edit') => {
    if (draftSteps.length === 0) return;
    
    const userQuery = messages.find(m => m.role === 'user')?.content || '';
    const workflowName = userQuery.substring(0, 30) || 'AI Generated Workflow';
    const workflowData = {
      id: '',
      name: workflowName,
      description: `Generated from intent: ${userQuery}`,
      steps: draftSteps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    switch (action) {
      case 'execute':
        setExecutionStatus('executing');
        setExecutionResults(null);
        
        try {
          // Re-execute using natural language with the original query
          const result = await apiService.executeNaturalLanguage(userQuery, {
            autoStart: true,
            silent: true,
          });
          
          if (result.success) {
            setExecutionStatus('success');
            showToast('Workflow executed successfully!', 'success');
            
            const stepResults: StepResult[] = extractStepResults(result);
            const totalDuration = result.statistics?.totalDuration || 
              stepResults.reduce((sum, s) => sum + (s.duration || 0), 0);
            
            setExecutionResults(stepResults);
            setExecutionTotalDuration(totalDuration);
            setCurrentTraceId(result.traceId || null);
            
            updateStepsWithResults(stepResults);
          } else {
            setExecutionStatus('error');
            showToast(`Workflow execution failed: ${result.error || 'Unknown error'}`, 'error');
            
            const stepResults: StepResult[] = extractStepResults(result);
            setExecutionResults(stepResults);
            setExecutionTotalDuration(result.statistics?.totalDuration || 0);
          }
        } catch (error: any) {
          setExecutionStatus('error');
          showToast(`Workflow execution error: ${error.message || 'Unknown error'}`, 'error');
        }

        // Save workflow for future reference
        saveWorkflowMutation.mutate(workflowData, {
          onError: () => {}
        });
        break;
        
      case 'save':
        saveWorkflowMutation.mutate(workflowData);
        break;
        
      case 'edit':
        showToast('Workflow steps ready for editing', 'info');
        break;
    }
  };

  // Extract step results from execution result
  const extractStepResults = (result: any): StepResult[] => {
    const steps = result.executionSteps || result.steps || [];
    if (Array.isArray(steps)) {
      return steps.map((step: any) => ({
        name: step.name || step.toolName,
        toolName: step.toolName || step.name,
        serverName: step.serverName,
        success: step.success,
        error: step.error,
        duration: step.duration,
        output: step.output || extractResultText(step.result),
        result: step.result,
      }));
    }
    return [];
  };

  // Create workflow steps from execution result for re-execution
  const createWorkflowStepsFromResult = (result: any): WorkflowStep[] => {
    const steps = result.executionSteps || [];
    if (!Array.isArray(steps) || steps.length === 0) return [];
    
    return steps.map((step: any, index: number) => {
      // Extract actual arguments from the step
      const args = step.arguments || {};
      // Build a human-readable description of the parameters
      const paramDescription = Object.keys(args).length > 0
        ? Object.entries(args)
            .map(([key, value]) => {
              const val = typeof value === 'string' ? value : JSON.stringify(value);
              return `${key}: ${val}`;
            })
            .join(', ')
        : '';
      
      return {
        id: `step_${Date.now()}_${index}`,
        type: 'tool' as const,
        serverName: step.serverName || '',
        toolName: step.toolName || step.name || '',
        parameters: {
          // Include the actual arguments that were passed to the tool
          ...args,
          _metadata: {
            name: `Execute: ${step.toolName || step.name || 'Unknown'}`,
            description: `Step ${index + 1}: ${step.toolName || step.name || 'Unknown'}`,
            status: step.success ? 'success' : 'failed',
            parameters: paramDescription,
          }
        },
      };
    });
  };

  // Update draft steps with execution results
  const updateStepsWithResults = (stepResults: StepResult[]) => {
    setDraftSteps(prev => prev.map((step, index) => {
      const result = stepResults[index];
      if (!result) return step;
      return {
        ...step,
        parameters: {
          ...step.parameters,
          _executionResult: {
            success: result.success,
            error: result.error,
            duration: result.duration,
          }
        }
      };
    }));
  };

  // Retry failed steps
  const handleRetry = () => {
    setExecutionResults(null);
    handleAction('execute');
  };

  const handleActionChange = (action: 'execute' | 'save' | 'edit') => {
    setActionSelection(action);
  };

  const handleClear = () => {
    setDraftSteps([]);
    setStatus('idle');
    setExecutionResults(null);
  };

  const handleDeleteStep = (id: string) => {
    setDraftSteps(prev => prev.filter(step => step.id !== id));
  };

  // Step editing
  const handleEditStep = (step: WorkflowStep) => {
    const index = draftSteps.findIndex(s => s.id === step.id);
    if (index >= 0) {
      setEditingStep({ step, index });
    }
  };

  const handleSaveEditedStep = (editedStep: WorkflowStep) => {
    setDraftSteps(prev => prev.map((s, i) => 
      i === editingStep?.index ? editedStep : s
    ));
    setEditingStep(null);
    showToast('Step updated successfully', 'success');
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast(prev => ({ ...prev, show: false }));
  };

  const formatExecutionResult = (executionResult: any): string => {
    if (!executionResult) return t('orchestration.executionComplete');
    
    const userQuery = messages.find(m => m.role === 'user')?.content;
    
    try {
      return formatWithNewSystem(executionResult, userQuery);
    } catch (error) {
      return t('orchestration.formattingFailed');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -m-6 overflow-hidden">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left: AI Chat Panel - 60% width */}
        <div className="flex-[6] min-w-0 relative">
          <AIChatPanel 
            onSendMessage={handleSendMessage}
            messages={messages}
            isAnalyzing={isAnalyzing}
            statusMessage={analysisStatus}
            insertedText={insertedText}
            onClearInsertedText={() => setInsertedText(null)}
            onToggleLibrary={() => setIsToolLibraryOpen(!isToolLibraryOpen)}
          />

          {/* Tool Library Overlay */}
          <ToolLibraryDrawer
            isOpen={isToolLibraryOpen}
            onClose={() => setIsToolLibraryOpen(false)}
            onInsertTool={handleInsertTool}
          />
        </div>

        {/* Right: Step Preview Board - 40% width */}
        <div className="flex-[4] flex flex-col min-w-0 overflow-hidden">
          <StepPreviewBoard 
            steps={draftSteps}
            status={status}
            onClear={handleClear}
            onDeleteStep={handleDeleteStep}
            onEditStep={handleEditStep}
            onAddStep={() => {
              const newStep: WorkflowStep = {
                id: `step-${Date.now()}`,
                type: 'tool',
                toolName: '',
                serverName: '',
                parameters: {},
              };
              setDraftSteps(prev => [...prev, newStep]);
              setEditingStep({ step: newStep, index: draftSteps.length });
            }}
            actionSelection={actionSelection}
            onActionChange={handleActionChange}
            onActionExecute={() => handleAction(actionSelection)}
            isExecuting={executionStatus === 'executing'}
          />

          {/* Execution Results Panel */}
          {executionResults && executionResults.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 overflow-y-auto max-h-[40vh]">
              <ExecutionResultPanel
                results={executionResults}
                totalDuration={executionTotalDuration}
                traceId={currentTraceId || undefined}
                onInspectTrace={(id) => {
                  setCurrentTraceId(id);
                  setIsTraceInspectorOpen(true);
                }}
                onClose={() => setExecutionResults(null)}
                onRetry={handleRetry}
              />
            </div>
          )}
        </div>
      </div>

      {/* Trace Inspector Overlay */}
      {isTraceInspectorOpen && currentTraceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-4xl">
            <TraceInspector 
              traceId={currentTraceId} 
              onClose={() => setIsTraceInspectorOpen(false)} 
            />
          </div>
        </div>
      )}

      {/* Step Editor Modal */}
      {editingStep && (
        <StepEditorModal
          step={editingStep.step}
          index={editingStep.index}
          onSave={handleSaveEditedStep}
          onClose={() => setEditingStep(null)}
        />
      )}

      {/* Toast */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </div>
  );
};

export default Orchestration;
