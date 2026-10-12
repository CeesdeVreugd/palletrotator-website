# --- Build stage -----------------------------------------------------------
# Bouwt alle taalversies (nl, de, en, fr, it, es) in een keer en vertaalt de
# niet-Nederlandse sites met het vertaalgeheugen in i18n/memory.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
# Alleen voor testen op subdomeinen: STAGING_BASE=palletrotator.devreugd-pt.nl laat de taalkiezer naar
# https://de.<base>, https://en.<base>, ... wijzen i.p.v. naar de productiedomeinen.
ARG STAGING_BASE=""
ENV STAGING_BASE=$STAGING_BASE
RUN npm run build:all

# --- Run stage: statische sites geserveerd door nginx (kiest de taal op basis van het domein) ----
FROM nginx:1.27-alpine AS run

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/nl /usr/share/nginx/html/nl
COPY --from=build /app/dist/de /usr/share/nginx/html/de
COPY --from=build /app/dist/en /usr/share/nginx/html/en
COPY --from=build /app/dist/fr /usr/share/nginx/html/fr
COPY --from=build /app/dist/it /usr/share/nginx/html/it
COPY --from=build /app/dist/es /usr/share/nginx/html/es

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
