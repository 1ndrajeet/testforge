import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ================================================================
   CONFIG
   ================================================================ */

const MSBTE_TIMETABLE_API =
    process.env.MSBTE_TIMETABLE_API ||
    "https://api.msbte.co.in/timetable_live_api";

const SUBJECTS_API =
    process.env.SUBJECTS_API ||
    "http://localhost:3000/api/subjects";

const PORT = process.env.PORT || 5000;

const MSBTE_CACHE_TTL_MS = 10 * 60 * 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBJECTS_CACHE_FILE = path.join(__dirname, "subjects-cache.json");

/* ================================================================
   SUBJECT CACHE
   ================================================================ */

let subjectsCache = { count: -1, fetchedAt: null, data: [] };
let subjectsRefreshInFlight = null;

function loadSubjectsCacheFromDisk() {
    try {
        if (fs.existsSync(SUBJECTS_CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SUBJECTS_CACHE_FILE, "utf8"));
            if (raw && typeof raw.count === "number" && Array.isArray(raw.data)) {
                subjectsCache = raw;
                console.log(`[subjects] loaded cache: ${raw.count} rows (fetched ${raw.fetchedAt})`);
            }
        }
    } catch (e) {
        console.warn("[subjects] could not load cache:", e.message);
    }
}

function saveSubjectsCacheToDisk() {
    try {
        fs.writeFileSync(SUBJECTS_CACHE_FILE, JSON.stringify(subjectsCache));
        console.log(`[subjects] wrote cache: ${subjectsCache.count} rows`);
    } catch (e) {
        console.warn("[subjects] could not write cache:", e.message);
    }
}

async function fetchSubjectsCount() {
    const r = await fetch(`${SUBJECTS_API}?type=count`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`count HTTP ${r.status}`);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "count failed");
    return j.count;
}

async function fetchSubjectsFull() {
    const r = await fetch(`${SUBJECTS_API}?type=full`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`full HTTP ${r.status}`);
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "full failed");
    if (!j.complete) throw new Error(`partial: returned ${j.returned} of ${j.count}`);
    return { count: j.count, data: j.data };
}

async function ensureSubjects() {
    if (subjectsRefreshInFlight) return subjectsRefreshInFlight;
    subjectsRefreshInFlight = (async () => {
        try {
            const remoteCount = await fetchSubjectsCount();
            if (remoteCount === subjectsCache.count) return;
            console.log(`[subjects] count drift ${subjectsCache.count} → ${remoteCount}, refetching full`);
            const { count, data } = await fetchSubjectsFull();
            subjectsCache = { count, fetchedAt: new Date().toISOString(), data };
            saveSubjectsCacheToDisk();
        } catch (e) {
            console.warn("[subjects] refresh failed:", e.message);
        } finally {
            subjectsRefreshInFlight = null;
        }
    })();
    return subjectsRefreshInFlight;
}

/** Force a full re-pull of the subjects catalog, bypassing the drift check. */
async function forceSubjectsRefresh() {
    // Cancel any in-flight refresh first — we want a clean slate.
    subjectsRefreshInFlight = null;
    subjectsCache = { count: -1, fetchedAt: null, data: [] };
    try {
        const { count, data } = await fetchSubjectsFull();
        subjectsCache = { count, fetchedAt: new Date().toISOString(), data };
        saveSubjectsCacheToDisk();
        return { ok: true, count };
    } catch (e) {
        console.warn("[subjects] forced refresh failed:", e.message);
        return { ok: false, error: e.message };
    }
}

/* ================================================================
   SUBJECT INDEX — exact match only, but with 3 secondary indexes
   for diagnosing *why* a lookup missed.
   ================================================================ */

function normalizeScheme(s) {
    return String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .trim();
}

