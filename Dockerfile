FROM ghcr.io/project-osrm/osrm-backend:v5.27.1

RUN mkdir -p /src
COPY package.json /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends npm && \
    cd /src && \
    npm install

COPY . /src
WORKDIR /src
RUN chgrp -R root /src && chmod -R 770 /src

EXPOSE 3000
CMD ["npm", "start"]
