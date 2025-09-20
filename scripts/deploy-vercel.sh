#!/bin/bash

# Dream 100 Keyword Engine - Vercel Deployment Script
# This script handles production and staging deployments to Vercel

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="dream100-keyword-engine"
ORG_NAME="ollisocial"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GIT_COMMIT=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        log_error "Vercel CLI is not installed. Install it with: npm install -g vercel"
        exit 1
    fi
    
    # Check if we're in a git repository
    if ! git rev-parse --is-inside-work-tree &> /dev/null; then
        log_error "Not in a git repository"
        exit 1
    fi
    
    # Check if we have uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        log_warning "You have uncommitted changes. Consider committing them first."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled."
            exit 0
        fi
    fi
    
    log_success "Prerequisites check passed"
}

setup_environment() {
    local env_type=$1
    log_info "Setting up $env_type environment..."
    
    # Copy appropriate environment file
    if [[ "$env_type" == "production" ]]; then
        if [[ -f ".env.production" ]]; then
            cp .env.production .env.production.local
            log_success "Production environment configured"
        else
            log_warning "No .env.production file found. Make sure to set environment variables in Vercel dashboard."
        fi
    elif [[ "$env_type" == "staging" ]]; then
        if [[ -f ".env.staging" ]]; then
            cp .env.staging .env.staging.local
            log_success "Staging environment configured"
        else
            log_warning "No .env.staging file found. Make sure to set environment variables in Vercel dashboard."
        fi
    fi
}

run_pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    # Run type checking
    log_info "Running TypeScript type check..."
    if ! npm run build > /tmp/build.log 2>&1; then
        log_error "TypeScript compilation failed:"
        cat /tmp/build.log
        exit 1
    fi
    
    # Run linting
    log_info "Running ESLint..."
    if ! npm run lint > /tmp/lint.log 2>&1; then
        log_warning "Linting issues found:"
        cat /tmp/lint.log
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled."
            exit 0
        fi
    fi
    
    # Run tests
    if [[ -f "package.json" ]] && npm run test --if-present > /tmp/test.log 2>&1; then
        log_success "Tests passed"
    else
        log_warning "Tests failed or not configured:"
        cat /tmp/test.log 2>/dev/null || true
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled."
            exit 0
        fi
    fi
    
    log_success "Pre-deployment checks completed"
}

deploy_to_vercel() {
    local env_type=$1
    local vercel_env=$2
    
    log_info "Deploying to $env_type environment..."
    
    # Set deployment parameters
    local deploy_args=()
    deploy_args+=("--project" "$PROJECT_NAME")
    
    if [[ "$env_type" == "production" ]]; then
        deploy_args+=("--prod")
    else
        deploy_args+=("--target" "preview")
    fi
    
    # Add metadata
    deploy_args+=("--meta" "branch=$GIT_BRANCH")
    deploy_args+=("--meta" "commit=$GIT_COMMIT")
    deploy_args+=("--meta" "timestamp=$TIMESTAMP")
    deploy_args+=("--meta" "environment=$env_type")
    
    # Deploy
    log_info "Running: vercel ${deploy_args[*]}"
    
    if DEPLOYMENT_URL=$(vercel "${deploy_args[@]}" 2>&1 | tail -n 1); then
        log_success "Deployment successful!"
        log_info "Deployment URL: $DEPLOYMENT_URL"
        
        # Store deployment info
        echo "{
  \"url\": \"$DEPLOYMENT_URL\",
  \"environment\": \"$env_type\",
  \"branch\": \"$GIT_BRANCH\",
  \"commit\": \"$GIT_COMMIT\",
  \"timestamp\": \"$TIMESTAMP\",
  \"vercel_env\": \"$vercel_env\"
}" > "deployment-$env_type-$TIMESTAMP.json"
        
        return 0
    else
        log_error "Deployment failed!"
        echo "$DEPLOYMENT_URL"
        return 1
    fi
}

