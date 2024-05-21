FROM alpine:3.19

RUN mkdir /src
COPY package.json /src

RUN apk add --no-cache npm && \
    cd /src && \
    npm install

COPY . /src
WORKDIR /src
RUN chgrp -R root /src && chmod -R 770 /src

EXPOSE 3000
CMD ["npm", "start"]
