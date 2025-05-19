FROM osrm-backend-debian:v6.0.0

RUN apt-get update && \
    apt-get install -y --no-install-recommends npm postgresql-client osm2pgsql build-essential git && \
    git clone --depth 1 --branch v2.0.1 https://github.com/HY-OHTUPROJ-OSRM/Polygonal-Intersections.git /Polygonal-Intersections && \
    cd /Polygonal-Intersections && \
    make cli && \
    apt-get remove -y build-essential git && \
    cp bin/cli/Polygonal-Intersections-CLI /bin && \
    cd .. && \
    rm -rf /Polygonal-Intersections

WORKDIR /src
COPY package.json package-lock.json /src/
RUN npm install

COPY . /src
WORKDIR /src
RUN chgrp -R root /src && chmod -R 770 /src

EXPOSE 3000
CMD ["npm", "start"]
