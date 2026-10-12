#!/bin/sh
# Bezoeklogboek voor de WebsiteBeheerPortal: map klaarzetten en bestanden ouder dan 90 dagen opruimen.
D=/bridge/_visits/palletrotator
if [ -d /bridge ] && [ -w /bridge ]; then
  mkdir -p "$D" && chmod 777 /bridge/_visits "$D" 2>/dev/null
  find "$D" -name '*.log' -mtime +90 -delete 2>/dev/null
  echo "[portal] bezoeklogboek klaar (anoniem, 90 dagen bewaard)"
fi
exit 0
