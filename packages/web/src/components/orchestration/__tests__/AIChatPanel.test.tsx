import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AIChatPanel from '../AIChatPanel';
import { LanguageProvider } from '../../../contexts/LanguageContext';

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <LanguageProvider>
      {component}
    </LanguageProvider>
  );
};

describe('AIChatPanel', () => {
  it('renders correctly', () => {
    renderWithProviders(
      <AIChatPanel onSendMessage={() => {}} messages={[]} isAnalyzing={false} />
    );
    expect(screen.getByPlaceholderText(/Type your intent/i)).toBeInTheDocument();
  });

  it('triggers onSendMessage when form is submitted', () => {
    const onSendMessage = vi.fn();
    renderWithProviders(
      <AIChatPanel onSendMessage={onSendMessage} messages={[]} isAnalyzing={false} />
    );
    
    const input = screen.getByPlaceholderText(/Type your intent/i);
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(onSendMessage).toHaveBeenCalledWith('Hello');
  });

  it('disables input when isAnalyzing is true', () => {
    renderWithProviders(
      <AIChatPanel onSendMessage={() => {}} messages={[]} isAnalyzing={true} />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows messages correctly', () => {
    const messages = [
      { id: '1', role: 'user' as const, content: 'Hello AI' },
      { id: '2', role: 'assistant' as const, content: 'Hello User' }
    ];
    
    renderWithProviders(
      <AIChatPanel onSendMessage={() => {}} messages={messages} isAnalyzing={false} />
    );
    
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByText('Hello User')).toBeInTheDocument();
  });

  it('shows analyzing indicator when isAnalyzing is true', () => {
    renderWithProviders(
      <AIChatPanel onSendMessage={() => {}} messages={[]} isAnalyzing={true} />
    );
    
    expect(screen.getByText(/Analyzing intent|Analyzing intent/i)).toBeInTheDocument();
  });
});