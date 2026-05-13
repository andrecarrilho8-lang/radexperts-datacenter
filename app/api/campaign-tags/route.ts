/**
 * GET  /api/campaign-tags?campaignId=xxx  → { campaignId, tagId, tagName } | { tagId: null }
 * POST /api/campaign-tags                 → body: { campaignId, tagId, tagName }
 *
 * Persists a Meta campaign ↔ Active Campaign tag association in Neon Postgres.
 */

import { NextResponse } from 'next/server';
import { getDb, ensureCampaignTagsSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function ensureTable() {
  await ensureCampaignTagsSchema();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId')?.trim();

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  try {
    await ensureTable();
    const sql = getDb();
    const rows = await sql`
      SELECT campaign_id, tag_id, tag_name, updated_at
      FROM campaign_ac_tags
      WHERE campaign_id = ${campaignId}
      LIMIT 1
    ` as any[];

    if (rows.length === 0) {
      return NextResponse.json({ campaignId, tagId: null, tagName: null });
    }

    const row = rows[0];
    return NextResponse.json({
      campaignId: row.campaign_id,
      tagId:      row.tag_id,
      tagName:    row.tag_name,
      updatedAt:  row.updated_at,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { campaignId, tagId, tagName } = body || {};

  if (!campaignId || !tagId || !tagName) {
    return NextResponse.json(
      { error: 'campaignId, tagId and tagName are required' },
      { status: 400 }
    );
  }

  try {
    await ensureTable();
    const sql = getDb();
    const now = Date.now();

    await sql`
      INSERT INTO campaign_ac_tags (campaign_id, tag_id, tag_name, updated_at)
      VALUES (${String(campaignId)}, ${String(tagId)}, ${String(tagName)}, ${now})
      ON CONFLICT (campaign_id) DO UPDATE
        SET tag_id     = EXCLUDED.tag_id,
            tag_name   = EXCLUDED.tag_name,
            updated_at = EXCLUDED.updated_at
    `;

    return NextResponse.json({ ok: true, campaignId, tagId, tagName, updatedAt: now });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId')?.trim();

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  try {
    await ensureTable();
    const sql = getDb();
    await sql`DELETE FROM campaign_ac_tags WHERE campaign_id = ${campaignId}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
