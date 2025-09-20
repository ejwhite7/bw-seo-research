* Align on goals, personas, and scope for a 10k-keyword pipeline using Ahrefs and Anthropic

* Define features, flows, scoring, clustering, and editorial roadmap generation end-to-end

* Specify data, integrations, scraping approach, compliance, and export schema (CSV)

* Document architecture, scalability, risks, and tracking to support a lean MVP to v1.0

* Provide milestones, small-team estimates, and an implementation-ready appendix

# Dream 100 Keyword Engine — PRD for Olli Social

### TL;DR

Build a workflow that expands a seed keyword into a Dream 100, researches competitors, scrapes editorial titles, generates a 10,000-keyword universe, clusters semantically, scores/prioritizes, and outputs an editorial roadmap. Primary users are SEO Managers, Content Marketers, and PMs in the United States (English). The system integrates Ahrefs (preferred) and Anthropic (preferred), and exports a CSV for execution.

---

## Goals

### Business Goals

* Increase qualified organic sessions from “social selling” topics by 30–50% within 6 months of adoption (tracked by GA/GSC).

* Enable content velocity of 10–30 posts/month with <2 hours setup time and <30 minutes per roadmap refresh.

* Reduce time-to-first-prioritized-keywords from days to under 20 minutes.

* Deliver a high-quality, de-duplicated keyword universe capped at 10,000 terms per run, with >85% topical relevance (human spot-check).

* Maintain API and scraping cost per 1k keywords discovered under $2 while meeting SLAs.

### User Goals

* Automate discovery of Dream 100, tier-2, and tier-3 long-tail keywords from a single seed term.

* Get a prioritized, cluster-based editorial plan aligned to volume, intent, and competition.

* Export a clean CSV ready for planning, writing, and publishing workflows.

* Monitor progress and refine the roadmap quickly with updated metrics and competitor inputs.

### Non-Goals

* Do not build a full CMS or publishing platform.

* Do not implement paid distribution or ad campaign features.

* Do not host editorial content; we only generate plans and exports.

---

## User Stories

Primary Personas:

* SEO Manager (owns organic growth and keyword strategy)

* Content Marketer (plans, writes, and publishes content)

* Product Manager (aligns roadmap to business goals and timelines)

SEO Manager

* As an SEO Manager, I want to input a seed keyword and market, so that I can rapidly generate a Dream 100 list to anchor strategy.

* As an SEO Manager, I want blended scoring with tunable weights, so that I can prioritize high-impact keywords by stage (Dream 100, tier-2, tier-3).

* As an SEO Manager, I want competitor scraping of editorial titles, so that I can mine long-tail opportunities and content gaps.

* As an SEO Manager, I want to export prioritized clusters, so that I can align writers and track performance.

Content Marketer

* As a Content Marketer, I want cluster-based topic briefs with representative keywords, so that I can write content that ranks.

* As a Content Marketer, I want an editorial roadmap paced to 10–30 posts/month, so that my workload is clear and achievable.

* As a Content Marketer, I want CSV exports with deadlines and DRIs, so that I can collaborate with my team effectively.

Product Manager

* As a Product Manager, I want to see the projected impact and effort per cluster, so that I can sequence work for maximum ROI.

* As a Product Manager, I want to track time-to-first-roadmap and conversion to published posts, so that I can measure team productivity.

* As a Product Manager, I want guardrails for API cost and rate limits, so that the tool scales predictably.

---

## Functional Requirements

* Input & Setup (Priority: P0) -- Seed Keyword Input: Accept 1–5 seed terms (initial focus: “social selling”) and market (United States, English). -- API Keys: Capture and validate Ahrefs and Anthropic keys; allow missing-key mode with limited functionality. -- Limits & Settings: Configure 100 Dream 100 keywords, 10 tier-2 per Dream keyword, 10 tier-3 per tier-2 (max 10,000 terms). Allow weight tuning for scoring.

* Dream 100 Generator (Priority: P0) -- Expansion: Generate 100 commercially relevant head terms from the seed using search data and LLM expansion. -- Validation: Pull volume, difficulty, SERP features from Ahrefs; filter by US/EN. -- Intent Tagging: Classify intent (transactional, commercial, informational, navigational) via SERP cues + LLM.

