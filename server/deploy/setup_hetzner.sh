#!/usr/bin/env bash
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

cd /opt || cd /srv || cd /root
if [ ! -d SpacePirates ]; then
  git clone https://github.com/placeholder/SpacePirates.git
fi
cd SpacePirates

npm --prefix ./app_package ci
npm --prefix ./app_package run build
npm --prefix ./test_package ci
npm --prefix ./test_package run build

cd server
docker compose up --build -d
