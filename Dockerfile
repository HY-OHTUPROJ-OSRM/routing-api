ARG BASE_IMAGE=quay.io/routing-projekti/osrm-backend:v6.0.0-debian
FROM ${BASE_IMAGE}

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        npm \
        postgresql-client \
        osm2pgsql \
        build-essential \
        git \
        curl \
        jq && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v2.0.1 https://github.com/HY-OHTUPROJ-OSRM/Polygonal-Intersections.git /Polygonal-Intersections && \
    cd /Polygonal-Intersections && \
    make cli && \
    cp bin/cli/Polygonal-Intersections-CLI /bin && \
    rm -rf /Polygonal-Intersections

WORKDIR /src/drl
COPY drl /src/drl
RUN g++ -std=c++17 -O0 -o drl src/main.cpp

WORKDIR /src
COPY package.json package-lock.json /src/
RUN npm install

COPY . /src
RUN chgrp -R root /src && chmod -R 770 /src

EXPOSE 3000

CMD ["npm", "start"]
