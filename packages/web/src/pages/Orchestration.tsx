import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AIChatPanel from '../components/orchestration/AIChatPanel';
import StepPreviewBoard from '../components/orchestration/StepPreviewBoard';
import { Toast } from '../components/ui';
import { aiService } from '../services/ai';
import { apiService } from '../services/api';
import { workflowEngine } from '../services/workflowEngine';
import { formatMCPServerName } from '../utils/format';
import { useOutputFormatting } from '../hooks/useOutputFormatting';
import { useLanguage } from '../contexts/LanguageContext';
import type { WorkflowStep, Workflow } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const Orchestration: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'success' | 'capability_missing' | 'error'>('idle');
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [actionSelection, setActionSelection] = useState<'execute' | 'save' | 'edit'>('execute');
  const [autoExecute, setAutoExecute] = useState(true);
  const [hasUserChangedAction, setHasUserChangedAction] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Output formatting hook
  const { formatExecutionResult: formatWithNewSystem } = useOutputFormatting({
    debug: process.env.NODE_ENV === 'development',
    autoInitialize: true,
    defaultOptions: {
      detailLevel: 'standard',
      language: 'en'
    }
  });

  // Mutation to save the generated workflow
  const saveWorkflowMutation = useMutation({
    mutationFn: (workflowData: any) => apiService.saveWorkflow(workflowData),
    onSuccess: (savedWorkflow: Workflow) => {
      console.log('Workflow saved successfully:', savedWorkflow);
      console.log('Workflow ID:', savedWorkflow.id);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showToast(`Workflow "${savedWorkflow.name}" saved successfully!`, 'success');
      return savedWorkflow;
    },
    onError: (error) => {
      console.error('Failed to save workflow:', error);
      showToast(`Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    },
  });

  // Mutation to execute workflow with enhanced engine
  const executeWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => workflowEngine.executeWorkflowWithValidation(workflowId),
    onSuccess: (result) => {
      console.log('✅ Workflow execution result:', result);
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      if (result.success) {
        setExecutionStatus('success');
        showToast('Workflow executed successfully!', 'success');
        
        // Add execution result to chat messages
        console.log('📊 Execution result data:', result.executionResult);
        if (result.executionResult) {
          const userQuery = messages.find(m => m.role === 'user')?.content;
          console.log('🔍 Attempting to format with user query:', userQuery);
          
          const formattedResult = formatExecutionResult(result.executionResult);
          console.log('📝 Formatted result (first 100 chars):', formattedResult.substring(0, 100));
          
          const executionMessage: Message = {
            id: `execution-${Date.now()}`,
            role: 'assistant',
            content: formattedResult,
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, executionMessage]);
        }
      } else {
        setExecutionStatus('error');
        showToast(`Workflow execution failed: ${result.message || 'Unknown error'}`, 'error');
      }
    },
    onError: (error) => {
      console.error('Workflow execution error:', error);
      setExecutionStatus('error');
      showToast(`Workflow execution error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    },
  });

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Start analysis
    setIsAnalyzing(true);
    setAnalysisStatus(t('orchestration.analyzing'));
    setStatus('idle');
    
    try {
      const result = await aiService.parseIntent(content);
      
      setAnalysisStatus(t('orchestration.generatingWorkflow'));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.status === 'success' 
          ? t('orchestration.workflowGenerated', { count: result.steps.length })
          : t('orchestration.capabilityMissingDesc'),
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setDraftSteps(result.steps);
      setStatus(result.status);
      
      // Smart auto-execute logic
      // Only auto-execute if:
      // 1. User hasn't manually changed the action (first time or default)
      // 2. Auto-execute is enabled (true by default for "execute")
      // 3. Steps were successfully generated
      // 4. The selected action is "execute"
      const shouldAutoExecute = 
        !hasUserChangedAction && 
        autoExecute && 
        result.status === 'success' && 
        result.steps.length > 0 &&
        actionSelection === 'execute';
      
      if (shouldAutoExecute) {
        console.log('🔄 Auto-executing workflow...');
        setTimeout(() => {
          handleAction(actionSelection);
        }, 800); // Slightly longer delay to let user see the steps
      } else if (result.status === 'success' && result.steps.length > 0) {
        // Show a toast message if steps were generated but not auto-executed
        if (actionSelection !== 'execute') {
          showToast(`Workflow generated with ${result.steps.length} steps. Select "${actionSelection}" action to proceed.`, 'info');
        } else if (hasUserChangedAction) {
          showToast(`Workflow generated. Click "Execute Now" to run it.`, 'info');
        }
      }
    } catch (error) {
      console.error('Failed to parse intent:', error);
      setStatus('error');
      
      // Provide more helpful error messages based on error type
      let errorContent = "I encountered an error while trying to process your request. ";
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
          errorContent += "It seems there's a network issue. Please check your connection and try again.";
        } else if (errorMsg.includes('auth') || errorMsg.includes('401') || errorMsg.includes('token')) {
          errorContent += "Authentication issue detected. The system will try to use fallback mode.";
          
          // Try fallback parsing
          try {
            const fallbackResult = await aiService.parseIntent(content);
            if (fallbackResult.status === 'success' && fallbackResult.steps.length > 0) {
              errorContent = "Using fallback mode: I've generated a workflow for you. Review the steps on the right.";
              setDraftSteps(fallbackResult.steps);
              setStatus(fallbackResult.status);
            }
          } catch (fallbackError) {
            console.warn('Fallback also failed:', fallbackError);
          }
        } else if (errorMsg.includes('server') || errorMsg.includes('mcp') || errorMsg.includes('missing')) {
          errorContent += "Required MCP server may not be available. Please ensure the necessary servers are installed and running.";
        } else {
          errorContent += "Please try again or rephrase your request.";
        }
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle the selected action
  const handleAction = (action: 'execute' | 'save' | 'edit') => {
    if (draftSteps.length === 0) return;
    
    const workflowName = messages.find(m => m.role === 'user')?.content.substring(0, 30) || 'AI Generated Workflow';
    const workflowData = {
      id: '',
      name: workflowName,
      description: `Generated from intent: ${messages.find(m => m.role === 'user')?.content}`,
      steps: draftSteps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    switch (action) {
      case 'execute':
        // Save and execute
        saveWorkflowMutation.mutate(workflowData, {
          onSuccess: (savedWorkflow) => {
            setExecutionStatus('executing');
            const workflowId = savedWorkflow.id;
            console.log('Saved workflow object:', savedWorkflow);
            console.log(`Executing workflow with ID: ${workflowId}`);
            if (!workflowId) {
              console.error('Workflow ID is empty! Saved workflow:', savedWorkflow);
              showToast('Failed to save workflow: No workflow ID returned', 'error');
              setExecutionStatus('error');
              return;
            }
            executeWorkflowMutation.mutate(workflowId);
          }
        });
        break;
        
      case 'save':
        // Save only
        saveWorkflowMutation.mutate(workflowData);
        break;
        
      case 'edit':
        // Just keep the steps for editing, no action needed
        showToast('Workflow steps ready for editing', 'info');
        break;
    }
  };

  // Handle action selection change
  const handleActionChange = (action: 'execute' | 'save' | 'edit') => {
    setActionSelection(action);
    setHasUserChangedAction(true);
    
    // Update auto-execute preference based on selection
    if (action === 'execute') {
      setAutoExecute(true);
    } else {
      setAutoExecute(false);
    }
  };

  const handleClear = () => {
    setDraftSteps([]);
    setStatus('idle');
  };

  const handleDeleteStep = (id: string) => {
    setDraftSteps(prev => prev.filter(step => step.id !== id));
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast(prev => ({ ...prev, show: false }));
  };

  // Format execution result for display in chat
  const formatExecutionResult = (executionResult: any): string => {
    if (!executionResult) return t('orchestration.executionComplete');
    
    // Extract user query from messages
    const userQuery = messages.find(m => m.role === 'user')?.content;
    
    // Use the new output formatting system
    try {
      return formatWithNewSystem(executionResult, userQuery);
    } catch (error) {
      console.error('Failed to format execution result with new system:', error);
      return t('orchestration.formattingFailed');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] -m-6 overflow-hidden">
      <div className="flex flex-1 h-full overflow-hidden">
        {/* Left Side: Chat */}
        <div className="w-1/3 min-w-[350px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
          <AIChatPanel 
            onSendMessage={handleSendMessage} 
            messages={messages} 
            isAnalyzing={isAnalyzing}
            statusMessage={analysisStatus}
          />
        </div>
        
        {/* Right Side: Preview */}
        <div className="flex-1 min-w-0">
          <StepPreviewBoard 
            steps={draftSteps} 
            status={status}
            onClear={handleClear}
            onDeleteStep={handleDeleteStep}
            actionSelection={actionSelection}
            onActionChange={handleActionChange}
            onActionExecute={() => handleAction(actionSelection)}
            isExecuting={executionStatus === 'executing'}
          />
        </div>
      </div>

      {/* Execution Status Overlay - Only show for executing, not for success/error */}
      {executionStatus === 'executing' && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
              </div>
               <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('orchestration.executingWorkflow')}</h3>
               <p className="text-gray-600 dark:text-gray-400">
                 {t('orchestration.pleaseWaitWorkflow')}
               </p>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
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