* Competitor Research & Scraping (Priority: P0) -- Competitor Discovery: Identify top-ranking domains per Dream 100 via Ahrefs SERP/positions. -- Scraping Titles: Crawl competitor blogs for post titles and URLs respecting robots.txt; throttle and cache. -- Normalization: Deduplicate titles, extract candidate long-tails with n-gram analysis and LLM suggestions.

* Keyword Universe Generation (Priority: P0) -- Tier-2 Expansion: For each Dream 100 keyword, generate up to 10 tier-2 variants guided by SERP overlaps and modifiers. -- Tier-3 Expansion: For each tier-2, generate up to 10 specific long-tails (questions, comparisons, use-cases). -- Metrics Enrichment: Fetch volume, KD/difficulty, CPC, SERP features, and top URLs for all terms (Ahrefs).

* Scoring & Prioritization (Priority: P0) -- Blended Score: Compute per-stage weighted score with defaults and user-adjustable weights. -- Quick Wins: Flag low-KD, high-relevance tier-3s with near-term potential. -- Duplicates & Canonicalization: Merge near-duplicates; map misspellings and variants to canonical keywords.

* Clustering & Semantics (Priority: P0) -- Embeddings: Create text embeddings for keywords; compute similarity. -- Hierarchical Clusters: Agglomerative clustering with cut thresholds for pillar (Dream 100), subtopics (tier-2), and article-level (tier-3). -- Themes & Pillars: Label clusters and propose pillar pages vs supporting posts.

* Editorial Roadmap (Priority: P0) -- Pacing: Generate a monthly plan targeting 10–30 posts, balancing quick wins and strategic pillars. -- Assignments: Include DRI, due dates, suggested titles, primary/secondary keywords, and intent. -- CSV Export: Provide a downloadable CSV conforming to schema in Appendix.

* Exports (Priority: P0) -- CSV Export: One-click export for Keyword Universe, Clusters, and Editorial Roadmap. -- Presets: Export presets for “Writers,” “SEO Ops,” and “Stakeholders” with tailored columns.

* Admin & Monitoring (Priority: P1) -- Job Queue: Track ingestion, scraping, enrichment, clustering, scoring, and export stages with statuses. -- Rate Limits & Costs: Display API usage and estimated cost; throttle to user-configured budgets. -- Audit & Logs: Store run metadata (keys used, settings, time, counts, errors).

---

## Keyword Scoring & Prioritization

* Inputs per keyword

  * Volume (V): Monthly US search volume (normalized 0–1).

  * Difficulty (D): Keyword difficulty/KD (invert to ease E = 1 − normalized KD).

  * Intent (I): Classified as transactional/commercial/informational/navigational with intent weight factor.

  * Relevance (R): Semantic similarity to seed/Dream 100 theme (0–1).

  * Trend (T): Optional normalized growth factor from 12-month trend (0–1).

* Intent measurement

  * SERP signal mix: presence of ads/shopping, PLAs, pricing pages, category pages, comparison posts, how-tos.

  * LLM classification: Anthropic model maps queries + top SERP titles/snippets to intent class with confidence.

  * Map to weights: transactional=1.0, commercial=0.9, informational=0.7, navigational=0.5 (defaults; tunable).

* Stage-specific default weights

  * Dream 100 (head terms): Score = 0.40*V + 0.30*I + 0.15*R + 0.10*T + 0.05\*E

  * Tier-2 (mid-tail): Score = 0.35*V + 0.25*E + 0.20*R + 0.15*I + 0.05\*T

  * Tier-3 (long-tail): Score = 0.35*E + 0.30*R + 0.20*V + 0.10*I + 0.05\*T

* Quick wins surfacing

  * Mark keywords with E ≥ 0.7 and V ≥ median(V) in cluster as “Quick Win.”

  * Boost quick-win rank within cluster by +10% (display only; underlying score unchanged unless user opts to apply boost).

