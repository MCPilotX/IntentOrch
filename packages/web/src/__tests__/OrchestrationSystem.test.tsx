import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import Orchestration from '../pages/Orchestration';
import { aiService } from '../services/ai-service';
import { LanguageProvider } from '../contexts/LanguageContext';

// Mock services
vi.mock('../services/ai-service', () => ({
  aiService: {
    parseIntent: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  apiService: {
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
    // 1. Setup mock response
    (aiService.parseIntent as any).mockResolvedValue({
      status: 'success',
      steps: [
        { id: 'step_1', type: 'tool', serverName: 'github', toolName: 'list_stars', parameters: {} }
      ]
    });

    renderOrchestration();

    // 2. Input intent
    const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
    fireEvent.change(input, { target: { value: 'Sync GitHub' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // 3. Verify analyzing state
    expect(screen.getByText(/Analyzing intent|Analyzing intent/i)).toBeInTheDocument();

    // 4. Verify draft steps appear
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
      expect(screen.getByText('list_stars')).toBeInTheDocument();
    });
  });

  it('Scenario C: Handle capability missing gracefully', async () => {
    (aiService.parseIntent as any).mockResolvedValue({
      status: 'capability_missing',
      steps: []
    });

    renderOrchestration();

    const input = screen.getByPlaceholderText(/Type your intent|Enter your automation needs/i);
    fireEvent.change(input, { target: { value: 'unknown intent' } });
    fireEvent.submit(screen.getByRole('button', { name: '' })); // The send button

    await waitFor(() => {
      expect(screen.getByText(/Capability Not Found|No matching capability found/i)).toBeInTheDocument();
      expect(screen.getByText(/Submit Tool Request|Submit tool request/i)).toBeInTheDocument();
    });
  });
});
