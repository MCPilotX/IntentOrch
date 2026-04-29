import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import Orchestration from '../pages/Orchestration';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock apiService (Orchestration uses apiService.executeNaturalLanguage, not aiService)
vi.mock('../services/api', () => ({
  apiService: {
    executeNaturalLanguage: vi.fn(),
    saveWorkflow: vi.fn().mockResolvedValue({ id: 'new-wf-123' }),
    searchServices: vi.fn().mockResolvedValue({ total: 0, services: [] }),
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

describe('Intelligent Orchestration System Integration', () => {
  it('Scenario A: Full lifecycle from intent to draft generation', async () => {
    // 1. Setup mock response for executeNaturalLanguage
    const { apiService } = await import('../services/api');
    (apiService.executeNaturalLanguage as any).mockResolvedValue({
      success: true,
      executionSteps: [
        { name: 'list_stars', toolName: 'list_stars', serverName: 'github', success: true, duration: 100 }
      ],
      statistics: { totalDuration: 100 },
      result: '✅ **Execution Complete** (1/1 steps successful)\n\n✅ **list_stars** _(100ms)_\n  > Stars listed successfully',
    });

    renderOrchestration();

    // 2. Input intent
    const input = screen.getByPlaceholderText(/Enter your intent/i);
    fireEvent.change(input, { target: { value: 'Sync GitHub' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // 3. Verify draft steps appear
    // Note: serverName and toolName appear multiple times in StepCard, use getAllByText
    await waitFor(() => {
      const githubElements = screen.getAllByText('github');
      expect(githubElements.length).toBeGreaterThan(0);
      const listStarsElements = screen.getAllByText('list_stars');
      expect(listStarsElements.length).toBeGreaterThan(0);
    });
  });

  it('Scenario C: Handle capability missing gracefully', async () => {
    const { apiService } = await import('../services/api');
    // Mock capability missing - handleSendMessage sets status to 'error' when success is false
    (apiService.executeNaturalLanguage as any).mockResolvedValue({
      success: false,
      error: 'Capability not found for the given intent',
      executionSteps: [],
    });

    renderOrchestration();

    const input = screen.getByPlaceholderText(/Enter your intent/i);
    fireEvent.change(input, { target: { value: 'unknown intent' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // When success is false, handleSendMessage sets status to 'error'
    // StepPreviewBoard shows error message when status === 'error'
    await waitFor(() => {
      expect(screen.getByText(/Failed to generate workflow/i)).toBeInTheDocument();
    });
  });
});
