docker stop postgis
docker rm postgis
docker run -d --platform linux/amd64 -p 5432:5432 -e POSTGRES_PASSWORD=pass --name postgis postgis/postgis