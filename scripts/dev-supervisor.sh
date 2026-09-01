#!/bin/bash
# Keeps `next dev` on port 3000 alive: restarts it whenever it dies.
cd /home/z/my-project || exit 1

while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/health 2>/dev/null)
  if [ "$code" != "200" ]; then
    # don't stack servers: wait for the port to actually free up
    sleep 2
    echo "[$(date '+%H:%M:%S')] dev server down (health=$code) — restarting" >> /home/z/my-project/dev-supervisor.log
    bun run dev >> /home/z/my-project/dev-supervisor.log 2>&1
    echo "[$(date '+%H:%M:%S')] dev server exited" >> /home/z/my-project/dev-supervisor.log
  fi
  sleep 8
done