* Cluster-level scoring

  * Cluster Score = top-N average of member scores (N=5) plus coverage bonus: +5% if cluster contains all three intents.

* De-duplication and canonicalization

  * If similarity ≥ 0.92 or edit distance ≤ 2 and same SERP URLs overlap ≥ 60%, merge under canonical term retaining highest-volume variant.

---

## Clustering & Semantics

* Approach

  * Generate dense embeddings for all keywords.

  * Compute cosine similarity; use agglomerative clustering with average linkage.

  * Apply hierarchical cuts: Pillar clusters (Dream 100 anchors), sub-clusters (tier-2), leaf groups (tier-3).

* Parameters

  * Pillar cut threshold: similarity ≥ 0.72; Subtopic threshold: ≥ 0.80; Leaf grouping: ≥ 0.88 (defaults; tunable).

  * Minimum cluster size: 5 for pillar, 3 for subtopic; allow orphans to attach to nearest neighbor.

* Labeling and mapping

  * Cluster labels from highest-volume representative or LLM-generated normalized label.

  * Map clusters to editorial structures:

    * Pillar page: comprehensive guide targeting the Dream 100 anchor.

    * Supporting articles: tier-2 and tier-3 leaves feeding internal links to pillar.

* Quality controls

  * Collapse sparse clusters; enforce uniqueness of labels; show inter-cluster distance for overlap resolution.

---

## User Experience

Detailed journey and screens mapped to a 5-step flow: Input → Dream 100 → Keyword Universe → Clusters → Editorial Roadmap

**Entry Point & First-Time User Experience**

* Access: User lands on Input screen from dashboard.

* Onboarding: One-slide explainer on stages; prompt to add Ahrefs and Anthropic API keys.

* Defaults: Pre-fill market = United States (English), caps = 100/10/10 (10k), default scoring weights.

**Core Experience**

* Step 1: Input primary keyword(s)

  * UI: Single field with chips; market selector; checkboxes for “Include competitor scraping.”

  * Validation: 1–5 keywords; enforce ASCII/length; show missing-key warnings with limited-mode info.

  * Success: “Generate Dream 100” button triggers job; display progress bar and cost estimate.

* Step 2: Dream 100 list

  * UI: Table with columns: Keyword, Volume, KD, Intent, Score; filters and weight tuner drawer.

  * Actions: Select/deselect keywords for downstream expansion; view top SERP competitors per keyword.

  * Error handling: If Ahrefs throttles, queue with ETA; fallback to cached metrics if available.

* Step 3: Keyword Universe

  * UI: 3-tier tree and table view; show counts (remaining vs. 10k cap).

  * Actions: Regenerate tier-2 or tier-3 for a given node; exclude patterns; dedupe preview.

  * Feedback: Quality meter for relevance coverage and quick-win density.

* Step 4: Cluster view

  * UI: Cluster cards with label, size, top score, intent mix, representative keywords.

  * Actions: Merge/split clusters; adjust similarity thresholds; re-label cluster.

  * Edge cases: Sparse clusters highlighted with autosuggest to merge.

* Step 5: Editorial Roadmap

  * UI: Calendar and list views; monthly pacing slider (10–30 posts).

  * Actions: Assign DRIs, set due dates, auto-generate titles and outlines; export CSV.

  * Success: Confirmation modal with export summary and API usage report.

**Advanced Features & Edge Cases**

* Missing keys: Limited mode uses only LLM expansion and local heuristics; marks metrics as “estimates.”

* CAPTCHA or blocked scraping: Pause and fallback to Ahrefs SERP titles and cached pages.

* Over-cap results: Hard cap at 10,000; spillover reported with download option for overflow CSV (optional P1).

* Re-run with changes: Incremental updates reuse cached metrics within 7–30 days.

**UI/UX Highlights**

* Accessibility: High-contrast palette, keyboard navigation, ARIA labels.

* Responsiveness: Works on laptop and desktop; data-heavy tables with virtualized rows.

* Transparency: Inline explanations for scores, intent, and cluster assignments.

---

## Narrative

