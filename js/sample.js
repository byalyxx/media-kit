// Sample data, for previewing the layout only. It is used when the page is opened with ?sample
// and a banner says so. None of these numbers are real; the real ones live in js/data.js.

window.makeSampleData = function (real) {
  let seed = 7;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const DAYS = 150;
  const today = new Date();
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (t) => new Date(t).toISOString().slice(0, 10);

  // A daily curve: slow growth, weekly rhythm and the odd video that takes off.
  function curve(base, spikiness) {
    const out = [];
    let spike = 0;
    for (let i = 0; i < DAYS; i++) {
      if (rand() < 0.05) spike = base * (2 + rand() * spikiness);
      spike *= 0.6;
      const weekly = 1 + 0.15 * Math.sin((i / 7) * Math.PI * 2);
      out.push(Math.round(base * (0.7 + (i / DAYS) * 0.6) * weekly * (0.8 + rand() * 0.4) + spike));
    }
    return out;
  }
  const hoursFor = (total) => {
    const w = Array.from({ length: 24 }, (_, h) => Math.max(0.15, Math.sin(((h - 6) / 24) * Math.PI * 2) + 1.1) * (0.7 + rand() * 0.6));
    const s = w.reduce((a, b) => a + b, 0);
    return w.map((x) => Math.round((x / s) * total));
  };
  const split = (total, weights) => {
    const out = {};
    const s = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) out[k] = Math.round((total * w * (0.85 + rand() * 0.3)) / s);
    return out;
  };
  const videos = (n, prefix) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix} ${i + 1}`, 1 / (i + 1.3)]));

  function build(series, fn) {
    return series.map((v, i) => ({ date: iso(end - (DAYS - 1 - i) * 864e5), hours: hoursFor(v), ...fn(v, i) }));
  }

  const tt = curve(9000, 3);
  let ttFollowers = 6100;
  const tiktok = build(tt, (v) => {
    ttFollowers += Math.round(v / 900);
    return {
      m: { views: v, followers: ttFollowers, profileViews: Math.round(v * 0.03), likes: Math.round(v * 0.07), comments: Math.round(v * 0.004), shares: Math.round(v * 0.006) },
      l: {
        topVideos: split(v, videos(9, "Sample TikTok")),
        trafficSources: split(v, { "For You": 74, Search: 9, "Personal profile": 7, Following: 6, Sound: 4 }),
        territories: split(v, { "United Kingdom": 34, "United States": 17, Germany: 8, Canada: 6, Australia: 5, Netherlands: 4, France: 4, Ireland: 3 }),
        ageGender: split(v, { "Men 18–24": 38, "Men 25–34": 27, "Women 18–24": 12, "Men 35–44": 9, "Women 25–34": 8, "Men 13–17": 6 }),
      },
    };
  });

  const ig = curve(2600, 4);
  let igFollowers = 820;
  const instagram = build(ig, (v) => {
    igFollowers += Math.round(v / 1500);
    return {
      m: { reach: v, followers: igFollowers, accountsEngaged: Math.round(v * 0.05), profileVisits: Math.round(v * 0.02) },
      l: {
        topPosts: split(v, videos(8, "Sample reel")),
        contentReach: split(v, { Reels: 81, Posts: 11, Stories: 8 }),
        locations: split(v, { London: 14, Manchester: 6, Birmingham: 5, "New York": 4, Dublin: 3, Berlin: 3, Toronto: 2 }),
        followerGrowth: split(Math.round(v / 1200) + 4, { Follows: 80, Unfollows: 20 }),
      },
    };
  });

  const yt = curve(700, 3);
  let ytSubs = 540;
  const youtube = build(yt, (v) => {
    ytSubs += Math.round(v / 600);
    const impressions = Math.round(v * (11 + rand() * 3));
    return {
      m: { views: v, subscribers: ytSubs, watchMinutes: Math.round(v * (2.6 + rand() * 0.8)), impressions, impressionClicks: Math.round(impressions * 0.058) },
      l: {
        topVideos: split(v, videos(8, "Sample video")),
        trafficSources: split(v, { "Browse features": 38, "YouTube search": 24, "Suggested videos": 27, External: 7, "Channel pages": 4 }),
        countries: split(v, { "United Kingdom": 31, "United States": 22, India: 8, Germany: 6, Canada: 5, Australia: 4, Poland: 3 }),
        devices: split(v, { Mobile: 58, Computer: 29, TV: 9, Tablet: 4 }),
      },
    };
  });

  return {
    ...real,
    sample: true,
    updated: iso(end),
    platforms: {
      tiktok: { ...real.platforms.tiktok, days: tiktok },
      instagram: { ...real.platforms.instagram, days: instagram },
      youtube: { ...real.platforms.youtube, days: youtube },
    },
    deliverables: real.deliverables.length
      ? real.deliverables
      : ["tiktok", "instagram", "youtube", "tiktok", "instagram", "tiktok", "youtube"].map((p, i) => ({
          brand: `Sample brand ${String.fromCharCode(65 + i)}`,
          title: `Sample deliverable ${i + 1}`,
          platform: p,
        })),
  };
};
