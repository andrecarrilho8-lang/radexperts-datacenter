/**
 * GET /api/leads/contact-by-email?email=X
 * Returns the Active Campaign contact + tags for a given email.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function acHeaders() {
  const key = process.env.AC_API_KEY;
  if (!key) throw new Error('AC_API_KEY not set');
  return { 'Api-Token': key, 'Content-Type': 'application/json' };
}
function acBase() {
  const base = process.env.AC_BASE_URL;
  if (!base) throw new Error('AC_BASE_URL not set');
  return base.replace(/\/$/, '');
}
async function acFetch(path: string) {
  const res = await fetch(`${acBase()}${path}`, {
    headers: acHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`AC ${res.status}`);
  return res.json();
}

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get('email');
  if (!email) return NextResponse.json({ tags: [], contact: null });

  try {
    const [contactsRes, tagsRes] = await Promise.all([
      acFetch(`/api/3/contacts?email=${encodeURIComponent(email)}&include=contactTags`),
      acFetch(`/api/3/tags?limit=1000`),
    ]);

    const contact  = (contactsRes.contacts || [])[0] || null;
    if (!contact) return NextResponse.json({ tags: [], contact: null });

    // Build tagId → name map
    const tagIdToName = new Map<string, string>();
    for (const t of (tagsRes.tags || []) as any[]) {
      tagIdToName.set(String(t.id), String(t.tag || ''));
    }

    // Resolve contact's tag IDs to names
    const contactTags: any[] = contactsRes.contactTags || [];
    const myTagIds = new Set(
      (contact.contactTags || []).map((id: any) => String(id))
    );
    const tags = contactTags
      .filter(ct => myTagIds.has(String(ct.id)))
      .map(ct => ({
        name: tagIdToName.get(String(ct.tag)) || String(ct.tag),
        date: ct.cdate || '',
      }))
      .filter(t => t.name)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      tags,
      contact: {
        id:        String(contact.id),
        firstName: contact.firstName || '',
        lastName:  contact.lastName  || '',
        phone:     contact.phone     || '',
        createdAt: contact.cdate     || '',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ tags: [], contact: null, error: e.message });
  }
}