Olli Social’s team needs to scale content around “social selling,” but manual research stalls momentum. The SEO Manager starts with a single seed keyword and market. With one click, the tool expands into a Dream 100, pulling US volumes and difficulty from Ahrefs, and classifying intent using SERP signals and Anthropic. Competitor domains surface automatically, while a respectful crawler collects blog titles to mine long-tail opportunities.

Within minutes, the Keyword Universe fills with validated tier-2 and tier-3 ideas—cleaned, deduplicated, and ranked by a blended score tuned to stage-specific goals. Semantic clustering organizes topics into pillars and supporting posts. The Content Marketer switches to the cluster view, merges two overlapping groups, and approves the pacing slider at 20 posts/month. The tool converts priorities into a monthly editorial plan with DRIs, due dates, suggested titles, and primary/secondary keywords.

The Product Manager downloads the CSV and loads it into the planning workflow. Time-to-first-roadmap drops from days to under 20 minutes, the team maintains consistent output at 10–30 posts/month, and early quick wins drive incremental organic traffic. With low overhead and clear guardrails, Olli Social accelerates content production while staying aligned with business outcomes.

---

## Success Metrics

* 10k-keyword universe generated with >85% topical relevance (human spot-check).

* Time-to-first-roadmap under 20 minutes for a single seed (P50).

* 10–30 posts/month scheduled via roadmap exports within first two weeks of use.

* 30–50% lift in organic sessions for targeted clusters in 6 months.

* API failure rate <1% per run; end-to-end success rate >95%.

### User-Centric Metrics

* Median time from seed submission to CSV export.

* % of clusters accepted without manual edits.

* Writer satisfaction (CSAT) with briefs and titles (≥4/5).

### Business Metrics

* Incremental organic sessions and CTR on targeted clusters (GSC).

* Content throughput: posts published/month versus plan adherence.

* Cost per 1k keywords generated and validated.

### Technical Metrics

* 95th percentile pipeline runtime under 20 minutes for 10k terms.

* Uptime ≥ 99.5%; API error rate <1% after retries.

* Scrape block rate <3%, with fallback success >80%.

### Tracking Plan

* seed_submitted, api_keys_added, dream100_generated

* competitors_identified, scraping_started, scraping_completed, scrape_fallback_used

* universe_generated, clustering_completed, scoring_adjusted

* roadmap_created, roadmap_exported_csv

* run_failed_with_reason, api_rate_limited, retry_succeeded

---

## Technical Considerations

### Technical Needs

* Services: Ingestion (inputs), Expansion (Dream 100), Enrichment (metrics), Scraping, Embeddings/Clustering, Scoring, Roadmap, Export.

* Data models: Keyword (attributes, metrics, stage), Cluster, Competitor, Run, RoadmapItem.

* Front-end: Dashboard with 5 screens; virtualized tables; stateful filters; CSV export.

* Back-end: Job queue, rate-limited API clients, scraping service, metrics cache, scoring engine.

### Integration Points (API Integrations & Auth)

* Ahrefs (preferred)

  * Credentials: API key stored encrypted; per-user or system-level.

  * Usage: Retrieve volume, KD/difficulty, CPC, SERP overview, top URLs, competitor positions.

  * Rate limits: Concurrency cap with token bucket; exponential backoff (2^n up to 5 retries) and jitter.

  * Fallbacks: Use cached metrics (≤30 days) or mark fields as “pending” if exhausted.

* Anthropic (preferred)

  * Credentials: API key stored encrypted.

  * Usage: LLM expansions (Dream 100 seeds, long-tail suggestions), intent classification, title generation.

  * Rate limits: Queue requests; batch classify intent; streaming disabled for simplicity.

  * Fallbacks: Switch to heuristic intent if LLM unavailable; pause expansions.

### Data Storage, Privacy & Compliance

* Data retention: Store run artifacts and metrics for 90 days by default; user-initiated deletion supported.

* PII: None required. User emails and API keys stored encrypted at rest; keys masked in logs.

* Compliance: Respect robots.txt; US-based storage; maintain ToS-compliant use of Ahrefs and Anthropic.

* Access: Role-based access to runs and exports; audit log entries for admin actions.

### Scalability & Performance

