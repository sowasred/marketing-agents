#!/bin/bash

# Campaign Management Utility Script

BASE_URL="http://localhost:3000"
API_KEY="${API_KEY:-}"  # Read from environment variable

# Check if API_KEY is set
if [ -z "$API_KEY" ]; then
    echo "⚠️  Warning: API_KEY not set. Set it with: export API_KEY=your-key"
    echo "   Or run: source .env && export API_KEY"
    echo ""
fi

function show_help() {
    echo "Marketing Campaign Bot - Management CLI"
    echo ""
    echo "Usage: ./campaign.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  status              Check queue status"
    echo "  health              Check server health"
    echo "  trigger [N]         Trigger campaign (optional: limit to N rows)"
    echo "  process-row <ID>    Process specific row by ID"
    echo "  test <email>        Send test email"
    echo "  clear               Clear the queue"
    echo "  help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./campaign.sh status"
    echo "  ./campaign.sh trigger 5"
    echo "  ./campaign.sh process-row 1"
    echo "  ./campaign.sh test me@example.com"
    echo ""
}

function check_server() {
    curl -s "$BASE_URL/health" > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "❌ Server not responding. Is it running?"
        echo "   Start with: npm run dev"
        exit 1
    fi
}

function show_status() {
    check_server
    echo "📊 Queue Status:"
    curl -s "$BASE_URL/api/campaign/status" \
        -H "X-API-Key: $API_KEY" | jq '.queue // .'
}

function show_health() {
    check_server
    echo "🏥 Server Health:"
    curl -s "$BASE_URL/health" | jq '.'
}

function trigger_campaign() {
    check_server
    local max_rows=$1
    
    if [ -z "$max_rows" ]; then
        echo "🚀 Triggering full campaign..."
        response=$(curl -s -X POST "$BASE_URL/api/campaign/trigger" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -d '{}')
    else
        # Validate that max_rows is a number
        if ! [[ "$max_rows" =~ ^[0-9]+$ ]]; then
            echo "❌ Error: max_rows must be a number, got: '$max_rows'"
            exit 1
        fi
        
        echo "🚀 Triggering campaign (max $max_rows rows)..."
        # Use jq to properly construct JSON
        local json_payload=$(jq -n --arg rows "$max_rows" '{maxRows: ($rows | tonumber)}')
        response=$(curl -s -X POST "$BASE_URL/api/campaign/trigger" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $API_KEY" \
            -d "$json_payload")
    fi
    
    # Try to parse as JSON, if it fails show raw response
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
}

function process_row() {
    check_server
    local row_id=$1
    
    if [ -z "$row_id" ]; then
        echo "❌ Row ID required"
        echo "Usage: ./campaign.sh process-row <ID>"
        exit 1
    fi
    
    echo "📧 Processing row $row_id..."
    curl -s -X POST "$BASE_URL/api/campaign/process-row/$row_id" \
        -H "X-API-Key: $API_KEY" | jq '.'
}

function send_test_email() {
    check_server
    local email=$1
    
    if [ -z "$email" ]; then
        echo "❌ Email address required"
        echo "Usage: ./campaign.sh test <email>"
        exit 1
    fi
    
    echo "✉️  Sending test email to $email..."
    curl -s -X POST "$BASE_URL/api/test/email" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $API_KEY" \
        -d "{\"to\": \"$email\"}" | jq '.'
}

function clear_queue() {
    check_server
    echo "🗑️  Clearing queue..."
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        curl -s -X POST "$BASE_URL/api/campaign/clear-queue" | jq '.'
    else
        echo "Cancelled"
    fi
}

# Main script logic
case "$1" in
    status)
        show_status
        ;;
    health)
        show_health
        ;;
    trigger)
        trigger_campaign "$2"
        ;;
    process-row)
        process_row "$2"
        ;;
    test)
        send_test_email "$2"
        ;;
    clear)
        clear_queue
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

