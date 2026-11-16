import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';

/* -------------------------------------------------------------- */
/*  GET /api/subjects?type=count   → { success, count }          */
/*  GET /api/subjects?type=full    → { success, count, data }    */
/*                                                               */
/*  Any other `type` → 400.                                      */
/*                                                               */
/*  Philosophy:                                                  */
/*   - count is cheap (head-only query). Callers poll this.      */
/*   - full is the heavy dump, paged internally to defeat        */
/*     Supabase's `Max Rows` cap. Callers only fetch when        */
/*     `count` changed vs their cached snapshot.                 */
/*   - Rate limits differ per type (full is more expensive).     */
/* -------------------------------------------------------------- */

const supabasePublic = createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

/* -------------------------------------------------------------- */
/*  Rate limits — fixed window, in-memory, per IP                */
/* -------------------------------------------------------------- */

const RATE = {
    count: { windowMs: 60_000, max: 60 },
    full: { windowMs: 60_000, max: 6 },
} as const;

type RateKind = keyof typeof RATE;

interface Bucket { count: number; resetAt: number }

const buckets: Record<RateKind, Map<string, Bucket>> = {
    count: new Map(),
    full: new Map(),
};

function getClientIp(request: Request): string {
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

interface RateResult {
    ok: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter: number;
}

function checkRate(kind: RateKind, ip: string): RateResult {
    const cfg = RATE[kind];
    const map = buckets[kind];
    const now = Date.now();

    let b = map.get(ip);
    if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + cfg.windowMs };
        map.set(ip, b);
    }

    if (map.size > 10_000) {
        for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
    }

    b.count += 1;
    const ok = b.count <= cfg.max;
    const remaining = Math.max(0, cfg.max - b.count);
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);

    return { ok, limit: cfg.max, remaining, resetAt: b.resetAt, retryAfter };
}

function withRateHeaders(headers: Headers, kind: RateKind, r: RateResult) {
    headers.set('X-RateLimit-Kind', kind);
    headers.set('X-RateLimit-Limit', String(r.limit));
    headers.set('X-RateLimit-Remaining', String(r.remaining));
    headers.set('X-RateLimit-Reset', String(Math.floor(r.resetAt / 1000)));
    headers.set('Cache-Control', 'no-store');
}

function jsonError(
    status: number,
    body: Record<string, unknown>,
    kind: RateKind,
    rate: RateResult,
    extraHeaders?: Record<string, string>,
) {
    const h = new Headers();
    withRateHeaders(h, kind, rate);
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) h.set(k, v);
    return NextResponse.json(body, { status, headers: h });
}

/* -------------------------------------------------------------- */
/*  Query helpers                                                */
/* -------------------------------------------------------------- */

function parseFilters(searchParams: URLSearchParams) {
    const scheme = searchParams.get('scheme')?.trim() || null;
    const qRaw = searchParams.get('q')?.trim() || null;
    // strip chars that PostgREST `.or()` treats as operators
    const q = qRaw ? qRaw.replace(/[,()%]/g, ' ').trim() || null : null;
    return { scheme, q };
}

/** Columns that both count & full select — one source of truth. */
const COLS = 'code, name, scheme, abbr' as const;

/** Head-only query → returns { count } and NO rows. */
function countQuery(scheme: string | null, q: string | null) {
    let qy = supabasePublic
        .from('subjects')
        .select(COLS, { count: 'exact', head: true })
        .eq('is_deleted', false);

    if (scheme) qy = qy.eq('scheme', scheme);
    if (q) qy = qy.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    return qy;
}

/** Row-fetching query, clipped to [from..to]. */
function fullPageQuery(
    scheme: string | null,
    q: string | null,
    from: number,
    to: number,
) {
    let qy = supabasePublic
        .from('subjects')
        .select(COLS)
        .eq('is_deleted', false)
        .order('scheme', { ascending: true })
        .order('code', { ascending: true })
        .range(from, to);

    if (scheme) qy = qy.eq('scheme', scheme);
    if (q) qy = qy.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    return qy;
}

/* -------------------------------------------------------------- */
/*  Route                                                        */
/* -------------------------------------------------------------- */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Supabase `Max Rows` default. If you raise the cap, bump this too — it just runs fewer iterations. */
const SUPABASE_PAGE = 1000;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // ── strict validation ─────────────────────────────
    if (type !== 'count' && type !== 'full') {
        return NextResponse.json(
            {
                success: false,
                error: 'Invalid or missing `type`. Allowed: `count` or `full`.',
            },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    const kind: RateKind = type;
    const ip = getClientIp(request);
    const rate = checkRate(kind, ip);

    if (!rate.ok) {
        return jsonError(
            429,
            {
                success: false,
                error: 'Rate limit exceeded. Please retry later.',
                retryAfter: rate.retryAfter,
            },
            kind,
            rate,
            { 'Retry-After': String(rate.retryAfter) },
        );
    }

    const { scheme, q } = parseFilters(searchParams);

    try {
        /* ────────────────────────────────────────────── */
        /* type=count — cheap, head-only                  */
        /* ────────────────────────────────────────────── */
        if (kind === 'count') {
            const { count, error } = await countQuery(scheme, q);

            if (error) {
                console.error('[subjects:count] Supabase error:', error.message);
                return jsonError(
                    500,
                    { success: false, error: 'Failed to count subjects' },
                    kind,
                    rate,
                );
            }

            return jsonError(
                200,
                {
                    success: true,
                    type: 'count',
                    count: count ?? 0,
                    filters: { scheme, q },
                },
                kind,
                rate,
            );
        }

        /* ────────────────────────────────────────────── */
        /* type=full — page internally to beat Max Rows   */
        /* ────────────────────────────────────────────── */

        // 1) exact count first
        const { count, error: countErr } = await countQuery(scheme, q);

        if (countErr) {
            console.error('[subjects:full] count error:', countErr.message);
            return jsonError(
                500,
                { success: false, error: 'Failed to count subjects' },
                kind,
                rate,
            );
        }

        const total = count ?? 0;

        if (total === 0) {
            return jsonError(
                200,
                {
                    success: true,
                    type: 'full',
                    count: 0,
                    returned: 0,
                    complete: true,
                    data: [],
                    filters: { scheme, q },
                },
                kind,
                rate,
            );
        }

        // 2) page through rows in SUPABASE_PAGE chunks
        const pages = Math.ceil(total / SUPABASE_PAGE);
        const rows: Array<{ code: string; name: string; scheme: string; abbr: string | null }> = [];

        for (let i = 0; i < pages; i++) {
            const from = i * SUPABASE_PAGE;
            const to = Math.min(from + SUPABASE_PAGE - 1, total - 1);

            const { data: chunk, error: pageErr } = await fullPageQuery(scheme, q, from, to);

            if (pageErr) {
                console.error(`[subjects:full] page ${i} error:`, pageErr.message);
                return jsonError(
                    500,
                    { success: false, error: 'Failed to fetch subjects' },
                    kind,
                    rate,
                );
            }

            if (chunk) rows.push(...chunk);
        }

        return jsonError(
            200,
            {
                success: true,
                type: 'full',
                count: total,
                returned: rows.length,
                complete: rows.length === total,
                data: rows,
                filters: { scheme, q },
            },
            kind,
            rate,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        console.error('[subjects:GET] Unhandled:', message);
        return jsonError(
            500,
            { success: false, error: message },
            kind,
            rate,
        );
    }
}