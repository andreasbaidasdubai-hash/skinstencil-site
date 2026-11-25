# Google Ads test for Skinstencil

A prepared plan, not a running campaign. Nothing here spends money until you create it in Google Ads and set the budget.

## Goal and how to judge it
Find out if search ads for stencil keywords bring people who buy. A test of 14 days at USD 15 a day (USD 210 total) is enough to see clicks and a first read on cost per sale. Judge it on: cost per click, Google Ads click and impression counts, and Polar sales in the same days. One USD 4.99 day pass does not pay back a USD 1.50 click on its own, so the real question is whether Pro buyers appear.

## Set up
- Campaign type: Search, no display network, no search partners. Goal: website traffic (not "sales", because no conversion tag exists yet).
- Locations: United States, United Kingdom, Germany, Austria, Switzerland (test these first, they have the best Planner numbers). Language: English and German as separate ad groups.
- Budget: USD 15 a day. Bidding: Maximise clicks with a max CPC cap of USD 1.20, then switch to manual once there is data.
- Landing pages: English `https://skinstencil.com/studio/`, German `https://skinstencil.com/de/studio/`. Sending people straight into the free tool beats the home page for this audience.

## Ad groups and keywords (exact and phrase match)
English: "tattoo stencil maker", "tattoo stencil generator", "photo to tattoo stencil", "tattoo stencil printer", "make tattoo stencil online", "tattoo transfer paper design".
German: "tattoo vorlage erstellen", "tattoo stencil erstellen", "tattoo vorlagen", "tattoo generator" (only phrase, broad is too wide), "foto in tattoo vorlage umwandeln".
Negative keywords (add on day one): free tattoo designs, tattoo ideas, tattoo near me, tattoo shop, tattoo artist near me, tattoo removal, henna, temporary tattoo, sticker, flash sheets download, pdf, reddit, jobs, course, training, how much.
Reason: people searching "tattoo ideas" want a design to copy, not a tool. The planner's large numbers (for example "ai tattoo generator") are mostly that audience, so they are left out of the test.

## Ads (responsive search ad, English)
Headlines: Tattoo Stencil Maker Online / Turn Any Design Into A Stencil / Print Stencils At True Size / Free To Use, Nothing Uploaded / Works In Your Browser / Keep Your Line Weight
Descriptions: Turn your drawing or photo into a clean line stencil in seconds. Free tool, nothing to install. / Remove the watermark with a day pass or Pro. Print at true size, 300 dpi.

## Ads (German)
Headlines: Tattoo Vorlage Erstellen / Stencil Aus Foto Oder Zeichnung / In Originalgröße Drucken / Kostenlos Testen / Läuft Im Browser / Deine Linie Bleibt Erhalten
Descriptions: Aus deiner Zeichnung oder deinem Foto wird in Sekunden ein sauberer Stencil. Kostenlos, ohne Installation. / Wasserzeichen entfernen mit Tagespass oder Pro. Druck in Originalgröße, 300 dpi.

Use only claims that are true today: free tool, runs in the browser, nothing uploaded, true-size print, watermark removal on day pass or Pro. Do not advertise AI, brow mapping or PDF export.

## Measuring without breaking the privacy page
- The privacy page says the site sets no cookies. A Google Ads conversion tag sets cookies and, in the EU/UK, needs a consent banner. So start without it.
- Count sales in Polar and clicks in Google Ads. Compare the two by date. Add a `?src=ads` style parameter only if you later add analytics that reads it.
- If the test shows sales, then add Cloudflare Web Analytics (see ANALYTICS.md) and consider a consent banner plus the conversion tag.

## Stop rules
Pause after 7 days if the average cost per click is over USD 2 and there is no sale. Pause after 14 days regardless and read the result. Do not raise the budget before there is at least one Pro sale.
