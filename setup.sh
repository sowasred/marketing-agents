#!/bin/bash

# Marketing Campaign Bot - Setup Script

echo "🚀 Setting up Marketing Campaign Bot..."

# Check Node.js version
echo "📦 Checking Node.js version..."
node_version=$(node -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi
echo "✅ Node.js $node_version detected"

# Install dependencies
echo "📥 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚙️  Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your API keys!"
    echo ""
    echo "Required API keys:"
    echo "  - RESEND_API_KEY (from https://resend.com)"
    echo "  - OPENAI_API_KEY (from https://platform.openai.com)"
    echo "  - YOUTUBE_API_KEY (from https://console.cloud.google.com)"
    echo ""
else
    echo "✅ .env file already exists"
fi

# Check Redis
echo "🔍 Checking Redis connection..."
redis-cli ping >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️  Redis is not running. Please start Redis:"
    echo "   macOS: brew services start redis"
    echo "   Linux: sudo systemctl start redis"
    echo "   Docker: docker run -d -p 6379:6379 redis:alpine"
else
    echo "✅ Redis is running"
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys"
echo "  2. Ensure Redis is running"
echo "  3. Start the server: npm run dev"
echo "  4. In another terminal, start the worker: npm run dev:worker"
echo ""
echo "Test the system:"
echo '  curl -X POST http://localhost:3000/api/test/email -H "Content-Type: application/json" -d '"'"'{"to": "your-email@example.com"}'"'"
echo ""
echo "Happy campaigning! 🎯"

