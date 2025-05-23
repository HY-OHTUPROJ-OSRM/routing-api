curl -X POST http://localhost:3000/disconnected_links \
     -H "Content-Type: application/json" \
     -d '{"min_dist":0.1, "max_dist":0.3, "names_are_same":false}'
