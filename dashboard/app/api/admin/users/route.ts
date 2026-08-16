import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

async function verifyAdmin(adminId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', adminId)
    .maybeSingle();
  return data?.role === 'admin';
}

// GET /api/admin/users?adminId=xxx  → Lista todos los usuarios
export async function GET(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get('adminId') || '';
  const isAdmin = await verifyAdmin(adminId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

// DELETE /api/admin/users?adminId=xxx&targetId=yyy  → Eliminar usuario
export async function DELETE(req: NextRequest) {
  const adminId = req.nextUrl.searchParams.get('adminId') || '';
  const targetId = req.nextUrl.searchParams.get('targetId') || '';

  const isAdmin = await verifyAdmin(adminId);
  if (!isAdmin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  if (adminId === targetId) {
    return NextResponse.json({ error: 'No puedes eliminarte a ti mismo.' }, { status: 400 });
  }

  await supabaseAdmin.from('user_profiles').delete().eq('id', targetId);
  await supabaseAdmin.from('mnemonic_seeds').delete().eq('user_id', targetId);

  return NextResponse.json({ success: true });
}
