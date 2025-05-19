docker run -it --rm \
  --net="host" \
  -p 3000:3000 \
  -p 5001:5001 \
  -e BACKEND_URL=http://172.17.0.1:5001 \
  -e OSRM_BACKEND_PORT=5001 \
  -e DATABASE_HOST=172.17.0.1 \
  -e DATABASE_PORT=5432 \
  -e DATABASE_DB=postgres \
  -e DATABASE_USER=postgres \
  -e DATABASE_PASSWORD=pass \
  routing-api
