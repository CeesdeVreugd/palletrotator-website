#!/bin/sh
# Meldt deze website aan bij de WebsiteBeheerPortal door de bundel naar het gedeelde volume te kopieren.
# Doet niets als het volume niet is gekoppeld (dan draait de website gewoon zonder portaal).
if [ -d /bridge ] && [ -w /bridge ]; then
  rm -rf /bridge/palletrotator.tmp
  mkdir -p /bridge/palletrotator.tmp \
    && cp -a /portal-bundle/. /bridge/palletrotator.tmp/ \
    && rm -rf /bridge/palletrotator \
    && mv /bridge/palletrotator.tmp /bridge/palletrotator \
    && chmod -R a+rX /bridge/palletrotator \
    && echo "[portal] website aangemeld bij de WebsiteBeheerPortal" \
    || echo "[portal] aanmelden bij de WebsiteBeheerPortal mislukt (de website werkt gewoon door)"
fi
exit 0