function normalizeName(s) {
    return String(s || "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .replace(/[‘’']/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .trim();
}

/**
 * Build a 3-index structure:
 *  - byCodeScheme: "CODE__SCHEME"   → { abbr, name, id, scheme }
 *  - byNameScheme: "NAME__SCHEME"   → [{ abbr, name, code, id, scheme }, ...]
 *  - byCode:       "CODE"           → [{ ... }, ...]   (all schemes for a code)
 */
function buildSubjectIndex() {
    const byCodeScheme = new Map();
    const byNameScheme = new Map();
    const byCode = new Map();

    for (const row of subjectsCache.data) {
        const { id, code, scheme, abbr, name } = row;
        if (!code || !scheme) continue;

        const codeTrim = String(code).trim();
        const schemeNorm = normalizeScheme(scheme);
        const entry = {
            id: id || null,
            code: codeTrim,
            scheme,
            scheme_norm: schemeNorm,
            abbr: abbr || null,
            name: name || "",
        };

        const csKey = `${codeTrim}__${schemeNorm}`;
        if (!byCodeScheme.has(csKey)) byCodeScheme.set(csKey, entry);

        const nameNorm = normalizeName(name);
        if (nameNorm) {
            const nsKey = `${nameNorm}__${schemeNorm}`;
            if (!byNameScheme.has(nsKey)) byNameScheme.set(nsKey, []);
            byNameScheme.get(nsKey).push(entry);
        }

        if (!byCode.has(codeTrim)) byCode.set(codeTrim, []);
        byCode.get(codeTrim).push(entry);
    }

    return { byCodeScheme, byNameScheme, byCode };
}

/**
 * Lookup a paper scheme and classify the match state precisely.
 *
 * Returns { state, info }
 *   state = "matched"     → abbr found, use it
 *         = "null_abbr"   → row exists (code+scheme+name), but abbr IS NULL    → UPDATE
 *         = "wrong_code"  → row exists at (name+scheme) but with DIFFERENT code → FLAG
 *         = "wrong_name"  → row exists at (code+scheme) but with DIFFERENT name → FLAG
 *         = "absent"      → no row at all                                      → INSERT
 */
function diagnoseSubject(index, code, scheme, subjectName) {
    const codeTrim = String(code || "").trim();
    const schemeNorm = normalizeScheme(scheme);
    const nameNorm = normalizeName(subjectName);

    const exact = index.byCodeScheme.get(`${codeTrim}__${schemeNorm}`);
    if (exact) {
        if (exact.abbr) {
            return { state: "matched", info: exact };
        }
        // Row exists with matching code+scheme, but abbr is NULL.
        // Verify name matches to be safe — if name drifted, it's a different anomaly.
        if (nameNorm && normalizeName(exact.name) !== nameNorm) {
            return { state: "wrong_name", info: exact };
        }
        return { state: "null_abbr", info: exact };
    }

    // No (code, scheme) row. Check if the same subject name lives under this scheme
    // under a different code — that's a code-mismatch, not a true absence.
    if (nameNorm) {
        const nameMatches = index.byNameScheme.get(`${nameNorm}__${schemeNorm}`);
        if (nameMatches && nameMatches.length) {
            return { state: "wrong_code", info: nameMatches[0], alternates: nameMatches };
        }
    }

    return { state: "absent", info: null };
}

/* ================================================================
   ENRICH — one row per (paper, scheme), exact match only
   ================================================================ */

function enrichPapers(papers) {
    const index = buildSubjectIndex();

    let matched = 0;
    let unmatched = 0;

    const expanded = [];

    for (const p of papers) {
        const schemes = String(p.scheme || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        if (schemes.length === 0) {
            expanded.push({
                ...p,
                scheme: "",
                subject_abbr: null,
                subject_abbr_source: "none",
                match_state: "absent",
                catalog_id: null,
                catalog_code: null,
                catalog_name: null,
                catalog_scheme: null,
            });
            unmatched++;
            continue;
        }

        for (const s of schemes) {
            const diag = diagnoseSubject(index, p.paper_code, s, p.subject_name);

            if (diag.state === "matched") {
                expanded.push({
                    ...p,
                    scheme: s,
                    subject_abbr: diag.info.abbr,
                    subject_abbr_source: "catalog",
                    catalog_subject_name: diag.info.name,
                    match_state: "matched",
                    catalog_id: diag.info.id,
                    catalog_code: diag.info.code,
                    catalog_name: diag.info.name,
                    catalog_scheme: diag.info.scheme,
                });
                matched++;
            } else {
                expanded.push({
                    ...p,
                    scheme: s,
                    subject_abbr: null,
                    subject_abbr_source: "none",
                    match_state: diag.state,
                    catalog_id: diag.info?.id || null,
                    catalog_code: diag.info?.code || null,
                    catalog_name: diag.info?.name || null,
                    catalog_scheme: diag.info?.scheme || null,
                });
                unmatched++;
            }
        }
    }

    /* ---------- colour group classification ---------- */

    const byCodeAbbr = new Map();
    for (const r of expanded) {
        if (!r.subject_abbr) continue;
        const k = `${r.paper_code}__${r.subject_abbr}`;
        if (!byCodeAbbr.has(k)) byCodeAbbr.set(k, new Set());
        byCodeAbbr.get(k).add(r.scheme);
    }

    const byAbbr = new Map();
    for (const r of expanded) {
        if (!r.subject_abbr) continue;
        if (!byAbbr.has(r.subject_abbr)) byAbbr.set(r.subject_abbr, new Set());
        byAbbr.get(r.subject_abbr).add(r.paper_code);
    }

    const PALETTE = [
        { bg: "#dbeafe", fg: "#1e3a8a", ring: "#93c5fd" },
        { bg: "#dcfce7", fg: "#14532d", ring: "#86efac" },
        { bg: "#fef3c7", fg: "#78350f", ring: "#fcd34d" },
        { bg: "#fce7f3", fg: "#831843", ring: "#f9a8d4" },
        { bg: "#ede9fe", fg: "#4c1d95", ring: "#c4b5fd" },
        { bg: "#cffafe", fg: "#164e63", ring: "#67e8f9" },
        { bg: "#ffedd5", fg: "#7c2d12", ring: "#fdba74" },
        { bg: "#e0e7ff", fg: "#312e81", ring: "#a5b4fc" },
        { bg: "#fae8ff", fg: "#701a75", ring: "#f0abfc" },
        { bg: "#ccfbf1", fg: "#134e4a", ring: "#5eead4" },
        { bg: "#fef9c3", fg: "#713f12", ring: "#fde047" },
        { bg: "#fee2e2", fg: "#7f1d1d", ring: "#fca5a5" },
    ];

    function hashColor(key) {
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
        return PALETTE[Math.abs(h) % PALETTE.length];
    }

    for (const r of expanded) {
        if (!r.subject_abbr) {
            r.color_group = "none";
            r.color_key = null;
            r.color = null;
            continue;
        }

        const multiScheme = byCodeAbbr.get(`${r.paper_code}__${r.subject_abbr}`)?.size > 1;
        const sharedAbbr = byAbbr.get(r.subject_abbr)?.size > 1;

        // Distinct prefixes per group class so "both" and "shared-abbr" never collide.
        if (multiScheme && sharedAbbr) {
            r.color_group = "both";
            r.color_key = `X__${r.paper_code}__${r.subject_abbr}`;
        } else if (multiScheme) {
            r.color_group = "multi-scheme";
            r.color_key = `A__${r.paper_code}__${r.subject_abbr}`;
        } else if (sharedAbbr) {
            r.color_group = "shared-abbr";
            r.color_key = `B__${r.subject_abbr}`;
        } else {
            r.color_group = "single";
            r.color_key = null;
            r.color = null;
            continue;
        }
        r.color = hashColor(r.color_key);
    }

    // Per-state tally for the client to render.
    const stateCounts = {
        matched: 0, absent: 0, null_abbr: 0, wrong_code: 0, wrong_name: 0,
    };
    for (const r of expanded) {
        stateCounts[r.match_state] = (stateCounts[r.match_state] || 0) + 1;
    }

    console.log(
        `[subjects] rows: ${expanded.length} (from ${papers.length} papers) | matched: ${matched}, unmatched: ${unmatched}` +
        ` | states: ${JSON.stringify(stateCounts)}`
    );

    return { rows: expanded, stateCounts };
}

/* ================================================================
   SQL GENERATOR — emits a runnable script to fill the catalog gaps
   ================================================================ */

function sqlLiteral(s) {
    if (s === null || s === undefined) return "NULL";
    return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Build INSERT / UPDATE / FLAG statements from the enriched rows.
 *
 * Because the client cannot produce a trustworthy abbr automatically,
 * we do NOT invent one. Instead:
 *   - absent / partial → INSERT with abbr = NULL (operator fills abbr later)
 *   - null_abbr        → UPDATE ... SET abbr = '<TBD>' WHERE code AND scheme
 *   - wrong_code / wrong_name → comment-only FLAG so a human can review
 *
 * Deduplication is by (code, scheme) — one paper fanning out to N schemes
 * yields N distinct inserts, which is what the catalog wants.
 */
function generateSQL(rows) {
    const lines = [];
    const seen = new Set();

    const ins = [];
    const upd = [];
    const flag = [];

    for (const r of rows) {
        if (r.match_state === "matched") continue;
        const scheme = String(r.scheme || "").trim();
        const code = String(r.paper_code || "").trim();
        const name = String(r.subject_name || "").trim();
        if (!code || !scheme) continue;

        const key = `${code}__${normalizeScheme(scheme)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (r.match_state === "absent") {
            ins.push({ code, name, scheme, reason: "absent" });
        } else if (r.match_state === "null_abbr") {
            upd.push({
                code,
                scheme: r.catalog_scheme || scheme,
                name: r.catalog_name || name,
                existing_id: r.catalog_id,
                reason: "null_abbr",
            });
        } else if (r.match_state === "wrong_code") {
            flag.push({
                code, name, scheme,
                catalog_code: r.catalog_code,
                catalog_name: r.catalog_name,
                catalog_scheme: r.catalog_scheme,
                reason: "wrong_code",
            });
        } else if (r.match_state === "wrong_name") {
            flag.push({
                code, name, scheme,
                catalog_code: r.catalog_code,
                catalog_name: r.catalog_name,
                catalog_scheme: r.catalog_scheme,
                reason: "wrong_name",
            });
        }
    }
    const oldCode = c => /^(0\d{3}|2\d{4})$/.test(c);
    const newCode = c => /^3\d{4}$/.test(c);
    const oldScheme = s => /[IGECF]$/.test(normalizeScheme(s)) && !/K$/.test(normalizeScheme(s));

    const safeIns = ins.filter(x => !(newCode(x.code) && oldScheme(x.scheme)));
    const suspect = ins.filter(x => newCode(x.code) && oldScheme(x.scheme));
    const realFlag = flag.filter(x => !(newCode(x.code) && oldCode(x.catalog_code)));
    const eraFlag = flag.filter(x => newCode(x.code) && oldCode(x.catalog_code));

    lines.push("-- =============================================================");
    lines.push("-- Auto-generated by server.js — MSBTE Winter 2026 catalog gaps");
    lines.push("-- Generated: " + new Date().toISOString());
    lines.push("--");
    lines.push("-- Sections:");
    lines.push(`--   INSERT (safe)   : ${safeIns.length}`);
    lines.push(`--   INSERT (suspect): ${suspect.length}  — new code + old scheme, review`);
    lines.push(`--   UPDATE          : ${upd.length}`);
    lines.push(`--   FLAG (real)     : ${realFlag.length}`);
    lines.push(`--   ERA MISMATCH    : ${eraFlag.length}  — old↔new scheme pairs, catalog is correct`);
    lines.push("--");
    lines.push("-- Philosophy: we do NOT invent abbreviations.");
    lines.push("-- abbr is seeded as NULL for INSERTs, and as '<TBD>' for UPDATEs.");
    lines.push("-- Fill them in before committing.");
    lines.push("-- =============================================================");
    lines.push("");
    lines.push("BEGIN;");
    lines.push("");

    if (safeIns.length) {
        lines.push("-- ─── INSERT: genuine gaps ───────────────────────────────────");
        for (const x of safeIns) {
            lines.push("INSERT INTO public.subjects (code, name, scheme, abbr, is_deleted)");
            lines.push(`VALUES (${sqlLiteral(x.code)}, ${sqlLiteral(x.name)}, ${sqlLiteral(x.scheme)}, NULL, false)`);
            lines.push("ON CONFLICT (code, scheme) DO NOTHING;");
            lines.push("");
        }
    }
    if (upd.length) {
        lines.push("-- ─── UPDATE: fill null abbrs by borrowing from a same-code sibling ──");
        lines.push("-- For each (code, scheme) with abbr IS NULL, copy the most-frequent");
        lines.push("-- non-null abbr among other schemes of the same code.");
        lines.push("-- Rows with no sibling abbr remain NULL (nothing to borrow).");
        lines.push("");
        lines.push("WITH consensus AS (");
        lines.push("  SELECT code, abbr,");
        lines.push("         row_number() OVER (PARTITION BY code ORDER BY count(*) DESC) AS rn");
        lines.push("    FROM public.subjects");
        lines.push("   WHERE abbr IS NOT NULL");
        lines.push("     AND abbr <> '<TBD>'");
        lines.push("     AND NOT is_deleted");
        lines.push("   GROUP BY code, abbr");
        lines.push(")");
        lines.push("UPDATE public.subjects s");
        lines.push("   SET abbr = c.abbr");
        lines.push("  FROM consensus c");
        lines.push(" WHERE c.code = s.code");
        lines.push("   AND c.rn = 1");
        lines.push("   AND s.abbr IS NULL");
        lines.push("   AND NOT s.is_deleted;");
        lines.push("");
        lines.push(`-- ${upd.length} (code, scheme) pairs were missing abbr; the statement above`);
        lines.push("-- fills them from siblings where a source exists.");
        lines.push("");
    }

    if (suspect.length) {
        lines.push("-- ─── SUSPECT INSERT: new code + old scheme — DO NOT AUTO-RUN ──");
        for (const x of suspect) lines.push(`--   (${sqlLiteral(x.code)}, ${sqlLiteral(x.scheme)})  ${x.name}`);
        lines.push("");
    }
    if (realFlag.length) {
        lines.push("-- ─── FLAG: real drift — review manually ─────────────────────");
        for (const x of realFlag) lines.push(`-- [${x.reason}] ${x.code}/${x.scheme} vs catalog ${x.catalog_code}/${x.catalog_scheme}`);
        lines.push("");
    }
    if (eraFlag.length) {
        lines.push("-- ─── ERA MISMATCH: old↔new scheme pairs — catalog is CORRECT ──");
        for (const x of eraFlag) lines.push(`--   ${x.code}(${x.scheme}) ≟ ${x.catalog_code}(${x.catalog_scheme})`);
        lines.push("");
    }

    lines.push("COMMIT;");
    return lines.join("\n");
}

/* ================================================================
   MSBTE TIMETABLE CACHE
   ================================================================ */

let lastEnriched = null;
let msbteCacheHits = 0;
let msbteCacheMisses = 0;
let msbteCacheOldestAt = null; // timestamp of the oldest entry currently in cache
const msbteCache = new Map();

function cacheKey(method, pathname, body) {
    // Canonicalize the timetable POST body so {codes:[a,b]} and {codes:[b,a]}
    // share a cache entry.
    if (method === "POST" && pathname === "/examcenterwise/timetable" && body) {
        try {
            const j = JSON.parse(body);
            if (Array.isArray(j.codes)) {
                j.codes = [...j.codes].sort();
                return `${method} ${pathname} ${JSON.stringify(j)}`;
            }
        } catch { /* fall through */ }
    }
    return `${method} ${pathname} ${body}`;
}

function getCache(key) {
    const hit = msbteCache.get(key);
    if (!hit) { msbteCacheMisses++; return null; }
    if (hit.expiresAt <= Date.now()) {
        msbteCache.delete(key);
        msbteCacheMisses++;
        return null;
    }
    msbteCacheHits++;
    return hit.body;
}

function setCache(key, body) {
    msbteCache.set(key, { expiresAt: Date.now() + MSBTE_CACHE_TTL_MS, body });
    if (!msbteCacheOldestAt || Date.now() < msbteCacheOldestAt) {
        msbteCacheOldestAt = Date.now();
    }
    if (msbteCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of msbteCache) if (v.expiresAt <= now) msbteCache.delete(k);
        // Recompute oldest
        let oldest = null;
        for (const v of msbteCache.values()) {
            const created = v.expiresAt - MSBTE_CACHE_TTL_MS;
            if (oldest === null || created < oldest) oldest = created;
        }
        msbteCacheOldestAt = oldest;
    }
}

function clearMsbteCache() {
    const n = msbteCache.size;
    msbteCache.clear();
    msbteCacheOldestAt = null;
    return n;
}

function msbteCacheAgeMs() {
    if (!msbteCacheOldestAt || msbteCache.size === 0) return 0;
    return Date.now() - msbteCacheOldestAt;
}

/* ================================================================
   HTTP PROXY
   ================================================================ */

async function proxyMSBTE(req, res, upstreamPath) {
    const target = MSBTE_TIMETABLE_API + upstreamPath;
    let body = "";
    for await (const chunk of req) body += chunk;

    const key = cacheKey(req.method, upstreamPath, body);
    const cached = getCache(key);

    if (cached) {
        res.writeHead(cached.status, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(cached.text),
            "Access-Control-Allow-Origin": "*",
            "X-Cache": "HIT",
            "X-Cache-TTL": String(Math.max(0, Math.floor((cached.expiresAt - Date.now()) / 1000))),
            "X-Cache-Age": String(Math.floor(msbteCacheAgeMs() / 1000)),
        });
        return res.end(cached.text);
    }

    try {
        const upstream = await fetch(target, {
            method: req.method,
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body || undefined,
        });
        const text = await upstream.text();

        let finalText = text;
        let finalStatus = upstream.status;
        let enrichedMeta = null;

        if (upstreamPath.startsWith("/examcenterwise/timetable") && upstream.ok) {
            try {
                const papers = JSON.parse(text);
                const { rows, stateCounts } = enrichPapers(papers);
                finalText = JSON.stringify(rows);
                finalStatus = upstream.status;
                enrichedMeta = { rows: rows.length, stateCounts };
                lastEnriched = { rows, stateCounts, at: Date.now() };
            } catch (e) {
                console.warn("[proxy] could not enrich timetable:", e.message);
            }
        }

        setCache(key, {
            status: finalStatus,
            text: finalText,
            expiresAt: Date.now() + MSBTE_CACHE_TTL_MS,
        });

        const headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(finalText),
            "Access-Control-Allow-Origin": "*",
            "X-Cache": "MISS",
            "X-Cache-Age": "0",
        };
        if (enrichedMeta) {
            headers["X-Rows"] = String(enrichedMeta.rows);
            headers["X-State-Counts"] = JSON.stringify(enrichedMeta.stateCounts);
        }
        res.writeHead(finalStatus, headers);
        return res.end(finalText);
    } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: String(e) }));
    }
}

/* ================================================================
   HTML
   ================================================================ */

const HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MSBTE Winter 2026 — Timetable Viewer</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  html { scroll-behavior: smooth; }
  .abbr-badge { display:inline-block; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; padding:1px 6px; border-radius:4px; }
  .abbr-badge.catalog { background: #ecfdf5; color: #065f46; box-shadow: inset 0 0 0 1px #a7f3d0; }
  .abbr-badge.none    { background: #fef2f2; color: #991b1b; box-shadow: inset 0 0 0 1px #fecaca; font-style: italic; }
  .abbr-badge.null_abbr  { background: #fef9c3; color: #713f12; box-shadow: inset 0 0 0 1px #fde047; font-style: italic; }
  .abbr-badge.wrong_code { background: #fed7aa; color: #7c2d12; box-shadow: inset 0 0 0 1px #fdba74; font-style: italic; }
  .abbr-badge.wrong_name { background: #e9d5ff; color: #581c87; box-shadow: inset 0 0 0 1px #c084fc; font-style: italic; }
  .scheme-chip { display:inline-block; padding: 1px 6px; margin:1px 3px 1px 0; font-size:10px; font-family: ui-monospace,monospace; font-weight:600; border-radius:4px; background:#f1f5f9; color:#334155; box-shadow: inset 0 0 0 1px #e2e8f0; white-space:nowrap; }
  .sr-cell { color:#94a3b8; font-variant-numeric: tabular-nums; }
  thead th { position: sticky; top: 0; background:#f1f5f9; }
  .sql-modal { position: fixed; inset: 0; background: rgba(15,23,42,0.7); display: none; align-items: center; justify-content: center; z-index: 50; padding: 1rem; }
  .sql-modal.open { display: flex; }
  .sql-textarea { width: 100%; height: 60vh; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.4; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #0f172a; color: #e2e8f0; resize: none; }
  .cache-pill { display:inline-flex; align-items:center; gap:0.35rem; padding:1px 8px; border-radius:999px; font-size:10px; font-weight:600; background:#e0e7ff; color:#312e81; box-shadow: inset 0 0 0 1px #a5b4fc; }
  .cache-pill.fresh { background:#dcfce7; color:#14532d; box-shadow: inset 0 0 0 1px #86efac; }
  .cache-pill.stale { background:#fef3c7; color:#78350f; box-shadow: inset 0 0 0 1px #fcd34d; }
  .cache-pill.expired { background:#fee2e2; color:#7f1d1d; box-shadow: inset 0 0 0 1px #fca5a5; }
  @media print {
    .no-print { display: none !important; }
    body { background: white !important; }
    .session-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">

<header class="bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-lg">
  <div class="max-w-7xl mx-auto px-4 py-5 flex items-center gap-4">
    <div class="w-12 h-12 bg-white rounded-full flex items-center justify-center font-bold text-blue-900 text-xl">M</div>
    <div>
      <h1 class="text-lg sm:text-xl font-bold leading-tight">Maharashtra State Board of Technical Education, Mumbai</h1>
      <p class="text-xs sm:text-sm text-blue-100">Government Polytechnic Building, 49, Kherwadi, Bandra (E), Mumbai 400 051</p>
    </div>
  </div>
</header>

<section class="bg-white border-b border-slate-200">
  <div class="max-w-7xl mx-auto px-4 py-6">
    <h2 class="text-xl sm:text-2xl font-bold text-slate-900">
      Time Table for MSBTE Winter 2026 Theory Examination
      <span class="ml-2 align-middle inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1 rounded">FINAL</span>
    </h2>
    <p class="text-slate-600 text-sm mt-1">For Diploma in Engineering, Pharmacy and Government Approved Short Term (Non-AICTE) Courses</p>

    <form id="search-form" class="mt-5 flex flex-col sm:flex-row gap-3 no-print">
      <div class="flex-1">
        <label for="inst-id" class="block text-xs font-semibold text-slate-600 mb-1">Exam Center Code / Institute ID</label>
        <input id="inst-id" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="e.g. 1740"
          class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 bg-white"
          autocomplete="off" required />
      </div>
      <div class="flex items-end gap-2">
        <button type="submit" id="load-btn"
          class="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm">
          Load Timetable
        </button>
        <button type="button" id="print-btn"
          class="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-4 py-2.5 rounded-lg transition no-print">
          🖨️ Print
        </button>
      </div>
    </form>

    <div id="status" class="mt-3 text-sm text-slate-500"></div>
  </div>
</section>

<main class="max-w-7xl mx-auto px-4 py-6">
  <div id="institute-title" class="hidden mb-5 p-4 bg-white border-l-4 border-blue-700 rounded shadow-sm">
    <div class="text-xs uppercase tracking-wide text-slate-500">Exam Center-Wise Timetable</div>
    <div id="institute-name" class="text-lg font-bold text-blue-900 mt-0.5"></div>
  </div>

  <div id="toolbar" class="hidden mb-4 bg-white rounded-lg shadow-sm border border-slate-200 p-3 no-print">
    <div class="grid grid-cols-1 md:grid-cols-12 gap-2">
      <div class="md:col-span-4">
        <label class="block text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Search</label>
        <input id="f-search" type="search" placeholder="code, name, abbr, scheme… (press /)"
          class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>
      <div class="md:col-span-2">
        <label class="block text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Session</label>
        <select id="f-session" class="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All</option>
          <option value="M">Morning</option>
          <option value="A">Afternoon</option>
        </select>
      </div>
      <div class="md:col-span-3">
        <label class="block text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Scheme</label>
        <select id="f-scheme" class="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All</option>
        </select>
      </div>
      <div class="md:col-span-2">
        <label class="block text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1">Day</label>
        <select id="f-day" class="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All</option>
        </select>
      </div>
      <div class="md:col-span-1 flex items-end">
        <button id="f-clear" type="button"
          class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1.5 rounded transition">
          Clear
        </button>
      </div>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <label class="inline-flex items-center gap-1.5">
        <input id="f-abbr-mode" type="checkbox" class="accent-emerald-600" />
        Show only rows with missing abbr
      </label>
      <span class="ml-auto">
        Sort:
        <select id="f-sort" class="ml-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="day-session-sr">Day ▸ Session ▸ Sr</option>
          <option value="code">Subject Code ▸ Scheme</option>
          <option value="name">Subject Name</option>
          <option value="scheme">Scheme ▸ Code</option>
          <option value="abbr">Abbr ▸ Code</option>
        </select>
      </span>
      <span id="f-count" class="font-medium text-slate-700"></span>
      <span id="cache-status" class="cache-pill" title="MSBTE proxy cache age">
        <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
        <span id="cache-text">—</span>
      </span>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <button id="btn-gen-sql" type="button" class="hidden bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition">
        📋 Generate SQL for missing abbr
      </button>
      <button id="btn-refresh-subjects" type="button" class="bg-slate-600 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition">
        🔄 Refresh Subject Catalog
      </button>
      <button id="btn-clear-cache" type="button" class="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition">
        🗑️ Clear MSBTE Cache
      </button>
    </div>
    <div id="state-pills" class="mt-3 flex flex-wrap gap-1.5 text-[10px]"></div>
    <div id="legend" class="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-600"></div>
  </div>

  <div id="output"></div>
</main>

<footer class="bg-white border-t border-slate-200 mt-8">
  <div class="max-w-7xl mx-auto px-4 py-6 text-sm text-slate-600">
    <div class="font-semibold text-slate-900 mb-2">📌 Important Instructions for Winter 2026 Exam</div>
    <ul class="list-disc list-inside space-y-1.5">
      <li>The Exam Day &amp; Date wise FINAL Time Table for Winter 2026 Theory Examination is displayed on MSBTE portal for the information of students, institutes and all concerned.</li>
      <li>The duration of the Winter 2026 Theory Examination is 18 days.</li>
      <li>All students belonging to old schemes shall note that the theory examination shall be as per the paper codes which are offered as equivalent to the courses in old schemes and indicated on their hall ticket.</li>
      <li>Examination of different semesters/years scheduled on the same day but in different slots shall not be considered as a clash.</li>
    </ul>
  </div>
</footer>

<!-- SQL modal -->
<div id="sql-modal" class="sql-modal no-print">
  <div class="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
    <div class="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
      <h3 class="font-bold text-slate-900 text-base">Generated SQL — Missing Abbr Fixes</h3>
      <span id="sql-stats" class="text-xs text-slate-500"></span>
      <button id="sql-close" type="button" class="ml-auto text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
    </div>
    <div class="p-4 flex-1 overflow-hidden flex flex-col gap-2">
      <div id="sql-summary" class="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200"></div>
      <textarea id="sql-text" class="sql-textarea" spellcheck="false" readonly></textarea>
    </div>
    <div class="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
      <button id="sql-copy" type="button" class="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-1.5 rounded transition">Copy to Clipboard</button>
      <button id="sql-download" type="button" class="bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold px-4 py-1.5 rounded transition">Download .sql</button>
    </div>
  </div>
</div>

<script>
const API_BASE = "/api";
const state = {
  papers: [],
  filtered: [],
  institute: null,
  filters: { search: "", session: "", scheme: "", day: "", onlyMissing: false, sort: "day-session-sr" },
  cacheAgeMs: 0,
};

async function fetchJSON(path, { method = "GET", body } = {}) {
  const headers = body !== undefined ? { "Content-Type": "application/json" } : {};
  const res = await fetch(API_BASE + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " on " + path);
  return res.json();
}
const GET  = (p)    => fetchJSON(p);
const POST = (p, b) => fetchJSON(p, { method: "POST", body: b });

const api = {
  institutes: ()      => GET("/institutewise/institutes").then(r => r.data || []),
  papercodes: (id)    => GET("/examcenterwise/papercodes/" + encodeURIComponent(id)),
  examdays:   ()      => GET("/examcenterwise/examdays"),
  timetable:  (codes) => POST("/examcenterwise/timetable", { codes }),
  cacheInfo:  ()      => fetch("/__cache").then(r => r.json()),
  clearCache: ()      => fetch("/__cache/clear", { method: "POST" }).then(r => r.json()),
  refreshSubjects: () => fetch("/__subjects/refresh", { method: "POST" }).then(r => r.json()),
  missingSQL: () => fetch("/__sql/missing-abbr").then(r => r.text()),
};

const cache = { institutes: null, examdays: null };
const getInstitutes = () => (cache.institutes ??= api.institutes());
const getExamdays   = () => (cache.examdays   ??= api.examdays());

const $ = id => document.getElementById(id);
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "mt-3 text-sm " + (isError ? "text-red-600" : "text-slate-500");
}

function fmtAge(ms) {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s old";
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return m + "m " + rs + "s old";
  const h = Math.floor(m / 60);
  return h + "h " + (m % 60) + "m old";
}

function renderCacheStatus(ageMs) {
  state.cacheAgeMs = ageMs;
  const el = $("cache-status");
  const txt = $("cache-text");
  const maxMs = 10 * 60 * 1000;
  const pct = ageMs / maxMs;
  el.classList.remove("fresh", "stale", "expired");
  if (ageMs === 0) {
    el.classList.add("fresh");
    txt.textContent = "cache fresh";
  } else if (pct < 0.5) {
    el.classList.add("fresh");
    txt.textContent = fmtAge(ageMs);
  } else if (pct < 1) {
    el.classList.add("stale");
    txt.textContent = fmtAge(ageMs);
  } else {
    el.classList.add("expired");
    txt.textContent = "expired";
  }
}

async function refreshCacheStatus() {
  try {
    const info = await api.cacheInfo();
    renderCacheStatus(info.msbte?.ageMs ?? 0);
  } catch { /* silent */ }
}

function setInstituteTitle(name, instId) {
  $("institute-name").textContent = name ? name + " — " + instId : "Exam Center " + instId;
  $("institute-title").classList.remove("hidden");
}

function schemeValue(p) {
  return String(p.scheme || "").trim();
}

function applyFilters() {
  const { search, session, scheme, day, onlyMissing, sort } = state.filters;
  const q = search.trim().toLowerCase();

  let rows = state.papers.filter(p => {
    if (session && p.daysession !== session) return false;
    if (day && String(p.exam_dayw) !== String(day)) return false;
    if (scheme && schemeValue(p) !== scheme) return false;
    if (onlyMissing && p.subject_abbr) return false;
    if (q) {
      const hay = (p.paper_code + " " + p.subject_name + " " + (p.subject_abbr || "") + " " + p.scheme).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sessionRank = { M: 0, A: 1 };
  const cmp = {
    "day-session-sr": (a, b) =>
      a.exam_dayw - b.exam_dayw ||
      (sessionRank[a.daysession] ?? 9) - (sessionRank[b.daysession] ?? 9) ||
      (a.subject_no || 0) - (b.subject_no || 0) ||
      a.paper_code.localeCompare(b.paper_code),
    "code": (a, b) =>
      a.paper_code.localeCompare(b.paper_code) ||
      String(a.scheme).localeCompare(String(b.scheme)),
    "name": (a, b) =>
      a.subject_name.localeCompare(b.subject_name),
    "scheme": (a, b) =>
      String(a.scheme).localeCompare(String(b.scheme)) ||
      a.paper_code.localeCompare(b.paper_code),
    "abbr": (a, b) =>
      String(a.subject_abbr || "~").localeCompare(String(b.subject_abbr || "~")) ||
      a.paper_code.localeCompare(b.paper_code),
  }[sort] || ((a, b) => 0);

  rows.sort(cmp);
  state.filtered = rows;
  renderTimetable();
}

function populateFilterOptions() {
  const schemeSet = new Set();
  const daySet = new Set();
  for (const p of state.papers) {
    const s = schemeValue(p);
    if (s) schemeSet.add(s);
    daySet.add(p.exam_dayw);
  }

  const schemeSel = $("f-scheme");
  const daySel = $("f-day");
  schemeSel.innerHTML = '<option value="">All</option>' +
    [...schemeSet].sort().map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join("");
  daySel.innerHTML = '<option value="">All</option>' +
    [...daySet].sort((a, b) => a - b).map(d => '<option value="' + d + '">Day ' + d + '</option>').join("");
}

function groupByDate(rows) {
  const groups = new Map();
  for (const p of rows) {
    const key = p.exam_dayw + "|" + p.daysession;
    if (!groups.has(key)) {
      groups.set(key, {
        day: p.exam_dayw,
        date: p.date,
        session: p.daysession,
        time: p.paper_time,
        papers: [],
      });
    }
    groups.get(key).papers.push(p);
  }
  const sessionRank = { M: 0, A: 1 };
  return [...groups.values()].sort(
    (a, b) => a.day - b.day || (sessionRank[a.session] ?? 9) - (sessionRank[b.session] ?? 9)
  );
}

function sessionMeta(s) {
  return s === "M"
    ? { icon: "🌅", label: "Morning",   bg: "bg-amber-50",  border: "border-amber-400",  text: "text-amber-800"  }
    : { icon: "🌇", label: "Afternoon", bg: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-800" };
}

function schemeChip(schemeStr) {
  const s = String(schemeStr || "").trim();
  if (!s) return '<span class="text-slate-400">—</span>';
  return '<span class="scheme-chip">' + escapeHtml(s) + '</span>';
}

function abbrBadge(p) {
  if (p.subject_abbr) {
    const c = p.color;
    if (!c) {
      return '<span class="abbr-badge catalog" title="Matched from subjects catalog">' + escapeHtml(p.subject_abbr) + '</span>';
    }
    const title = p.color_group === "multi-scheme"
      ? "Same code+abbr appears under multiple schemes"
      : p.color_group === "shared-abbr"
      ? "Same abbr used by different subject codes"
      : "Same code+abbr under multiple schemes AND shared across codes";
    return '<span class="abbr-badge" style="background:' + c.bg + ';color:' + c.fg + ';box-shadow:inset 0 0 0 1px ' + c.ring + '" title="' + title + '">' + escapeHtml(p.subject_abbr) + '</span>';
  }
  // Missing-abbr states
  const st = p.match_state || "absent";
  const titles = {
    absent:     "No catalog row for this (code, scheme) — safe to INSERT",
    null_abbr:  "Row exists but abbr is NULL — safe to UPDATE",
    wrong_code: "Same subject name + scheme exists under a DIFFERENT code — review",
    wrong_name: "Same code + scheme exists with a DIFFERENT name — review",
  };
  const labels = {
    absent:     "no row",
    null_abbr:  "null abbr",
    wrong_code: "code drift",
    wrong_name: "name drift",
  };
  return '<span class="abbr-badge ' + st + '" title="' + (titles[st] || "") + '">' + (labels[st] || "no abbr") + '</span>';
}

function renderSession(group, startIndex) {
  const { icon, label, bg, border, text } = sessionMeta(group.session);
  const rows = group.papers.map((p, i) =>
    '<tr class="hover:bg-slate-50 border-b border-slate-100 align-top">' +
      '<td class="px-3 py-2 text-center sr-cell">' + (startIndex + i + 1) + '</td>' +
      '<td class="px-3 py-2 text-center">' + group.day + '</td>' +
      '<td class="px-3 py-2 text-center font-medium ' + text + '">' + escapeHtml(p.daysession) + '</td>' +
      '<td class="px-3 py-2 whitespace-nowrap">' + escapeHtml(p.paper_time) + '</td>' +
      '<td class="px-3 py-2">' +
        '<div class="font-mono text-blue-800 font-semibold">' + escapeHtml(p.paper_code) + '</div>' +
        '<div class="mt-0.5">' + abbrBadge(p) + '</div>' +
      '</td>' +
      '<td class="px-3 py-2 font-medium text-slate-800">' + escapeHtml(p.subject_name) + '</td>' +
      '<td class="px-3 py-2 text-xs">' + schemeChip(p.scheme) + '</td>' +
    '</tr>'
  ).join("");

  return '<section class="session-card mb-6 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden break-inside-avoid">' +
    '<header class="px-4 py-2.5 ' + bg + ' ' + border + ' border-l-4 flex flex-wrap items-center gap-x-4 gap-y-1">' +
      '<span class="font-semibold text-slate-800">📅 ' + escapeHtml(group.date) + '</span>' +
      '<span class="' + text + ' font-medium">' + icon + ' ' + label + '</span>' +
      '<span class="text-slate-500 text-sm">Day ' + group.day + '</span>' +
      '<span class="ml-auto text-sm text-slate-600">' + escapeHtml(group.time) + '</span>' +
    '</header>' +
    '<div class="overflow-x-auto">' +
      '<table class="min-w-full text-sm">' +
        '<thead class="bg-slate-100 text-slate-600 uppercase text-xs">' +
          '<tr>' +
            '<th class="px-3 py-2 text-center">Sr</th>' +
            '<th class="px-3 py-2 text-center">Day</th>' +
            '<th class="px-3 py-2 text-center">Session</th>' +
            '<th class="px-3 py-2 text-left">Time Slot</th>' +
            '<th class="px-3 py-2 text-left">Subject Code</th>' +
            '<th class="px-3 py-2 text-left">Subject Name</th>' +
            '<th class="px-3 py-2 text-left">Scheme</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
  '</section>';
}

function renderLegend(papers) {
  const groups = new Map();
  for (const p of papers) {
    if (!p.color) continue;
    const g = groups.get(p.color_key) || { color: p.color, members: new Set() };
    g.members.add(p.paper_code + " · " + p.subject_abbr);
    groups.set(p.color_key, g);
  }
  const el = $("legend");
  if (!groups.size) { el.innerHTML = ''; return; }
  el.innerHTML = '<span class="font-semibold text-slate-500">Colour groups:</span> ' +
    [...groups.values()].slice(0, 12).map(g => {
      const c = g.color;
      return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style="background:' + c.bg + ';color:' + c.fg + ';box-shadow:inset 0 0 0 1px ' + c.ring + '">' +
        escapeHtml([...g.members].join(', ')) +
      '</span>';
    }).join(' ');
}

function renderStatePills(counts) {
  const el = $("state-pills");
  if (!counts) { el.innerHTML = ''; return; }
  const defs = [
    { key: "matched",    label: "✓ matched",    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    { key: "absent",     label: "✗ absent",     cls: "bg-red-50 text-red-700 ring-red-200" },
    { key: "null_abbr",  label: "· null abbr",  cls: "bg-yellow-50 text-yellow-800 ring-yellow-200" },
    { key: "wrong_code", label: "⚠ code drift", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
    { key: "wrong_name", label: "⚠ name drift", cls: "bg-purple-50 text-purple-800 ring-purple-200" },
  ];
  el.innerHTML = defs
    .filter(d => (counts[d.key] || 0) > 0)
    .map(d => '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ring-1 ' + d.cls + '">' + d.label + ': ' + counts[d.key] + '</span>')
    .join('');
}

function renderTimetable() {
  const out = $("output");
  const { filtered, papers } = state;

  $("f-count").textContent = filtered.length + " / " + papers.length + " rows shown";

  if (!filtered.length) {
    out.innerHTML = '<div class="p-6 bg-white border border-slate-200 rounded-lg text-center text-slate-500">' +
      'No rows match the current filters. ' +
      '<button onclick="document.getElementById(\'f-clear\').click()" class="ml-2 text-blue-600 underline">Clear filters</button>' +
    '</div>';
    renderLegend([]);
    return;
  }

  const matchedRows = papers.filter(p => p.subject_abbr).length;
  const missingRows = papers.length - matchedRows;

  // Aggregate state counts across all papers (not filtered) — the "Generate SQL" button
  // should reflect total missing, not just the current filter view.
  const stateCounts = { matched: 0, absent: 0, null_abbr: 0, wrong_code: 0, wrong_name: 0 };
  for (const p of papers) {
    stateCounts[p.match_state] = (stateCounts[p.match_state] || 0) + 1;
  }
  renderStatePills(stateCounts);

  const actionable = (stateCounts.absent || 0) + (stateCounts.null_abbr || 0);
  const flagCount = (stateCounts.wrong_code || 0) + (stateCounts.wrong_name || 0);
  const genBtn = $("btn-gen-sql");
  if (actionable + flagCount > 0) {
    genBtn.classList.remove("hidden");
    genBtn.textContent = "📋 Generate SQL (" + actionable + " fixes, " + flagCount + " flags)";
  } else {
    genBtn.classList.add("hidden");
  }

  const groups = groupByDate(filtered);
  let sr = 0;
  const html = groups.map(g => {
    const s = renderSession(g, sr);
    sr += g.papers.length;
    return s;
  }).join("");

  out.innerHTML =
    '<div class="flex flex-wrap items-center gap-2 mb-3 text-xs">' +
      '<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 rounded font-medium">✓ ' + matchedRows + ' rows with abbr</span>' +
      '<span class="inline-flex items-center gap-1 bg-red-50 text-red-700 ring-1 ring-red-200 px-2 py-0.5 rounded font-medium">✗ ' + missingRows + ' rows missing abbr</span>' +
      '<span class="ml-auto text-slate-500">' + groups.length + ' session blocks</span>' +
    '</div>' +
    html;

  renderLegend(papers);
}

async function resolveInstituteName(instId) {
  try {
    const list = await getInstitutes();
    const m = list.find(i => String(i.inst_id) === String(instId));
    return m ? m.inst_name : null;
  } catch { return null; }
}

async function loadTimetable(instId) {
  const btn = $("load-btn");
  btn.disabled = true;
  $("output").innerHTML = "";
  $("toolbar").classList.add("hidden");

  try {
    setStatus("Fetching paper codes for institute " + instId + "…");
    const codes = (await api.papercodes(instId)).map(p => p.paper_code);
    if (!codes.length) {
      setStatus("No paper codes.", true);
      setInstituteTitle(null, instId);
      return;
    }

    await getExamdays();
    setStatus("Fetching timetable for " + codes.length + " papers…");
    const papers = await api.timetable(codes);

    const name = await resolveInstituteName(instId);
    state.papers = papers;
    state.institute = { name, id: instId };
    state.filters = { search: "", session: "", scheme: "", day: "", onlyMissing: false, sort: "day-session-sr" };

    $("f-search").value = "";
    $("f-session").value = "";
    $("f-scheme").value = "";
    $("f-day").value = "";
    $("f-abbr-mode").checked = false;
    $("f-sort").value = "day-session-sr";

    setInstituteTitle(name, instId);
    populateFilterOptions();
    $("toolbar").classList.remove("hidden");
    applyFilters();
    setStatus("Loaded " + papers.length + " rows.");
    refreshCacheStatus();
  } catch (err) {
    console.error(err);
    setStatus("Failed: " + err.message, true);
    $("output").innerHTML = '<div class="p-4 bg-red-50 border border-red-200 text-red-800 rounded">Could not load timetable. ' + escapeHtml(err.message) + '</div>';
  } finally {
    btn.disabled = false;
  }
}

/* ─── Button handlers ─────────────────────────────────────────── */

$("search-form").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("inst-id").value.trim();
  if (id) loadTimetable(id);
});
$("print-btn").addEventListener("click", () => window.print());

$("f-search").addEventListener("input", e => { state.filters.search = e.target.value; applyFilters(); });
$("f-session").addEventListener("change", e => { state.filters.session = e.target.value; applyFilters(); });
$("f-scheme").addEventListener("change", e => { state.filters.scheme = e.target.value; applyFilters(); });
$("f-day").addEventListener("change", e => { state.filters.day = e.target.value; applyFilters(); });
$("f-abbr-mode").addEventListener("change", e => { state.filters.onlyMissing = e.target.checked; applyFilters(); });
$("f-sort").addEventListener("change", e => { state.filters.sort = e.target.value; applyFilters(); });
$("f-clear").addEventListener("click", () => {
  state.filters = { search: "", session: "", scheme: "", day: "", onlyMissing: false, sort: "day-session-sr" };
  $("f-search").value = "";
  $("f-session").value = "";
  $("f-scheme").value = "";
  $("f-day").value = "";
  $("f-abbr-mode").checked = false;
  $("f-sort").value = "day-session-sr";
  applyFilters();
});

$("btn-clear-cache").addEventListener("click", async () => {
  const btn = $("btn-clear-cache");
  btn.disabled = true;
  try {
    const r = await api.clearCache();
    setStatus("MSBTE cache cleared (" + (r.cleared || 0) + " entries).");
    renderCacheStatus(0);
  } catch (e) {
    setStatus("Cache clear failed: " + e.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("btn-refresh-subjects").addEventListener("click", async () => {
  const btn = $("btn-refresh-subjects");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "⏳ Refreshing…";
  try {
    const r = await api.refreshSubjects();
    if (r.ok) {
      setStatus("Subject catalog refreshed: " + r.count + " rows. Re-load timetable to apply.");
    } else {
      setStatus("Refresh failed: " + (r.error || "unknown"), true);
    }
  } catch (e) {
    setStatus("Refresh failed: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

$("btn-gen-sql").addEventListener("click", async () => {
  const btn = $("btn-gen-sql");
  btn.disabled = true;
  try {
    const text = await api.missingSQL();
    $("sql-text").value = text;

    // Parse counts from the header for the summary
    const m = text.match(/INSERT \(safe\)\s*:\s*(\d+)[\s\S]*?UPDATE\s*:\s*(\d+)[\s\S]*?FLAG \(real\)\s*:\s*(\d+)/);
    if (m) {
      const [, ins, upd, flag] = m;
      $("sql-stats").textContent = "INSERT " + ins + " · UPDATE " + upd + " · FLAG " + flag;
      $("sql-summary").innerHTML =
        '<strong>' + ins + '</strong> rows to INSERT (genuine gaps) · ' +
        '<strong>' + upd + '</strong> rows to UPDATE (null abbr) · ' +
        '<strong>' + flag + '</strong> rows flagged for review (code/name drift)<br>' +
        '<span class="text-slate-500">abbr is seeded as NULL / \'&lt;TBD&gt;\' — fill them in before committing.</span>';
    }
    $("sql-modal").classList.add("open");
  } catch (e) {
    setStatus("SQL generation failed: " + e.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("sql-close").addEventListener("click", () => $("sql-modal").classList.remove("open"));
$("sql-modal").addEventListener("click", (e) => {
  if (e.target.id === "sql-modal") $("sql-modal").classList.remove("open");
});
$("sql-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("sql-text").value);
    $("sql-copy").textContent = "✓ Copied";
    setTimeout(() => $("sql-copy").textContent = "Copy to Clipboard", 1500);
  } catch { /* noop */ }
});
$("sql-download").addEventListener("click", () => {
  const blob = new Blob([$("sql-text").value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "msbte-winter2026-abbr-fixes.sql";
  a.click();
  URL.revokeObjectURL(url);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("f-search") && !$("toolbar").classList.contains("hidden")) {
    e.preventDefault();
    $("f-search").focus();
  }
  if (e.key === "Escape") $("sql-modal").classList.remove("open");
});

const qp = new URLSearchParams(location.search).get("inst_id");
if (qp) { $("inst-id").value = qp; loadTimetable(qp); }
</script>
</body>
</html>`;

/* ================================================================
   SERVER
   ================================================================ */

const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        });
        return res.end();
    }

    if (req.url === "/" || req.url.startsWith("/?") || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(HTML);
    }

    ensureSubjects().catch(() => { });

    if (req.url.startsWith("/api/")) {
        return proxyMSBTE(req, res, req.url.slice(4));
    }

    /* ---------- admin endpoints ---------- */

    if (req.url === "/__cache/clear" && req.method === "POST") {
        const cleared = clearMsbteCache();
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, cleared }));
    }

    if (req.url === "/__subjects/refresh" && req.method === "POST") {
        const r = await forceSubjectsRefresh();
        res.writeHead(r.ok ? 200 : 500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(r));
    }

    if (req.url === "/__sql/missing-abbr") {
        const rows = lastEnriched?.rows || [];
        if (!rows.length) {
            res.writeHead(409, { "Content-Type": "text/plain" });
            return res.end("-- No enriched timetable yet. Load a timetable first.");
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(generateSQL(rows));
    }

    if (req.url === "/__cache") {
        const now = Date.now();
        const entries = [...msbteCache.entries()].map(([k, v]) => ({
            key: k.slice(0, 80) + (k.length > 80 ? "…" : ""),
            ttl: Math.max(0, Math.floor((v.expiresAt - now) / 1000)),
        }));
        const ageMs = msbteCacheAgeMs();
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
            subjects: {
                count: subjectsCache.count,
                fetchedAt: subjectsCache.fetchedAt,
            },
            msbte: {
                entries,
                hits: msbteCacheHits,
                misses: msbteCacheMisses,
                ttlMs: MSBTE_CACHE_TTL_MS,
                ageMs,
                oldestAt: msbteCacheOldestAt,
            },
        }, null, 2));
    }

    res.writeHead(404); res.end("Not found");
});

loadSubjectsCacheFromDisk();

server.listen(PORT, async () => {
    console.log("→ http://localhost:" + PORT);
    console.log("[msbte]    timetable source : " + MSBTE_TIMETABLE_API);
    console.log("[msbte]    cache ttl        : " + (MSBTE_CACHE_TTL_MS / 60000) + " min");
    console.log("[subjects] lookup source    : " + SUBJECTS_API);
    try {
        await ensureSubjects();
        console.log("[subjects] ready: " + subjectsCache.count + " rows");
    } catch (e) {
        console.warn("[subjects] boot warm failed: " + e.message);
    }
});