* Batch pipeline tuned for 10k keywords/run with parallel enrichment and scraping (bounded concurrency).

* Caching: Metrics and scrape cache to reduce costs and latency; de-dupe identical requests across runs.

* Memory/CPU: Embeddings computed in batches; cluster computation O(n log n) with approximate methods as needed.

### Potential Challenges

* API cost overruns: Mitigate with budgets, previews of estimated cost, and hard caps.

* Scraping blocks/CAPTCHAs: Use respectful rates, rotating user-agents, and fallback to SERP data.

* Data quality variance: Human-in-the-loop review for top clusters; show confidence scores.

* Duplicates/near-duplicates: Canonicalization and SERP-overlap checks reduce noise.

---

## Keyword Scoring & Prioritization (Detailed Formulas)

* Normalization

  * Normalize Volume and KD per run using min-max with small epsilon; cap outliers at 99th percentile.

* Final formulas (defaults; user-tunable)

  * Dream 100: 0.40*V + 0.30*I + 0.15*R + 0.10*T + 0.05\*(1−KD)

  * Tier-2: 0.35*V + 0.25*(1−KD) + 0.20*R + 0.15*I + 0.05\*T

  * Tier-3: 0.35\*(1−KD) + 0.30*R + 0.20*V + 0.10*I + 0.05*T

* Intent scores

  * transactional=1.00, commercial=0.90, informational=0.70, navigational=0.50

* Quick-win rule

  * Highlight if (1−KD) ≥ 0.70 and V ≥ median(V in cluster).

---

## UX: Screens & Flows

Screens

* Input primary keyword(s)

* Dream 100 keyword list

* Keyword Universe

* Keyword Clusters

* Editorial Roadmap

Flows

1. Input → Dream 100

* User enters “social selling”; selects US/EN; clicks Generate.

* System validates keys, shows runtime and cost estimate; begins Ahrefs + LLM expansion.

1. Dream 100 → Keyword Universe

* User reviews 100 head terms; tunes weights; deselects any irrelevant terms.

* System expands into tier-2 and tier-3 while enriching metrics.

1. Keyword Universe → Clusters

* User switches to cluster view; merges/splits; adjusts thresholds.

* System re-clusters incrementally; updates labels and scores.

1. Clusters → Editorial Roadmap

* User sets pacing (e.g., 20 posts/month), assigns DRIs.

* System schedules posts by priority and diversity; generates titles and outlines; CSV export available.

1. Revisions and Exports

* User modifies weights or excludes patterns; regenerates affected portions.

* System runs incrementally; versioned exports preserved.

---

## Editorial Roadmap Generation

* Inputs

  * Prioritized clusters and keywords with scores, quick-win flags, intent, and KD.

  * Pacing: 10–30 posts/month; starting month; working days calendar.

  * Team: List of DRIs and optional capacity per person.

* Scheduling logic

  * Mix: 40% quick wins (tier-3), 40% tier-2 strategic, 20% pillar/evergreen.

  * Diversity: Avoid more than 3 posts from the same cluster in a week.

  * Cadence: Distribute evenly Mon–Thu; reserve Fri for buffers.

  * Dependencies: Schedule pillar pages within first 6 weeks; ensure at least 2 supporting posts within 2 weeks after a pillar.

* Assignments

  * Round-robin DRIs weighted by capacity; allow manual overrides.

  * Generate suggested titles and H1s using Anthropic, grounded in primary/secondary keywords and intent.

* CSV output schema

  * See Appendix for full column definitions and sample rows.

---

## API Integrations & Auth

* Credential management

  * Secure storage of Ahrefs and Anthropic keys (encrypted at rest); masked in UI and logs.

  * Validation endpoints called on save; display plan/limit info if available.

* Rate limit handling

  * Concurrency control per provider; adaptive backoff with jitter; circuit breaker to pause non-critical calls.

  * Batch requests where supported; cache results by (keyword, market).

* Missing keys or rate-limited state

  * Limited mode: generate expansions and clustering using internal heuristics and LLM; mark metrics as estimates.

  * Retry strategy: queued jobs with exponential backoff; user sees ETA and can cancel.

