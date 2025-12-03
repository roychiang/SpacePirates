Prerequisites
- Update DuckDNS A record for spacepirates.duckdns.org to 46.224.54.46
- Ensure ports 80 and 443 are open on Hetzner firewall
- Provide SSH access (user with sudo) to 46.224.54.46

Quick install and run
1. ssh to the server: ssh <user>@46.224.54.46
2. copy the project to the server: scp -r SpacePirates <user>@46.224.54.46:/opt/
3. run: sudo bash /opt/SpacePirates/server/deploy/setup_hetzner.sh

Manual steps
1. Install Docker and Compose plugin
   - sudo apt-get update
   - sudo apt-get install -y ca-certificates curl gnupg lsb-release
   - sudo install -m 0755 -d /etc/apt/keyrings
   - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   - sudo apt-get update
   - sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

2. Install Node.js and git
   - curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   - sudo apt-get install -y nodejs git

3. Clone repository
   - cd /opt
   - sudo git clone https://github.com/placeholder/SpacePirates.git
   - cd SpacePirates

4. Build client assets
   - npm --prefix ./app_package ci
   - npm --prefix ./app_package run build
   - npm --prefix ./test_package ci
   - npm --prefix ./test_package run build

5. Start server and proxy
   - cd server
   - sudo docker compose up --build -d

6. Verify
   - curl -I https://spacepirates.duckdns.org
   - curl -s https://spacepirates.duckdns.org/colyseus | head -n 5

7. Update on new releases
   - git pull
   - npm --prefix ./app_package run build
   - npm --prefix ./test_package run build
   - cd server && sudo docker compose pull && sudo docker compose up -d

