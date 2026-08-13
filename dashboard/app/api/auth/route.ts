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
      // Intentar insertar directamente (más simple y eficiente)
      const userId = 'usr_' + crypto.randomBytes(8).toString('hex');

      // Contar usuarios existentes para asignar admin al primero
      let role = 'user';
      try {
        const { count } = await supabaseAdmin
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });

        const isFirst = (count || 0) === 0;
        role = (isFirst || cleanEmail.includes('admin')) ? 'admin' : 'user';
      } catch (countErr: unknown) {
        // Si falla el count, probablemente la tabla no existe
        const msg = countErr instanceof Error ? countErr.message : String(countErr);
        if (msg.includes('does not exist') || msg.includes('42P01') || msg.includes('relation')) {
          return NextResponse.json({
            error: '⚠️ La tabla "user_profiles" no existe en tu Supabase. Ejecuta el SQL del archivo supabase_schema.sql en tu panel de Supabase.'
          }, { status: 500 });
        }
        // Si no es error de tabla, el primer usuario será admin por defecto
        role = 'admin';
      }

      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('user_profiles')
        .insert([{
          id: userId,
          email: cleanEmail,
          password_hash: passHash,
          role
        }])
        .select('id, email, role, created_at')
        .single();

      if (insertError) {
        if (insertError.message?.includes('duplicate') || insertError.code === '23505') {
          return NextResponse.json({ error: 'Este correo ya está registrado. Inicia sesión.' }, { status: 400 });
        }
        if (insertError.message?.includes('does not exist') || insertError.code === '42P01') {
          return NextResponse.json({
            error: '⚠️ La tabla "user_profiles" no existe. Ejecuta el SQL en tu panel de Supabase.'
          }, { status: 500 });
        }
        return NextResponse.json({ error: `Error al registrar: ${insertError.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, user: newUser });
    }

    if (action === 'login') {
      const { data: user, error: fetchError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, role, password_hash')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (fetchError) {
        if (fetchError.message?.includes('does not exist') || fetchError.code === '42P01') {
          return NextResponse.json({
            error: '⚠️ La tabla "user_profiles" no existe. Ejecuta el SQL en tu panel de Supabase.'
          }, { status: 500 });
        }
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

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Auth Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
