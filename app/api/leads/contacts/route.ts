/**
 * GET /api/leads/contacts?offset=0&limit=200&sort=tags|date
 *
 * PERFORMANCE FIX: True server-side pagination.
 * Only fetches the requested page (max 200 contacts) from AC instead of all contacts.
 * Tags are fetched in parallel batches of 50 for only the current page.
 * Estimated time: ~3-5s instead of minutes.
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
  const res = await fetch(`${acBase()}${path}`, { headers: acHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AC API erro ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch exactly `limit` contacts starting at `offset`.
 * AC max per request = 100, so we may need 1-2 parallel calls.
 * Also returns the `total` count from meta.
 */
async function fetchContactsPage(offset: number, limit: number): Promise<{ contacts: any[]; total: number }> {
  const AC_MAX = 100;
  if (limit <= AC_MAX) {
    // Single call
    const data = await acFetch(`/api/3/contacts?limit=${limit}&offset=${offset}`);
    return {
      contacts: data.contacts || [],
      total: parseInt(data.meta?.total || '0', 10),
    };
  }

  // Parallel calls: e.g. offset=0,limit=200 → two calls of 100
  const calls: Promise<any>[] = [];
  for (let o = offset; o < offset + limit; o += AC_MAX) {
    const batchLimit = Math.min(AC_MAX, offset + limit - o);
    calls.push(acFetch(`/api/3/contacts?limit=${batchLimit}&offset=${o}`));
  }
  const results = await Promise.all(calls);
  let contacts: any[] = [];
  for (const r of results) contacts = contacts.concat(r.contacts || []);
  const total = parseInt(results[0]?.meta?.total || '0', 10);
  return { contacts, total };
}

/** Fetch tags for a list of contacts in batches of 50 (parallel) */
async function fetchTagsForContacts(contacts: any[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();
  const BATCH_SIZE = 50;

  // Chunk into batches of 50, run each batch in parallel
  const chunks: any[][] = [];
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    chunks.push(contacts.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (c: any) => {
        try {
          const data = await acFetch(`/api/3/contacts/${c.id}/tags`);
          const tags: string[] = (data.contactTags || [])
            .map((ct: any) => ct.tag?.tag || ct.tag || '')
            .filter(Boolean);
          tagMap.set(String(c.id), tags);
        } catch {
          tagMap.set(String(c.id), []);
        }
      })
    );
  }

  return tagMap;
}

/** Get all known student emails from DB (fast single query) */
async function getStudentEmails(): Promise<Set<string>> {
  try {
    const sql = getDb();
    const [bpRows, msRows] = await Promise.all([
      sql`SELECT email FROM buyer_profiles WHERE purchase_count > 0`,
      sql`SELECT DISTINCT email FROM manual_students WHERE COALESCE(total_amount, 0) > 0`,
    ]);
    const set = new Set<string>();
    const allRows = [...(bpRows as any[]), ...(msRows as any[])];
    for (const r of allRows) {
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
  const sort   = searchParams.get('sort') || 'date';

  try {
    // 1. Fetch only the current page of contacts from AC
    const { contacts: pageContacts, total } = await fetchContactsPage(offset, limit);

    // 2. Fetch tags for only the current page's contacts (parallel batches)
    const tagMap = await fetchTagsForContacts(pageContacts);

    // 3. Get student emails from DB
    const studentEmails = await getStudentEmails();

    // 4. Shape contacts
    let contacts = pageContacts.map((c: any) => {
      const email = (c.email || '').toLowerCase().trim();
      const tags  = tagMap.get(String(c.id)) || [];
      return {
        id:        String(c.id),
        email,
        firstName: c.firstName || c.first_name || '',
        lastName:  c.lastName  || c.last_name  || '',
        phone:     c.phone     || '',
        createdAt: c.cdate     || c.created_timestamp || '',
        tags,
        tagCount:  tags.length,
        isAluno:   studentEmails.has(email),
      };
    });

    // 5. Sort (within the current page)
    if (sort === 'tags') {
      contacts.sort((a, b) => b.tagCount - a.tagCount || a.firstName.localeCompare(b.firstName));
    } else {
      contacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return NextResponse.json({ contacts, total, offset, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
