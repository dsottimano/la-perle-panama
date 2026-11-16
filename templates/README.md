# La Perle templates

Page presets: home, about, contact, find. Collection routes: listings → listing; projects → project. See each fields.json for editable slots. Body content is enabled on about/contact and both detail templates.

## Shared contract

Gallery is a supported repeater of `{ image, alt }` objects. `body` is the rich-text canvas, enabled by top-level body:true, not a duplicate frontmatter field. Optional property bedrooms/bathrooms are omitted for land. Projects are new residential developments; status is presale, under-construction, or delivered.

`flowTags` remains a list of strings. Because Lanza cannot interpolate a scalar array, the quiz exposes dotted indexes 0–19 in inert HTML; up to 20 tags per listing reach matching. `region` remains the source slug. Quiz inventory comes from the page listing scope, so rebuilding automatically updates it and excludes drafts. It filters active inventory by sale/rent, budget, bedroom minimum and property type, then ranks region/tag overlaps. Unverified amenities are explicitly left for personal confirmation. No lead POST, cookies, storage or analytics were added.

## Performance

System Arial and Georgia, CSS transform-only scroll-timeline parallax under feature/reduced-motion guards. Video sources are assigned only after window load and two animation frames, then only while intersecting; Save-Data and reduced motion skip them. Posters have reserved dimensions. Pause controls are available. Quiz assets are loaded only by /find; only the current question/swipe images load.

Media sources: public/media/CREDITS.md. Owner originals are in ignored video-src/, never in public or dist. Five silent 1280×720 exports: panamadayskyline 1,323,079 bytes (hero), panamanight 846,483 bytes (bottom section), panamadayamador 648,814 bytes, panamacasco 956,750 bytes, panamaskylineday 823,403 bytes. Posters are 39,798–108,386 bytes. Stock media removed. Dependencies installed without changing the manifest or lockfile; no commits or pushes.

## Validation and remaining constraints

Production build: passed (15 pages). Final Lighthouse mobile: performance 96, accessibility 100, best practices 100, SEO 100; LCP 2.6s, CLS 0, TBT 0ms. Reports: /tmp/lp-owner-lighthouse.report.html and .json. Site checker: zero errors, four advisory warnings for local CSS/JS includes. Browser checks: six page types at 390px without overflow, five quiz intent paths reach results, no-match state, no capture form or page errors, no quiz assets on home, no below-fold video request at initial home load. Save-Data/reduced-motion video behavior tested separately.

Platform limitation: lanza-site 0.1.32 Base.astro adds an unconditional Google Fonts stylesheet. Tenant CSS uses system fonts, but removing that platform request requires a package fix outside this agent's assigned files. Quiz photo provenance was not provided with the old assets and needs owner confirmation. Real project facts/content remain with the content owner.

## Owner review update

The logo is 30% larger. Five tracked uppercase links fit on a single navigation row from 768px; 768–1279px uses a deliberate second header row beneath the centred wordmark, while wider screens use one header row. Mobile retains the native disclosure. Current-page anchors are selected with CSS page markers, with hidden duplicates excluded from the accessibility tree; no navigation JS.

The hero CTA links to /find and the editable quiz section sits directly beneath it. Listing/project details use a compact photo/facts layout, and collection index headings are reduced. At 1440×900, listing facts end at 601px and the full photograph at 694px. Screenshots at /tmp/lp-owner-review/ cover home, listing and listings index at 390, 768 and 1440. The existing static production preview remains on port 4321 because Lanza dev does not serve tenant public assets correctly.

## Contact and centred-navigation update

The header now puts the logo left, five divided links in the centre, and contact action right. Tablet widths keep a centred second navigation row rather than shrinking the text. Screenshots checked at 390/768/1024/1440/1880: no wrapping or overlaps. Hover underline uses transform; reduced motion disables its transition.

Contact has a freshly authored seven-shape composition inspired by Hyperplexed’s Living Shapes reference. It uses the local founder portrait, La Perle colours, three layouts and four roundness sets. A reserved golden-ratio frame contains layout/paint; clip-path morphing avoids geometric layout changes. Its 981-byte inline controller advances every 3 seconds, only while in view and the tab is visible. Pause, offscreen, simulated hidden-document, and reduced-motion checks passed. Reduced motion resets to layout/roundness 1.

Contact Lighthouse mobile: 99 performance, 100 accessibility, 100 best practices, 100 SEO; LCP 1.7s, CLS 0, TBT 0ms. Build and validator passed (zero errors, six advisory script/stylesheet warnings). Reports /tmp/lp-contact-lighthouse.report.html and .json; screenshots /tmp/lp-contact-review/. The built preview remains on port 4321.
