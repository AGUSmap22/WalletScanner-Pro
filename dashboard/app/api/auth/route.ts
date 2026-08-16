import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'wallet_scanner_salt_2026').digest('hex');
}

async function verifyAdmin(adminId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', adminId)
    .maybeSingle();
  return data?.role === 'admin';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, password, adminId, targetUserId, newRole } = body;

    // ─── REGISTRO ────────────────────────────────────────────────────────────
    if (action === 'register') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
      }
      const cleanEmail = email.trim().toLowerCase();
      const passHash = hashPassword(password);
      const userId = 'usr_' + crypto.randomBytes(8).toString('hex');

      // Registros públicos SIEMPRE son 'user'. Nunca admin.
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('user_profiles')
        .insert([{ id: userId, email: cleanEmail, password_hash: passHash, role: 'user' }])
        .select('id, email, role, created_at')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return NextResponse.json({ error: 'Este correo ya está registrado. Inicia sesión.' }, { status: 400 });
        }
        return NextResponse.json({ error: `Error al registrar: ${insertError.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, user: newUser });
    }

    // ─── LOGIN ───────────────────────────────────────────────────────────────
    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
      }
      const cleanEmail = email.trim().toLowerCase();
      const passHash = hashPassword(password);

      const { data: user, error: fetchError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, role, password_hash')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (fetchError) {
        return NextResponse.json({ error: `Error de base de datos: ${fetchError.message}` }, { status: 500 });
      }

      if (!user || user.password_hash !== passHash) {
        return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        user: { id: user.id, email: user.email, role: user.role }
      });
    }

    // ─── PROMOVER / CAMBIAR ROL (solo admins) ────────────────────────────────
    if (action === 'setRole') {
      if (!adminId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }

      const isAdmin = await verifyAdmin(adminId);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Solo los admins pueden cambiar roles.' }, { status: 403 });
      }

      const allowedRoles = ['admin', 'user'];
      if (!allowedRoles.includes(newRole)) {
        return NextResponse.json({ error: 'Rol no válido. Usa "admin" o "user".' }, { status: 400 });
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', targetUserId)
        .select('id, email, role')
        .single();

      if (updateError) {
        return NextResponse.json({ error: `Error al cambiar rol: ${updateError.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, user: updated });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Auth Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
