# Skinstencil site

Static site for skinstencil.com. See DEPLOY.md.

## Editing
Pages are generated. Edit `src/index.tpl.html`, `src/studio.tpl.html` or the text in `src/strings/<lang>.json`, then run `node src/build.mjs`. English is the source; other languages fall back to English for any missing key. Checkout is switched on in `js/config.js` (see PAYMENTS.md).
