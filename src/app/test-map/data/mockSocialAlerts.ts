import type { SocialAlert } from "@/types/hazard";

/**
 * Realistic test social alerts from Bluesky firehose matching `social_alerts` schema
 */
export const MOCK_SOCIAL_ALERTS: SocialAlert[] = [
  {
    id: "social-1",
    blueskyUri: "at://did:plc:satxreporter/app.bsky.feed.post/3la712",
    summary: "Flooding has closed low-water crossings along Salado Creek in San Antonio. Stranded vehicles reported.",
    category: "flood",
    urgency: "severe",
    coordinates: [-98.4936, 29.4241],
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
    authorHandle: "@satx_emergency.bsky.social",
  },
  {
    id: "social-2",
    blueskyUri: "at://did:plc:alamoresident/app.bsky.feed.post/3la715",
    summary: "Large tree down blocking both lanes on Bandera Rd near loop 410. Power lines sparked.",
    category: "road_hazard",
    urgency: "critical",
    coordinates: [-98.572, 29.489],
    createdAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    authorHandle: "@texas_watch.bsky.social",
  },
  {
    id: "social-3",
    blueskyUri: "at://did:plc:elpasocitizen/app.bsky.feed.post/3la718",
    summary: "Water pooling heavily on I-10 East near downtown El Paso. Traffic crawling.",
    category: "flood",
    urgency: "medium",
    coordinates: [-106.4869, 31.7619],
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    authorHandle: "@elpaso_chatter.bsky.social",
  },
  {
    id: "social-4",
    blueskyUri: "at://did:plc:rgvobserver/app.bsky.feed.post/3la720",
    summary: "TxDOT crews spotted closing ramps near Edinburg due to standing water.",
    category: "road_hazard",
    urgency: "medium",
    coordinates: [-98.1633, 26.3017],
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    authorHandle: "@rgv_news.bsky.social",
  },
  {
    id: "social-5",
    blueskyUri: "at://did:plc:austinmutualaid/app.bsky.feed.post/3la725",
    summary: "Cooling & water station opened at East Austin Community Center with cold water and phone charging.",
    category: "shelter",
    urgency: "low",
    coordinates: [-97.712, 30.264],
    createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    authorHandle: "@atx_mutualaid.bsky.social",
  },
];

