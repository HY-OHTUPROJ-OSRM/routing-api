FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

RUN mkdir -p /src
COPY package.json /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends npm postgresql-client osm2pgsql build-essential git && \
    git clone https://github.com/HY-OHTUPROJ-OSRM/Polygonal-Intersections.git /Polygonal-Intersections && \
    cd /Polygonal-Intersections && \
    make cli && \
    apt-get remove -y build-essential git && \
    cp bin/cli/Polygonal-Intersections-CLI /bin && \
    cd .. && \
    rm -rf /Polygonal-Intersections && \
    cd /src && \
    npm install

COPY . /src
WORKDIR /src
RUN chgrp -R root /src && chmod -R 770 /src

EXPOSE 3000
CMD ["npm", "start"]
