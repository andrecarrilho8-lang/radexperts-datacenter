/**
 * GET /api/leads/contacts?offset=0&limit=200
 *
 * FAST: 3 API calls total (instead of N per contact).
 * Uses ?include=contactTags on the contacts endpoint to get tag associations,
 * and fetches all tag names in one call. Maps everything locally.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function acHeaders() {
  const key = process.env.AC_API_KEY;
  if (!key) throw new Error('AC_API_KEY env var não configurada.');
  return { 'Api-Token': key, 'Content-Type': 'application/json' };
}

function acBase() {
  const base = process.env.AC_BASE_URL;
  if (!base) throw new Error('AC_BASE_URL env var não configurada.');
  return base.replace(/\/$/, '');
}

async function acFetch(path: string) {
  const res = await fetch(`${acBase()}${path}`, {
    headers: acHeaders(),
    // 20s timeout
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AC API erro ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Fetch contacts + all tag data in ~3 parallel calls:
 * 1. All tag definitions (names)   → GET /api/3/tags?limit=1000
 * 2. Contact pages (1-2 calls)     → GET /api/3/contacts?include=contactTags
 * Returns contacts already enriched with tag names.
 */
async function fetchContactsWithTags(offset: number, limit: number): Promise<{
  contacts: any[];
  total: number;
}> {
  const AC_MAX = 100; // AC hard limit per request

  // Build contact page calls
  const contactCalls: Promise<any>[] = [];
  for (let o = offset; o < offset + limit; o += AC_MAX) {
    const batchLimit = Math.min(AC_MAX, offset + limit - o);
    contactCalls.push(
      acFetch(`/api/3/contacts?limit=${batchLimit}&offset=${o}&include=contactTags`)
    );
  }

  // Run all calls in parallel (contacts pages + tags list)
  const [tagsRes, ...contactResults] = await Promise.all([
    acFetch(`/api/3/tags?limit=1000`),
    ...contactCalls,
  ]);

  // Build tagId → tagName lookup table
  const tagIdToName = new Map<string, string>();
  for (const t of (tagsRes.tags || []) as any[]) {
    tagIdToName.set(String(t.id), String(t.tag || ''));
  }

  // Merge contact results + collect all contactTag associations
  let rawContacts: any[] = [];
  const allContactTags: any[] = [];
  let total = 0;

  for (const r of contactResults) {
    rawContacts = rawContacts.concat(r.contacts || []);
    if (Array.isArray(r.contactTags)) allContactTags.push(...r.contactTags);
    if (!total && r.meta?.total) total = parseInt(r.meta.total, 10);
  }

  // Build contactId → [tagNames] map
  const tagsByContact = new Map<string, string[]>();
  for (const ct of allContactTags) {
    const tagName = tagIdToName.get(String(ct.tag));
    if (!tagName) continue;
    const cid = String(ct.contact);
    const arr = tagsByContact.get(cid) || [];
    if (!arr.includes(tagName)) arr.push(tagName);
    tagsByContact.set(cid, arr);
  }

  // Shape contacts with their tags
  const contacts = rawContacts.map((c: any) => ({
    id:        String(c.id),
    email:     (c.email || '').toLowerCase().trim(),
    firstName: c.firstName || c.first_name || '',
    lastName:  c.lastName  || c.last_name  || '',
    phone:     c.phone     || '',
    createdAt: c.cdate     || c.created_timestamp || '',
    tags:      tagsByContact.get(String(c.id)) || [],
  }));

  return { contacts, total };
}

/** One DB query to get all known student emails */
async function getStudentEmails(): Promise<Set<string>> {
  try {
    const sql = getDb();
    const [bpRows, msRows] = await Promise.all([
      sql`SELECT email FROM buyer_profiles WHERE purchase_count > 0`,
      sql`SELECT DISTINCT email FROM manual_students`,
    ]);
    const set = new Set<string>();
    for (const r of [...(bpRows as any[]), ...(msRows as any[])]) {
      if (r.email) set.add(r.email.toLowerCase().trim());
    }
    return set;
  } catch {
    return new Set();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit  = Math.min(parseInt(searchParams.get('limit') || '200', 10), 200);

  try {
    // Parallel: fetch contacts+tags from AC, student emails from DB
    const [{ contacts: raw, total }, studentEmails] = await Promise.all([
      fetchContactsWithTags(offset, limit),
      getStudentEmails(),
    ]);

    // Enrich with isAluno + tagCount, always sort by createdAt desc
    const contacts = raw
      .map(c => ({
        ...c,
        tagCount: c.tags.length,
        isAluno:  studentEmails.has(c.email),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ contacts, total, offset, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
