// What each platform reports, in its own terms. Metrics are not shared between platforms:
// a KPI or list only appears when the data for it exists.
//
// `combined` names the metrics that measure the same thing on every platform, for the All tab.
// Engagements are likes + comments + shares on all three (saves are left out: YouTube has none).
//
// KPI `value(days, snapshot)` returns a number (formatted with `format`) or a ready string, or null to hide it.

(function () {
  const sum = (key) => (days) => {
    let total = 0;
    let seen = false;
    for (const d of days) {
      const v = d.m && d.m[key];
      if (typeof v === "number") {
        total += v;
        seen = true;
      }
    }
    return seen ? total : null;
  };

  // Latest value in the range (follower-type totals), falling back to the snapshot figure.
  const latest = (key) => (days, snapshot) => {
    for (let i = days.length - 1; i >= 0; i--) {
      const v = days[i].m && days[i].m[key];
      if (typeof v === "number") return v;
    }
    return snapshot && snapshot[key] != null ? snapshot[key] : null;
  };

  const ratio = (top, bottom, scale = 1) => (days) => {
    const a = top.map((k) => sum(k)(days));
    const b = sum(bottom)(days);
    if (a.some((v) => v == null) || !b) return null;
    return (a.reduce((x, y) => x + y, 0) / b) * scale;
  };

  window.ENGAGEMENT_KEYS = ["likes", "comments", "shares"];

  window.PLATFORMS = {
    tiktok: {
      name: "TikTok",
      chart: { key: "views", label: "Video views" },
      combined: { views: "views", viewsLabel: "video views", audience: "followers", audienceLabel: "followers" },
      kpis: [
        { label: "Followers", value: latest("followers"), format: "compact" },
        { label: "Video views", value: sum("views"), format: "compact" },
        { label: "Profile views", value: sum("profileViews"), format: "compact" },
        // (likes + comments + shares) / views
        { label: "Engagement rate", value: ratio(["likes", "comments", "shares"], "views", 100), format: "percent" },
      ],
      lists: [
        [
          { key: "topVideos", title: "Top videos", icon: "video", unit: "Views" },
          { key: "trafficSources", title: "Traffic sources", icon: "source", unit: "Views" },
        ],
        [
          { key: "territories", title: "Audience territories", icon: "country", unit: "Viewers" },
          { key: "ageGender", title: "Age and gender", icon: "person", unit: "Viewers", share: true },
        ],
      ],
    },

    instagram: {
      name: "Instagram",
      chart: { key: "reach", label: "Reach" },
      // Plays, not reach: plays count views the way TikTok and YouTube do, reach counts accounts.
      combined: { views: "plays", viewsLabel: "plays", audience: "followers", audienceLabel: "followers" },
      kpis: [
        { label: "Followers", value: latest("followers"), format: "compact" },
        { label: "Reach", value: sum("reach"), format: "compact" },
        { label: "Accounts engaged", value: sum("accountsEngaged"), format: "compact" },
        { label: "Profile visits", value: sum("profileVisits"), format: "compact" },
      ],
      lists: [
        [
          { key: "topPosts", title: "Top posts and reels", icon: "video", unit: "Reach" },
          { key: "contentReach", title: "Reach by content type", icon: "layers", unit: "Reach" },
        ],
        [
          { key: "locations", title: "Top locations", icon: "country", unit: "Followers", share: true },
          { key: "followerGrowth", title: "Follower growth", icon: "person", unit: "Accounts" },
        ],
      ],
    },

    youtube: {
      name: "YouTube",
      chart: { key: "views", label: "Views" },
      combined: { views: "views", viewsLabel: "views", audience: "subscribers", audienceLabel: "subscribers" },
      kpis: [
        { label: "Subscribers", value: latest("subscribers"), format: "compact" },
        { label: "Views", value: sum("views"), format: "compact" },
        { label: "Watch time", value: (days) => { const m = sum("watchMinutes")(days); return m == null ? null : m / 60; }, format: "hours" },
        // watch time / views, in seconds
        { label: "Avg view duration", value: ratio(["watchMinutes"], "views", 60), format: "duration" },
        { label: "Impressions", value: sum("impressions"), format: "compact" },
        // views from impressions / impressions
        { label: "Click-through rate", value: ratio(["impressionClicks"], "impressions", 100), format: "percent" },
      ],
      lists: [
        [
          { key: "topVideos", title: "Top videos", icon: "video", unit: "Views" },
          { key: "trafficSources", title: "Traffic sources", icon: "source", unit: "Views" },
        ],
        [
          { key: "countries", title: "Top countries", icon: "country", unit: "Views" },
          { key: "devices", title: "Device type", icon: "device", unit: "Views", share: true },
        ],
      ],
    },
  };
})();
