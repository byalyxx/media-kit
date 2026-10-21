# byalyxx media kit

A one-page live media kit for brands: audience stats for TikTok, Instagram and YouTube, past brand deliverables, and partners. It's separate from byalyxx.com on purpose: own repo, own deployment, own subdomain.

Plain HTML, CSS and JavaScript. No build step, no backend, no dependencies.

## Updating the numbers

Everything lives in `js/data.js`.

- `updated`: the date you last refreshed the figures.
- `platforms.<name>.snapshot`: single totals you only have as one figure (for example `followers: "7k+"`). Shown as-is.
- `platforms.<name>.days`: one entry per day, oldest first. Daily numbers let the date picker work out any range:

```js
{ date: "2026-10-21", m: { views: 9120, followers: 7410 }, l: { territories: { "United Kingdom": 3100, "United States": 1500 } } }
```

The metric and list keys each platform understands are in `js/platforms.js`. Anything you leave out simply doesn't show: no zeros, no empty boxes.

- `all`: the All tab works out each platform's views, followers and engagements from the platform days, using the metrics listed under `combined` in `js/platforms.js` (TikTok video views, Instagram plays, YouTube views; likes + comments + shares everywhere). `all.days` only holds what the platforms can't give on their own: views by country across all three (`l.countries`), views per hour for single-day ranges (`hours`), or a per-platform `views` figure that overrides the worked-out one. A combined figure only appears when all three platforms have it. The All chart groups points by range length: hourly up to 2 days, daily up to 31, weekly (Monday start) up to 120, monthly beyond.
- `deliverables`: put your best three first. Each one is `{ brand, title, platform, url, thumb, alt, views }`, with `thumb` a 9:16 image in `assets/deliverables/` and `alt` describing what the frame shows. The section stays hidden until there's at least one.
- `partners`: `{ name, logo, url }`.

## Controls shared with the main site

`ui.css` and `js/ui.js` are ports of the main site's control components (byalyxx/site-): `buttonClass`, the SiteNav pill group and its `itemClass`, and the ContactForm submit button, resolved to the same values. Change them on the main site first, then port the change here. The text tabs (`PillTabs`) and the dropdown (`Select`) have no equivalent there yet, so they're built from the main site's tokens.

## Previewing

Open `index.html` in a browser, or run any static server (`python3 -m http.server`).

Add `?sample` to the address to fill every section with made-up numbers so you can see the full layout. A banner says it's sample data. Never send that link to a brand.

## Deploying

Any static host works with no config:

- **Vercel**: import the repo, framework preset "Other", no build command, output directory `.`
- **Netlify**: import the repo, leave the build command empty, publish directory `.`
- **GitHub Pages**: Settings → Pages → deploy from `main`, folder `/ (root)`. `.nojekyll` is already there.

### Subdomain

Add the subdomain (for example `kit.byalyxx.com`) in the host's domain settings, then add the DNS record it asks for where byalyxx.com's DNS lives. That's usually a `CNAME` from `kit` to the host's address (`cname.vercel-dns.com`, `<site>.netlify.app` or `byalyxx.github.io`).

## Unlisted

The page has `<meta name="robots" content="noindex, nofollow">`, so search engines leave it out. There's deliberately no robots.txt block, because crawlers need to fetch the page to see the noindex tag. Anyone with the link can still open it.
