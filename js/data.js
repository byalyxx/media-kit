// The media kit's numbers. This is the only file you need to edit.
//
// Rules the page follows:
// - A metric with no data is left out, never shown as zero.
// - Nothing is carried from one platform to another.
// - Keep these in line with byalyxx.com/media-kit while both are online.
//
// `snapshot` holds figures you only have as a single total (shown as-is, whatever the date range).
// `days` holds one entry per day, oldest first, so every date range can be worked out:
//   { date: "2026-10-21", hours: [24 numbers, optional, for the chart on single-day ranges],
//     m: { ...daily totals }, l: { listName: { "Row label": number } } }
// The keys each platform understands are listed in js/platforms.js.
// `posts` lists what went up, so the chart tooltip can say which post a spike came from:
//   { date: "2026-10-09", time: "18:00" (optional, places it on hourly charts), title: "I ranked every upgrade on my desk",
//     thumbnail: "assets/posts/ranked.jpg", url: "https://…", views: 48200, engagementRate: 9.1 }

window.MEDIA_KIT = {
  // Date the numbers were last brought up to date (YYYY-MM-DD).
  updated: "2026-09-23",
  email: "byalyxx@gmail.com",

  platforms: {
    tiktok: {
      handle: "@byalyxx",
      url: "https://www.tiktok.com/@byalyxx",
      // Same figure as byalyxx.com/media-kit (Sep 23, 2026).
      snapshot: { followers: "7k+" },
      days: [],
      posts: [],
    },
    instagram: {
      handle: "@byalyxx",
      url: "https://www.instagram.com/byalyxx/",
      snapshot: { followers: "900+" },
      days: [],
      posts: [],
    },
    youtube: {
      handle: "@byalyxx",
      url: "https://www.youtube.com/@byalyxx",
      snapshot: { subscribers: "600+" },
      days: [],
      posts: [],
    },
  },

  // The All tab. Per-platform totals (views, followers, engagements) are worked out from the
  // platform days above, using the metrics in each platform's `combined` entry (js/platforms.js).
  // Add a day here only for what the platforms can't give on their own:
  //   { date: "2026-10-21",
  //     views: { tiktok: 9120, instagram: 3400, youtube: 700 },        optional, overrides the worked-out totals
  //     hours: { tiktok: [24 numbers], instagram: [...], youtube: [...] }, views per hour, for single-day ranges
  //     l: { countries: { "United Kingdom": 4300, ... } } }              views by country, all three platforms together
  all: { days: [] },

  // Brand work, best first: the first three are what a brand sees without scrolling.
  // { brand: "Flexispot", title: "E7 Pro desk setup", platform: "tiktok" | "instagram" | "youtube",
  //   url: "https://…", thumb: "assets/deliverables/flexispot.jpg" (9:16 image), alt: "What the frame shows",
  //   views: 182000 (all-time views, for the All tab's top deliverables list) }
  deliverables: [],

  partners: [
    { name: "Flexispot", logo: "assets/partners/flexispot.jpg" },
    { name: "Blacklyte", logo: "assets/partners/blacklyte.jpg" },
    { name: "Gravastar", logo: "assets/partners/gravastar.jpg" },
    { name: "Hex Gaming", logo: "assets/partners/hex-gaming.jpg" },
  ],
};
