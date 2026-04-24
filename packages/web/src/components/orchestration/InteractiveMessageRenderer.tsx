import React, { useState } from 'react';
import { Bot, Check, X, HelpCircle, Calendar, MapPin } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { UserGuidanceMessage, MissingParameter } from '../../types';

interface InteractiveMessageRendererProps {
  guidance: UserGuidanceMessage;
  onResponse: (response: any) => void;
}

const InteractiveMessageRenderer: React.FC<InteractiveMessageRendererProps> = ({ 
  guidance, 
  onResponse 
}) => {
  const { t } = useLanguage();
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleParameterChange = (parameterName: string, value: any) => {
    setParameterValues(prev => ({
      ...prev,
      [parameterName]: value,
    }));
  };

  const handleSubmit = () => {
    if (guidance.type === 'parameter_request' && guidance.parameters) {
      // Submit parameter values
      guidance.parameters.forEach(param => {
        if (param.required && !parameterValues[param.parameterName]) {
          // Use suggestion if available
          if (param.suggestions && param.suggestions.length > 0) {
            parameterValues[param.parameterName] = param.suggestions[0];
          }
        }
      });

      const response = {
        type: 'parameter_value' as const,
        parameters: parameterValues,
        timestamp: new Date(),
      };
      onResponse(response);
    } else if (guidance.type === 'confirmation_request' && guidance.options) {
      // Submit confirmation
      const response = {
        type: 'confirmation' as const,
        confirmed: selectedOption === 'confirm',
        timestamp: new Date(),
      };
      onResponse(response);
    } else if (guidance.type === 'clarification_request') {
      // Submit clarification
      const response = {
        type: 'clarification' as const,
        clarification: parameterValues['clarification'] || '',
        timestamp: new Date(),
      };
      onResponse(response);
    }
  };

  const getIconForParameter = (parameterName: string) => {
    const lowerName = parameterName.toLowerCase();
    if (lowerName.includes('date') || lowerName.includes('time')) {
      return <Calendar className="w-4 h-4" />;
    } else if (lowerName.includes('location') || lowerName.includes('address') || lowerName.includes('city')) {
      return <MapPin className="w-4 h-4" />;
    } else {
      return <HelpCircle className="w-4 h-4" />;
    }
  };

  const renderParameterInput = (parameter: MissingParameter) => {
    const value = parameterValues[parameter.parameterName] || parameter.currentValue || '';
    
    if (parameter.suggestions && parameter.suggestions.length > 0) {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {parameter.suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleParameterChange(parameter.parameterName, suggestion)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  value === suggestion
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => handleParameterChange(parameter.parameterName, e.target.value)}
            placeholder={`Enter ${parameter.parameterName}...`}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => handleParameterChange(parameter.parameterName, e.target.value)}
        placeholder={`Enter ${parameter.parameterName}...`}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    );
  };

  const renderConfirmationOptions = () => {
    if (!guidance.options) return null;

    return (
      <div className="space-y-3">
        {guidance.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelectedOption(option.id)}
            className={`w-full p-3 text-left rounded-lg border transition-all ${
              selectedOption === option.id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {option.description}
                  </div>
                )}
              </div>
              {selectedOption === option.id && (
                <Check className="w-5 h-5 text-primary-500" />
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderClarificationInput = () => {
    return (
      <div className="space-y-2">
        <textarea
          value={parameterValues['clarification'] || ''}
          onChange={(e) => handleParameterChange('clarification', e.target.value)}
          placeholder="Please provide more details or clarify your request..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
        />
      </div>
    );
  };

  const isSubmitDisabled = () => {
    if (guidance.type === 'parameter_request' && guidance.parameters) {
      return guidance.parameters.some(
        param => param.required && !parameterValues[param.parameterName]
      );
    } else if (guidance.type === 'confirmation_request') {
      return !selectedOption;
    } else if (guidance.type === 'clarification_request') {
      return !parameterValues['clarification'];
    }
    return false;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4">
      {/* Message header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
          <Bot className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
            {guidance.message}
          </div>
        </div>
      </div>

      {/* Interactive content */}
      <div className="space-y-4">
        {guidance.type === 'parameter_request' && guidance.parameters && (
          <div className="space-y-4">
            {guidance.parameters.map((parameter) => (
              <div key={parameter.parameterName} className="space-y-2">
                <div className="flex items-center gap-2">
                  {getIconForParameter(parameter.parameterName)}
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    {parameter.parameterName}
                    {parameter.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                </div>
                {parameter.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {parameter.description}
                  </p>
                )}
                {renderParameterInput(parameter)}
                {parameter.validationError && (
                  <p className="text-xs text-red-500">{parameter.validationError}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {guidance.type === 'confirmation_request' && renderConfirmationOptions()}

        {guidance.type === 'clarification_request' && renderClarificationInput()}

        {guidance.type === 'suggestion' && guidance.options && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Suggested options:
            </p>
            <div className="flex flex-wrap gap-2">
              {guidance.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    const response = {
                      type: 'parameter_value' as const,
                      parameterName: 'suggestion',
                      value: option.value,
                      timestamp: new Date(),
                    };
                    onResponse(response);
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            const response = {
              type: 'cancellation' as const,
              timestamp: new Date(),
            };
            onResponse(response);
          }}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled()}
          className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
        >
          {guidance.type === 'confirmation_request' ? 'Confirm' : 'Submit'}
        </button>
      </div>
    </div>
  );
};

export default InteractiveMessageRenderer;