---

## Competitor Research & Scraping

* Discovery

  * Use Ahrefs SERP/top positions to identify top 10–20 domains per Dream 100 keyword.

* Legal and compliance

  * Respect robots.txt and crawl-delay; identify as a crawler; no authentication-required areas; store only titles/URLs.

* Technical approach

  * Crawl sitemaps and blog index pages first; throttle 0.5–1 req/sec/domain; random delays; rotating user-agents.

  * Extraction: Parse titles, headings; normalize, dedupe, and tokenize for candidate long-tails.

* Edge cases

  * CAPTCHA or 403: skip domain for this run; fallback to SERP titles; log event.

  * Infinite scroll: Use sitemap-first; limit page depth; abort on dynamic lockouts.

---

## Data Storage, Privacy & Compliance

* Storage

  * Relational DB for entities (Keywords, Clusters, Competitors, Runs, RoadmapItems).

  * Object storage for exports, cached SERP snapshots, and scrape artifacts (titles only).

  * Optional vector index for embeddings to speed clustering lookups.

* Privacy

  * No end-user PII is required beyond account login; API keys protected; export files private to account.

* Retention & deletion

  * Default 90-day retention for runs and caches; immediate user-initiated deletion; periodic clean-up jobs.

* Compliance

  * US data residency; adhere to provider ToS; robots.txt honored; clear user-agent; opt-out list supported.

---

## Exports & Integrations

* Formats

  * CSV (required) for Universe, Clusters, and Editorial Roadmap.

* Optional integrations (later)

  * Google Sheets, Airtable, Notion via API with OAuth.

* CSV schema

  * See Appendix for detailed column definitions.

---

## Technical Architecture & Scalability

* Ingestion Layer

  * Handles inputs, settings, and key validation; enqueues run.

* Processing Pipeline (queued jobs)

  * Expansion service (Dream 100, tier-2/3 with LLM assist).

  * Enrichment service (Ahrefs metrics).

  * Scraping service (competitor titles with cache).

  * Embeddings service (batch compute; stores vectors).

  * Clustering service (agglomerative; incremental updates).

  * Scoring service (stage-aware formulas; quick wins).

  * Roadmap service (scheduler; CSV generator).

* Storage

  * Relational DB for metadata; object storage for artifacts; vector index for embeddings.

* Orchestration

  * Job queue with per-provider rate-limiters, retries, and checkpoints; resumable runs.

* Scalability

  * Parallelize per-keyword enrichment in bounded worker pools.

  * Cache metrics for 30 days; dedupe identical requests across users when possible.

  * Target 10k-keyword runs in ≤20 minutes P95 under normal API conditions.

---

## Potential Risks & Mitigations

* API cost exposure

  * Mitigate with previews, budgets, caps, caching, and batch requests.

* Scraping legal/operational risk

  * Strict robots.txt compliance, throttling, user-agent identification, and fallback to SERP data.

* Data quality and drift

  * Confidence scoring, manual cluster edits, and periodic retraining/tuning of thresholds.

* Vendor rate limits/outages

  * Retries with backoff, graceful degradation to limited mode, user notifications, and resumable jobs.

* Over-clustering or fragmentation

  * User-controlled thresholds, merge/split tools, and distance visualization.

---

## Milestones & Sequencing

### Project Estimate

* Medium: 2–4 weeks for a detailed MVP; 4–6 weeks to v1.0 with polish.

### Team Size & Composition

* Small team (2–3 people):

  * 1 Product/Designer (part-time)

  * 1 Full-stack Engineer

  * 1 Data/ML Engineer (part-time; can be same as full-stack if experienced)

### Suggested Phases

* Discovery & Design (3–5 days)

  * Key Deliverables: User flows, screen wireframes, scoring defaults, CSV schema (PM/Design).

  * Dependencies: Access to Ahrefs and Anthropic keys; seed keywords and markets confirmed.

* MVP (10–12 days)

  * Key Deliverables: Input → Dream 100 → Universe pipeline; basic clustering; scoring; CSV export; limited scraping (titles only) (Engineering).

  * Dependencies: Working Ahrefs integration; Anthropic for expansion/intent.

