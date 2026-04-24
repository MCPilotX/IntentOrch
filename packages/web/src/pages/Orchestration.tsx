import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AIChatPanel from '../components/orchestration/AIChatPanel';
import StepPreviewBoard from '../components/orchestration/StepPreviewBoard';
import { Toast } from '../components/ui';
import { aiService } from '../services/ai-service'; // Use enhanced AI service
import { apiService } from '../services/api';

import { useOutputFormatting, useAuthHeaders } from '../hooks';

import { useLanguage } from '../contexts/LanguageContext';
import type { WorkflowStep, Workflow, UserGuidanceMessage, UserFeedbackResponse, InteractiveSession } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  metadata?: {
    isInteractive?: boolean;
    guidance?: any;
    requiresResponse?: boolean;
    interactiveType?: 'server_selection' | 'tool_selection';
    servers?: any[];
    tools?: any[];
    query?: string;
    selectedServer?: any;
    initialResult?: any;
  };
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

  // Interactive session state
  const [interactiveSession, setInteractiveSession] = useState<{
    sessionId: string | null;
    guidance: UserGuidanceMessage | null;
    isActive: boolean;
  }>({
    sessionId: null,
    guidance: null,
    isActive: false,
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

  // Authentication headers hook
  const { getAuthHeaders } = useAuthHeaders();

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

  const handleSendMessage = async (content: string) => {
    // Start analysis
    setIsAnalyzing(true);
    setAnalysisStatus(t('orchestration.analyzing'));
    setStatus('idle');
    
    try {
      // Check if we're in an interactive session
      if (interactiveSession.isActive && interactiveSession.sessionId) {
        // Process as feedback in existing interactive session
        // Note: handleInteractiveFeedback will add the user message
        await handleInteractiveFeedback(content);
        return;
      }
      
      // Add user message for non-interactive sessions
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Try traditional intent parsing first
      const result = await aiService.parseIntent(content);

      // Check if we should show steps directly (even if confidence is not perfect)
      const hasValidSteps = result.status === 'success' && result.steps && result.steps.length > 0;
      const confidence = result.confidence || 0;

      // New strategy: if we have steps and reasonable confidence, show them!
      // This matches CLI behavior where we prioritize results over nagging questions
      if (hasValidSteps && confidence >= 0.55) {
        console.log(`[Orchestration] Result confidence ${confidence} is good enough, showing steps directly`);
        setDraftSteps(result.steps);
        setStatus(result.status);

        // Add helpful assistant message
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `I've analyzed your request and prepared a workflow with ${result.steps.length} steps. You can review and execute it from the right panel.`,
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMessage]);
        return;
      }

      // If no steps or very low confidence, use interactive mode
      const shouldUseInteractive =
        confidence < 0.55 || // Very low confidence
        result.status === 'partial' || // Partial success
        result.status === 'capability_missing'; // Capability missing
      if (shouldUseInteractive) {
        // Start IMPROVED interactive session for low confidence, partial success, or capability missing
        // User's suggestion: list relevant services for user to choose
        await startImprovedInteractiveSession(content, result);
        return;
      }
      
      // Use traditional parsing result
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
        
        // Execute the already-parsed steps directly (no re-parsing)
        // This ensures the executed steps are exactly what the user saw in preview
        // and produces the same result format as CLI run command
        try {
          console.log('🔄 Executing pre-parsed steps directly (no re-parsing)...');
          const result = await aiService.executeSteps(draftSteps, {
            autoStart: true,
            silent: true,
          });
          
          console.log('✅ Steps execution result:', result);
          
          if (result.success) {
            setExecutionStatus('success');
            showToast('Workflow executed successfully!', 'success');
            
            // Format and display the execution result
            const formattedResult = formatExecutionResult(result);
            
            const executionMessage: Message = {
              id: `execution-${Date.now()}`,
              role: 'assistant',
              content: formattedResult,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, executionMessage]);
          } else {
            setExecutionStatus('error');
            showToast(`Workflow execution failed: ${result.error || 'Unknown error'}`, 'error');
            
            const errorMessage: Message = {
              id: `execution-error-${Date.now()}`,
              role: 'assistant',
              content: `❌ Execution failed: ${result.error || 'Unknown error'}`,
              timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
          }
        } catch (error: any) {
          console.error('❌ Steps execution failed:', error);
          setExecutionStatus('error');
          showToast(`Workflow execution error: ${error.message || 'Unknown error'}`, 'error');
        }

        
        // Also save the workflow for future reference (don't block on this)
        saveWorkflowMutation.mutate(workflowData, {
          onError: (saveError) => {
            console.warn('Failed to save workflow (non-critical):', saveError);
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

  // Improved interactive session functions
  const startImprovedInteractiveSession = async (query: string, initialResult?: any) => {
    try {
      setAnalysisStatus('Starting improved interactive session...');
      
      // Step 1: Get available MCP servers for user selection
      const headers = await getAuthHeaders();
      
      // Get available servers - handle different response formats
      const serversResponse = await fetch('http://localhost:9658/api/servers', {
        method: 'GET',
        headers,
      });
      
      if (!serversResponse.ok) {
        throw new Error(`Failed to get servers: ${serversResponse.status}`);
      }
      
      const serversData = await serversResponse.json();
      console.log('Servers API response:', serversData);
      
      // Handle different response formats
      let servers = [];
      if (Array.isArray(serversData)) {
        servers = serversData;
      } else if (serversData && Array.isArray(serversData.data)) {
        servers = serversData.data;
      } else if (serversData && serversData.servers && Array.isArray(serversData.servers)) {
        servers = serversData.servers;
      } else {
        console.warn('Unexpected servers response format:', serversData);
        // Try to extract servers from the response object
        servers = Object.values(serversData).filter((item: any) => 
          item && typeof item === 'object' && item.name
        );
      }
      
      console.log('Available servers for user selection:', servers);
      
      // Filter relevant servers based on query keywords
      // Universal platform approach: no service-specific logic
      // Use generic keyword matching that works for ANY MCP service
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/[\s,，、]+/).filter(w => w.length > 0);
      
      // Extract meaningful keywords from query (skip common stop words)
      const stopWords = ['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'might', 'shall', 'should', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'then', 'it', 'its'];
      const keywords = queryWords.filter(w => w.length > 1 && !stopWords.includes(w));
      
      // Score each server based on keyword matching against name, type, description, and tags
      const scoredServers = servers.map((server: any) => {
        let score = 0;
        const serverName = (server.name || '').toLowerCase();
        const serverType = (server.type || '').toLowerCase();
        const serverDesc = (server.description || '').toLowerCase();
        const serverTags = (server.tags || []).map((t: string) => t.toLowerCase());
        const serverCapabilities = (server.capabilities || []).map((c: string) => c.toLowerCase());
        
        // Combine all server text for matching
        const serverText = [serverName, serverType, serverDesc, ...serverTags, ...serverCapabilities].join(' ');
        
        // Score each keyword
        for (const keyword of keywords) {
          if (serverText.includes(keyword)) {
            score += 2; // Direct keyword match
          }
          // Check if keyword is a substring of any server text part
          if (serverName.includes(keyword) || serverType.includes(keyword)) {
            score += 3; // Name/type match is more important
          }
        }
        
        // Also check if query words partially match server capabilities
        for (const word of queryWords) {
          if (word.length > 2 && serverText.includes(word)) {
            score += 1;
          }
        }
        
        return { server, score };
      });
      
      // Sort by score descending, include all servers but highlight relevant ones
      scoredServers.sort((a: any, b: any) => b.score - a.score);
      
      // Include all servers (user can choose any), but mark relevance
      const relevantServers = scoredServers.map((item: any) => ({
        ...item.server,
        _relevanceScore: item.score,
        _isRelevant: item.score > 0
      }));
      
      console.log('Server relevance scores:', scoredServers.map((s: any) => ({ name: s.server.name, score: s.score })));

      
      // Create interactive message with server options
      const confidencePercent = initialResult?.confidence ? `${Math.round(initialResult.confidence * 100)}%` : 'Low';
      let serverOptionsMessage = `🔍 **Improved Interactive Session**

      **Your Query:** "${query}"
      **Initial Confidence:** ${confidencePercent}

      📋 **Step 1: Select Relevant MCP Server**

      I need your help to select the right MCP server for your request. Please choose one:`;

      relevantServers.forEach((server: any, index: number) => {
        const description = server.description || server.type || 'Standard MCP Server';
        serverOptionsMessage += `\n${index + 1}. **${server.name}** (${description}) - ${server.status}`;
      });

      serverOptionsMessage += `\n\n**Or type:** "skip" to let the system choose automatically`;
      // Add the interactive message to chat
      const serverSelectionMessage: Message = {
        id: `server-selection-${Date.now()}`,
        role: 'assistant',
        content: serverOptionsMessage,
        metadata: {
          isInteractive: true,
          interactiveType: 'server_selection',
          servers: relevantServers,
          query: query,
          initialResult: initialResult,
        },
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, serverSelectionMessage]);
      
      // Update interactive session state
      setInteractiveSession({
        sessionId: `server-selection-${Date.now()}`,
        guidance: {
          type: 'clarification_request', // Required by UserGuidanceMessage
          message: serverOptionsMessage,
          requiresResponse: true,
          timestamp: new Date(), // Required by UserGuidanceMessage
          // Store interactiveType in options
          options: [{
            id: 'interactive_type',
            label: 'server_selection',
            value: 'server_selection'
          }]
        },
        isActive: true,
      });
      
    } catch (error) {
      console.error('Failed to start improved interactive session:', error);
      showToast('Failed to start interactive session. Using traditional mode.', 'error');
      
      // Fallback to traditional parsing
      try {
        console.log('Attempting fallback to traditional parsing for query:', query);
        const fallbackResult = await aiService.parseIntent(query);
        console.log('Fallback parsing result:', fallbackResult);
        handleTraditionalParsingResult(fallbackResult);
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError);
        showToast('Both interactive and traditional parsing failed. Please try again.', 'error');
        
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `I encountered an error while processing your request. Please try again or rephrase your query. Error: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    }
  };

  const handleInteractiveFeedback = async (userResponse: string) => {
    if (!interactiveSession.sessionId) return;
    
    try {
      setIsAnalyzing(true);
      setAnalysisStatus('Processing your response...');
      
      // Get the last interactive message to understand context
      const lastMessage = messages[messages.length - 1];
      const interactiveType = lastMessage.metadata?.interactiveType;
      
      // Add user response to chat
      const userMessage: Message = {
        id: `feedback-${Date.now()}`,
        role: 'user',
        content: userResponse,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Handle different interactive types
      if (interactiveType === 'server_selection') {
        await handleServerSelectionResponse(userResponse, lastMessage);
      } else if (interactiveType === 'tool_selection') {
        await handleToolSelectionResponse(userResponse, lastMessage);
      } else {
        // Legacy interactive session handling
        await handleLegacyInteractiveFeedback(userResponse);
      }
      
    } catch (error) {
      console.error('Failed to process interactive feedback:', error);
      showToast('Failed to process your response. Please try again.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  // Handle server selection response
  const handleServerSelectionResponse = async (userResponse: string, lastMessage: Message) => {
    const servers = lastMessage.metadata?.servers || [];
    const query = lastMessage.metadata?.query;
    const initialResult = lastMessage.metadata?.initialResult;
    
    let selectedServer = null;
    
    // Parse user response
    const responseLower = userResponse.toLowerCase().trim();
    
    if (responseLower === 'skip') {
      // User wants system to choose automatically
      selectedServer = servers[0]; // Choose first server as default
    } else {
      // Try to parse server number or name
      const serverNumber = parseInt(responseLower);
      if (!isNaN(serverNumber) && serverNumber >= 1 && serverNumber <= servers.length) {
        selectedServer = servers[serverNumber - 1];
      } else {
        // Try to match by server name
        selectedServer = servers.find(server => 
          server.name.toLowerCase().includes(responseLower) ||
          server.type.toLowerCase().includes(responseLower)
        );
      }
    }
    
    if (!selectedServer) {
      // No valid server selected, ask again
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I couldn't identify which server you selected. Please choose a number (1-${servers.length}) or type the server name.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    // Show server selection confirmation
    const confirmationMessage: Message = {
      id: `confirmation-${Date.now()}`,
      role: 'assistant',
      content: `✅ **Server Selected:** ${selectedServer.name} (${selectedServer.type})

Now I'll parse your query again with this server context and show you the available tools.`,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, confirmationMessage]);
    
    // Step 2: Get tools for selected server and show tool selection
    await showToolSelection(query, selectedServer, initialResult);
  };
  
  // Show tool selection after server is selected
  const showToolSelection = async (query: string, selectedServer: any, initialResult?: any) => {
    try {
      const headers = await getAuthHeaders();
      
      // Get tools for the selected server - handle different ID field names
      const serverId = selectedServer.id || selectedServer._id || selectedServer.serverId || selectedServer.name;
      if (!serverId) {
        throw new Error('Server ID not found in server object');
      }
      
      const toolsResponse = await fetch(`http://localhost:9658/api/servers/${serverId}/tools`, {
        method: 'GET',
        headers,
      });
      
      if (!toolsResponse.ok) {
        throw new Error(`Failed to get tools: ${toolsResponse.status}`);
      }
      
      const tools = await toolsResponse.json();
      console.log('Available tools for server:', tools);
      
      if (!tools || tools.length === 0) {
        const noToolsMessage: Message = {
          id: `no-tools-${Date.now()}`,
          role: 'assistant',
          content: `The selected server "${selectedServer.name}" doesn't have any available tools. Please select a different server.`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, noToolsMessage]);
        return;
      }
      
      // Create tool selection message
      let toolOptionsMessage = `🔧 **Step 2: Select Tool for "${selectedServer.name}"**

Available tools for this server:`;
      
      tools.forEach((tool: any, index: number) => {
        toolOptionsMessage += `\n${index + 1}. **${tool.name}** - ${tool.description || 'No description'}`;
        if (tool.parameters) {
          toolOptionsMessage += `\n   Parameters: ${JSON.stringify(tool.parameters)}`;
        }
      });
      
      toolOptionsMessage += `\n\n**Please choose a tool number or type "auto" to let the system choose automatically.**`;
      
      const toolSelectionMessage: Message = {
        id: `tool-selection-${Date.now()}`,
        role: 'assistant',
        content: toolOptionsMessage,
        metadata: {
          isInteractive: true,
          interactiveType: 'tool_selection',
          tools: tools,
          query: query,
          selectedServer: selectedServer,
          initialResult: initialResult,
        },
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, toolSelectionMessage]);
      
      // Update interactive session state
      setInteractiveSession(prev => ({
        ...prev,
        guidance: {
          type: 'clarification_request',
          message: toolOptionsMessage,
          requiresResponse: true,
          timestamp: new Date(),
          options: [{
            id: 'interactive_type',
            label: 'tool_selection',
            value: 'tool_selection'
          }]
        },
      }));
      
    } catch (error) {
      console.error('Failed to get tools:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Failed to get tools for server "${selectedServer.name}". Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };
  
  // Handle tool selection response
  const handleToolSelectionResponse = async (userResponse: string, lastMessage: Message) => {
    const tools = lastMessage.metadata?.tools || [];
    const query = lastMessage.metadata?.query;
    const selectedServer = lastMessage.metadata?.selectedServer;
    const initialResult = lastMessage.metadata?.initialResult;
    
    let selectedTool = null;
    
    // Parse user response
    const responseLower = userResponse.toLowerCase().trim();
    
    if (responseLower === 'auto') {
      // User wants system to choose automatically
      selectedTool = tools[0]; // Choose first tool as default
    } else {
      // Try to parse tool number
      const toolNumber = parseInt(responseLower);
      if (!isNaN(toolNumber) && toolNumber >= 1 && toolNumber <= tools.length) {
        selectedTool = tools[toolNumber - 1];
      } else {
        // Try to match by tool name
        selectedTool = tools.find(tool => 
          tool.name.toLowerCase().includes(responseLower)
        );
      }
    }
    
    if (!selectedTool) {
      // No valid tool selected, ask again
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I couldn't identify which tool you selected. Please choose a number (1-${tools.length}) or type the tool name.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }
    
    // Show tool selection confirmation
    const confirmationMessage: Message = {
      id: `confirmation-${Date.now()}`,
      role: 'assistant',
      content: `✅ **Tool Selected:** ${selectedTool.name}
✅ **Server:** ${selectedServer.name}

Now I'll execute your query with high confidence!`,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, confirmationMessage]);
    
    // Step 3: Execute with high confidence
    await executeWithHighConfidence(query, selectedServer, selectedTool, initialResult);
  };
  
  // Execute with high confidence after user selections
  const executeWithHighConfidence = async (query: string, selectedServer: any, selectedTool: any, initialResult?: any) => {
    try {
      setAnalysisStatus('Preparing high confidence execution...');
      
      // Create a workflow step based on user selections
      // Note: WorkflowStep interface doesn't have 'name', 'description', 'tool', or 'status' properties
      // We need to adapt to the actual interface
      const workflowStep: WorkflowStep = {
        id: `step-${Date.now()}`,
        type: 'tool', // Use 'tool' type since we're executing a tool
        serverName: selectedServer.name,
        toolName: selectedTool.name,
        parameters: {}, // Would need to collect parameters in a real implementation
        // Note: 'name', 'description', and 'status' are not part of WorkflowStep interface
        // We'll store them in parameters for now
      };
      
      // Store additional metadata in parameters since WorkflowStep interface is limited
      (workflowStep.parameters as any) = {
        ...workflowStep.parameters,
        _metadata: {
          name: `Execute: ${selectedTool.name}`,
          description: `Execute "${selectedTool.name}" on "${selectedServer.name}" for query: "${query}"`,
          status: 'pending',
          originalTool: selectedTool.name,
        }
      };
      
      setDraftSteps([workflowStep]);
      setStatus('success');
      
      // Show success message
      const successMessage: Message = {
        id: `success-${Date.now()}`,
        role: 'assistant',
        content: `🎯 **High Confidence Execution Ready**

Your query has been successfully configured with:
- **Server:** ${selectedServer.name}
- **Tool:** ${selectedTool.name}
- **Confidence:** High (user-guided selection)

✅ **Auto-executing now** (confidence is fully normal after user guidance)`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, successMessage]);
      
      // Reset interactive session
      setInteractiveSession({
        sessionId: null,
        guidance: null,
        isActive: false,
      });
      
      showToast('Interactive configuration complete! Auto-executing with high confidence.', 'success');
      
      // User's suggestion: "直到置信度完全正常后直接执行"
      // Since user has manually selected both server and tool, confidence is now high
      // Auto-execute immediately
      setTimeout(() => {
        console.log('🔄 Auto-executing with high confidence after user guidance...');
        handleAction('execute');
      }, 1500); // Give user time to read the message
      
    } catch (error) {
      console.error('Failed to execute with high confidence:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Failed to prepare execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };
  
  // Legacy interactive session handling (for backward compatibility)
  const handleLegacyInteractiveFeedback = async (userResponse: string) => {
    const headers = await getAuthHeaders();
    
    // Create feedback response
    const feedbackResponse: UserFeedbackResponse = {
      type: 'parameter_value',
      parameterName: 'user_input',
      value: userResponse,
      timestamp: new Date(),
    };
    
    // Send feedback to API
    const response = await fetch(`http://localhost:9658/api/execute/interactive/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: interactiveSession.sessionId,
        response: feedbackResponse,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to process feedback: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Feedback processed successfully:', result);
      
      // Update session state
      setInteractiveSession(prev => ({
        ...prev,
        guidance: result.guidance || null,
      }));
      
      // Add guidance message if available
      if (result.guidance) {
        console.log('Adding guidance message:', result.guidance);
        const guidanceMessage: Message = {
          id: `guidance-${Date.now() + 1}`,
          role: 'assistant',
          content: result.guidance.message,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, guidanceMessage]);
      }
      
      // Check if ready for execution
      if (result.readyForExecution && result.session) {
        console.log('Session ready for execution:', result.session);
        await executeInteractiveSession(result.session);
      }
    } else {
      console.error('Feedback processing failed:', result.error);
      throw new Error(result.error || 'Failed to process feedback');
    }
  };

  const executeInteractiveSession = async (session: InteractiveSession) => {
    try {
      setAnalysisStatus('Executing workflow...');
      
      // Get authentication headers
      const headers = await getAuthHeaders();
      
      const response = await fetch(`http://localhost:9658/api/execute/interactive/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: session.sessionId,
          options: {
            simulate: false,
            autoStart: true,
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to execute session: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Add execution result to chat
        const executionMessage: Message = {
          id: `execution-${Date.now()}`,
          role: 'assistant',
          content: `Workflow executed successfully! Result: ${JSON.stringify(result.result, null, 2)}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, executionMessage]);
        
        // Reset interactive session
        setInteractiveSession({
          sessionId: null,
          guidance: null,
          isActive: false,
        });
        
        showToast('Interactive workflow executed successfully!', 'success');
      } else {
        throw new Error(result.error || 'Failed to execute session');
      }
    } catch (error) {
      console.error('Failed to execute interactive session:', error);
      showToast('Failed to execute workflow. Please try again.', 'error');
    }
  };

  const handleTraditionalParsingResult = (result: any) => {
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
      }, 800);
    } else if (result.status === 'success' && result.steps.length > 0) {
      if (actionSelection !== 'execute') {
        showToast(`Workflow generated with ${result.steps.length} steps. Select "${actionSelection}" action to proceed.`, 'info');
      } else if (hasUserChangedAction) {
        showToast(`Workflow generated. Click "Execute Now" to run it.`, 'info');
      }
    }
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
