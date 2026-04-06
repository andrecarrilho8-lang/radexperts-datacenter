/**
 * GET /api/leads/contacts?offset=0&limit=200&sort=tags|date
 *
 * Fetches contacts from Active Campaign v3 API and cross-references
 * their email against buyer_profiles + manual_students to mark
 * existing students (isAluno: true).
 *
 * ENV required:
 *   AC_API_KEY   — Active Campaign API key
 *   AC_BASE_URL  — e.g. https://youraccount.api-us1.com
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 100; // AC max per request

function acHeaders() {
  const key = process.env.AC_API_KEY;
  if (!key) throw new Error('AC_API_KEY env var not set');
  return { 'Api-Token': key, 'Content-Type': 'application/json' };
}

function acBase() {
  const base = process.env.AC_BASE_URL;
  if (!base) throw new Error('AC_BASE_URL env var not set');
  return base.replace(/\/$/, '');
}

async function acFetch(path: string) {
  const res = await fetch(`${acBase()}${path}`, { headers: acHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AC API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetch all contacts with their tags in parallel batches */
async function fetchAllContacts(): Promise<any[]> {
  // First call to get total count
  const first = await acFetch(`/api/3/contacts?limit=${PAGE_SIZE}&offset=0`);
  const total: number = parseInt(first.meta?.total || '0', 10);
  const firstBatch: any[] = first.contacts || [];

  // Build remaining offsets
  const offsets: number[] = [];
  for (let off = PAGE_SIZE; off < total; off += PAGE_SIZE) {
    offsets.push(off);
  }

  // Fetch remaining pages in parallel (max 10 concurrent)
  const chunks: number[][] = [];
  for (let i = 0; i < offsets.length; i += 10) chunks.push(offsets.slice(i, i + 10));

  let all = [...firstBatch];
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(off => acFetch(`/api/3/contacts?limit=${PAGE_SIZE}&offset=${off}`))
    );
    for (const r of results) all = all.concat(r.contacts || []);
  }

  return all;
}

/** Fetch tags for a batch of contact IDs */
async function fetchTagsForContacts(contacts: any[]): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();

  // Fetch up to 50 contacts' tags in parallel
  const chunks: any[][] = [];
  for (let i = 0; i < contacts.length; i += 50) chunks.push(contacts.slice(i, i + 50));

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (c: any) => {
        try {
          const data = await acFetch(`/api/3/contacts/${c.id}/tags`);
          const tags: string[] = (data.contactTags || []).map(
            (ct: any) => ct.tag?.tag || ct.tag || ''
          ).filter(Boolean);
          tagMap.set(String(c.id), tags);
        } catch {
          tagMap.set(String(c.id), []);
        }
      })
    );
  }

  return tagMap;
}

/** Get all known student emails from DB */
async function getStudentEmails(): Promise<Set<string>> {
  try {
    const sql = getDb();
    const [bpRows, msRows] = await Promise.all([
      sql`SELECT email FROM buyer_profiles WHERE purchase_count > 0`,
      sql`SELECT DISTINCT email FROM manual_students`,
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
  const limit  = parseInt(searchParams.get('limit')  || '200', 10);
  const sort   = searchParams.get('sort') || 'tags'; // 'tags' | 'date'

  try {
    // 1. Fetch all contacts from AC
    const allRaw = await fetchAllContacts();

    // 2. Fetch tags for all contacts
    const tagMap = await fetchTagsForContacts(allRaw);

    // 3. Get student emails for cross-reference
    const studentEmails = await getStudentEmails();

    // 4. Shape contacts
    let contacts = allRaw.map((c: any) => {
      const email   = (c.email || '').toLowerCase().trim();
      const tags    = tagMap.get(String(c.id)) || [];
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

    // 5. Sort
    if (sort === 'tags') {
      contacts.sort((a, b) => b.tagCount - a.tagCount || a.firstName.localeCompare(b.firstName));
    } else {
      contacts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // 6. Paginate
    const total   = contacts.length;
    const sliced  = contacts.slice(offset, offset + limit);

    return NextResponse.json({ contacts: sliced, total, offset, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
