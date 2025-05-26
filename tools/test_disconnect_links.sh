curl -X POST http://localhost:3000/disconnected_links \
     -H "Content-Type: application/json" \
     -d '{"minDist":100, "maxDist":5000, "namesAreSame":false}'
