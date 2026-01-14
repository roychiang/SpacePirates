#!/usr/bin/env bash
set -euo pipefail

# 1. Install Docker & Node if missing
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# 2. Navigate to Project
cd /opt/SpacePirates || { echo "Project not found in /opt/SpacePirates"; exit 1; }

# 3. Pull latest changes (if it's a git repo)
if [ -d .git ]; then
    echo "Pulling latest changes..."
    git pull
fi

# 4. Build Clients
echo "Building Frontend (test_package)..."
npm --prefix ./test_package ci
npm --prefix ./test_package run build

# Note: app_package build skipped as test_package is the primary web client now.
# npm --prefix ./app_package ci
# npm --prefix ./app_package run build

# 5. Start Server with Docker Compose
echo "Starting Server..."
cd server
docker compose up --build -d

echo "Deployment Complete!"
echo "Check logs: docker compose logs -f"
