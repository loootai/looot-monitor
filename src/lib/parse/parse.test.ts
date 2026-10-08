import { describe, expect, it } from "vitest";
import appstore from "@/demo/fixtures/appstore_reviews.json";
import google from "@/demo/fixtures/google.json";
import linkedin from "@/demo/fixtures/linkedin.json";
import maps from "@/demo/fixtures/maps_reviews.json";
import news from "@/demo/fixtures/news.json";
import page from "@/demo/fixtures/page.json";
import pageSerper from "@/demo/fixtures/page_serper.json";
import reddit from "@/demo/fixtures/reddit.json";
import screenshot from "@/demo/fixtures/screenshot.json";
import x from "@/demo/fixtures/x.json";
import { PARSERS, canonicalUrl, isoDate, parseAppstoreReviews, parseGoogle, parseLinkedin, parseMapsReviews, parseNews, parsePage, parseReddit, parseScreenshot, parseX } from "./index";

describe("parsers, each against its fixture", () => {
  it("news: title, link, outlet, date; the entry with no title is skipped", () => {
    const items = parseNews(news);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Tallyroom brings invoice approvals to its iPad app", domain: "thestudiodesk.example", publishedAt: "2026-10-08T07:40:00.000Z", extra: { outlet: "The Studio Desk" } });
    expect(items[1].publishedAt).toBeNull();
  });
  it("news: tracking parameters do not change the fingerprint", () => {
    const clean = parseNews({ news: [{ title: "t", link: "https://thestudiodesk.example/news/tallyroom-ipad-approvals" }] });
    expect(parseNews(news)[0].fingerprint).toBe(clean[0].fingerprint);
  });
  it("google: organic rows with a position", () => {
    const items = parseGoogle(google);
    expect(items.map((i) => [i.extra.position, i.domain])).toEqual([[1, "toolreviewer.example"], [2, "softwareshelf.example"], [3, "paperkite.example"]]);
  });
  it("x: two field styles, engagement summed, URL built when missing", () => {
    const items = parseX(x);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ author: "Lune et Ligne", extra: { engagement: 16 } });
    expect(items[1].url).toBe("https://x.com/obi_makes/status/18480077");
  });
  it("reddit: flat and nested posts", () => {
    const items = parseReddit(reddit);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ author: "u/grid_and_gutter", extra: { engagement: 12, outlet: "r/freelance" } });
    expect(items[1].extra.engagement).toBe(140);
    expect(items[0].url).toBe("https://www.reddit.com/r/freelance/comments/1ns2ab/tallyroom_deposit_invoices/");
  });
  it("linkedin: text, author, reactions", () => {
    const items = parseLinkedin(linkedin);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ author: "Emeka van der Meer", extra: { engagement: 73 } });
    expect(items[1]).toMatchObject({ author: "Saoirse Tanaka", extra: { engagement: 9 } });
  });
  it("maps reviews: rating, reviewer, id or text as the fingerprint", () => {
    const items = parseMapsReviews(maps);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ author: "Thandiwe M.", extra: { rating: 5 }, publishedAt: "2026-10-06T15:20:00.000Z" });
    expect(items[1].extra.rating).toBe(2);
    expect(items[0].fingerprint).not.toBe(items[1].fingerprint);
  });
  it("app store reviews: a rating as text still parses", () => {
    const items = parseAppstoreReviews(appstore);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ author: "Viktor H.", extra: { rating: 3 } });
  });
  it("page: both readers", () => {
    expect(parsePage(page).title).toBe("Ledgerly pricing");
    expect(parsePage(page).content).toContain("Studio: $35 /mo");
    expect(parsePage(pageSerper)).toEqual({ content: "# Ledgerly pricing\n\nStudio: $35 /mo", title: "Ledgerly pricing" });
  });
  it("screenshot: finds the image URL", () => {
    expect(parseScreenshot(screenshot)).toBe("/demo/ledgerly-pricing-after.svg");
    expect(parseScreenshot({ data: { url: "https://img.example/a.png" } })).toBe("https://img.example/a.png");
  });
  it("no parser throws on an empty, null or odd body", () => {
    for (const parse of Object.values(PARSERS)) {
      for (const raw of [null, undefined, "", 42, [], {}, { data: null }, { results: "nope" }]) expect(parse!(raw)).toEqual([]);
    }
    expect(parsePage(null)).toEqual({ content: "", title: null });
    expect(parseScreenshot(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("isoDate reads ISO text and unix seconds, and refuses relative dates", () => {
    expect(isoDate(1791446400)).toBe("2026-10-08T08:00:00.000Z");
    expect(isoDate("3 hours ago")).toBeNull();
    expect(isoDate("not a date")).toBeNull();
  });
  it("canonicalUrl drops www, trailing slash, hash and tracking", () => {
    expect(canonicalUrl("https://www.Site.example/a/?utm_medium=x&id=2#top")).toBe("site.example/a?id=2");
  });
});
