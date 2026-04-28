import { logger } from "../core/logger";
import { WorkflowContext } from './types';
import lodash from 'lodash';
import jexl from 'jexl';

// Add length transform to Jexl
jexl.addTransform('length', (val: any) => {
  if (Array.isArray(val) || typeof val === 'string') return val.length;
  if (typeof val === 'object' && val !== null) return Object.keys(val).length;
  return 0;
});

export class ExpressionEvaluator {
  static resolve(value: any, context: WorkflowContext): any {
    // 1. If it's a direct reference like "{{input.name}}", return the actual type (not just string)
    // Priority: Single interpolation should preserve type
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const inner = value.slice(2, -2).trim();
      // Check if there are NO other {{ or }} inside to ensure it's a single expression
      if (!inner.includes('{{') && !inner.includes('}}')) {
        const path = inner;
        if (path.startsWith('input.')) return context.inputs[path.slice(6)];
        if (path.startsWith('secret.')) return context.secrets[path.slice(7)];
        return lodash.get(context.state, path);
      }
    }

    // 2. Handle multiple interpolations or partial strings - results in a string
    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
      return value.replace(/\{\{(.+?)\}\}/g, (_, expression) => {
        const path = expression.trim();
        
        let resolvedValue: any;
        if (path.startsWith('input.')) {
          resolvedValue = context.inputs[path.slice(6)];
        } else if (path.startsWith('secret.')) {
          resolvedValue = context.secrets[path.slice(7)];
        } else {
          resolvedValue = lodash.get(context.state, path);
        }
        
        return resolvedValue ?? '';
      });
    }

    if (Array.isArray(value)) {
      return value.map(v => this.resolve(v, context));
    }

    if (typeof value === 'object' && value !== null) {
      const resolved: any = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolve(v, context);
      }
      return resolved;
    }

    return value;
  }

  static async evaluateCondition(condition: string, context: WorkflowContext): Promise<boolean> {
    // If it's wrapped in {{ }}, remove them for Jexl evaluation
    let expr = condition;
    if (expr.startsWith('{{') && expr.endsWith('}}')) {
      expr = expr.slice(2, -2).trim();
    }

    // Create a unified evaluation context for Jexl
    const evalContext = {
      input: context.inputs,
      secret: context.secrets,
      ...context.state
    };

    try {
      return await jexl.eval(expr, evalContext);
    } catch (e) {
      logger.warn(`Failed to evaluate condition "${expr}":`, e);
      return false;
    }
  }
}
