import React, { useMemo, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
// Ensure d3-transition is loaded to patch selection.prototype.interrupt
// This prevents "selection.interrupt is not a function" error from d3-zoom
import 'd3-transition';
import type { Workflow, WorkflowStep } from '../../types';

interface WorkflowVisualizerProps {
  workflow: Workflow;
  onStepClick?: (step: WorkflowStep) => void;
}

const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({ workflow, onStepClick }) => {
  // Convert workflow steps to React Flow nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // Start node
    nodes.push({
      id: 'start',
      type: 'input',
      data: { label: 'Start' },
      position: { x: 250, y: 0 },
      style: { background: '#10b981', color: '#fff', borderRadius: '8px', padding: '10px' }
    });

    let currentY = 100;
    
    workflow.steps.forEach((step, index) => {
      const nodeId = step.id || `step-${index}`;
      
      // Node label
      const label = (
        <div onClick={() => onStepClick?.(step)}>
          <div className="font-bold">{step.toolName || 'Tool'}</div>
          <div className="text-xs">{step.serverName || 'MCP Server'}</div>
        </div>
      );

      nodes.push({
        id: nodeId,
        data: { label },
        position: { x: 250, y: currentY },
        style: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', minWidth: '150px' }
      });

      // Edge from previous step
      const prevId = index === 0 ? 'start' : workflow.steps[index - 1].id || `step-${index - 1}`;
      edges.push({
        id: `e-${prevId}-${nodeId}`,
        source: prevId,
        target: nodeId,
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      });

      currentY += 100;
    });

    // End node
    if (workflow.steps.length > 0) {
      const lastStepId = workflow.steps[workflow.steps.length - 1].id || `step-${workflow.steps.length - 1}`;
      nodes.push({
        id: 'end',
        type: 'output',
        data: { label: 'End' },
        position: { x: 250, y: currentY },
        style: { background: '#ef4444', color: '#fff', borderRadius: '8px', padding: '10px' }
      });

      edges.push({
        id: `e-${lastStepId}-end`,
        source: lastStepId,
        target: 'end',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      });
    } else {
       // Just Start -> End if no steps
       nodes.push({
        id: 'end',
        type: 'output',
        data: { label: 'End' },
        position: { x: 250, y: 100 },
        style: { background: '#ef4444', color: '#fff', borderRadius: '8px', padding: '10px' }
      });

      edges.push({
        id: 'e-start-end',
        source: 'start',
        target: 'end',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [workflow, onStepClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when workflow changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <div className="h-[500px] w-full bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background />
        <Controls />
        <Panel position="top-right" className="bg-white p-2 rounded shadow-sm border border-gray-200">
          <div className="text-xs font-bold text-gray-500 uppercase">Workflow Graph</div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default WorkflowVisualizer;
