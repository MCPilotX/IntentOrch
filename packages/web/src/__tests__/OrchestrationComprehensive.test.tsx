import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import Orchestration from '../pages/Orchestration';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock apiService (Orchestration uses apiService.executeNaturalLanguage, not aiService)
vi.mock('../services/api', () => ({
  apiService: {
    executeNaturalLanguage: vi.fn(),
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

// Helper to find the send button by its title attribute
const findSendButton = () => {
  const buttons = screen.getAllByRole('button');
  return buttons.find(button => 
    button.getAttribute('title')?.includes('Send')
  );
};

describe('Orchestration page comprehensive scenario test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario1: Complete workflow generation and publishing', () => {
    it('User input intent -> AIParse success -> Generate steps -> Publish workflow', async () => {
      const { apiService } = await import('../services/api');
      // Mock executeNaturalLanguage success
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: true,
        executionSteps: [
          { 
            name: 'list_stars', toolName: 'list_stars', serverName: 'github', 
            success: true, duration: 100,
            arguments: { owner: 'MCPilotX' }
          },
          { 
            name: 'create_page', toolName: 'create_page', serverName: 'notion', 
            success: true, duration: 200,
            arguments: { parent_id: 'auto_detected', title: 'GitHub Stars' }
          }
        ],
        statistics: { totalDuration: 300 },
        result: '✅ **Execution Complete** (2/2 steps successful)',
      });
      (apiService.saveWorkflow as any).mockResolvedValue({ id: 'new-wf-123' });

      renderOrchestration();

      // 1. User input intent
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Sync GitHub stars to Notion' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      // 2. Verify step generation
      // Note: serverName and toolName appear multiple times in StepCard, use getAllByText
      await waitFor(() => {
        const githubElements = screen.getAllByText('github');
        expect(githubElements.length).toBeGreaterThan(0);
        const listStarsElements = screen.getAllByText('list_stars');
        expect(listStarsElements.length).toBeGreaterThan(0);
        const notionElements = screen.getAllByText('notion');
        expect(notionElements.length).toBeGreaterThan(0);
        const createPageElements = screen.getAllByText('create_page');
        expect(createPageElements.length).toBeGreaterThan(0);
      });

      // 3. Verify step count display
      expect(screen.getByText(/2 steps generated/i)).toBeInTheDocument();

      // 4. Click Go button to execute/save
      const goButton = screen.getByRole('button', { name: /Go/i });
      fireEvent.click(goButton);

      // 5. Verify API call
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
    it('User inputs unknown intent -> AIReturns capability missing -> Shows error message', async () => {
      const { apiService } = await import('../services/api');
      // Mock capability missing - handleSendMessage sets status to 'error' when success is false
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: false,
        error: 'Capability not found for the given intent',
        executionSteps: [],
      });

      renderOrchestration();

      // Input unknown intent
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Unknown intent that cannot be satisfied' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      // When success is false, handleSendMessage sets status to 'error'
      // StepPreviewBoard shows error message when status === 'error'
      await waitFor(() => {
        expect(screen.getByText(/Failed to generate workflow/i)).toBeInTheDocument();
      });

      // Verify no steps generated
      expect(screen.queryByText('github')).not.toBeInTheDocument();
      expect(screen.queryByText('list_stars')).not.toBeInTheDocument();
    });
  });

  describe('Scenario3: Error handling', () => {
    it('AIService exception -> Display error message -> User can retry', async () => {
      const { apiService } = await import('../services/api');
      // Mock API exception
      (apiService.executeNaturalLanguage as any).mockRejectedValue(new Error('AI service unavailable'));

      renderOrchestration();

      // Input intent
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Test intent' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      // Verify error information display
      await waitFor(() => {
        expect(screen.getByText(/Failed to generate workflow/i)).toBeInTheDocument();
      });

      // Verify user can re-enter
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });
    });
  });

  describe('Scenario4: Step management', () => {
    it('Generate steps -> Clear all steps', async () => {
      const { apiService } = await import('../services/api');
      // Mock generate multiple steps
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: true,
        executionSteps: [
          { name: 'list_stars', toolName: 'list_stars', serverName: 'github', success: true, duration: 100 },
          { name: 'post_message', toolName: 'post_message', serverName: 'slack', success: true, duration: 100 },
          { name: 'create_page', toolName: 'create_page', serverName: 'notion', success: true, duration: 100 }
        ],
        statistics: { totalDuration: 300 },
        result: '✅ **Execution Complete** (3/3 steps successful)',
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Multi-step workflow' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(/3 steps generated/i)).toBeInTheDocument();
      });

      // Clear all steps - via title property lookup
      const clearButtons = screen.getAllByRole('button');
      const clearButton = clearButtons.find(button => 
        button.getAttribute('title')?.includes('Clear all steps')
      );
      
      if (clearButton) {
        fireEvent.click(clearButton);
      }

      // Verify all steps cleared
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

      const sendButton = findSendButton()!;

      // Initial state should be disabled
      expect(sendButton).toBeDisabled();

      const input = screen.getByPlaceholderText(/Enter your intent/i);

      // Should still be disabled after entering spaces
      fireEvent.change(input, { target: { value: '   ' } });
      expect(sendButton).toBeDisabled();

      // Enabled after entering valid content
      fireEvent.change(input, { target: { value: 'Valid intent' } });
      expect(sendButton).not.toBeDisabled();
    });

    it('During analysis -> Send button disabled', async () => {
      const { apiService } = await import('../services/api');
      // Mock long analysis
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      
      (apiService.executeNaturalLanguage as any).mockImplementation(() => promise);

      renderOrchestration();

      const input = screen.getByPlaceholderText(/Enter your intent/i);
      const sendButton = findSendButton()!;

      // Start analysis
      fireEvent.change(input, { target: { value: 'Test intent' } });
      fireEvent.click(sendButton);

      // Verify during analysis send button disabled
      expect(sendButton).toBeDisabled();

      // Complete analysis
      await act(async () => {
        resolvePromise!({
          success: true,
          executionSteps: [{ name: 'test_tool', toolName: 'test_tool', serverName: 'test', success: true }],
          statistics: { totalDuration: 100 },
          result: '✅ Execution complete',
        });
        await Promise.resolve();
      });

      // Verify analysis complete, button should be enabled when input has content
      fireEvent.change(input, { target: { value: 'New intent' } });
      
      await waitFor(() => {
        expect(sendButton).not.toBeDisabled();
      }, { timeout: 2000 });
    });

    it('When no steps -> Go button disabled', () => {
      renderOrchestration();

      // The Go button should not be visible when there are no steps
      // (it's only rendered when steps.length > 0 in StepPreviewBoard)
      expect(screen.queryByRole('button', { name: /Go/i })).not.toBeInTheDocument();
    });
  });

  describe('Scenario6: Multi-language support', () => {
    it('UI text supports multiple languages', () => {
      renderOrchestration();

      // Verify key elements exist (English)
      expect(screen.getByPlaceholderText(/Enter your intent/i)).toBeInTheDocument();
      expect(screen.getByText(/AI Assistant/i)).toBeInTheDocument();
      
      // Use getAllByText to handle multiple matches
      const workflowTexts = screen.getAllByText(/Generate automation workflows|Use natural language to generate automation workflows/i);
      expect(workflowTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario7: Performance and concurrency test', () => {
    it('Rapid consecutive input -> Correctly handle request queue', async () => {
      const { apiService } = await import('../services/api');
      const resolves: Array<(value: any) => void> = [];

      // Mock async API
      (apiService.executeNaturalLanguage as any).mockImplementation(() => {
        return new Promise(resolve => {
          resolves.push(resolve);
        });
      });

      renderOrchestration();

      const input = screen.getByPlaceholderText(/Enter your intent/i);
      const sendButton = findSendButton()!;

      // Send requests quickly
      fireEvent.change(input, { target: { value: 'First intent' } });
      fireEvent.click(sendButton);

      // Before first request completes, send button should be disabled
      expect(sendButton).toBeDisabled();

      // Resolve first request
      await act(async () => {
        resolves[0]({
          success: true,
          executionSteps: [{ name: 'test_tool', toolName: 'test_tool', serverName: 'test', success: true }],
          statistics: { totalDuration: 100 },
          result: '✅ Execution complete',
        });
        await Promise.resolve();
      });

      // Verify can continue input
      fireEvent.change(input, { target: { value: 'Second intent' } });
      
      await waitFor(() => {
        expect(sendButton).not.toBeDisabled();
      }, { timeout: 2000 });
    });
  });

  describe('Scenario8: Network error handling', () => {
    it('API call failure -> Graceful degradation', async () => {
      const { apiService } = await import('../services/api');
      // Mock API call failure
      (apiService.saveWorkflow as any).mockRejectedValue(new Error('Network error'));

      // Mock executeNaturalLanguage success
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: true,
        executionSteps: [
          { name: 'list_stars', toolName: 'list_stars', serverName: 'github', success: true, duration: 100 }
        ],
        statistics: { totalDuration: 100 },
        result: '✅ **Execution Complete** (1/1 steps successful)',
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Test workflow' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      await waitFor(() => {
        const githubElements = screen.getAllByText('github');
        expect(githubElements.length).toBeGreaterThan(0);
      });

      // Click Go button (will try to save and may fail but won't crash)
      const goButton = screen.getByRole('button', { name: /Go/i });
      fireEvent.click(goButton);

      // Verify app did not crash, still operable
      await waitFor(() => {
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('Scenario9: UI/UX test', () => {
    it('Chat interface shows user and AI messages', async () => {
      const { apiService } = await import('../services/api');
      // Mock executeNaturalLanguage success
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: true,
        executionSteps: [{ name: 'test_tool', toolName: 'test_tool', serverName: 'test', success: true }],
        statistics: { totalDuration: 100 },
        result: "I've generated a workflow for you. The execution completed successfully.",
      });

      renderOrchestration();

      // Send messages
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Hello AI' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      // Verify user messages display
      await waitFor(() => {
        expect(screen.getByText('Hello AI')).toBeInTheDocument();
      });

      // Verify AI response display
      await waitFor(() => {
        expect(screen.getByText(/I've generated a workflow|I have generated a workflow for you/i)).toBeInTheDocument();
      });
    });

    it('Step cards display correct information', async () => {
      const { apiService } = await import('../services/api');
      // Mock generate steps
      (apiService.executeNaturalLanguage as any).mockResolvedValue({
        success: true,
        executionSteps: [
          { 
            name: 'list_stars', toolName: 'list_stars', serverName: 'github', 
            success: true, duration: 100,
            arguments: { owner: 'MCPilotX', limit: 10 }
          }
        ],
        statistics: { totalDuration: 100 },
        result: '✅ **Execution Complete** (1/1 steps successful)',
      });

      renderOrchestration();

      // Generate steps
      const input = screen.getByPlaceholderText(/Enter your intent/i);
      fireEvent.change(input, { target: { value: 'Show GitHub stars' } });
      const sendButton = findSendButton()!;
      fireEvent.click(sendButton);

      // Verify step card display
      await waitFor(() => {
        const githubElements = screen.getAllByText('github');
        expect(githubElements.length).toBeGreaterThan(0);
        const listStarsElements = screen.getAllByText('list_stars');
        expect(listStarsElements.length).toBeGreaterThan(0);
      });
    });
  });
});
