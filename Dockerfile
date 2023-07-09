FROM node:8

WORKDIR /app

ADD . .

ENTRYPOINT ["/app/scripts/build.sh"]