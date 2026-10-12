FROM node:20-alpine
ENV NODE_ENV=production PORT=3200 DATA_DIR=/data MEDIA_DIR=/media BRIDGE_DIR=/bridge
WORKDIR /app
COPY package.json server.mjs ./
COPY lib ./lib
COPY ui ./ui
# Mappen die als volume worden gemonteerd; 777 zodat het eerst aangemaakte (nog root-eigen) volume ook beschrijfbaar is.
RUN mkdir -p /data /media /bridge && chmod 777 /data /media /bridge
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3200/api/health >/dev/null || exit 1
CMD ["node", "server.mjs"]
