import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import Orchestration from '../pages/Orchestration';
import { aiService } from '../services/ai-service';
import { apiService } from '../services/api';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock services
vi.mock('../services/ai-service', () => ({
  aiService: {
    parseIntent: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  apiService: {
    saveWorkflow: vi.fn(),
    searchServices: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderOrchestration = () => {
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter>
          <Orchestration />
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

describe('Orchestration page comprehensive scenario test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiService.saveWorkflow as any).mockResolvedValue({ id: 'new-wf-123' });
    (apiService.searchServices as any).mockResolvedValue({ total: 0, services: [] });
  });

  describe('Scenario1: Complete workflow generation and publishing', () => {
    it('User input intent -> AIParse success -> Generate steps -> Publish workflow', async () => {
      // MockAIParse success
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'success',
        steps: [
          { 
            id: 'step_1', 
            type: 'tool', 
            serverName: 'github', 
            toolName: 'list_stars', 
            parameters: { owner: 'MCPilotX' } 
          },
          { 
            id: 'step_2', 
            type: 'tool', 
            serverName: 'notion', 
            toolName: 'create_page', 
            parameters: { parent_id: 'auto_detected', title: 'GitHub Stars' } 
          }
        ]
      });

      renderOrchestration();

      // 1. User input intent
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Sync GitHub stars to Notion' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // 2. Verify analysis status
      expect(screen.getByText(/Analyzing intent|Analyzing intent/i)).toBeInTheDocument();

      // 3. Verify step generation
      await waitFor(() => {
        expect(screen.getByText('github')).toBeInTheDocument();
        expect(screen.getByText('list_stars')).toBeInTheDocument();
        expect(screen.getByText('notion')).toBeInTheDocument();
        expect(screen.getByText('create_page')).toBeInTheDocument();
      });

      // 4. Verify step count display
      expect(screen.getByText(/2 steps generated/i)).toBeInTheDocument();

      // 5. Publish workflow - Usemore precise selector
      const publishButton = screen.getByRole('button', { name: /Publish|Publish/i });
      fireEvent.click(publishButton);

      // 6. VerifyAPIcall
      await waitFor(() => {
        expect(apiService.saveWorkflow).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Sync GitHub stars to Notion',
            steps: expect.arrayContaining([
              expect.objectContaining({ serverName: 'github' }),
              expect.objectContaining({ serverName: 'notion' })
            ])
          })
        );
      });
    });
  });

  describe('Scenario2: Capability missing handling', () => {
    it('User inputs unknown intent -> AIReturns capability missing -> Shows capability missing page', async () => {
      // MockCapability missing
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'capability_missing',
        steps: []
      });

      renderOrchestration();

      // Input unknown intent
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Unknown intent that cannot be satisfied' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // VerifyCapability missingpagedisplay
      await waitFor(() => {
        expect(screen.getByText(/Capability Not Found|No matching capability found/i)).toBeInTheDocument();
        expect(screen.getByText(/Submit Tool Request|Submit tool request/i)).toBeInTheDocument();
      });

      // VerifyNo steps generated（butMay have"0 steps generated"text）
      // So we need to check if there are actual step cards
      expect(screen.queryByText('github')).not.toBeInTheDocument();
      expect(screen.queryByText('list_stars')).not.toBeInTheDocument();
    });
  });

  describe('Scenario3: Error handling', () => {
    it('AIService exception -> Display error message -> User can retry', async () => {
      // MockAIService exception
      (aiService.parseIntent as any).mockRejectedValue(new Error('AI service unavailable'));

      renderOrchestration();

      // Input intent
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Test intent' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // VerifyErrorinformation display
      await waitFor(() => {
        expect(screen.getByText(/Failed to generate workflow|Failed to generate workflow/i)).toBeInTheDocument();
      });

      // VerifyUsercan re-enter
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });
    });
  });

  describe('Scenario4: Step management', () => {
    it('Generate steps -> Clear all steps', async () => {
      // MockGenerate multiple steps
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'success',
        steps: [
          { id: 'step_1', type: 'tool', serverName: 'github', toolName: 'list_stars' },
          { id: 'step_2', type: 'tool', serverName: 'slack', toolName: 'post_message' },
          { id: 'step_3', type: 'tool', serverName: 'notion', toolName: 'create_page' }
        ]
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Multi-step workflow' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText(/3 steps generated/i)).toBeInTheDocument();
      });

      // Clear all steps - viatitleproperty lookup
      const clearButtons = screen.getAllByRole('button');
      const clearButton = clearButtons.find(button => 
        button.getAttribute('title')?.includes('Clear all steps') ||
        button.getAttribute('title')?.includes('Clear all steps')
      );
      
      if (clearButton) {
        fireEvent.click(clearButton);
      }

      // VerifyAll steps cleared
      await waitFor(() => {
        expect(screen.queryByText('github')).not.toBeInTheDocument();
        expect(screen.queryByText('slack')).not.toBeInTheDocument();
        expect(screen.queryByText('notion')).not.toBeInTheDocument();
      });
    });
  });

  describe('Scenario5: Boundary condition test', () => {
    it('Empty input -> Send button disabled', () => {
      renderOrchestration();

      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      const sendButton = screen.getByRole('button', { name: '' }); // Send button

      // Initial state should be disabled
      expect(sendButton).toBeDisabled();

      // Should still be disabled after entering spaces
      fireEvent.change(input, { target: { value: '   ' } });
      expect(sendButton).toBeDisabled();

      // Enabled after entering valid content
      fireEvent.change(input, { target: { value: 'Valid intent' } });
      expect(sendButton).not.toBeDisabled();
    });

    it('During analysis -> Send button disabled', async () => {
      // Mocklong analysis
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      (aiService.parseIntent as any).mockImplementation(() => promise);

      renderOrchestration();

      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      const sendButton = screen.getByRole('button', { name: '' });

      // Start analysis
      fireEvent.change(input, { target: { value: 'Test intent' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // VerifyDuring analysisSend button disabled
      expect(sendButton).toBeDisabled();

      // Complete analysis
      await act(async () => {
        resolvePromise!({
          status: 'success',
          steps: [{ id: 'step_1', type: 'tool', serverName: 'test', toolName: 'test_tool' }]
        });
        // Wait for microtask queue to clear
        await Promise.resolve();
      });

      // VerifyAnalysis complete，If input has content，button should be enabled
      // FirstMockUserenter new content
      fireEvent.change(input, { target: { value: 'New intent' } });
      
      // Verifybutton enabled
      await waitFor(() => {
        expect(sendButton).not.toBeDisabled();
      }, { timeout: 2000 });
    });

    it('When no steps -> Publishbutton disabled', () => {
      renderOrchestration();

      // Use more reliable selector：viabuttontextandrole
      const publishButton = screen.getByRole('button', { name: /Publish|Publish/i });
      
      // VerifyPublishbutton disabled
      expect(publishButton).toBeDisabled();
    });
  });

  describe('Scenario6: Multi-language support', () => {
    it('UItextsupports multiple languages', () => {
      renderOrchestration();

      // VerifyKeyCNYelements exist（English orChinese）
      expect(screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i)).toBeInTheDocument();
      expect(screen.getByText(/AI Assistant|AIAssistant/i)).toBeInTheDocument();
      
      // UsegetAllByTexthandle multiple matches
      const workflowTexts = screen.getAllByText(/Generate automation workflows|Usenatural language to generate automation workflows/i);
      expect(workflowTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario7: Performance and concurrency test', () => {
    it('Rapid consecutive input -> Correctly handle request queue', async () => {
      const resolves: Array<(value: any) => void> = [];

      // MockasyncAIparse
      (aiService.parseIntent as any).mockImplementation(() => {
        return new Promise(resolve => {
          resolves.push(resolve);
        });
      });

      renderOrchestration();

      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      const sendButton = screen.getByRole('button', { name: '' });

      // Send requests quickly
      fireEvent.change(input, { target: { value: 'First intent' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // Wait for first request to start processing
      await waitFor(() => {
        expect(screen.getByText(/Analyzing intent|Analyzing intent/i)).toBeInTheDocument();
      });

      // Before first request completes，Send buttonshould be disabled
      expect(sendButton).toBeDisabled();

      // parsefirst request
      await act(async () => {
        resolves[0]({
          status: 'success',
          steps: [{ id: 'step_1', type: 'tool', serverName: 'test', toolName: 'test_tool' }]
        });
        // Wait for microtask queue to clear
        await Promise.resolve();
      });

      // Verifycan continue input - MockUserenter new content
      fireEvent.change(input, { target: { value: 'Second intent' } });
      
      // Verifybutton enabled
      await waitFor(() => {
        expect(sendButton).not.toBeDisabled();
      }, { timeout: 2000 });
    });
  });

  describe('Scenario8: Network error handling', () => {
    it('APIcallFailure -> Graceful degradation', async () => {
      // MockAPIcallFailure
      (apiService.saveWorkflow as any).mockRejectedValue(new Error('Network error'));

      // MockAIParse success
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'success',
        steps: [
          { id: 'step_1', type: 'tool', serverName: 'github', toolName: 'list_stars' }
        ]
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Test workflow' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('github')).toBeInTheDocument();
      });

      // TryPublish（should failbutwill not crash）
      const publishButton = screen.getByRole('button', { name: /Publish|Publish/i });
      fireEvent.click(publishButton);

      // Verifyapp did not crash，still operable
      await waitFor(() => {
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('Scenario9: UI/UXtest', () => {
    it('Chat interface shows user andAImessages', async () => {
      // MockAIParse success
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'success',
        steps: [{ id: 'step_1', type: 'tool', serverName: 'test', toolName: 'test_tool' }]
      });

      renderOrchestration();

      // Sendmessages
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Hello AI' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // VerifyUsermessagesdisplay
      await waitFor(() => {
        expect(screen.getByText('Hello AI')).toBeInTheDocument();
      });

      // VerifyAIresponse display
      await waitFor(() => {
        expect(screen.getByText(/I've generated a workflow|I have generated a workflow for you/i)).toBeInTheDocument();
      });
    });

    it('Step cards display correct information', async () => {
      // MockGenerate steps
      (aiService.parseIntent as any).mockResolvedValue({
        status: 'success',
        steps: [
          { 
            id: 'step_1', 
            type: 'tool', 
            serverName: 'github', 
            toolName: 'list_stars',
            parameters: { owner: 'MCPilotX', limit: 10 }
          }
        ]
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
      fireEvent.change(input, { target: { value: 'Show GitHub stars' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      // VerifyStep carddisplay
      await waitFor(() => {
        expect(screen.getByText('github')).toBeInTheDocument();
        expect(screen.getByText('list_stars')).toBeInTheDocument();
        expect(screen.getByText(/Step 1/i)).toBeInTheDocument();
        expect(screen.getByText(/TOOL/i)).toBeInTheDocument();
      });
    });
  });
});