run_post_deployment_checks() {
    local deployment_url=$1
    log_info "Running post-deployment health checks..."
    
    # Wait for deployment to be ready
    log_info "Waiting for deployment to be ready..."
    sleep 30
    
    # Health check
    local health_url="$deployment_url/api/health"
    log_info "Checking health endpoint: $health_url"
    
    if curl -sSf "$health_url" > /tmp/health.json 2>&1; then
        log_success "Health check passed"
        cat /tmp/health.json | jq '.' 2>/dev/null || cat /tmp/health.json
    else
        log_warning "Health check failed or endpoint not available"
        cat /tmp/health.json 2>/dev/null || true
    fi
    
    # Basic connectivity test
    log_info "Testing basic connectivity..."
    if curl -sSf "$deployment_url" -o /dev/null; then
        log_success "Basic connectivity test passed"
    else
        log_warning "Basic connectivity test failed"
    fi
}

notify_deployment() {
    local env_type=$1
    local deployment_url=$2
    local status=$3
    
    log_info "Sending deployment notification..."
    
    # Slack notification (if webhook URL is set)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        local status_text
        
        if [[ "$status" == "success" ]]; then
            color="good"
            status_text="✅ Successful"
        else
            color="danger"
            status_text="❌ Failed"
        fi
        
        local payload
        payload=$(cat <<EOF
{
  "attachments": [
    {
      "color": "$color",
      "title": "Dream 100 Keyword Engine - $env_type Deployment",
      "fields": [
        {
          "title": "Status",
          "value": "$status_text",
          "short": true
        },
        {
          "title": "Environment",
          "value": "$env_type",
          "short": true
        },
        {
          "title": "Branch",
          "value": "$GIT_BRANCH",
          "short": true
        },
        {
          "title": "Commit",
          "value": "$GIT_COMMIT",
          "short": true
        },
        {
          "title": "URL",
          "value": "$deployment_url",
          "short": false
        }
      ],
      "footer": "Vercel",
      "ts": $(date +%s)
    }
  ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
             --data "$payload" \
             "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || true
        
        log_info "Slack notification sent"
    fi
}

cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/build.log /tmp/lint.log /tmp/test.log /tmp/health.json
    rm -f .env.production.local .env.staging.local
    log_success "Cleanup completed"
}

show_usage() {
    echo "Usage: $0 [ENVIRONMENT]"
    echo ""
    echo "ENVIRONMENT:"
    echo "  production   Deploy to production"
    echo "  staging      Deploy to staging/preview"
    echo "  preview      Deploy as preview (same as staging)"
    echo ""
    echo "Examples:"
    echo "  $0 production    # Deploy to production"
    echo "  $0 staging       # Deploy to staging"
    echo ""
    echo "Environment Variables:"
    echo "  SLACK_WEBHOOK_URL  Optional Slack webhook for notifications"
}

# Main execution
main() {
    local env_type=${1:-}
    
    # Show usage if no arguments
    if [[ -z "$env_type" ]]; then
        show_usage
        exit 1
    fi
    
    # Validate environment type
    case "$env_type" in
        production)
            local vercel_env="production"
            ;;
        staging|preview)
            local vercel_env="preview"
            env_type="staging"
            ;;
        *)
            log_error "Invalid environment: $env_type"
            show_usage
            exit 1
            ;;
    esac
    
    log_info "Starting deployment to $env_type environment"
    log_info "Git branch: $GIT_BRANCH"
    log_info "Git commit: $GIT_COMMIT"
    log_info "Timestamp: $TIMESTAMP"
    
    # Set up error handling
    trap 'cleanup; log_error "Deployment failed!"' ERR
    trap 'cleanup' EXIT
    
    # Run deployment process
    check_prerequisites
    setup_environment "$env_type"
    run_pre_deployment_checks
    
    if deployment_url=$(deploy_to_vercel "$env_type" "$vercel_env"); then
        run_post_deployment_checks "$deployment_url"
        notify_deployment "$env_type" "$deployment_url" "success"
        
        echo ""
        log_success "🎉 Deployment completed successfully!"
        log_info "Environment: $env_type"
        log_info "URL: $deployment_url"
        log_info "Branch: $GIT_BRANCH"
        log_info "Commit: $GIT_COMMIT"
        echo ""
    else
        notify_deployment "$env_type" "" "failed"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"