* Beta (7–10 days)

  * Key Deliverables: Full cluster editor, roadmap pacing and assignments, cost controls, retries/backoff, admin dashboard; improved dedupe/canonicalization (Engineering).

  * Dependencies: Metrics cache; vector index; user feedback loop.

* v1.0 Launch (5–7 days)

  * Key Deliverables: Performance tuning to ≤20 min P95 for 10k; accessibility polish; audit logs; documentation and onboarding (All).

  * Dependencies: Stabilized APIs; monitoring and alerting.

---

## Appendix: CSV Schema, Sample Outputs, and API Contract Notes

### A) CSV Schema: Editorial Roadmap

* Columns

  * post_id: Unique ID

  * cluster_label: Pillar/cluster name

  * stage: pillar | supporting

  * primary_keyword: Target term

  * secondary_keywords: Pipe-separated list

  * intent: transactional | commercial | informational | navigational

  * volume: Integer (US)

  * difficulty: 0–100 (from Ahrefs KD)

  * blended_score: 0–1 (rounded to 0.001)

  * quick_win: TRUE/FALSE

  * suggested_title: String

  * DRI: Owner name/email (optional)

  * due_date: ISO date

  * notes: Optional guidance

  * source_urls: Pipe-separated competitor URLs (optional)

  * run_id: Reference to generation run

### B) CSV Schema: Keyword Universe

* Columns

  * keyword, tier (dream100|tier2|tier3), cluster_label, volume, difficulty, intent, relevance, trend, blended_score, quick_win, canonical_keyword, top_serp_urls

### C) Sample Rows (Editorial Roadmap)

* Example row 1

  * post_id: 2025-SS-001

  * cluster_label: Social Selling Strategy

  * stage: pillar

  * primary_keyword: social selling strategy

  * secondary_keywords: social selling plan|social selling framework

  * intent: commercial

  * volume: 4400

  * difficulty: 58

  * blended_score: 0.652

  * quick_win: FALSE

  * suggested_title: The Complete Social Selling Strategy: Framework, Playbooks, and KPIs

  * 

  * due_date: 2025-09-05

  * notes: Include internal links to supporting posts in first section.

  * 

  * run_id: RUN-2025-08-SS

* Example row 2

  * post_id: 2025-SS-002

  * cluster_label: LinkedIn Social Selling

  * stage: supporting

  * primary_keyword: how to do social selling on linkedin

  * secondary_keywords: linkedin social selling tips|ssi score improve

  * intent: informational

  * volume: 1600

  * difficulty: 32

  * blended_score: 0.741

  * quick_win: TRUE

  * suggested_title: How to Do Social Selling on LinkedIn: 12 Practical Tips to Lift Your SSI

  * 

  * due_date: 2025-09-07

  * notes: Add screenshots; aim for featured snippet eligibility.

  * 

  * run_id: RUN-2025-08-SS

### D) API Contract Notes

* Ahrefs (illustrative expectations)

  * Inputs: keyword(s), country=US, language=en

  * Responses: search volume, KD/difficulty, CPC, SERP overview (top pages/domains), positions for competitor discovery.

  * Usage Patterns: Batch keywords where possible; cache by (keyword, market) for 30 days.

* Anthropic

  * Tasks: Generate Dream 100 expansions from seed; classify intent using SERP snippets; generate suggested titles/outlines.

  * Inputs: prompt with seed/keywords + top SERP titles/snippets; temperature low for classification, medium for ideation.

  * Outputs: JSON with labels, intents, confidence, and suggested titles; deterministic config for reproducibility (low temperature, system prompt with schema).

### E) Scheduling Heuristics (Details)

* Prioritization within month: Sort by blended_score, then quick_win flag, then diversity across clusters.

* Pillar-support pairing: Ensure at least two supporting posts scheduled within 14 days after a pillar.

### F) Run Metadata

* Stored fields: run_id, seed_keywords, market, caps (100/10/10), scoring weights, timestamps, API usage, errors, version hash of heuristics.

---