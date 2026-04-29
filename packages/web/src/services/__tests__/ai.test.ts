import { describe, it, expect, vi } from 'vitest';
import { aiService } from '../ai-service';

// Mock apiService (aiService.parseIntent delegates to apiService.parseIntent)
vi.mock('../api', () => ({
  apiService: {
    parseIntent: vi.fn(),
  },
}));

describe('aiService.parseIntent', () => {
  it('should parse user intent into workflow steps', async () => {
    const { apiService } = await import('../api');
    (apiService.parseIntent as any).mockResolvedValue({
      status: 'success',
      steps: [
        { id: 'step_1', type: 'tool', serverName: 'github', toolName: 'list_stars', parameters: {} }
      ]
    });

    const intent = 'Sync GitHub stars to Notion';
    const result = await aiService.parseIntent(intent);
    expect(result.steps).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.status).toBe('success');
  });

  it('should return capability_missing if intent cannot be satisfied', async () => {
    const { apiService } = await import('../api');
    (apiService.parseIntent as any).mockResolvedValue({
      status: 'capability_missing',
      steps: []
    });

    const intent = 'Make me a coffee';
    const result = await aiService.parseIntent(intent);
    expect(result.status).toBe('capability_missing');
    expect(result.steps).toHaveLength(0);
  });
});
