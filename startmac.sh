docker run -it --rm \
  -p 3000:3000 \
  -p 5001:5001 \
  -e BACKEND_URL=http://host.docker.internal:5001 \
  -e OSRM_BACKEND_PORT=5001 \
  -e DATABASE_HOST=host.docker.internal \
  -e DATABASE_PORT=5432 \
  -e DATABASE_DB=postgres \
  -e DATABASE_USER=postgres \
  -e DATABASE_PASSWORD=pass \
  routing-api
