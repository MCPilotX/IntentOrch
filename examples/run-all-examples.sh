#!/bin/bash

# MCPilot SDK Core - Run All Developer Examples
# This script runs all the developer-friendly examples in order

set -e  # Exit on error

echo "🚀 MCPilot SDK Core - Developer Examples Runner"
echo "================================================"

# Check for DeepSeek API key
if [ -z "$DEEPSEEK_API_KEY" ] && [ -z "$DEEPSEEK_TOKEN" ]; then
    echo "❌ Error: DeepSeek API key not found"
    echo "Please set environment variable:"
    echo "  export DEEPSEEK_API_KEY=your_api_key_here"
    echo "Or:"
    echo "  export DEEPSEEK_TOKEN=your_api_key_here"
    exit 1
fi

echo "✅ DeepSeek API key found"
echo "Starting examples in sequence..."
echo ""

# Function to run an example with timeout (cross-platform)
run_example() {
    local example_name=$1
    local example_file=$2
    local timeout_seconds=${3:-60}
    
    echo "📋 Running: $example_name"
    echo "----------------------------------------"
    
    # Cross-platform timeout implementation
    if command -v gtimeout >/dev/null 2>&1; then
        # macOS with coreutils
        gtimeout $timeout_seconds node "$example_file" || {
            if [ $? -eq 124 ]; then
                echo "⚠ Timeout after ${timeout_seconds}s - continuing to next example"
            else
                echo "⚠ Example completed with warnings - continuing"
            fi
        }
    elif command -v timeout >/dev/null 2>&1; then
        # Linux
        timeout $timeout_seconds node "$example_file" || {
            if [ $? -eq 124 ]; then
                echo "⚠ Timeout after ${timeout_seconds}s - continuing to next example"
            else
                echo "⚠ Example completed with warnings - continuing"
            fi
        }
    else
        # Fallback: use Node.js timeout wrapper
        echo "⚠ Using Node.js timeout wrapper..."
        node run-with-timeout.js $timeout_seconds node "$example_file" || {
            if [ $? -eq 124 ]; then
                echo "⚠ Timeout after ${timeout_seconds}s - continuing to next example"
            else
                echo "⚠ Example completed with warnings - continuing"
            fi
        }
    fi
    
    echo ""
    sleep 2  # Brief pause between examples
}

# Run examples in recommended order
run_example "Basic SDK Usage" "1-basic-sdk-usage.js" 30
run_example "AI Integration" "2-ai-integration.js" 90
run_example "MCP Tool Management" "3-mcp-tools.js" 60

# Optional: Run the complete starter kit (takes longer)
echo "📋 Optional: Complete Developer Starter Kit"
echo "----------------------------------------"
read -p "Run complete starter kit? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_example "Complete Developer Starter Kit" "developer-starter-kit.js" 120
fi

echo "================================================"
echo "🎉 All examples completed!"
echo ""
echo "📚 Next Steps:"
echo "1. Check the individual example files for more details"
echo "2. Explore the package/README.md for full documentation"
echo "3. Look at ../sdk-core/examples/ for more advanced examples"
echo "4. Try integrating with real MCP servers"
echo ""
echo "💡 Tip: You can run individual examples anytime:"
echo "  node 1-basic-sdk-usage.js"
echo "  node 2-ai-integration.js"
echo "  node 3-mcp-tools.js"
echo "  node developer-starter-kit.js"
echo ""
echo "Happy coding! 🚀"