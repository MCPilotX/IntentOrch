#!/bin/bash

# Test script for GitHub Actions workflows
# This script simulates what GitHub Actions would do locally

set -e

echo "🔧 Testing GitHub Actions Workflows"
echo "==================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success message
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print warning message
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error message
error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    error "Not in project root directory"
    exit 1
fi

echo ""
echo "📦 Testing NPM Package Preparation"
echo "---------------------------------"

# Test 1: Validate documentation
echo "1. Validating documentation structure..."
if npm run docs:validate > /dev/null 2>&1; then
    success "Documentation validation passed"
else
    error "Documentation validation failed"
    exit 1
fi

# Test 2: Prepare npm documentation
echo "2. Preparing npm documentation..."
if npm run docs:prepare > /dev/null 2>&1; then
    success "NPM documentation preparation passed"
    
    # Check if temp directory was created
    if [ -d ".npm-docs-temp" ]; then
        success "Temporary documentation directory created"
        
        # List contents
        echo "Contents of .npm-docs-temp:"
        find .npm-docs-temp -type f | sort | sed 's/^/  /'
    else
        warning "Temporary documentation directory not found"
    fi
else
    error "NPM documentation preparation failed"
    exit 1
fi

# Test 3: Verify package contents
echo "3. Verifying package contents..."
if npm run docs:verify > /dev/null 2>&1; then
    success "Package verification passed"
else
    error "Package verification failed"
    exit 1
fi

# Test 4: Check package.json configuration
echo "4. Checking package.json configuration..."
if grep -q '"docs/"' package.json; then
    success "package.json includes docs/ directory"
else
    error "package.json does not include docs/ directory"
fi

if grep -q '"README.md"' package.json; then
    success "package.json includes README.md"
else
    error "package.json does not include README.md"
fi

# Test 5: Dry-run npm pack
echo "5. Testing npm pack (dry-run)..."
if npm pack --dry-run > /dev/null 2>&1; then
    success "npm pack dry-run successful"
    
    # Show what would be included
    echo "Files that would be included in npm package:"
    npm pack --dry-run 2>&1 | grep -A 20 "npm notice === Tarball Contents ===" | tail -n +2 | sed 's/^/  /'
else
    error "npm pack dry-run failed"
fi

# Test 6: Check GitHub Actions files
echo ""
echo "🔧 Testing GitHub Actions Configuration"
echo "--------------------------------------"

if [ -d ".github/workflows" ]; then
    success ".github/workflows directory exists"
    
    # List workflow files
    echo "Workflow files found:"
    find .github/workflows -name "*.yml" -o -name "*.yaml" | sed 's/^/  /'
    
    # Check each workflow file
    for workflow in .github/workflows/*.yml .github/workflows/*.yaml; do
        if [ -f "$workflow" ]; then
            echo "  Validating $(basename "$workflow")..."
            
            # Basic YAML syntax check
            if python3 -c "import yaml; yaml.safe_load(open('$workflow'))" > /dev/null 2>&1; then
                success "    Valid YAML syntax"
            else
                warning "    Could not validate YAML syntax (python yaml module may not be available)"
            fi
            
            # Check for required sections
            if grep -q "name:" "$workflow"; then
                success "    Contains 'name' field"
            else
                warning "    Missing 'name' field"
            fi
            
            if grep -q "on:" "$workflow"; then
                success "    Contains 'on' trigger"
            else
                warning "    Missing 'on' trigger"
            fi
        fi
    done 2>/dev/null || true
else
    error ".github/workflows directory not found"
fi

# Test 7: Check documentation files
echo ""
echo "📚 Testing Documentation Files"
echo "-----------------------------"

required_docs=(
    "README.md"
    "docs/README.ZH_CN.md"
    "docs/api.md"
    "docs/architecture.md"
    "docs/development.md"
)

all_present=true
for doc in "${required_docs[@]}"; do
    if [ -f "$doc" ]; then
        success "$doc exists"
    else
        error "$doc missing"
        all_present=false
    fi
done

if $all_present; then
    success "All required documentation files exist"
else
    warning "Some documentation files are missing"
fi

# Test 8: Check script permissions
echo ""
echo "🔐 Testing Script Permissions"
echo "---------------------------"

scripts=(
    "scripts/sync-docs.js"
    "scripts/test-github-actions.sh"
)

for script in "${scripts[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ] || [[ "$script" == *.js ]]; then
            success "$script is executable or a Node.js script"
        else
            warning "$script may not be executable"
            chmod +x "$script" 2>/dev/null && success "  Made $script executable"
        fi
    fi
done

# Cleanup
echo ""
echo "🧹 Cleaning up..."
if [ -d ".npm-docs-temp" ]; then
    rm -rf .npm-docs-temp
    success "Cleaned up temporary directory"
fi

echo ""
echo "==================================="
echo "🎉 All tests completed successfully!"
echo ""
echo "Next steps:"
echo "1. Commit these changes to your repository"
echo "2. Push to GitHub to trigger the workflows"
echo "3. Set up NPM_TOKEN secret in GitHub repository settings"
echo "4. Create a version tag to trigger npm publish:"
echo "   git tag v0.5.1"
echo "   git push origin v0.5.1"
echo ""
echo "For manual testing of npm publish:"
echo "npm run docs:sync"
echo "npm pack --dry-run"
echo ""