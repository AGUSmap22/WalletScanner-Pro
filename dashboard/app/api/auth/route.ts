import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'wallet_scanner_salt_2026').digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const passHash = hashPassword(password);

    if (action === 'register') {
      // Verificar si ya existe
      const { data: existing } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('email', cleanEmail)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Este email ya está registrado' }, { status: 400 });
      }

      // Verificar cuántos usuarios existen para asignar admin al primero
      const { count } = await supabaseAdmin
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      const isFirst = (count || 0) === 0;
      const role = (isFirst || cleanEmail.includes('admin')) ? 'admin' : 'user';
      const userId = 'usr_' + crypto.randomBytes(8).toString('hex');

      const { data: newUser, error } = await supabaseAdmin
        .from('user_profiles')
        .insert([{
          id: userId,
          email: cleanEmail,
          password_hash: passHash,
          role
        }])
        .select('id, email, role, created_at')
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        user: newUser
      });
    }

    if (action === 'login') {
      const { data: user, error } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, role, password_hash')
        .eq('email', cleanEmail)
        .single();

      if (error || !user || user.password_hash !== passHash) {
        return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
      }

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error de autenticación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
